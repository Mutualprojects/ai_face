import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
import base64
import json
import uuid
import queue
import logging
import subprocess
import functools
import cv2
import numpy as np
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
from insightface.app import FaceAnalysis
import requests
import time
import datetime
import asyncio
import websockets
import threading

load_dotenv()

# ──────────────────────────────────────────────────────────
# LOGGING — replaces scattered print() calls with real logging
# (levels, timestamps, and the ability to turn verbosity up/down
# without touching code).
# ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("sentinel")

app = Flask(__name__)
CORS(app)

# ──────────────────────────────────────────────────────────
# CENTRAL CONFIG — every tunable constant that used to be scattered
# across the file (and sometimes duplicated with different values)
# now lives in one place, overridable via environment variables.
# ──────────────────────────────────────────────────────────
class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8005")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # Single source of truth for the match threshold (previously:
    # MATCH_THRESHOLD=0.35 global, a hardcoded 0.38 in /api/match, and a
    # stale docstring claiming 0.42 that was never set — three different
    # answers to "did this face match" depending on which code path ran).
    MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.35"))

    # NEW: margin-based rejection. A cosine score can clear the threshold
    # and STILL be a bad match if a second identity scores almost as high
    # (common with siblings, similar lighting, low-quality crops). We now
    # require the winner to beat the runner-up by this margin, not just
    # beat the threshold. Set to 0 to disable and fall back to pure
    # threshold behaviour.
    MATCH_MARGIN = float(os.getenv("MATCH_MARGIN", "0.02"))

    # Detection confidence gates — previously 0.35 in one code path and
    # 0.25 in another for the identical purpose. Unified to one value.
    DET_SCORE_MIN = float(os.getenv("DET_SCORE_MIN", "0.25"))
    REGISTER_DET_SCORE_MIN = float(os.getenv("REGISTER_DET_SCORE_MIN", "0.70"))

    PRESENCE_CONFIRM_FRAMES = int(os.getenv("PRESENCE_CONFIRM_FRAMES", "1"))
    PRESENCE_TIMEOUT_SEC = float(os.getenv("PRESENCE_TIMEOUT_SEC", "8.0"))
    FRAME_INTERVAL = float(os.getenv("FRAME_INTERVAL", "0.10"))

    EMAIL_COOLDOWN_SECONDS = float(os.getenv("EMAIL_COOLDOWN_SECONDS", "300.0"))
    LOG_COOLDOWN_KNOWN_SEC = float(os.getenv("LOG_COOLDOWN_KNOWN_SEC", "10.0"))
    LOG_COOLDOWN_UNKNOWN_SEC = float(os.getenv("LOG_COOLDOWN_UNKNOWN_SEC", "5.0"))
    WORKER_LOG_COOLDOWN_SEC = float(os.getenv("WORKER_LOG_COOLDOWN_SEC", "60.0"))

    GO2RTC_RTSP_PORT = int(os.getenv("GO2RTC_RTSP_PORT", "8554"))
    WS_PORT = int(os.getenv("WS_PORT", "5001"))

    # ── DEVICE CAMERAS ──────────────────────────────────────
    # Off by default: local webcams (/dev/videoX) must never be pulled
    # into the detection pipeline unless explicitly enabled. Prevents a
    # stale `device:0` camera row in the DB from silently capturing the
    # host laptop/webcam.
    ALLOW_DEVICE_CAMERAS = os.getenv("ALLOW_DEVICE_CAMERAS", "false").lower() == "true"

    # ── AUTH ──────────────────────────────────────────────
    # Previously every endpoint — including registering/deleting people
    # and adding/removing cameras — was wide open with no auth at all.
    # If API_KEY is set, mutating endpoints require
    #   Authorization: Bearer <API_KEY>
    # If it is not set, the server still runs (useful for local dev) but
    # logs a loud warning on every request to a protected endpoint so
    # this can't silently ship to production unauthenticated.
    API_KEY = os.getenv("API_KEY")


MEDIAMTX_YAML = os.path.join(os.path.dirname(__file__), "mediamtx.yml")
MEDIAMTX_BIN = os.path.join(os.path.dirname(__file__), "mediamtx")
MEDIAMTX_LOG = os.path.join(os.path.dirname(__file__), "mediamtx_run.log")

supabase: Client = None
db_connection_status = "Not Checked"
db_connection_error = None

if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
    db_connection_status = "Failed: Missing Credentials"
    db_connection_error = "SUPABASE_URL or SUPABASE_KEY is missing from environment"
else:
    try:
        supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
        try:
            supabase.table("known_faces").select("id").limit(1).execute()
            db_connection_status = "Connected"
        except Exception as query_err:
            err_msg = str(query_err)
            if "relation" in err_msg or "404" in err_msg or "PGRST" in err_msg:
                db_connection_status = "Connected"
            else:
                raise query_err
    except Exception as e:
        db_connection_status = "Failed"
        db_connection_error = str(e)
        log.error("Supabase connection failed: %s", e)

# ── Load InsightFace Model ──────────────────────────────────
log.info("Loading InsightFace model (preferring fast CPU-optimized 'buffalo_sc')...")
face_app = None
ACTIVE_MODEL_NAME = None

for model_name in ["buffalo_sc", "buffalo_l"]:
    try:
        candidate = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
        candidate.prepare(ctx_id=-1, det_size=(480, 480))
        face_app = candidate
        ACTIVE_MODEL_NAME = model_name
        log.info("InsightFace '%s' model loaded successfully.", model_name)
        break
    except Exception as e:
        log.warning("Could not load '%s': %s. Trying next model...", model_name, e)

if face_app is None:
    log.error("No InsightFace model could be loaded.")

# ── Load YOLOv8 Model ──────────────────────────────────
log.info("Loading YOLOv8n model...")
try:
    import torch
    try:
        import ultralytics.nn.tasks
        import torch.nn.modules.container
        torch.serialization.add_safe_globals([
            ultralytics.nn.tasks.DetectionModel,
            torch.nn.modules.container.Sequential
        ])
    except Exception:
        pass
    from ultralytics import YOLO
    yolo_app = YOLO(os.getenv("YOLO_MODEL_PATH", "/home/btl/facial_recognistion/Backend/yolov8n.pt"))
    log.info("YOLOv8n model loaded successfully.")
except Exception as e:
    log.warning("Could not load YOLOv8n model: %s", e)
    yolo_app = None


# ──────────────────────────────────────────────────────────
# AUTH DECORATOR
# ──────────────────────────────────────────────────────────
def require_api_key(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not Config.API_KEY:
            log.warning(
                "AUTH DISABLED: %s called with no API_KEY configured. "
                "Set the API_KEY env var before deploying this outside a trusted network.",
                request.path,
            )
            return fn(*args, **kwargs)
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else None
        if not token:
            token = request.headers.get("x-api-key", "")
        if token != Config.API_KEY:
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper


# ──────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ──────────────────────────────────────────────────────────

def base64_to_cv2(b64_str):
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",")[1]
        img_data = base64.b64decode(b64_str)
        nparr = np.frombuffer(img_data, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        log.error("Error decoding base64 image: %s", e)
        return None

def cv2_to_base64(img):
    try:
        _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        b64_bytes = base64.b64encode(buffer)
        return "data:image/jpeg;base64," + b64_bytes.decode('utf-8')
    except Exception as e:
        log.error("Error encoding image to base64: %s", e)
        return None

def enhance_face_for_embedding(face_img):
    """HD-quality face preprocessing: upscale -> CLAHE -> denoise -> unsharp mask."""
    if face_img is None or face_img.size == 0:
        return face_img
    try:
        h, w = face_img.shape[:2]
        if h < 112 or w < 112:
            scale = max(112.0 / h, 112.0 / w)
            face_img = cv2.resize(face_img, (max(w, int(w * scale)), max(h, int(h * scale))),
                                  interpolation=cv2.INTER_CUBIC)
        lab = cv2.cvtColor(face_img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        face_img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
        face_img = cv2.bilateralFilter(face_img, 5, 35, 35)
        gaussian = cv2.GaussianBlur(face_img, (0, 0), 2.0)
        face_img = cv2.addWeighted(face_img, 1.5, gaussian, -0.5, 0)
    except Exception:
        pass
    return face_img

def pad_image(img, pad_size=100):
    return cv2.copyMakeBorder(
        img, pad_size, pad_size, pad_size, pad_size,
        cv2.BORDER_CONSTANT, value=[128, 128, 128]
    )

def detect_faces_padded(img, pad_size=100):
    """
    Pad the face image with a neutral gray border on all sides before running
    InsightFace detection. Tightly cropped images with no background context
    often fail to trigger RetinaFace anchors. Adding a border resolves this.
    """
    if img is None or img.size == 0 or face_app is None:
        return []
    try:
        padded_img = pad_image(img, pad_size)
        faces = face_app.get(padded_img)
        if not faces:
            return []

        for f in faces:
            if hasattr(f, "bbox"):
                f.bbox[0] -= pad_size
                f.bbox[1] -= pad_size
                f.bbox[2] -= pad_size
                f.bbox[3] -= pad_size
            if hasattr(f, "landmark") and f.landmark is not None:
                f.landmark[:, 0] -= pad_size
                f.landmark[:, 1] -= pad_size
            for attr in ["landmark_2d_106", "landmark_3d_68"]:
                lm = getattr(f, attr, None)
                if lm is not None:
                    lm[:, 0] -= pad_size
                    lm[:, 1] -= pad_size
                    setattr(f, attr, lm)
        return faces
    except Exception as e:
        log.error("[detect_faces_padded] Error running detection: %s", e)
        return []

def cosine_similarity(a, b):
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))

