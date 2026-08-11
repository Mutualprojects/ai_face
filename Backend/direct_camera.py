#!/usr/bin/env python3
"""
direct_camera.py — Sentinel direct-camera recognition worker.

Captures frames straight from a local webcam (/dev/videoX) or an RTSP URL
using OpenCV, runs the YOLOv8 + InsightFace + OpenCV + cosine-similarity
pipeline on every frame, and logs every detection (known AND unknown) to the
Supabase `face_logs` table.

There is NO canvas, NO video view, and NO frontend round-trip: the camera is
read and processed entirely in this background process.

Usage:
    python direct_camera.py --device 0
    python direct_camera.py --device 0 --camera-id direct_device_0 --interval 0.12
    python direct_camera.py --rtsp "rtsp://user:pass@192.168.1.50:554/stream"
    python direct_camera.py --list-devices
"""

import os

os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"

import argparse
import base64
import json
import logging
import signal
import threading
import time
import uuid
from datetime import datetime, timezone

import cv2
import numpy as np

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from supabase import create_client
from insightface.app import FaceAnalysis


logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("direct_camera")


class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8005")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.35"))
    MATCH_MARGIN = float(os.getenv("MATCH_MARGIN", "0.02"))

    DET_SCORE_MIN = float(os.getenv("DET_SCORE_MIN", "0.25"))
    YOLO_CONF = float(os.getenv("YOLO_CONF", "0.40"))
    YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))

    FRAME_INTERVAL = float(os.getenv("FRAME_INTERVAL", "0.12"))
    MAX_WIDTH = int(os.getenv("DIRECT_MAX_WIDTH", "1280"))
    MIN_FACE_PX = int(os.getenv("MIN_FACE_PX", "15"))

    PRESENCE_CONFIRM_FRAMES = int(os.getenv("PRESENCE_CONFIRM_FRAMES", "2"))
    PRESENCE_TIMEOUT_SEC = float(os.getenv("PRESENCE_TIMEOUT_SEC", "8.0"))

    LOG_COOLDOWN_KNOWN_SEC = float(os.getenv("LOG_COOLDOWN_KNOWN_SEC", "10.0"))
    LOG_COOLDOWN_UNKNOWN_SEC = float(os.getenv("LOG_COOLDOWN_UNKNOWN_SEC", "30.0"))

    CACHE_REFRESH_SEC = int(os.getenv("CACHE_REFRESH_SEC", "60"))
    LOG_UNKNOWN = os.getenv("LOG_UNKNOWN", "true").lower() == "true"
    YOLO_MODEL_PATH = os.getenv(
        "YOLO_MODEL_PATH",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "yolov8n.pt"),
    )


# ──────────────────────────────────────────────────────────
# DATABASE
# ──────────────────────────────────────────────────────────

supabase = None

if Config.SUPABASE_URL and Config.SUPABASE_KEY:
    try:
        supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
        log.info("Supabase client ready (%s)", Config.SUPABASE_URL)
    except Exception as e:
        log.error("Supabase client failed: %s", e)
else:
    log.warning("SUPABASE_URL/SUPABASE_KEY missing — running without database logging.")


def ensure_camera(camera_id: str, name: str, rtsp_url: str = None):
    if supabase is None:
        return
    try:
        existing = supabase.table("cameras").select("id").eq("id", camera_id).execute()
        payload = {"id": camera_id, "name": name, "place": name, "rtsp_url": rtsp_url or ""}
        if existing.data:
            supabase.table("cameras").update(payload).eq("id", camera_id).execute()
        else:
            supabase.table("cameras").insert(payload).execute()
        log.info("Camera '%s' ensured in Supabase.", camera_id)
    except Exception as e:
        log.warning("Could not ensure camera '%s': %s", camera_id, e)


# ──────────────────────────────────────────────────────────
# MODELS
# ──────────────────────────────────────────────────────────

face_app = None
ACTIVE_MODEL = None
yolo_app = None