def img_from_photo_url(photo_url: str):
    """Handles BOTH base64 data URLs and http(s) Supabase Storage URLs."""
    if not photo_url:
        return None
    if photo_url.startswith(("http://", "https://")):
        try:
            resp = requests.get(photo_url, timeout=10)
            if resp.status_code == 200:
                nparr = np.frombuffer(resp.content, np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            log.warning("[img_from_photo_url] HTTP %s for %s", resp.status_code, photo_url[:60])
        except Exception as e:
            log.warning("[img_from_photo_url] Fetch failed: %s", e)
        return None
    return base64_to_cv2(photo_url)

def fetch_known_faces():
    if supabase is None:
        return []
    try:
        res = supabase.table("known_faces").select(
            "id, name, employee_code, department, designation, email, embedding, photo_url"
        ).execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching known faces: %s", e)
        return []

def fetch_visitors():
    try:
        res = supabase.table("visitors").select("visitor_id, full_name, photo_image, embedding").execute()
        visitors_list = []
        for r in (res.data or []):
            if r.get("embedding"):
                visitors_list.append({
                    "id": r["visitor_id"],
                    "name": f"Visitor: {r['full_name']}",
                    "employee_code": None,
                    "department": "Visitor",
                    "designation": "Visitor",
                    "photo_url": r["photo_image"],
                    "embedding": r["embedding"],
                    "is_visitor": True
                })
        return visitors_list
    except Exception as e:
        log.error("Error fetching visitors from DB: %s", e)
        return []


# ──────────────────────────────────────────────────────────
# CACHE — atomic (faces, matrix) snapshot so a best_idx computed from
# one array can never accidentally index into a different, newer array.
# ──────────────────────────────────────────────────────────
class _CacheSnapshot:
    __slots__ = ("faces", "matrix")
    def __init__(self, faces, matrix):
        self.faces = faces
        self.matrix = matrix

_EMPTY_SNAPSHOT = _CacheSnapshot([], None)
_CACHE_SNAPSHOT = _EMPTY_SNAPSHOT
_CACHE_SNAPSHOT_LOCK = threading.Lock()

def get_cache_snapshot() -> _CacheSnapshot:
    with _CACHE_SNAPSHOT_LOCK:
        return _CACHE_SNAPSHOT


def match_embedding(input_emb, snapshot: _CacheSnapshot = None, threshold=None, margin=None):
    """
    Vectorized cosine similarity match against the atomic cache snapshot,
    with margin-based rejection.

    Rather than accepting the single best match the moment it clears the
    threshold, we also require it to beat the *second-best* candidate by
    `margin`. A close runner-up means the embedding sits ambiguously
    between two identities (common with siblings/look-alikes or noisy
    crops) and should be reported as a non-match rather than a
    low-confidence guess. Set margin=0 to fall back to pure
    threshold-only behaviour.

    Returns (best_face_or_None, best_score, runner_up_score).
    """
    if threshold is None:
        threshold = Config.MATCH_THRESHOLD
    if margin is None:
        margin = Config.MATCH_MARGIN
    if snapshot is None:
        snapshot = get_cache_snapshot()

    if not snapshot.faces or snapshot.matrix is None or len(snapshot.matrix) == 0:
        return None, -1.0, -1.0

    input_vec = np.asarray(input_emb, dtype=np.float32)
    if snapshot.matrix.shape[1] != input_vec.shape[0]:
        log.warning(
            "[match_embedding] Dimension mismatch: cache=%s-d, input=%s-d. "
            "Likely a stale model/embedding mismatch — run /api/refresh_cache "
            "after confirming embeddings are regenerated.",
            snapshot.matrix.shape[1], input_vec.shape[0],
        )
        return None, -1.0, -1.0

    norm_in = np.linalg.norm(input_vec)
    if norm_in == 0:
        return None, -1.0, -1.0
    vec = input_vec / norm_in

    sims = np.dot(snapshot.matrix, vec)
    if len(sims) == 1:
        best_idx = 0
        best_score = float(sims[0])
        runner_up = -1.0
    else:
        top2_idx = np.argpartition(sims, -2)[-2:]
        top2_idx = top2_idx[np.argsort(-sims[top2_idx])]
        best_idx = int(top2_idx[0])
        best_score = float(sims[best_idx])
        runner_up = float(sims[int(top2_idx[1])])

    if best_score >= threshold and (best_score - runner_up) >= margin:
        return snapshot.faces[best_idx], best_score, runner_up
    return None, best_score, runner_up


def refresh_cache():
    """Reload all known face embeddings, build the normalized matrix, and
    swap it in as ONE atomic snapshot."""
    global _CACHE_SNAPSHOT
    try:
        faces = fetch_known_faces()
        for f in faces:
            f["is_visitor"] = False

        visitors = fetch_visitors()
        all_faces = faces + visitors

        matrix_rows = []
        valid_faces = []
        for item in all_faces:
            emb_val = item.get("embedding")
            if not emb_val:
                continue
            try:
                if isinstance(emb_val, str):
                    emb_arr = np.array(json.loads(emb_val), dtype=np.float32)
                else:
                    emb_arr = np.array(emb_val, dtype=np.float32)
            except Exception as parse_err:
                log.warning("[Cache] Skipping unparsable embedding for '%s': %s", item.get('name'), parse_err)
                continue

            norm = np.linalg.norm(emb_arr)
            if norm == 0:
                continue
            matrix_rows.append(emb_arr / norm)
            valid_faces.append(item)

        matrix = np.vstack(matrix_rows) if matrix_rows else None
        new_snapshot = _CacheSnapshot(valid_faces, matrix)

        with _CACHE_SNAPSHOT_LOCK:
            _CACHE_SNAPSHOT = new_snapshot

        log.info(
            "[Cache] Loaded %d face(s) into RAM matrix (%d known faces, %d visitors fetched; "
            "%d skipped — no/invalid embedding). Active model: %s",
            len(valid_faces), len(faces), len(visitors),
            len(faces) + len(visitors) - len(valid_faces), ACTIVE_MODEL_NAME,
        )
    except Exception as e:
        log.error("Error refreshing cache: %s", e)


def check_and_regenerate_embeddings():
    """If the active InsightFace model differs from the one that generated
    stored embeddings, cosine similarity between them is meaningless —
    detect that and regenerate everything automatically."""
    if supabase is None or face_app is None:
        return
    try:
        res = supabase.table("known_faces").select("id, name, embedding, photo_url").limit(10).execute()
        if not res.data:
            log.info("[Embeddings Check] No known faces in database.")
            return

        test_face_found = False
        stored_emb = None
        current_emb = None

        for row in res.data:
            stored_emb_val = row.get("embedding")
            photo_url = row.get("photo_url")
            if not stored_emb_val or not photo_url:
                continue

            stored_emb = np.array(json.loads(stored_emb_val) if isinstance(stored_emb_val, str) else stored_emb_val,
                                   dtype=np.float32)

            img = img_from_photo_url(photo_url)
            if img is None:
                continue

            faces = detect_faces_padded(img)
            if not faces:
                continue

            primary = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
            current_emb = primary.embedding.astype(np.float32)
            test_face_found = True
            log.info("[Embeddings Check] Using face of '%s' as test case for model check.", row.get('name'))
            break

        if not test_face_found:
            log.info("[Embeddings Check] Could not extract face from any of the first 10 stored photos, skipping check.")
            return

        if stored_emb.shape[0] != current_emb.shape[0]:
            sim = 0.0
            log.warning(
                "[Embeddings Check] Dimension mismatch (stored=%d, current=%d) — forcing regeneration.",
                stored_emb.shape[0], current_emb.shape[0],
            )
        else:
            sim = cosine_similarity(stored_emb, current_emb)
            log.info("[Embeddings Check] Cosine similarity between stored and current model: %.4f", sim)

        if sim < 0.90:
            log.warning("[Embeddings Check] Embedding model mismatch detected. Regenerating ALL database embeddings...")

            all_known = supabase.table("known_faces").select("id, name, photo_url").execute()
            for k_row in (all_known.data or []):
                k_img = img_from_photo_url(k_row.get("photo_url"))
                if k_img is None:
                    log.warning("[Embeddings Check] could not load photo for '%s' — skipped.", k_row['name'])
                    continue
                k_faces = detect_faces_padded(k_img)
                if not k_faces:
                    log.warning("[Embeddings Check] no face detected in stored photo for '%s' — skipped.", k_row['name'])
                    continue
                k_primary = max(k_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                supabase.table("known_faces").update(
                    {"embedding": k_primary.embedding.tolist()}
                ).eq("id", k_row["id"]).execute()
                log.info("[Embeddings Check] Regenerated known face: %s", k_row['name'])

            all_visitors = supabase.table("visitors").select("visitor_id, full_name, photo_image").execute()
            for v_row in (all_visitors.data or []):
                v_img = img_from_photo_url(v_row.get("photo_image"))
                if v_img is None:
                    continue
                v_faces = detect_faces_padded(v_img)
                if not v_faces:
                    continue
                v_primary = max(v_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                supabase.table("visitors").update(
                    {"embedding": v_primary.embedding.tolist()}
                ).eq("visitor_id", v_row["visitor_id"]).execute()
                log.info("[Embeddings Check] Regenerated visitor face: %s", v_row['full_name'])

            log.info("[Embeddings Check] Embedding regeneration complete.")
    except Exception as e:
        log.error("[Embeddings Check] Error during check/regeneration: %s", e)

if supabase is not None:
    try:
        check_and_regenerate_embeddings()
        refresh_cache()
    except Exception as _cache_err:
        log.error("[Cache] Could not pre-load cache at startup: %s", _cache_err)


# ──────────────────────────────────────────────────────────
# UNIFIED FACE-ANALYSIS PIPELINE
#
# This is the single most important structural fix. The original code had
# THREE separate, hand-copied implementations of "detect faces in an
# image, gate on det_score, crop, enhance, retry on the enhanced crop,
# match against the cache" — one in CameraWorker._process_frame, one in
# /api/match, one in process_ws_frame (websocket). They drifted out of
# sync with each other (different det_score gates, different padding
# behaviour on the retry pass) which is *exactly* why the same face could
# match on one path and not another. Now there is exactly one
# implementation, and every entry point calls it.
# ──────────────────────────────────────────────────────────

def analyze_frame(img, snapshot: _CacheSnapshot = None, run_yolo: bool = False,
                   yolo_imgsz: int = None, min_face_px: int = 15):
    """
    Runs face detection + matching (and optionally YOLO person-body
    detection) on a single BGR image. Returns (detections, bodies).

    detections: list of dicts identical in shape to what each of the three
    old call sites used to hand-build separately.
    """
    if face_app is None:
        return [], []

    if snapshot is None:
        snapshot = get_cache_snapshot()

    h, w = img.shape[:2]
    bodies = []

    if run_yolo and yolo_app is not None:
        try:
            if yolo_imgsz:
                scale = min(yolo_imgsz / max(w, h), 1.0)
                yolo_img = (cv2.resize(img, (int(w * scale), int(h * scale)),
                                        interpolation=cv2.INTER_LINEAR)
                            if scale < 1.0 else img)
            else:
                scale = 1.0
                yolo_img = img
            results = yolo_app(yolo_img, verbose=False, imgsz=yolo_imgsz) if yolo_imgsz else yolo_app(yolo_img, verbose=False)
            for r in results:
                for box in r.boxes:
                    if int(box.cls[0]) != 0:
                        continue
                    x1, y1, x2, y2 = [v / scale for v in box.xyxy[0].tolist()]
                    conf = float(box.conf[0])
                    if conf >= 0.40:
                        bodies.append([x1, y1, x2, y2, conf])
        except Exception as e:
            log.warning("YOLO inference error: %s", e)

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
        if (x2 - x1) < min_face_px or (y2 - y1) < min_face_px:
            continue

        raw_crop = img[y1:y2, x1:x2]
        if raw_crop.size == 0:
            continue

        enhanced_crop = enhance_face_for_embedding(raw_crop.copy())
        crop_b64 = cv2_to_base64(enhanced_crop if enhanced_crop is not None else raw_crop)

        embedding = face.embedding
        lm = getattr(face, "landmark_2d_106", None)
        best_known, best_score, runner_up = match_embedding(embedding, snapshot)

        # Retry pass on the enhanced, padded crop if no match was found —
        # identical padding/retry behaviour on every call site now.
        if not best_known and enhanced_crop is not None and enhanced_crop.size > 0:
            try:
                padded_crop = pad_image(enhanced_crop, 50)
                enh_faces = face_app.get(padded_crop)
                if enh_faces:
                    best_enh = max(enh_faces, key=lambda f: float(getattr(f, 'det_score', 0)))
                    enh_known, enh_score, enh_runner_up = match_embedding(best_enh.embedding, snapshot)
                    if enh_known:
                        best_known, best_score, runner_up = enh_known, enh_score, enh_runner_up
                        lm = getattr(best_enh, "landmark_2d_106", None)
            except Exception:
                pass

        landmarks = lm.astype(float).tolist() if lm is not None else []

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
            "landmarks": landmarks,
        })

        if not best_known and best_score > 0.15:
            log.debug("Unmatched face, best_score=%.3f runner_up=%.3f (threshold=%.3f, margin=%.3f)",
                      best_score, runner_up, Config.MATCH_THRESHOLD, Config.MATCH_MARGIN)

    return detections, bodies


# ──────────────────────────────────────────────────────────
# MEDIAMTX STREAM UTILS (unchanged behaviour, logging swapped in)
# ──────────────────────────────────────────────────────────

def detect_codec_and_width(stream_url: str) -> tuple:
    from urllib.parse import unquote
    decoded_url = unquote(stream_url)
    codec = "unknown"
    width = None
    try:
        cmd = ["ffprobe", "-v", "quiet"]
        if decoded_url.lower().startswith("rtsp://"):
            cmd.extend(["-rtsp_transport", "tcp"])
        cmd.extend([
            "-i", decoded_url, "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width", "-of", "default=noprint_wrappers=1"
        ])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
        for line in result.stdout.strip().split("\n"):
            if "=" in line:
                key, val = line.split("=", 1)
                if key.strip() == "codec_name":
                    codec = val.strip().lower()
                elif key.strip() == "width":
                    try:
                        width = int(val.strip())
                    except ValueError:
                        pass
        log.info("Detected codec: %s, width: %s", codec, width)
        return codec, width
    except Exception as e:
        log.warning("ffprobe failed: %s", e)
        return "unknown", None

def build_mediamtx_src(stream_url: str) -> dict:
    from urllib.parse import unquote
    decoded_url = unquote(stream_url)
    if "$" in decoded_url:
        decoded_url = decoded_url.replace("$", "%24")

    codec, width = detect_codec_and_width(decoded_url)

    if codec in ("hevc", "h265"):
        log.info("HEVC detected — will use high-quality ffmpeg transcode via runOnDemand")
        vf_scale = ""
        if width and width > 1280:
            vf_scale = "-vf scale=1280:-2 "
            log.info("Adding downscale filter (1280x720) for stream width %s", width)

        input_flags = "-rtsp_transport tcp " if decoded_url.lower().startswith("rtsp://") else ""
        return {
            "source": "publisher",
            "runOnDemand": f"ffmpeg -hide_banner -avoid_negative_ts make_zero -fflags nobuffer+discardcorrupt -flags low_delay -analyzeduration 100000 -probesize 100000 {input_flags}-i '{decoded_url}' {vf_scale}-c:v libx264 -preset ultrafast -tune zerolatency -crf 20 -pix_fmt yuv420p -g 15 -keyint_min 15 -sc_threshold 0 -an -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH",
            "runOnDemandRestart": True,
            "runOnDemandCloseAfter": "10s"
        }

    return {"source": decoded_url}

def write_mediamtx_yaml_entry(camera_id: str, cfg_dict: dict):
    try:
        import yaml
        with open(MEDIAMTX_YAML, "r") as f:
            cfg = yaml.safe_load(f) or {}
        if "paths" not in cfg or cfg["paths"] is None:
            cfg["paths"] = {}
        cfg["paths"][camera_id] = cfg_dict
        with open(MEDIAMTX_YAML, "w") as f:
            yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)
        log.info("mediamtx.yml updated for '%s'", camera_id)
    except Exception as e:
        log.error("Failed to update mediamtx.yml: %s", e)

def restart_mediamtx():
    try:
        subprocess.run(["pkill", "-f", "mediamtx"], timeout=3, capture_output=True)
        time.sleep(0.8)
        subprocess.Popen(
            f"nohup {MEDIAMTX_BIN} {MEDIAMTX_YAML} > {MEDIAMTX_LOG} 2>&1 &",
            shell=True,
            start_new_session=True
        )
        time.sleep(1.5)
        log.info("mediamtx restarted with updated config")
    except Exception as e:
        log.error("Failed to restart mediamtx: %s", e)

def remove_mediamtx_yaml_entry(camera_id: str):
    try:
        import yaml
        with open(MEDIAMTX_YAML, "r") as f:
            cfg = yaml.safe_load(f) or {}
        if "paths" in cfg and cfg["paths"] and camera_id in cfg["paths"]:
            del cfg["paths"][camera_id]
            with open(MEDIAMTX_YAML, "w") as f:
                yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)
            log.info("mediamtx.yml: removed '%s'", camera_id)
    except Exception as e:
        log.error("Failed to remove from mediamtx.yml: %s", e)

def sync_cameras_to_db():
    if supabase is None:
        return
    try:
        import yaml
        from urllib.parse import unquote

        with open(MEDIAMTX_YAML, "r") as f:
            cfg = yaml.safe_load(f) or {}

        paths = cfg.get("paths", {})
        if not paths:
            return

        existing = supabase.table("cameras").select("id").execute()
        existing_ids = {row["id"] for row in (existing.data or [])}
        KNOWN_NAMES = {"camera1": ("Default Camera", "Main Entrance")}

        inserted = 0
        for cam_id, info in paths.items():
            if cam_id in existing_ids:
                continue
            if not isinstance(info, dict):
                continue

            src_str = ""
            if "source" in info and info["source"] != "publisher":
                src_str = info["source"]
            elif "runOnInit" in info:
                import re
                match = re.search(r'-i\s+[\'"]?(rtsp://[^\s\'"]+)[\'"]?', info["runOnInit"])
                if match:
                    src_str = match.group(1)

            if not src_str:
                continue

            rtsp_url = unquote(src_str)
            if cam_id in KNOWN_NAMES:
                name, place = KNOWN_NAMES[cam_id]
            else:
                name = cam_id.replace("_", " ").title()
                place = "Unknown"

            supabase.table("cameras").insert({
                "id": cam_id, "name": name, "place": place, "rtsp_url": rtsp_url,
            }).execute()
            log.info("[Sync] Inserted missing camera '%s' into Supabase", cam_id)
            inserted += 1

        if inserted > 0:
            log.info("[Sync] Synced %d camera(s) to Supabase.", inserted)
    except Exception as e:
        log.error("[Sync] Camera sync failed: %s", e)