for model_name in ["buffalo_sc", "buffalo_l"]:
    try:
        candidate = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
        candidate.prepare(ctx_id=-1, det_size=(480, 480))
        face_app = candidate
        ACTIVE_MODEL = model_name
        log.info("InsightFace '%s' model loaded.", model_name)
        break
    except Exception as e:
        log.warning("Could not load '%s': %s", model_name, e)

if face_app is None:
    log.error("No InsightFace model could be loaded.")

try:
    import torch
    try:
        import ultralytics.nn.tasks
        import torch.nn.modules.container
        torch.serialization.add_safe_globals(
            [ultralytics.nn.tasks.DetectionModel, torch.nn.modules.container.Sequential]
        )
    except Exception:
        pass
    from ultralytics import YOLO

    yolo_app = YOLO(Config.YOLO_MODEL_PATH)
    log.info("YOLOv8 model loaded from %s", Config.YOLO_MODEL_PATH)
except Exception as e:
    log.warning("Could not load YOLOv8 model (continuing with InsightFace only): %s", e)


# ──────────────────────────────────────────────────────────
# IMAGE UTILITIES
# ──────────────────────────────────────────────────────────

def base64_to_cv2(b64_str):
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",")[1]
        nparr = np.frombuffer(base64.b64decode(b64_str), np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        log.error("base64 decode error: %s", e)
        return None


def cv2_to_base64(img, quality=90):
    try:
        _, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")
    except Exception as e:
        log.error("jpeg encode error: %s", e)
        return None


def enhance_face_for_embedding(face_img):
    if face_img is None or face_img.size == 0:
        return face_img
    try:
        h, w = face_img.shape[:2]
        if h < 112 or w < 112:
            scale = max(112.0 / h, 112.0 / w)
            face_img = cv2.resize(
                face_img,
                (max(w, int(w * scale)), max(h, int(h * scale))),
                interpolation=cv2.INTER_CUBIC,
            )
        lab = cv2.cvtColor(face_img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        face_img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
        face_img = cv2.bilateralFilter(face_img, 5, 35, 35)
        gaussian = cv2.GaussianBlur(face_img, (0, 0), 2.0)
        face_img = cv2.addWeighted(face_img, 1.5, gaussian, -0.5, 0)
    except Exception:
        pass
    return face_img


def pad_image(img, pad_size=50):
    return cv2.copyMakeBorder(
        img, pad_size, pad_size, pad_size, pad_size,
        cv2.BORDER_CONSTANT, value=[128, 128, 128],
    )


def cosine_similarity(a, b):
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ──────────────────────────────────────────────────────────
# CACHE SNAPSHOT (atomic — faces + normalized embedding matrix)
# ──────────────────────────────────────────────────────────

class CacheSnapshot:
    __slots__ = ("faces", "matrix")

    def __init__(self, faces, matrix):
        self.faces = faces
        self.matrix = matrix


EMPTY_SNAPSHOT = CacheSnapshot([], None)
CACHE_SNAPSHOT = EMPTY_SNAPSHOT
CACHE_LOCK = threading.Lock()


def fetch_known_faces():
    if supabase is None:
        return []
    try:
        try:
            res = supabase.table("known_faces").select(
                "id, name, employee_code, department, designation, email, embedding, photo_url"
            ).eq("is_active", True).execute()
        except Exception:
            res = supabase.table("known_faces").select(
                "id, name, employee_code, department, designation, email, embedding, photo_url"
            ).execute()
        return res.data or []
    except Exception as e:
        log.error("fetch_known_faces error: %s", e)
        return []


def fetch_visitors():
    if supabase is None:
        return []
    try:
        try:
            res = supabase.table("visitors").select(
                "visitor_id, full_name, photo_image, embedding"
            ).eq("is_active", True).execute()
        except Exception:
            res = supabase.table("visitors").select(
                "visitor_id, full_name, photo_image, embedding"
            ).execute()
        visitors = []
        for r in res.data or []:
            if r.get("embedding"):
                visitors.append({
                    "id": r["visitor_id"],
                    "name": f"Visitor: {r['full_name']}",
                    "employee_code": None,
                    "department": "Visitor",
                    "designation": "Visitor",
                    "photo_url": r["photo_image"],
                    "embedding": r["embedding"],
                    "is_visitor": True,
                })
        return visitors
    except Exception as e:
        log.error("fetch_visitors error: %s", e)
        return []


def refresh_cache():
    global CACHE_SNAPSHOT
    try:
        all_faces = fetch_known_faces() + fetch_visitors()
        rows = []
        valid_faces = []
        for item in all_faces:
            emb_val = item.get("embedding")
            if not emb_val:
                continue
            try:
                emb = np.array(
                    json.loads(emb_val) if isinstance(emb_val, str) else emb_val,
                    dtype=np.float32,
                )
            except Exception:
                continue
            norm = np.linalg.norm(emb)
            if norm == 0:
                continue
            rows.append(emb / norm)
            valid_faces.append(item)

        matrix = np.vstack(rows) if rows else None
        with CACHE_LOCK:
            CACHE_SNAPSHOT = CacheSnapshot(valid_faces, matrix)
        log.info(
            "Cache refreshed: %d face(s) in RAM matrix (model=%s).",
            len(valid_faces), ACTIVE_MODEL,
        )
    except Exception as e:
        log.error("refresh_cache error: %s", e)


def get_snapshot():
    with CACHE_LOCK:
        return CACHE_SNAPSHOT


def match_embedding(input_emb, threshold=None, margin=None):
    if threshold is None:
        threshold = Config.MATCH_THRESHOLD
    if margin is None:
        margin = Config.MATCH_MARGIN

    snapshot = get_snapshot()
    if not snapshot.faces or snapshot.matrix is None or len(snapshot.matrix) == 0:
        return None, -1.0, -1.0

    input_vec = np.asarray(input_emb, dtype=np.float32)
    if snapshot.matrix.shape[1] != input_vec.shape[0]:
        log.warning(
            "Embedding dimension mismatch (cache=%d, input=%d). Run /api/refresh_cache.",
            snapshot.matrix.shape[1], input_vec.shape[0],
        )
        return None, -1.0, -1.0

    norm_in = np.linalg.norm(input_vec)
    if norm_in == 0:
        return None, -1.0, -1.0
    vec = input_vec / norm_in

    sims = np.dot(snapshot.matrix, vec)
    if len(sims) == 1:
        best_idx, best_score, runner_up = 0, float(sims[0]), -1.0
    else:
        top2 = np.argpartition(sims, -2)[-2:]
        top2 = top2[np.argsort(-sims[top2])]
        best_idx = int(top2[0])
        best_score = float(sims[best_idx])
        runner_up = float(sims[int(top2[1])])

    if best_score >= threshold and (best_score - runner_up) >= margin:
        return snapshot.faces[best_idx], best_score, runner_up
    return None, best_score, runner_up


# ──────────────────────────────────────────────────────────
# UNIFIED FRAME PIPELINE (YOLO + InsightFace + OpenCV + cosine)
# ──────────────────────────────────────────────────────────

def detect_bodies_yolo(img):
    if yolo_app is None:
        return []
    bodies = []
    try:
        results = yolo_app(img, verbose=False, imgsz=Config.YOLO_IMGSZ)
        for r in results:
            for box in r.boxes:
                if int(box.cls[0]) != 0:
                    continue
                conf = float(box.conf[0])
                if conf >= Config.YOLO_CONF:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    bodies.append([int(x1), int(y1), int(x2), int(y2), conf])
    except Exception as e:
        log.warning("YOLO inference error: %s", e)
    return bodies


def analyze_frame(img, run_yolo=True):
    if face_app is None:
        return [], []

    h, w = img.shape[:2]
    bodies = detect_bodies_yolo(img) if run_yolo else []
    snapshot = get_snapshot()

    faces = face_app.get(img)
    detections = []
    if not faces:
        return detections, bodies

    for face in faces:
        det_score = float(getattr(face, "det_score", 1.0))
        if det_score < Config.DET_SCORE_MIN:
            continue

        bbox = face.bbox.astype(int).tolist()
        x1, y1 = max(0, bbox[0]), max(0, bbox[1])
        x2, y2 = min(w, bbox[2]), min(h, bbox[3])
        if (x2 - x1) < Config.MIN_FACE_PX or (y2 - y1) < Config.MIN_FACE_PX:
            continue

        raw_crop = img[y1:y2, x1:x2]
        if raw_crop.size == 0:
            continue

        enhanced_crop = enhance_face_for_embedding(raw_crop.copy())
        crop_b64 = cv2_to_base64(enhanced_crop if enhanced_crop is not None else raw_crop)

        embedding = face.embedding
        best_known, best_score, runner_up = match_embedding(embedding)

        if best_known is None and enhanced_crop is not None and enhanced_crop.size > 0:
            try:
                padded = pad_image(enhanced_crop, 50)
                enh_faces = face_app.get(padded)
                if enh_faces:
                    best_enh = max(enh_faces, key=lambda f: float(getattr(f, "det_score", 0)))
                    enh_known, enh_score, enh_runner_up = match_embedding(best_enh.embedding)
                    if enh_known:
                        best_known, best_score, runner_up = enh_known, enh_score, enh_runner_up
            except Exception:
                pass

        detections.append({
            "matched": bool(best_known),
            "name": best_known["name"] if best_known else "Unknown",
            "id": best_known.get("id") if best_known else None,
            "employee_code": best_known.get("employee_code") if best_known else None,
            "department": best_known.get("department") if best_known else None,
            "designation": best_known.get("designation") if best_known else None,
            "photo_url": best_known.get("photo_url") if best_known else None,
            "confidence": round(max(best_score, 0.0), 4),
            "runner_up_score": round(max(runner_up, 0.0), 4),
            "bbox": bbox,
            "crop_b64": crop_b64,
            "det_score": round(det_score, 3),
            "is_visitor": bool(best_known and best_known.get("is_visitor")),
        })

    return detections, bodies


# ──────────────────────────────────────────────────────────
# DIRECT CAMERA WORKER (twin-thread: reader + inference)
# ──────────────────────────────────────────────────────────

class DirectCameraWorker:
    def __init__(self, camera_id, source, source_type="device", interval=None):
        self.camera_id = camera_id
        self.source = source
        self.source_type = source_type
        self.interval = interval if interval else Config.FRAME_INTERVAL
        self._stop = threading.Event()
        self._latest_frame = None
        self._frame_lock = threading.Lock()

        self.last_log_time = {}
        self.log_lock = threading.Lock()
        self.presence = {}
        self.presence_lock = threading.Lock()

        self.frames_read = 0
        self.frames_processed = 0
        self.faces_seen = 0
        self.matches_seen = 0
        self.stats_lock = threading.Lock()

        self._reader = threading.Thread(target=self._reader_loop, daemon=True, name=f"reader-{camera_id}")
        self._worker = threading.Thread(target=self._worker_loop, daemon=True, name=f"worker-{camera_id}")

    # ── lifecycle ──────────────────────────────────────────

    def start(self):
        target = f"device {self.source}" if self.source_type == "device" else self.source
        log.info("[%s] Starting worker -> %s", self.camera_id, target)
        self._reader.start()
        self._worker.start()

    def stop(self):
        self._stop.set()

    # ── capture ────────────────────────────────────────────

    def _open_capture(self):
        if self.source_type == "device":
            cap = cv2.VideoCapture(self.source)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        else:
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0|analyzeduration;100000"
            )
            cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _reader_loop(self):
        cap = None
        while not self._stop.is_set():
            try:
                if cap is None or not cap.isOpened():
                    cap = self._open_capture()
                    if cap is None or not cap.isOpened():
                        time.sleep(1.0)
                        continue
                    log.info("[%s] Camera opened.", self.camera_id)

                ret, frame = cap.read()
                if ret and frame is not None:
                    with self._frame_lock:
                        self._latest_frame = frame
                    with self.stats_lock:
                        self.frames_read += 1
                else:
                    cap.release()
                    cap = None
                    time.sleep(0.2)
            except Exception as e:
                log.error("[%s] Reader error: %s", self.camera_id, e)
                if cap is not None:
                    cap.release()
                    cap = None
                time.sleep(1.0)

        if cap is not None:
            cap.release()

    # ── inference ──────────────────────────────────────────

    def _worker_loop(self):
        while not self._stop.is_set():
            try:
                frame = None
                with self._frame_lock:
                    if self._latest_frame is not None:
                        frame = self._latest_frame
                        self._latest_frame = None

                if frame is not None:
                    self._process_frame(frame)

                time.sleep(max(0.05, self.interval))
            except Exception as e:
                log.error("[%s] Worker error: %s", self.camera_id, e)
                time.sleep(1.0)

    def _process_frame(self, frame):
        h, w = frame.shape[:2]
        target_w = min(Config.MAX_WIDTH, w)
        proc = cv2.resize(frame, (target_w, int(h * target_w / w))) if w != target_w else frame

        detections, bodies = analyze_frame(proc, run_yolo=True)

        now = time.time()
        for d in detections:
            if d["matched"]:
                confirmed = self._presence_update(d["name"], d["confidence"], d.get("photo_url"), d.get("crop_b64"))
                d["confirmed"] = confirmed
                if confirmed:
                    self._log_match(d["name"], d["confidence"], d["crop_b64"], person_id=d.get("id"))
            else:
                d["confirmed"] = False
                if Config.LOG_UNKNOWN:
                    self._log_match("Unknown", d["confidence"], d["crop_b64"], person_id=None)

        with self.stats_lock:
            self.frames_processed += 1
            self.faces_seen += len(detections)
            self.matches_seen += sum(1 for d in detections if d["matched"])

    # ── presence ───────────────────────────────────────────

    def _presence_cleanup(self):
        now = time.time()
        with self.presence_lock:
            stale = [
                name for name, data in self.presence.items()
                if now - data["last_seen"] > Config.PRESENCE_TIMEOUT_SEC
            ]
            for name in stale:
                del self.presence[name]

    def _presence_update(self, name, score, photo_url, crop):
        now = time.time()
        with self.presence_lock:
            if name not in self.presence:
                self.presence[name] = {"frames": 0, "scores": [], "last_seen": 0, "confirmed": False}
            entry = self.presence[name]
            entry["frames"] += 1
            entry["scores"] = (entry["scores"] + [score])[-10:]
            entry["last_seen"] = now
            entry["photo_url"] = photo_url
            entry["crop"] = crop
            if entry["frames"] >= Config.PRESENCE_CONFIRM_FRAMES:
                entry["confirmed"] = True
            avg = sum(entry["scores"]) / len(entry["scores"])
        return entry["confirmed"] and avg

    # ── logging to Supabase ────────────────────────────────

    def _log_match(self, name, confidence, crop_b64, person_id=None):
        if supabase is None:
            return
        # Visitors must NOT be written into face_logs.person_id — that column
        # is a FK into known_faces(id) and the insert would be rejected.
        if person_id and str(name).lower().startswith("visitor: "):
            person_id = None
        now = time.time()
        key = person_id or name
        cooldown = Config.LOG_COOLDOWN_UNKNOWN_SEC if person_id is None or name.lower() == "unknown" else Config.LOG_COOLDOWN_KNOWN_SEC
        with self.log_lock:
            last = self.last_log_time.get(key, 0.0)
            if now - last < cooldown:
                return
            self.last_log_time[key] = now

        def insert():
            try:
                payload = {
                    "id": str(uuid.uuid4()),
                    "person_id": person_id,
                    "person_name": name,
                    "confidence": round(confidence, 4),
                    "snapshot_url": crop_b64,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "camera_id": self.camera_id,
                }
                supabase.table("face_logs").insert(payload).execute()
                log.info("[%s] LOG -> %s (conf=%.2f)", self.camera_id, name, confidence)
            except Exception as e:
                log.error("[%s] Log insert error: %s", self.camera_id, e)

        threading.Thread(target=insert, daemon=True).start()

    # ── stats ──────────────────────────────────────────────

    def stats(self):
        with self.stats_lock:
            return {
                "frames_read": self.frames_read,
                "frames_processed": self.frames_processed,
                "faces_seen": self.faces_seen,
                "matches_seen": self.matches_seen,
            }


# ──────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────

def list_video_devices(max_index=10):
    found = []
    for idx in range(max_index):
        dev_path = f"/dev/video{idx}"
        if not os.path.exists(dev_path):
            continue
        try:
            cap = cv2.VideoCapture(idx)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    h, w = frame.shape[:2]
                    found.append({"device_index": idx, "width": w, "height": h})
            cap.release()
        except Exception:
            pass
    return found


def parse_args():
    parser = argparse.ArgumentParser(description="Sentinel direct-camera recognition worker")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--device", type=int, help="Local webcam device index (e.g. 0 for /dev/video0)")
    group.add_argument("--rtsp", type=str, help="RTSP stream URL")
    group.add_argument("--list-devices", action="store_true", help="List available local video devices and exit")

    parser.add_argument("--camera-id", type=str, default=None, help="Camera id used in Supabase (default: direct_device_N or direct_rtsp)")
    parser.add_argument("--camera-name", type=str, default=None, help="Camera display name (default: Direct Camera N)")
    parser.add_argument("--interval", type=float, default=None, help="Seconds between inference passes (default: 0.12)")
    parser.add_argument("--threshold", type=float, default=None, help="Cosine match threshold (default: 0.35)")
    parser.add_argument("--margin", type=float, default=None, help="Min score gap over runner-up (default: 0.02)")
    parser.add_argument("--no-yolo", action="store_true", help="Disable YOLOv8 person detection")
    parser.add_argument("--no-unknown-log", action="store_true", help="Do not log Unknown faces")
    return parser.parse_args()


def main():
    args = parse_args()

    if args.list_devices:
        print(json.dumps({"devices": list_video_devices()}, indent=2))
        return

    if args.threshold is not None:
        Config.MATCH_THRESHOLD = args.threshold
    if args.margin is not None:
        Config.MATCH_MARGIN = args.margin
    if args.no_yolo:
        Config.YOLO_MODEL_PATH = None
        global yolo_app
        yolo_app = None
    if args.no_unknown_log:
        Config.LOG_UNKNOWN = False

    if face_app is None:
        log.error("InsightFace model failed to load — aborting.")
        return

    if args.device is not None:
        source_type, source = "device", args.device
        camera_id = args.camera_id or f"direct_device_{args.device}"
        camera_name = args.camera_name or f"Direct Camera {args.device}"
        rtsp_url = f"device:{args.device}"
    else:
        source_type, source = "rtsp", args.rtsp
        camera_id = args.camera_id or "direct_rtsp"
        camera_name = args.camera_name or "Direct RTSP Camera"
        rtsp_url = args.rtsp

    refresh_cache()
    ensure_camera(camera_id, camera_name, rtsp_url=rtsp_url)

    worker = DirectCameraWorker(camera_id, source, source_type, interval=args.interval)
    worker.start()

    def cache_refresher():
        while not worker._stop.is_set():
            time.sleep(Config.CACHE_REFRESH_SEC)
            refresh_cache()

    threading.Thread(target=cache_refresher, daemon=True).start()

    def on_shutdown(signum, frame):
        log.info("Shutting down worker...")
        worker.stop()

    signal.signal(signal.SIGINT, on_shutdown)
    signal.signal(signal.SIGTERM, on_shutdown)

    log.info(
        "Direct camera worker RUNNING | camera=%s (%s) | threshold=%.3f | margin=%.3f | cached_faces=%d",
        camera_id, source, Config.MATCH_THRESHOLD, Config.MATCH_MARGIN, len(get_snapshot().faces),
    )

    try:
        while not worker._stop.is_set():
            time.sleep(10)
            worker._presence_cleanup()
            present = [n for n, d in worker.presence.items() if d.get("confirmed")]
            st = worker.stats()
            log.info(
                "STATS | frames=%d | processed=%d | faces=%d | matches=%d | present=%s",
                st["frames_read"], st["frames_processed"], st["faces_seen"],
                st["matches_seen"], present or "none",
            )
    except KeyboardInterrupt:
        worker.stop()

    worker._reader.join(timeout=3)
    log.info("Worker stopped. Final stats: %s", worker.stats())
    os._exit(0)


if __name__ == "__main__":
    main()