sync_cameras_to_db()
restart_mediamtx()

# ──────────────────────────────────────────────────────────
# THREAD-SAFE SHARED STATE
# Previously several of these dicts (LATEST_DETECTIONS, EMAIL_COOLDOWN,
# LAST_LOGGED_TIME) were mutated from multiple threads (camera workers +
# websocket executor threads + Flask request threads) with no lock. CPython's
# GIL makes single dict-key writes atomic enough to not crash, but
# check-then-act sequences (cooldown checks) are not atomic and can race.
# Every shared dict now has an explicit lock and is only touched through it.
# ──────────────────────────────────────────────────────────

PRESENCE_TRACKER: dict = {}
PRESENCE_LOCK = threading.Lock()

LOG_SSE_QUEUE: queue.Queue = queue.Queue(maxsize=200)
LAST_LOGGED_TIME: dict = {}
LOG_LOCK = threading.Lock()

EMAIL_COOLDOWN: dict = {}
EMAIL_LOCK = threading.Lock()

LATEST_DETECTIONS: dict = {}
LATEST_DETECTIONS_LOCK = threading.Lock()

CAMERA_WORKERS: dict = {}
WORKERS_LOCK = threading.Lock()

WS_BUSY: dict = {}
WS_BUSY_LOCK = threading.Lock()


def presence_update(camera_id: str, name: str, score: float, photo_url, crop_b64):
    now = time.time()
    with PRESENCE_LOCK:
        if camera_id not in PRESENCE_TRACKER:
            PRESENCE_TRACKER[camera_id] = {}
        tracker = PRESENCE_TRACKER[camera_id]
        if name not in tracker:
            tracker[name] = {"frames": 0, "scores": [], "last_seen": 0,
                             "photo_url": photo_url, "crop": crop_b64, "confirmed": False}
        entry = tracker[name]
        entry["frames"] += 1
        entry["scores"] = (entry["scores"] + [score])[-10:]
        entry["last_seen"] = now
        entry["photo_url"] = photo_url
        entry["crop"] = crop_b64
        if entry["frames"] >= Config.PRESENCE_CONFIRM_FRAMES:
            entry["confirmed"] = True
        avg = sum(entry["scores"]) / len(entry["scores"])
    return entry["confirmed"], avg

def presence_cleanup(camera_id: str):
    now = time.time()
    with PRESENCE_LOCK:
        if camera_id not in PRESENCE_TRACKER:
            return
        stale = [n for n, d in PRESENCE_TRACKER[camera_id].items()
                 if now - d["last_seen"] > Config.PRESENCE_TIMEOUT_SEC]
        for n in stale:
            del PRESENCE_TRACKER[camera_id][n]


def send_realtime_recognition_email(person_id: str, name: str, camera_id: str, confidence: float, email_addr: str):
    if not email_addr or "@" not in str(email_addr):
        return

    now = time.time()
    key = (person_id or name, camera_id)
    with EMAIL_LOCK:
        last_sent = EMAIL_COOLDOWN.get(key, 0.0)
        if now - last_sent < Config.EMAIL_COOLDOWN_SECONDS:
            return
        EMAIL_COOLDOWN[key] = now

    def _async_email_task():
        try:
            cam_name = f"Camera ({camera_id})"
            cam_loc = "Main Facility"
            try:
                cres = supabase.table("cameras").select("name, location, zone").eq("id", camera_id).execute()
                if cres.data and len(cres.data) > 0:
                    cdata = cres.data[0]
                    cam_name = cdata.get("name") or cam_name
                    cam_loc = cdata.get("location") or cdata.get("zone") or cam_loc
            except Exception:
                pass

            from datetime import datetime
            timestr = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            subject = f"Sentinel AI: Entry Recognition Alert - {cam_name}"

            html_content = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #101B22; background-color: #FAF9F5; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #E4E0D6; border-radius: 16px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                  <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #1F6F5C; margin: 0;">Sentinel AI Recognition Alert</h2>
                    <p style="color: #6B6558; font-size: 13px;">Real-Time Facility Access Control Notification</p>
                  </div>
                  <hr style="border: 0; border-top: 1px solid #E4E0D6; margin: 20px 0;" />
                  <p style="font-size: 15px;">Hello <strong>{name}</strong>,</p>
                  <p style="font-size: 14px; color: #374151;">
                    Your face was just recognized entering the facility through our surveillance camera network.
                  </p>
                  <div style="background-color: #F7F5F0; border-left: 4px solid #1F6F5C; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 4px 0; font-size: 13px;"><strong>Camera:</strong> {cam_name}</p>
                    <p style="margin: 4px 0; font-size: 13px;"><strong>Location:</strong> {cam_loc}</p>
                    <p style="margin: 4px 0; font-size: 13px;"><strong>Time of Entry:</strong> {timestr}</p>
                    <p style="margin: 4px 0; font-size: 13px;"><strong>Match Confidence:</strong> {confidence * 100:.1f}%</p>
                  </div>
                  <p style="font-size: 13px; color: #6B6558;">
                    If you did not pass by this camera or suspect unauthorized identity usage, please notify Security immediately.
                  </p>
                  <hr style="border: 0; border-top: 1px solid #E4E0D6; margin: 20px 0;" />
                  <p style="font-size: 11px; color: #9C9585; text-align: center;">
                    Sentinel AI Security System - Automated Access Log
                  </p>
                </div>
              </body>
            </html>
            """

            log_entry = f"[{timestr}] EMAIL NOTIFICATION -> Sent to {email_addr} ({name}) | Camera: {cam_name} ({cam_loc}) | Match: {confidence * 100:.1f}%\n"
            with open("email_notifications.log", "a") as ef:
                ef.write(log_entry)
            log.info("[Email Notification] %s", log_entry.strip())

            smtp_server = os.environ.get("SMTP_SERVER")
            smtp_port = int(os.environ.get("SMTP_PORT", 587))
            smtp_user = os.environ.get("SMTP_USER")
            smtp_pass = os.environ.get("SMTP_PASSWORD")
            smtp_from = os.environ.get("SMTP_FROM", smtp_user or "alerts@sentinel.ai")

            if smtp_server and smtp_user and smtp_pass:
                import smtplib
                from email.mime.multipart import MIMEMultipart
                from email.mime.text import MIMEText

                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = smtp_from
                msg["To"] = email_addr
                msg.attach(MIMEText(html_content, "html"))

                with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_pass)
                    server.sendmail(smtp_from, [email_addr], msg.as_string())
                log.info("[SMTP] Email delivered to %s", email_addr)
        except Exception as err:
            log.error("[Email Error] Failed sending email to %s: %s", email_addr, err)

    threading.Thread(target=_async_email_task, daemon=True).start()


def log_match(camera_id: str, name: str, confidence: float, crop_b64: str, person_id: str = None):
    if supabase is None:
        return
    now = time.time()
    key = (camera_id, person_id or name)
    cooldown = Config.LOG_COOLDOWN_UNKNOWN_SEC if (not person_id or name.lower() == "unknown") else Config.LOG_COOLDOWN_KNOWN_SEC
    with LOG_LOCK:
        last_time = LAST_LOGGED_TIME.get(key, 0.0)
        if now - last_time < cooldown:
            return
        LAST_LOGGED_TIME[key] = now
    try:
        from datetime import datetime, timezone
        row_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        payload = {
            "id": row_id,
            "person_name": name,
            "confidence": round(confidence, 4),
            "snapshot_url": crop_b64,
            "timestamp": created_at,
            "camera_id": camera_id
        }
        supabase.table("face_logs").insert(payload).execute()
        log.info("[Logger %s] Logged event: %s (person_id=%s, conf=%.2f)", camera_id, name, person_id, confidence)

        if person_id and name.lower() != "unknown":
            try:
                snap = get_cache_snapshot()
                target_email = None
                if snap and snap.faces:
                    for fitem in snap.faces:
                        if fitem.get("id") == person_id:
                            target_email = fitem.get("email")
                            break
                if target_email:
                    send_realtime_recognition_email(person_id, name, camera_id, confidence, target_email)
            except Exception as e_mail_err:
                log.error("[Logger Email Dispatch Error]: %s", e_mail_err)

        try:
            LOG_SSE_QUEUE.put_nowait({
                "id": row_id, "person_id": person_id, "person_name": name, "confidence": round(confidence, 4),
                "snapshot_url": crop_b64, "created_at": created_at, "camera_id": camera_id,
            })
        except queue.Full:
            pass
    except Exception as e:
        log.error("[Logger %s] Log error: %s", camera_id, e)


def worker_log_match(camera_id: str, name: str, confidence: float, crop_b64: str, person_id: str = None):
    """Same cooldown-guarded insert used by CameraWorker (longer cooldown,
    fire-and-forget async insert instead of feeding the SSE queue)."""
    if supabase is None:
        return
    now = time.time()
    key = (camera_id, person_id or name)
    with LOG_LOCK:
        last_time = LAST_LOGGED_TIME.get(key, 0.0)
        if now - last_time < Config.WORKER_LOG_COOLDOWN_SEC:
            return
        LAST_LOGGED_TIME[key] = now

    def run_db_insert():
        try:
            payload = {
                "id": str(uuid.uuid4()),
                "person_id": person_id,
                "person_name": name,
                "confidence": round(confidence, 4),
                "snapshot_url": crop_b64,
                "camera_id": camera_id
            }
            supabase.table("face_logs").insert(payload).execute()
            log.info("[Async Logger %s] Logged face: %s (person_id=%s, conf=%.2f)", camera_id, name, person_id, confidence)
        except Exception as e:
            log.error("[Async Logger %s] Log error: %s", camera_id, e)

    threading.Thread(target=run_db_insert, daemon=True).start()


def list_local_video_devices(max_index=10):
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


class CameraWorker:
    """Background worker with twin-thread architecture:
    1) Dedicated RTSP Frame Reader Thread: Constantly drains OpenCV RTSP buffers,
       keeping self._latest_frame populated with the ABSOLUTE NEWEST live camera frame.
    2) Inference Worker Thread: Runs analyze_frame() on the latest frame at regular
       intervals without ANY buffer queue lag accumulation.
    """

    def __init__(self, camera_id: str, source_type: str = "rtsp", device_index: int = None):
        self.camera_id = camera_id
        self.source_type = source_type
        self.device_index = device_index
        self.url = f"rtsp://localhost:{Config.GO2RTC_RTSP_PORT}/{camera_id}" if source_type == "rtsp" else None
        self._stop = threading.Event()
        self._latest_frame = None
        self._frame_lock = threading.Lock()

        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True, name=f"reader-{camera_id}")
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name=f"worker-{camera_id}")

    def start(self):
        self._reader_thread.start()
        self._worker_thread.start()
        target = self.url if self.source_type == "rtsp" else f"local device #{self.device_index}"
        log.info("[Worker] Twin-thread pipeline started for '%s' -> %s", self.camera_id, target)

    def stop(self):
        self._stop.set()
        log.info("[Worker] Stopped for '%s'", self.camera_id)

    def _open_capture(self):
        if self.source_type == "device":
            cap = cv2.VideoCapture(self.device_index)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        else:
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;0|analyzeduration;100000"
            cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _reader_loop(self):
        log.info("[Reader %s] RTSP zero-latency buffer drain loop started.", self.camera_id)
        cap = None

        while not self._stop.is_set():
            try:
                if cap is None or not cap.isOpened():
                    cap = self._open_capture()
                    if not cap or not cap.isOpened():
                        time.sleep(1.0)
                        continue

                ret, frame = cap.read()
                if ret and frame is not None:
                    with self._frame_lock:
                        self._latest_frame = frame
                else:
                    if cap:
                        cap.release()
                        cap = None
                    time.sleep(0.2)

            except Exception as e:
                log.error("[Reader %s] Stream read error: %s", self.camera_id, e)
                if cap:
                    cap.release()
                    cap = None
                time.sleep(1.0)

        if cap:
            cap.release()

    def _worker_loop(self):
        log.info("[Worker %s] Inference pipeline started.", self.camera_id)

        while not self._stop.is_set():
            try:
                frame_to_process = None
                with self._frame_lock:
                    if self._latest_frame is not None:
                        frame_to_process = self._latest_frame
                        self._latest_frame = None  # Consume frame

                if frame_to_process is not None:
                    self._process_frame(frame_to_process)

                time.sleep(max(0.05, Config.FRAME_INTERVAL))

            except Exception as e:
                log.error("[Worker %s] Inference loop error: %s", self.camera_id, e)
                time.sleep(1.0)

    def _process_frame(self, frame):
        try:
            h, w = frame.shape[:2]
            target_w = 1280
            proc_frame = cv2.resize(frame, (target_w, int(h * target_w / w)))

            snapshot = get_cache_snapshot()
            detections, bodies = analyze_frame(proc_frame, snapshot, run_yolo=True, min_face_px=15)

            presence_cleanup(self.camera_id)

            for d in detections:
                d["camera_id"] = self.camera_id
                if d["matched"]:
                    confirmed, avg_score = presence_update(
                        self.camera_id, d["name"], d["confidence"], d.get("photo_url"), d["crop_b64"]
                    )
                    d["confirmed"] = confirmed
                    d["confidence"] = round(avg_score, 4)
                    if confirmed:
                        worker_log_match(self.camera_id, d["name"], avg_score, d["crop_b64"], person_id=d.get("id"))
                else:
                    d["confirmed"] = False
                    worker_log_match(self.camera_id, "Unknown", d["confidence"], d["crop_b64"], person_id=None)

            with LATEST_DETECTIONS_LOCK:
                LATEST_DETECTIONS[self.camera_id] = {
                    "detections": detections, "timestamp": time.time(), "bodies": bodies,
                    "frame_width": target_w, "frame_height": int(h * target_w / w),
                }
        except Exception as e:
            log.error("[Worker %s] Frame error: %s", self.camera_id, e)


def start_all_workers():
    if supabase is None or face_app is None:
        log.warning("[Workers] Skipping — Supabase or InsightFace not ready.")
        return
    try:
        res = supabase.table("cameras").select("*").execute()
        cameras = res.data or []
        with WORKERS_LOCK:
            for cam in cameras:
                cam_id = cam["id"]
                if cam_id not in CAMERA_WORKERS:
                    rtsp_url = cam.get("rtsp_url", "") or ""
                    src_type = cam.get("source_type")
                    dev_idx = cam.get("device_index")
                    if not src_type:
                        if rtsp_url.startswith("device:"):
                            src_type = "device"
                            try:
                                dev_idx = int(rtsp_url.split(":")[1])
                            except Exception:
                                dev_idx = 0
                        else:
                            src_type = "rtsp"

                    if src_type == "device":
                        if not Config.ALLOW_DEVICE_CAMERAS:
                            log.warning(
                                "[Workers] Skipping '%s' — local device cameras are disabled "
                                "(set ALLOW_DEVICE_CAMERAS=true to enable).",
                                cam_id,
                            )
                            continue
                        w = CameraWorker(cam_id, source_type="device", device_index=dev_idx if dev_idx is not None else 0)
                    else:
                        w = CameraWorker(cam_id, source_type="rtsp")
                    CAMERA_WORKERS[cam_id] = w
                    w.start()
        log.info("[Workers] Started %d camera worker(s).", len(cameras))
    except Exception as e:
        log.error("[Workers] Failed to start workers: %s", e)


def stop_camera_worker(camera_id: str):
    with WORKERS_LOCK:
        w = CAMERA_WORKERS.pop(camera_id, None)
    if w:
        w.stop()


def stop_all_workers():
    with WORKERS_LOCK:
        ids = list(CAMERA_WORKERS.keys())
    for cam_id in ids:
        with WORKERS_LOCK:
            w = CAMERA_WORKERS.pop(cam_id, None)
        if w:
            w.stop()
    log.info("[Workers] Stopped all %d camera worker(s).", len(ids))


def auto_cleanup_unknown_logs_worker():
    """Background worker running every 60s to purge Unknown face logs older
    than 50 minutes, keeping ALL Known person face logs PERMANENTLY."""
    log.info("[Retention Policy] Unknown face logs cleanup worker started (50-minute TTL for Unknowns, permanent for Knowns).")
    while True:
        try:
            if supabase is not None:
                cutoff_dt = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=50)
                cutoff_time = cutoff_dt.isoformat()

                # Delete Unknown face_logs where timestamp/created_at < 50 mins ago
                try:
                    res = supabase.table("face_logs") \
                        .delete() \
                        .eq("person_name", "Unknown") \
                        .lt("timestamp", cutoff_time) \
                        .execute()
                except Exception:
                    res = supabase.table("face_logs") \
                        .delete() \
                        .eq("person_name", "Unknown") \
                        .lt("created_at", cutoff_time) \
                        .execute()

                deleted_count = len(res.data) if res.data else 0
                if deleted_count > 0:
                    log.info("[Retention Policy] Purged %d Unknown face log(s) older than 50 minutes.", deleted_count)
        except Exception as e:
            log.error("[Retention Policy] Error purging old Unknown logs: %s", e)

        time.sleep(60)


if supabase is not None:
    try:
        start_all_workers()
        threading.Thread(target=auto_cleanup_unknown_logs_worker, daemon=True, name="unknown-logs-cleaner").start()
    except Exception as _w_err:
        log.error("[Workers] Could not start workers on boot: %s", _w_err)

# ──────────────────────────────────────────────────────────
# ENDPOINTS
# Read-only / informational endpoints stay open. Anything that creates,
# updates, or deletes data (registering people, cameras, deleting
# records) is now wrapped with @require_api_key.
# ──────────────────────────────────────────────────────────

@app.route("/api/cameras/local_devices", methods=["GET"])
def get_local_devices():
    return jsonify({"devices": list_local_video_devices()})

@app.route("/api/workers/start", methods=["POST"])
@require_api_key
def workers_start():
    start_all_workers()
    with WORKERS_LOCK:
        active = list(CAMERA_WORKERS.keys())
    return jsonify({"success": True, "active_cameras": active, "count": len(active)})

@app.route("/api/workers/stop", methods=["POST"])
@require_api_key
def workers_stop():
    stop_all_workers()
    return jsonify({"success": True})

@app.route("/api/presence/all", methods=["GET"])
def get_presence_all():
    now = time.time()
    with WORKERS_LOCK:
        all_cam_ids = list(CAMERA_WORKERS.keys())

    with PRESENCE_LOCK:
        all_cam_ids = list(set(all_cam_ids) | set(PRESENCE_TRACKER.keys()))

    for cam_id in all_cam_ids:
        presence_cleanup(cam_id)

    merged: dict = {}
    snapshot = get_cache_snapshot()
    cache_map = {item["name"]: item for item in snapshot.faces if "name" in item}
    with PRESENCE_LOCK:
        for cam_id in PRESENCE_TRACKER:
            for name, data in PRESENCE_TRACKER[cam_id].items():
                if not data.get("confirmed") or name == "Unknown":
                    continue
                scores = data.get("scores", [1.0])
                conf = sum(scores) / len(scores)
                if name not in merged or conf > merged[name]["confidence"]:
                    meta = cache_map.get(name, {})
                    merged[name] = {
                        "name": name, "employee_code": meta.get("employee_code"),
                        "department": meta.get("department"), "designation": meta.get("designation"),
                        "confidence": round(conf, 4), "seen_frames": data["frames"],
                        "last_seen": data["last_seen"], "seconds_ago": round(now - data["last_seen"], 1),
                        "photo_url": data.get("photo_url"), "crop": data.get("crop"), "camera_id": cam_id,
                    }

    present = sorted(merged.values(), key=lambda x: x["last_seen"], reverse=True)
    return jsonify({"present": present, "count": len(present), "cameras_monitored": len(all_cam_ids)})


@app.route("/", methods=["GET"])
def home():
    snapshot = get_cache_snapshot()
    return jsonify({
        "status": "online",
        "service": "Facial Recognition Backend with InsightFace",
        "database": {"status": db_connection_status, "url": Config.SUPABASE_URL, "error": db_connection_error},
        "model_loaded": face_app is not None,
        "active_model": ACTIVE_MODEL_NAME,
        "match_threshold": Config.MATCH_THRESHOLD,
        "match_margin": Config.MATCH_MARGIN,
        "cached_faces": len(snapshot.faces),
        "auth_enabled": bool(Config.API_KEY),
    })

@app.route("/api/health", methods=["GET"])
def health():
    snapshot = get_cache_snapshot()
    with WORKERS_LOCK:
        workers = list(CAMERA_WORKERS.keys())
    return jsonify({
        "status": "healthy",
        "database_connected": db_connection_status == "Connected",
        "model_loaded": face_app is not None,
        "active_model": ACTIVE_MODEL_NAME,
        "match_threshold": Config.MATCH_THRESHOLD,
        "match_margin": Config.MATCH_MARGIN,
        "cached_faces": len(snapshot.faces),
        "active_workers": workers,
    })

@app.route("/api/detections/<camera_id>", methods=["GET"])
def get_detections(camera_id):
    with LATEST_DETECTIONS_LOCK:
        result = LATEST_DETECTIONS.get(camera_id, {"detections": [], "timestamp": None})
    dets = result.get("detections", [])
    any_matched = any(d["matched"] for d in dets)
    best = max(dets, key=lambda d: d["confidence"]) if dets else None
    return jsonify({
        "camera_id": camera_id, "detections": dets, "bodies": result.get("bodies", []),
        "matched": any_matched,
        "name": best["name"] if best and best["matched"] else None,
        "confidence": best["confidence"] if best else 0.0,
        "frame_width": result.get("frame_width"),
        "frame_height": result.get("frame_height"),
        "timestamp": result.get("timestamp"),
    })

@app.route("/api/cameras", methods=["GET"])
def get_cameras():
    try:
        res = supabase.table("cameras").select("*").order("created_at").execute()
        return jsonify(res.data or [])
    except Exception as e:
        log.error("Error fetching cameras from DB: %s", e)
        return jsonify([])

@app.route("/api/cameras", methods=["POST"])
@require_api_key
def add_camera():
    data = request.json or {}
    name = data.get("name")
    place = data.get("place")
    source_type = data.get("source_type", "rtsp")

    if not name:
        return jsonify({"error": "Missing name"}), 400

    if source_type == "device":
        if not Config.ALLOW_DEVICE_CAMERAS:
            return jsonify({"error": "Local device cameras are disabled (set ALLOW_DEVICE_CAMERAS=true to enable)."}), 400
        device_index = data.get("device_index")
        if device_index is None:
            return jsonify({"error": "Missing device_index for source_type='device'"}), 400
        device_index = int(device_index)

        new_id = f"camera_{uuid.uuid4().hex[:8]}"
        new_camera = {
            "id": new_id, "name": name, "place": place,
            "rtsp_url": f"device:{device_index}",
        }
        try:
            supabase.table("cameras").insert(new_camera).execute()
        except Exception as e:
            log.error("Error inserting camera to DB: %s", e)
            return jsonify({"error": "Database error"}), 500

        with WORKERS_LOCK:
            if new_id not in CAMERA_WORKERS:
                w = CameraWorker(new_id, source_type="device", device_index=device_index)
                CAMERA_WORKERS[new_id] = w
                w.start()

        return jsonify({"success": True, "camera": new_camera})

    rtsp_url = data.get("rtsp_url")
    if not rtsp_url:
        return jsonify({"error": "Missing rtsp_url"}), 400

    new_id = f"camera_{uuid.uuid4().hex[:8]}"
    new_camera = {"id": new_id, "name": name, "place": place, "rtsp_url": rtsp_url}

    try:
        supabase.table("cameras").insert(new_camera).execute()
    except Exception as e:
        log.error("Error inserting camera to DB: %s", e)
        return jsonify({"error": "Database error"}), 500

    src = build_mediamtx_src(rtsp_url)
    write_mediamtx_yaml_entry(new_id, src)
    restart_mediamtx()

    with WORKERS_LOCK:
        if new_id not in CAMERA_WORKERS:
            w = CameraWorker(new_id, source_type="rtsp")
            CAMERA_WORKERS[new_id] = w
            w.start()

    return jsonify({"success": True, "camera": new_camera})

@app.route("/api/cameras/<camera_id>", methods=["DELETE"])
@require_api_key
def delete_camera(camera_id):
    if camera_id == "camera1":
        return jsonify({"error": "Cannot delete default camera"}), 400

    try:
        supabase.table("cameras").delete().eq("id", camera_id).execute()
    except Exception as e:
        log.error("Error deleting camera from DB: %s", e)
        return jsonify({"error": "Database error"}), 500

    remove_mediamtx_yaml_entry(camera_id)
    restart_mediamtx()
    stop_camera_worker(camera_id)
    with LATEST_DETECTIONS_LOCK:
        LATEST_DETECTIONS.pop(camera_id, None)

    return jsonify({"success": True})

@app.route("/api/extract", methods=["POST"])
@require_api_key
def extract_embedding():
    if not face_app:
        return jsonify({"error": "InsightFace model is not loaded on the backend"}), 500

    image_b64 = None

    try:
        if request.files.get("image"):
            file_bytes = request.files["image"].read()
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            data = request.json or {}
            image_b64 = data.get("image")
            if not image_b64:
                return jsonify({"error": "Missing image"}), 400
            img = base64_to_cv2(image_b64)

        if img is None:
            return jsonify({"error": "Invalid image data"}), 400

        faces = face_app.get(img)
        if not faces:
            return jsonify({"error": "No face detected in the image"}), 400

        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

        bbox = face.bbox.astype(int)
        h, w, _ = img.shape
        pad_x = int((bbox[2] - bbox[0]) * 0.15)
        pad_y = int((bbox[3] - bbox[1]) * 0.15)
        x1 = max(0, bbox[0] - pad_x)
        y1 = max(0, bbox[1] - pad_y)
        x2 = min(w, bbox[2] + pad_x)
        y2 = min(h, bbox[3] + pad_y)

        face_crop = img[y1:y2, x1:x2]
        face_b64 = cv2_to_base64(face_crop) if face_crop.size > 0 else (image_b64 or cv2_to_base64(img))

        embedding = face.embedding.tolist()

        return jsonify({
            "success": True, "embedding": embedding, "photo_url": face_b64, "bbox": bbox.tolist()
        })
    except Exception as e:
        log.error("Error extracting embedding: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/register", methods=["POST"])
@app.route("/api/employees", methods=["POST"])
@require_api_key
def register_face():
    if not face_app:
        return jsonify({"error": "InsightFace model is not loaded on the backend"}), 500

    image_b64 = None

    try:
        if request.files.get("image"):
            name = request.form.get("name", "").strip()
            employee_code = request.form.get("employee_code", "").strip()
            department = request.form.get("department", "").strip()
            designation = request.form.get("designation", "").strip()
            email = request.form.get("email", "").strip()
            mobile = request.form.get("mobile", "").strip()
            file_bytes = request.files["image"].read()
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            data = request.json or {}
            name = (data.get("name") or "").strip()
            employee_code = (data.get("employee_code") or "").strip()
            department = (data.get("department") or "").strip()
            designation = (data.get("designation") or "").strip()
            email = (data.get("email") or "").strip()
            mobile = (data.get("mobile") or "").strip()
            image_b64 = data.get("image")
            if not image_b64:
                return jsonify({"error": "Missing name or image"}), 400
            img = base64_to_cv2(image_b64)

        if not name:
            return jsonify({"error": "Missing name"}), 400
        if not employee_code:
            return jsonify({"error": "Missing employee_code"}), 400
        if img is None:
            return jsonify({"error": "Invalid image data"}), 400

        faces = face_app.get(img)
        if not faces:
            return jsonify({"error": "No face detected in the image. Please try another shot."}), 400

        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

        det_score = float(face.det_score) if hasattr(face, 'det_score') else 1.0
        if det_score < Config.REGISTER_DET_SCORE_MIN:
            return jsonify({"error": "Face is too blurry or unclear. Please take a clearer photo looking directly at the camera."}), 400

        bbox = face.bbox.astype(int)
        h, w, _ = img.shape
        pad_x = int((bbox[2] - bbox[0]) * 0.15)
        pad_y = int((bbox[3] - bbox[1]) * 0.15)
        x1 = max(0, bbox[0] - pad_x)
        y1 = max(0, bbox[1] - pad_y)
        x2 = min(w, bbox[2] + pad_x)
        y2 = min(h, bbox[3] + pad_y)

        face_crop = img[y1:y2, x1:x2]
        face_b64 = cv2_to_base64(face_crop) if face_crop.size > 0 else (image_b64 or cv2_to_base64(img))

        embedding = face.embedding.tolist()

        existing = supabase.table("known_faces").select("id").eq("employee_code", employee_code).execute()

        payload = {
            "name": name, "employee_code": employee_code,
            "embedding": embedding, "photo_url": face_b64
        }
        if department: payload["department"] = department
        if designation: payload["designation"] = designation
        if email: payload["email"] = email
        if mobile: payload["mobile"] = mobile

        if existing.data and len(existing.data) > 0:
            res = supabase.table("known_faces").update(payload).eq("employee_code", employee_code).execute()
        else:
            existing_by_name = supabase.table("known_faces").select("id").eq("name", name).execute()
            if existing_by_name.data and len(existing_by_name.data) > 0:
                res = supabase.table("known_faces").update(payload).eq("name", name).execute()
            else:
                res = supabase.table("known_faces").insert(payload).execute()

        refresh_cache()

        return jsonify({
            "success": True,
            "message": f"Successfully registered {name}",
            "data": {
                "id": res.data[0]["id"] if res.data else None,
                "name": name, "employee_code": employee_code, "photo_url": face_b64
            }
        })
    except Exception as e:
        log.error("Error registering face: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/refresh_cache", methods=["POST"])
@require_api_key
def api_refresh_cache():
    try:
        refresh_cache()
        snapshot = get_cache_snapshot()
        return jsonify({"success": True, "message": "Cache refreshed successfully",
                         "cached_faces": len(snapshot.faces)})
    except Exception as e:
        log.error("Error refreshing cache: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/match", methods=["POST"])
def match_face():
    if not face_app:
        return jsonify({"error": "InsightFace model is not loaded on the backend"}), 500

    try:
        if request.files.get("image"):
            file_bytes = request.files["image"].read()
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            data = request.json or {}
            image_b64 = data.get("image")
            if not image_b64:
                return jsonify({"error": "Missing image"}), 400
            img = base64_to_cv2(image_b64)

        if img is None:
            return jsonify({"error": "Invalid image data"}), 400

        detections, bodies = analyze_frame(img, run_yolo=True, min_face_px=20)

        if not detections and not face_app.get(img):
            return jsonify({"detections": [], "matched": False, "message": "No face detected in frame"}), 200

        any_matched = any(d["matched"] for d in detections)
        best_det = max(detections, key=lambda d: d["confidence"]) if detections else None

        return jsonify({
            "detections": detections, "bodies": bodies, "matched": any_matched,
            "name": best_det["name"] if best_det and best_det["matched"] else None,
            "employee_code": best_det.get("employee_code") if best_det and best_det["matched"] else None,
            "department": best_det.get("department") if best_det and best_det["matched"] else None,
            "designation": best_det.get("designation") if best_det and best_det["matched"] else None,
            "confidence": best_det["confidence"] if best_det else 0.0,
            "photo_url": best_det["photo_url"] if best_det and best_det["matched"] else None,
            "bbox": best_det["bbox"] if best_det else None,
            "crop_b64": best_det["crop_b64"] if best_det else None,
        })

    except Exception as e:
        log.error("Error matching face: %s", e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/top_matches", methods=["POST"])
def top_matches():
    """Given a base64 face crop, return the top N closest known faces with
    scores — useful for debugging borderline matches."""
    if not face_app:
        return jsonify({"error": "Model not loaded"}), 500
    try:
        data = request.json or {}
        image_b64 = data.get("image")
        top_n = int(data.get("top_n", 5))
        if not image_b64:
            return jsonify({"error": "Missing image"}), 400
        img = base64_to_cv2(image_b64)
        if img is None:
            return jsonify({"error": "Invalid image"}), 400

        faces = face_app.get(img)
        if not faces:
            return jsonify({"matches": [], "message": "No face detected"}), 200

        primary = max(faces, key=lambda f: float(getattr(f, 'det_score', 0)))
        input_emb = primary.embedding

        snapshot = get_cache_snapshot()
        candidates = []
        for known in snapshot.faces:
            known_emb_val = known.get("embedding")
            if not known_emb_val:
                continue
            try:
                known_emb = np.array(json.loads(known_emb_val) if isinstance(known_emb_val, str) else known_emb_val)
            except Exception:
                continue
            sim = float(cosine_similarity(input_emb, known_emb))
            candidates.append({
                "id": known.get("id"), "name": known.get("name", "Unknown"),
                "photo_url": known.get("photo_url"), "similarity": round(sim, 4),
                "pct": round(sim * 100, 1), "match": sim >= Config.MATCH_THRESHOLD,
            })

        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        return jsonify({"matches": candidates[:top_n], "threshold": Config.MATCH_THRESHOLD,
                         "margin": Config.MATCH_MARGIN})

    except Exception as e:
        log.error("top_matches error: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/registered_faces", methods=["GET"])
def get_registered_faces():
    try:
        res = supabase.table("known_faces").select(
            "id, name, employee_code, department, designation, email, mobile, photo_url, created_at"
        ).order("name").execute()
        return jsonify(res.data or [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/registered_faces/<id>", methods=["DELETE"])
@require_api_key
def delete_registered_face(id):
    try:
        supabase.table("known_faces").delete().eq("id", id).execute()
        refresh_cache()
        return jsonify({"success": True, "message": "Face registration deleted."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/employees", methods=["GET"])
def get_employees():
    try:
        res = supabase.table("known_faces").select(
            "id, name, employee_code, department, designation, email, mobile, photo_url, created_at"
        ).order("name").execute()
        return jsonify(res.data or [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/employees/<employee_code>", methods=["GET"])
def get_employee_by_code(employee_code):
    try:
        res = supabase.table("known_faces").select(
            "id, name, employee_code, department, designation, email, mobile, photo_url, created_at"
        ).eq("employee_code", employee_code).execute()
        if res.data and len(res.data) > 0:
            return jsonify(res.data[0])
        return jsonify({"error": f"Employee {employee_code} not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/employees/<employee_code>", methods=["PUT"])
@require_api_key
def update_employee(employee_code):
    try:
        existing = supabase.table("known_faces").select("id").eq("employee_code", employee_code).execute()
        if not existing.data or len(existing.data) == 0:
            return jsonify({"error": f"Employee {employee_code} not found"}), 404

        name = department = designation = email = mobile = None

        if request.files.get("image") or request.form:
            name = request.form.get("name")
            department = request.form.get("department")
            designation = request.form.get("designation")
            email = request.form.get("email")
            mobile = request.form.get("mobile")
        elif request.is_json:
            data = request.json or {}
            name = data.get("name")
            department = data.get("department")
            designation = data.get("designation")
            email = data.get("email")
            mobile = data.get("mobile")

        payload = {}
        if name: payload["name"] = name.strip()
        if department is not None: payload["department"] = department.strip()
        if designation is not None: payload["designation"] = designation.strip()
        if email is not None: payload["email"] = email.strip()
        if mobile is not None: payload["mobile"] = mobile.strip()

        img = None
        if request.files.get("image"):
            file_bytes = request.files["image"].read()
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        elif request.is_json and request.json and request.json.get("image"):
            img = base64_to_cv2(request.json.get("image"))

        if img is not None:
            if not face_app:
                return jsonify({"error": "InsightFace model is not loaded"}), 500
            faces = face_app.get(img)
            if not faces:
                return jsonify({"error": "No face detected in the image"}), 400
            face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

            bbox = face.bbox.astype(int)
            h, w, _ = img.shape
            pad_x = int((bbox[2] - bbox[0]) * 0.15)
            pad_y = int((bbox[3] - bbox[1]) * 0.15)
            x1, y1 = max(0, bbox[0]-pad_x), max(0, bbox[1]-pad_y)
            x2, y2 = min(w, bbox[2]+pad_x), min(h, bbox[3]+pad_y)
            face_crop = img[y1:y2, x1:x2]
            if face_crop.size > 0:
                enhanced_face = enhance_face_for_embedding(face_crop.copy())
                face_b64 = cv2_to_base64(enhanced_face)
                enh_faces = face_app.get(enhanced_face)
                if enh_faces:
                    primary = max(enh_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                    embedding = primary.embedding.tolist()
                else:
                    embedding = face.embedding.tolist()
            else:
                face_b64 = cv2_to_base64(img)
                embedding = face.embedding.tolist()

            payload["embedding"] = embedding
            payload["photo_url"] = face_b64

        if payload:
            supabase.table("known_faces").update(payload).eq("employee_code", employee_code).execute()
            refresh_cache()

        return jsonify({"success": True, "message": f"Successfully updated employee {employee_code}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/employees/<employee_code>", methods=["DELETE"])
@require_api_key
def delete_employee_by_code(employee_code):
    try:
        supabase.table("known_faces").delete().eq("employee_code", employee_code).execute()
        refresh_cache()
        return jsonify({"success": True, "message": f"Employee {employee_code} registration deleted."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/face_logs", methods=["GET"])
def get_face_logs():
    log_type = request.args.get("type", "all")
    try:
        q = supabase.table("face_logs").select("*").order("created_at", desc=True).limit(100)
        if log_type == "known":
            q = q.neq("person_name", "Unknown")
        elif log_type == "unknown":
            q = q.eq("person_name", "Unknown")
        res = q.execute()
        logs = res.data or []
    except Exception:
        try:
            q = supabase.table("face_logs").select("*").order("timestamp", desc=True).limit(100)
            if log_type == "known":
                q = q.neq("person_name", "Unknown")
            elif log_type == "unknown":
                q = q.eq("person_name", "Unknown")
            res = q.execute()
            logs = res.data or []
        except Exception as e2:
            return jsonify({"error": str(e2)}), 500

    snapshot = get_cache_snapshot()
    cache_map = {item["name"]: item for item in snapshot.faces if "name" in item}

    cam_map = {}
    try:
        cams = supabase.table("cameras").select("id, name, place").execute().data or []
        for c in cams:
            cam_label = f"{c['name']} ({c['place']})" if c.get("place") else c["name"]
            cam_map[c["id"]] = cam_label
    except Exception:
        pass

    default_cam = list(cam_map.values())[0] if cam_map else "Camera Stream"

    for log_row in logs:
        name = log_row.get("person_name")
        if name and name in cache_map:
            log_row["employee_code"] = cache_map[name].get("employee_code")
            log_row["department"] = cache_map[name].get("department")
            log_row["designation"] = cache_map[name].get("designation")

        cid = log_row.get("camera_id")
        if cid and cid in cam_map:
            log_row["camera_name"] = cam_map[cid]
        elif not log_row.get("camera_name"):
            log_row["camera_name"] = default_cam

    return jsonify(logs)

@app.route("/api/logs/stream", methods=["GET"])
def logs_sse_stream():
    def generate():
        yield "data: {\"ping\": true}\n\n"
        while True:
            try:
                log_row = LOG_SSE_QUEUE.get(timeout=15)
                yield f"data: {json.dumps(log_row)}\n\n"
            except queue.Empty:
                yield "data: {\"ping\": true}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )

@app.route("/api/presence/<camera_id>", methods=["GET"])
def get_presence(camera_id):
    presence_cleanup(camera_id)
    now = time.time()
    with PRESENCE_LOCK:
        tracker = dict(PRESENCE_TRACKER.get(camera_id, {}))

    present = []
    for name, data in tracker.items():
        if data.get("confirmed") and name != "Unknown":
            scores = data.get("scores", [1.0])
            present.append({
                "name": name, "confidence": round(sum(scores) / len(scores), 4),
                "seen_frames": data["frames"], "last_seen": data["last_seen"],
                "seconds_ago": round(now - data["last_seen"], 1),
                "photo_url": data.get("photo_url"), "crop": data.get("crop"),
            })

    present.sort(key=lambda x: x["last_seen"], reverse=True)
    return jsonify({"camera_id": camera_id, "present": present, "count": len(present)})

import concurrent.futures

WS_CLIENTS = set()
executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

def process_ws_frame(camera_id, image_b64):
    """WebSocket frame processor — now a thin wrapper around the same
    analyze_frame() pipeline everything else uses."""
    img = base64_to_cv2(image_b64)
    if img is None:
        return None

    h, w = img.shape[:2]
    snapshot = get_cache_snapshot()
    detections, bodies = analyze_frame(img, snapshot, run_yolo=True, yolo_imgsz=320, min_face_px=8)

    presence_cleanup(camera_id)
    for d in detections:
        d["camera_id"] = camera_id
        if d["matched"]:
            presence_update(camera_id, d["name"], d["confidence"], d.get("photo_url"), d["crop_b64"])
            d["confirmed"] = True
            log_match(camera_id, d["name"], d["confidence"], d["crop_b64"], person_id=d.get("id"))
        else:
            d["confirmed"] = False
            log_match(camera_id, "Unknown", d["confidence"], d["crop_b64"])

    return {
        "camera_id": camera_id, "detections": detections, "bodies": bodies,
        "frame_width": w, "frame_height": h
    }

async def ws_handler(websocket):
    WS_CLIENTS.add(websocket)
    try:
        async for message in websocket:
            camera_id = None
            try:
                data = json.loads(message)
                image_b64 = data.get("image")
                camera_id = data.get("camera_id")
                if not image_b64 or not camera_id:
                    continue

                with WS_BUSY_LOCK:
                    if WS_BUSY.get(camera_id, False):
                        continue
                    WS_BUSY[camera_id] = True

                try:
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(executor, process_ws_frame, camera_id, image_b64)
                    if result:
                        await websocket.send(json.dumps(result))
                finally:
                    with WS_BUSY_LOCK:
                        WS_BUSY[camera_id] = False

            except Exception as e:
                log.error("WS msg error: %s", e)
                if camera_id:
                    with WS_BUSY_LOCK:
                        WS_BUSY[camera_id] = False
    finally:
        WS_CLIENTS.discard(websocket)

async def start_server_async():
    async with websockets.serve(ws_handler, "0.0.0.0", Config.WS_PORT, ping_interval=None):
        await asyncio.Future()

def start_ws_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_server_async())

threading.Thread(target=start_ws_server, daemon=True).start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    snapshot = get_cache_snapshot()
    log.info("Starting Flask server on port %d...", port)
    log.info("Active model: %s | MATCH_THRESHOLD: %s | MATCH_MARGIN: %s | Cached faces: %d | Auth: %s",
              ACTIVE_MODEL_NAME, Config.MATCH_THRESHOLD, Config.MATCH_MARGIN,
              len(snapshot.faces), "ENABLED" if Config.API_KEY else "DISABLED")
    app.run(host="0.0.0.0", port=port, debug=False)