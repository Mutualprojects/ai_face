import os
import base64
import json
import uuid
import subprocess
import cv2
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
from insightface.app import FaceAnalysis
import requests
import time
import asyncio
import websockets
import threading




# Load env variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for frontend compatibility

SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8005")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase client
supabase: Client = None
db_connection_status = "Not Checked"
db_connection_error = None

if not SUPABASE_URL or not SUPABASE_KEY:
    db_connection_status = "Failed: Missing Credentials"
    db_connection_error = "SUPABASE_URL or SUPABASE_KEY is missing from environment"
else:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Test the connection via a quick request
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

# ── Load InsightFace Model ──────────────────────────────────
# buffalo_l = large ArcFace model → highest accuracy (primary)
# Falls back to buffalo_sc (small/CPU-optimised) if buffalo_l not available
print("Loading InsightFace buffalo_l model (best accuracy) on CPU...")
face_app = None

for model_name in ["buffalo_l", "buffalo_sc"]:
    try:
        candidate = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
        candidate.prepare(ctx_id=-1, det_size=(640, 640))
        face_app = candidate
        print(f"InsightFace '{model_name}' model loaded successfully.")
        break
    except Exception as e:
        print(f"Could not load '{model_name}': {e}. Trying next model...")

if face_app is None:
    print("ERROR: No InsightFace model could be loaded.")

# ── Load YOLOv8 Model (For Body Detection) ──────────────────
print("Loading Fire & Smoke model...")
try:
    from ultralytics import YOLO
    yolo_app = YOLO("/home/btl/fire_&_smoke/best.pt")
    print("Fire & Smoke model loaded successfully.")
except Exception as e:
    print(f"ERROR: Could not load Fire & Smoke model: {e}")
    yolo_app = None


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
        print(f"Error decoding base64 image: {e}")
        return None

def cv2_to_base64(img):
    try:
        _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        b64_bytes = base64.b64encode(buffer)
        return "data:image/jpeg;base64," + b64_bytes.decode('utf-8')
    except Exception as e:
        print(f"Error encoding image to base64: {e}")
        return None

def cosine_similarity(a, b):
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))

def fetch_known_faces():
    """Fetch all known face embeddings from Supabase."""
    if supabase is None:
        return []
    try:
        res = supabase.table("known_faces").select("id, name, embedding, photo_url").execute()
        return res.data or []
    except Exception as e:
        print(f"Error fetching known faces: {e}")
        return []

def match_embedding(input_emb, known_list, threshold=0.40):
    """Compare input_emb against known_list, return best match or None."""
    best_match = None
    best_score = -1.0

    for known in known_list:
        known_emb_val = known.get("embedding")
        if not known_emb_val:
            continue

        if isinstance(known_emb_val, str):
            known_emb = np.array(json.loads(known_emb_val))
        else:
            known_emb = np.array(known_emb_val)

        sim = cosine_similarity(input_emb, known_emb)
        if sim > best_score:
            best_score = sim
            best_match = known

    if best_match and best_score >= threshold:
        return best_match, best_score
    return None, best_score

# ── In-Memory Face Cache ─────────────────────────────────────────────────────
# PERFORMANCE FIX: Load all known face embeddings into RAM once at startup.
# This eliminates the expensive Supabase HTTP round-trip on every video frame.
# The cache is refreshed live when faces are added or deleted via the API.
# NOTE: Placed here (after fetch_known_faces) to avoid a NameError at module load.
KNOWN_FACES_CACHE: list = []

def refresh_cache():
    """Reload all known face embeddings from Supabase into RAM."""
    global KNOWN_FACES_CACHE
    data = fetch_known_faces()
    KNOWN_FACES_CACHE = data
    print(f"[Cache] Loaded {len(KNOWN_FACES_CACHE)} known faces into memory.")

# Populate cache at startup
if supabase is not None:
    try:
        refresh_cache()
    except Exception as _cache_err:
        print(f"[Cache] Could not pre-load cache at startup: {_cache_err}")


# ──────────────────────────────────────────────────────────
# MEDIAMTX STREAM UTILS
# ──────────────────────────────────────────────────────────
MEDIAMTX_YAML = os.path.join(os.path.dirname(__file__), "mediamtx.yml")
MEDIAMTX_BIN  = os.path.join(os.path.dirname(__file__), "mediamtx")
MEDIAMTX_LOG  = os.path.join(os.path.dirname(__file__), "mediamtx_run.log")

def detect_codec(rtsp_url: str) -> str:
    """Probe the RTSP stream to detect its video codec."""
    # Decode any percent-encoded characters (e.g. %24 → $) before probing
    from urllib.parse import unquote
    decoded_url = unquote(rtsp_url)
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-rtsp_transport", "tcp",
             "-i", decoded_url, "-select_streams", "v:0",
             "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1"],
            capture_output=True, text=True, timeout=12
        )
        codec = result.stdout.strip().lower()
        print(f"Detected codec for stream: {codec or 'unknown'}")
        return codec or "unknown"
    except Exception as e:
        print(f"ffprobe failed: {e}")
        return "unknown"

def build_mediamtx_src(rtsp_url: str) -> dict:
    """Build the mediamtx stream configuration dictionary."""
    from urllib.parse import unquote
    decoded_url = unquote(rtsp_url)
    codec = detect_codec(decoded_url)
    if codec in ("hevc", "h265"):
        print(f"HEVC detected — will use ffmpeg transcode via runOnInit")
        # MediaMTX will spawn ffmpeg on init, which pulls the stream and publishes it to this path.
        return {
            "source": "publisher",
            "runOnInit": f"ffmpeg -hide_banner -avoid_negative_ts make_zero -fflags nobuffer -flags low_delay -rtsp_transport tcp -i '{decoded_url}' -c:v libx264 -preset ultrafast -tune zerolatency -an -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH",
            "runOnInitRestart": True
        }
    return {"source": decoded_url}

def write_mediamtx_yaml_entry(camera_id: str, cfg_dict: dict):
    """Add or update a stream entry in mediamtx.yml."""
    try:
        import yaml
        with open(MEDIAMTX_YAML, "r") as f:
            cfg = yaml.safe_load(f) or {}

        if "paths" not in cfg:
            cfg["paths"] = {}
        if cfg["paths"] is None:
            cfg["paths"] = {}

        cfg["paths"][camera_id] = cfg_dict

        with open(MEDIAMTX_YAML, "w") as f:
            yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)
        print(f"mediamtx.yml updated for '{camera_id}'")
    except Exception as e:
        print(f"Failed to update mediamtx.yml: {e}")

def restart_mediamtx():
    """Kill existing mediamtx process and restart with updated YAML."""
    import time
    try:
        subprocess.run(["pkill", "-f", "mediamtx"], timeout=3, capture_output=True)
        time.sleep(0.8)
        subprocess.Popen(
            f"nohup {MEDIAMTX_BIN} {MEDIAMTX_YAML} > {MEDIAMTX_LOG} 2>&1 &",
            shell=True,
            start_new_session=True
        )
        time.sleep(1.5)  # Give mediamtx time to load all streams
        print("mediamtx restarted with updated config")
    except Exception as e:
        print(f"Failed to restart mediamtx: {e}")

def remove_mediamtx_yaml_entry(camera_id: str):
    """Remove a stream entry from mediamtx.yml."""
    try:
        import yaml
        with open(MEDIAMTX_YAML, "r") as f:
            cfg = yaml.safe_load(f) or {}
        if "paths" in cfg and cfg["paths"] and camera_id in cfg["paths"]:
            del cfg["paths"][camera_id]
            with open(MEDIAMTX_YAML, "w") as f:
                yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)
            print(f"mediamtx.yml: removed '{camera_id}'")
    except Exception as e:
        print(f"Failed to remove from mediamtx.yml: {e}")

def sync_cameras_to_db():
    """
    At startup, read mediamtx.yml and make sure every stream entry
    also exists as a row in the Supabase 'cameras' table.
    """
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

        # Fetch existing camera IDs from Supabase so we can skip those
        existing = supabase.table("cameras").select("id").execute()
        existing_ids = {row["id"] for row in (existing.data or [])}

        KNOWN_NAMES = {
            "camera1": ("Default Camera", "Main Entrance"),
        }

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
                # Extract URL from ffmpeg command
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
                name  = cam_id.replace("_", " ").title()
                place = "Unknown"

            supabase.table("cameras").insert({
                "id":       cam_id,
                "name":     name,
                "place":    place,
                "rtsp_url": rtsp_url,
            }).execute()
            print(f"[Sync] Inserted missing camera '{cam_id}' into Supabase")
            inserted += 1

        if inserted > 0:
            print(f"[Sync] Synced {inserted} camera(s) to Supabase.")

    except Exception as e:
        print(f"[Sync] Camera sync failed: {e}")

sync_cameras_to_db()
restart_mediamtx()

# ── Camera Background Workers ─────────────────────────────────────────────────
# Each active camera gets a daemon thread that reads HD frames from MediaMTX's
# RTSP stream. This prevents sending frames over HTTP.
#
#   • Backend controls the processing rate — no browser CPU wasted
#   • Supabase face_logs only written on MATCH — drastically fewer DB writes
#   • Frontend becomes a pure display layer (WebRTC + polling /api/detections)

import threading, time

GO2RTC_RTSP_PORT = 8554          # go2rtc internal RTSP restream port
FRAME_INTERVAL   = 0.15          # seconds between processed frames per camera (6.6 FPS)
MATCH_THRESHOLD  = 0.38          # ArcFace cosine similarity threshold

# Log rate-limiting/cooldown tracking
LAST_LOGGED_TIME: dict = {}
LOG_LOCK = threading.Lock()

def log_match(camera_id: str, name: str, confidence: float, crop_b64: str):
    """Insert ONE row per matched face — never for unknowns. Uses 10s cooldown. Synchronous for WS reliability."""
    if supabase is None:
        return

    now = time.time()
    key = (camera_id, name)

    with LOG_LOCK:
        last_time = LAST_LOGGED_TIME.get(key, 0.0)
        if now - last_time < 10.0:  # 10 second cooldown per person/camera
            return
        LAST_LOGGED_TIME[key] = now

    try:
        import uuid as _uuid
        supabase.table("face_logs").insert({
            "id":           str(_uuid.uuid4()),
            "person_name":  name,
            "confidence":   round(confidence, 4),
            "snapshot_url": crop_b64,
        }).execute()
        print(f"[Logger {camera_id}] Successfully logged match: {name} ({confidence:.2f})")
    except Exception as e:
        print(f"[Logger {camera_id}] Log error: {e}")

# Per-camera latest detection results (in RAM, not DB)
# Structure: { camera_id: {"detections": [...], "timestamp": float} }
LATEST_DETECTIONS: dict = {}

# Active worker threads
CAMERA_WORKERS: dict = {}
WORKERS_LOCK = threading.Lock()


class CameraWorker:
    """Background thread that reads RTSP frames via OpenCV."""

    def __init__(self, camera_id: str):
        self.camera_id  = camera_id
        self.url        = f"rtsp://localhost:8554/{camera_id}"
        self._stop      = threading.Event()
        self._thread    = threading.Thread(target=self._run, daemon=True,
                                           name=f"worker-{camera_id}")

    def start(self):
        self._thread.start()
        print(f"[Worker] Started for '{self.camera_id}' → {self.url}")

    def stop(self):
        self._stop.set()
        print(f"[Worker] Stopped for '{self.camera_id}'")

    # ── internal ──────────────────────────────────────────────────────────────
    def _run(self):
        import time
        import cv2

        print(f"[Worker {self.camera_id}] OpenCV RTSP capture loop started.")
        cap = None
        
        last_process_time = 0

        while not self._stop.is_set():
            try:
                if cap is None or not cap.isOpened():
                    cap = cv2.VideoCapture(self.url)
                    # Optimize for zero-latency by minimizing buffer size
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                # Grab frame from the buffer as fast as possible to avoid lag
                ret = cap.grab()
                if not ret:
                    cap.release()
                    cap = None
                    self._stop.wait(2)
                    continue

                now = time.time()
                # Only decode and process a frame if enough time has passed
                if now - last_process_time >= FRAME_INTERVAL:
                    ret, frame = cap.retrieve()
                    if ret and frame is not None:
                        self._process_frame(frame)
                        last_process_time = now

            except Exception as e:
                print(f"[Worker {self.camera_id}] Fetch error: {e}")
                if cap:
                    cap.release()
                    cap = None
                self._stop.wait(3)
                continue

    def _process_frame(self, frame):
        """Run InsightFace on one HD frame and update LATEST_DETECTIONS."""
        if face_app is None:
            return
        try:
            # Resize frame to max width 640 (maintaining aspect ratio)
            # This matches the frontend video box scale and boosts CPU inference speed.
            h, w = frame.shape[:2]
            target_w = 640
            scale = target_w / w
            target_h = int(h * scale)
            proc_frame = cv2.resize(frame, (target_w, target_h))

            # YOLO Body/Fire/Smoke Detection
            bodies = []
            if 'yolo_app' in globals() and yolo_app is not None:
                try:
                    # Detect all classes (fire and smoke)
                    results = yolo_app(proc_frame, verbose=False)
                    for r in results:
                        for box in r.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            conf = float(box.conf[0])
                            bodies.append([x1, y1, x2, y2, conf])
                except Exception as e:
                    print(f"YOLO inference error: {e}")

            faces = face_app.get(proc_frame)
            if not faces:
                LATEST_DETECTIONS[self.camera_id] = {
                    "detections": [], "timestamp": time.time()
                }
                return

            h, w = proc_frame.shape[:2]
            detections = []

            for face in faces:
                det_score = float(getattr(face, "det_score", 1.0))
                if det_score < 0.5:
                    continue

                bbox   = face.bbox.astype(int).tolist()
                x1, y1 = max(0, bbox[0]), max(0, bbox[1])
                x2, y2 = min(w, bbox[2]), min(h, bbox[3])

                face_crop = proc_frame[y1:y2, x1:x2]
                crop_b64  = cv2_to_base64(face_crop) if face_crop.size > 0 else None

                lm = getattr(face, "landmark_2d_106", None)
                landmarks = lm.astype(float).tolist() if lm is not None else []

                best_known, best_score = match_embedding(
                    face.embedding, KNOWN_FACES_CACHE, MATCH_THRESHOLD
                )

                if best_known:
                    detections.append({
                        "matched":    True,
                        "name":       best_known["name"],
                        "confidence": round(best_score, 4),
                        "photo_url":  best_known.get("photo_url"),
                        "bbox":       bbox,
                        "crop_b64":   crop_b64,
                        "det_score":  round(det_score, 3),
                        "landmarks":  landmarks,
                        "camera_id":  self.camera_id,
                    })
                    # Write to Supabase ONLY on a real match — zero wasteful writes
                    self._log_match(best_known["name"], best_score, crop_b64)
                else:
                    detections.append({
                        "matched":    False,
                        "name":       "Unknown",
                        "confidence": round(max(best_score, 0.0), 4),
                        "photo_url":  None,
                        "bbox":       bbox,
                        "crop_b64":   crop_b64,
                        "det_score":  round(det_score, 3),
                        "landmarks":  landmarks,
                        "camera_id":  self.camera_id,
                    })

            LATEST_DETECTIONS[self.camera_id] = {
                "detections": detections,
                "timestamp":  time.time(),
            }



        except Exception as e:
            print(f"[Worker {self.camera_id}] Frame error: {e}")

    def _log_match(self, name: str, confidence: float, crop_b64):
        """Insert ONE row per matched face — never for unknowns. Uses 10s cooldown and async threads."""
        if supabase is None:
            return

        now = time.time()
        key = (self.camera_id, name)

        with LOG_LOCK:
            last_time = LAST_LOGGED_TIME.get(key, 0.0)
            if now - last_time < 10.0:  # 10 second cooldown per person/camera
                return
            LAST_LOGGED_TIME[key] = now

        # Run database insert in a separate daemon thread to not block the main camera frame loop
        def run_db_insert():
            try:
                import uuid as _uuid
                supabase.table("face_logs").insert({
                    "id":           str(_uuid.uuid4()),
                    "person_name":  name,
                    "confidence":   round(confidence, 4),
                    "snapshot_url": crop_b64,
                }).execute()
                print(f"[Async Logger {self.camera_id}] Successfully logged match: {name} ({confidence:.2f})")
            except Exception as e:
                print(f"[Async Logger {self.camera_id}] Log error: {e}")

        threading.Thread(target=run_db_insert, daemon=True).start()


def start_all_workers():
    """Start one CameraWorker thread for every camera in the Supabase cameras table."""
    if supabase is None or face_app is None:
        print("[Workers] Skipping — Supabase or InsightFace not ready.")
        return
    try:
        res = supabase.table("cameras").select("id").execute()
        cameras = res.data or []
        with WORKERS_LOCK:
            for cam in cameras:
                cam_id = cam["id"]
                if cam_id not in CAMERA_WORKERS:
                    w = CameraWorker(cam_id)
                    CAMERA_WORKERS[cam_id] = w
                    w.start()
        print(f"[Workers] Started {len(cameras)} camera worker(s).")
    except Exception as e:
        print(f"[Workers] Failed to start workers: {e}")


def stop_camera_worker(camera_id: str):
    with WORKERS_LOCK:
        w = CAMERA_WORKERS.pop(camera_id, None)
    if w:
        w.stop()


# start_all_workers()

# ──────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "online",
        "service": "Facial Recognition Backend with InsightFace buffalo_l",
        "database": {
            "status": db_connection_status,
            "url": SUPABASE_URL,
            "error": db_connection_error
        },
        "model_loaded": face_app is not None
    })

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "database_connected": db_connection_status == "Connected",
        "model_loaded": face_app is not None,
        "active_workers": list(CAMERA_WORKERS.keys()),
    })

@app.route("/api/detections/<camera_id>", methods=["GET"])
def get_detections(camera_id):
    """Return the latest face detections for a given camera (polled by frontend)."""
    result = LATEST_DETECTIONS.get(camera_id, {"detections": [], "timestamp": None})
    dets = result.get("detections", [])
    any_matched = any(d["matched"] for d in dets)
    best = max(dets, key=lambda d: d["confidence"]) if dets else None
    return jsonify({
        "camera_id":   camera_id,
        "detections":  dets,
        "matched":     any_matched,
        "name":        best["name"]       if best and best["matched"] else None,
        "confidence":  best["confidence"] if best else 0.0,
        "timestamp":   result.get("timestamp"),
    })

@app.route("/api/cameras", methods=["GET"])
def get_cameras():
    try:
        res = supabase.table("cameras").select("*").order("created_at").execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"Error fetching cameras from DB: {e}")
        return jsonify([])

@app.route("/api/cameras", methods=["POST"])
def add_camera():
    data = request.json or {}
    name = data.get("name")
    place = data.get("place")
    rtsp_url = data.get("rtsp_url")
    
    if not name or not rtsp_url:
        return jsonify({"error": "Missing name or rtsp_url"}), 400
        
    new_id = f"camera_{uuid.uuid4().hex[:8]}"
    
    new_camera = {
        "id": new_id,
        "name": name,
        "place": place,
        "rtsp_url": rtsp_url
    }
    
    try:
        supabase.table("cameras").insert(new_camera).execute()
    except Exception as e:
        print(f"Error inserting camera to DB: {e}")
        return jsonify({"error": "Database error"}), 500
    
    # Write to mediamtx.yml, then restart mediamtx to pick it up
    src = build_mediamtx_src(rtsp_url)
    write_mediamtx_yaml_entry(new_id, src)
    restart_mediamtx()

    # Start a background worker for this new camera immediately
    with WORKERS_LOCK:
        if new_id not in CAMERA_WORKERS:
            w = CameraWorker(new_id)
            CAMERA_WORKERS[new_id] = w
            w.start()

    return jsonify({"success": True, "camera": new_camera})

@app.route("/api/cameras/<camera_id>", methods=["DELETE"])
def delete_camera(camera_id):
    if camera_id == "camera1":
        return jsonify({"error": "Cannot delete default camera"}), 400
        
    try:
        supabase.table("cameras").delete().eq("id", camera_id).execute()
    except Exception as e:
        print(f"Error deleting camera from DB: {e}")
        return jsonify({"error": "Database error"}), 500
    
    # Remove from mediamtx.yml and restart
    remove_mediamtx_yaml_entry(camera_id)
    restart_mediamtx()

    # Stop the background worker for this camera
    stop_camera_worker(camera_id)
    LATEST_DETECTIONS.pop(camera_id, None)

    return jsonify({"success": True})

@app.route("/api/extract", methods=["POST"])
def extract_embedding():
    if not face_app:
        return jsonify({"error": "InsightFace model is not loaded on the backend"}), 500

    try:
        # PERFORMANCE FIX: Accept raw binary (multipart) OR legacy base64 JSON
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

        # Select the largest face in the picture
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

        embedding = face.embedding.tolist()

        # Crop the face chip with padding
        bbox = face.bbox.astype(int)
        h, w, _ = img.shape
        pad_x = int((bbox[2] - bbox[0]) * 0.15)
        pad_y = int((bbox[3] - bbox[1]) * 0.15)
        x1 = max(0, bbox[0] - pad_x)
        y1 = max(0, bbox[1] - pad_y)
        x2 = min(w, bbox[2] + pad_x)
        y2 = min(h, bbox[3] + pad_y)

        face_crop = img[y1:y2, x1:x2]
        face_b64 = cv2_to_base64(face_crop) if face_crop.size > 0 else image_b64

        return jsonify({
            "success": True,
            "embedding": embedding,
            "photo_url": face_b64,
            "bbox": bbox.tolist()
        })
    except Exception as e:
        print(f"Error extracting embedding: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/register", methods=["POST"])
def register_face():
    if not face_app:
        return jsonify({"error": "InsightFace model is not loaded on the backend"}), 500

    try:
        # PERFORMANCE FIX: Accept raw binary (multipart) OR legacy base64 JSON
        if request.files.get("image"):
            name = request.form.get("name", "").strip()
            file_bytes = request.files["image"].read()
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            data = request.json or {}
            name = (data.get("name") or "").strip()
            image_b64 = data.get("image")
            if not image_b64:
                return jsonify({"error": "Missing name or image"}), 400
            img = base64_to_cv2(image_b64)

        if not name:
            return jsonify({"error": "Missing name"}), 400

        if img is None:
            return jsonify({"error": "Invalid image data"}), 400

        faces = face_app.get(img)
        if not faces:
            return jsonify({"error": "No face detected in the image. Please try another shot."}), 400

        # Select the largest face
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))

        # Strict registration quality check
        det_score = float(face.det_score) if hasattr(face, 'det_score') else 1.0
        if det_score < 0.7:
            return jsonify({"error": "Face is too blurry or unclear. Please take a clearer photo looking directly at the camera."}), 400

        embedding = face.embedding.tolist()

        # Crop face chip
        bbox = face.bbox.astype(int)
        h, w, _ = img.shape
        pad_x = int((bbox[2] - bbox[0]) * 0.15)
        pad_y = int((bbox[3] - bbox[1]) * 0.15)
        x1 = max(0, bbox[0] - pad_x)
        y1 = max(0, bbox[1] - pad_y)
        x2 = min(w, bbox[2] + pad_x)
        y2 = min(h, bbox[3] + pad_y)

        face_crop = img[y1:y2, x1:x2]
        face_b64 = cv2_to_base64(face_crop) if face_crop.size > 0 else image_b64

        # Insert to Supabase known_faces table
        res = supabase.table("known_faces").insert({
            "name": name,
            "embedding": embedding,
            "photo_url": face_b64
        }).execute()

        # Refresh in-memory cache so next frame match picks up the new face immediately
        refresh_cache()

        return jsonify({
            "success": True,
            "message": f"Successfully registered {name}",
            "data": {
                "id": res.data[0]["id"] if res.data else None,
                "name": name,
                "photo_url": face_b64
            }
        })
    except Exception as e:
        print(f"Error registering face: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/match", methods=["POST"])
def match_face():
    """
    Detect ALL faces in the frame and match each one against the in-memory cache.
    PERFORMANCE FIX: Accepts raw binary image via multipart OR legacy base64 JSON.
    Uses KNOWN_FACES_CACHE instead of a live DB query — zero network overhead per frame.
    """
    if not face_app:
        return jsonify({"error": "InsightFace model is not loaded on the backend"}), 500

    try:
        # PERFORMANCE FIX: Accept raw binary (multipart) — ~33% smaller payload, no encoding overhead
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

        # YOLO Body/Fire/Smoke Detection
        bodies = []
        if 'yolo_app' in globals() and yolo_app is not None:
            try:
                # Detect all classes
                results = yolo_app(img, verbose=False)
                for r in results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0])
                        bodies.append([x1, y1, x2, y2, conf])
            except Exception as e:
                print(f"YOLO inference error: {e}")

        faces = face_app.get(img)
        if not faces:
            return jsonify({
                "detections": [],
                "matched": False,
                "message": "No face detected in frame"
            }), 200

        h, w, _ = img.shape
        # PERFORMANCE FIX: Use in-memory cache — no DB round-trip!
        known_list = KNOWN_FACES_CACHE

        # ArcFace cosine similarity threshold
        # Lowered to 0.38 for better live recognition (live feeds have motion blur/lighting drops)
        THRESHOLD = 0.38

        detections = []
        for face in faces:
            det_score = float(face.det_score) if hasattr(face, 'det_score') else 1.0
            
            # Performance & Accuracy Filter: Skip blurry or low-confidence faces
            if det_score < 0.5:
                continue

            bbox = face.bbox.astype(int).tolist()
            input_emb = face.embedding

            # Crop face chip for log snapshot
            x1, y1 = max(0, bbox[0]), max(0, bbox[1])
            x2, y2 = min(w, bbox[2]), min(h, bbox[3])
            face_crop = img[y1:y2, x1:x2]
            crop_b64 = cv2_to_base64(face_crop) if face_crop.size > 0 else None

            # Extract 106 keypoints for face mesh (buffalo_sc may return None here)
            lm = getattr(face, 'landmark_2d_106', None)
            landmarks = lm.astype(float).tolist() if lm is not None else []

            best_known, best_score = match_embedding(input_emb, known_list, THRESHOLD)

            if best_known:
                detections.append({
                    "matched": True,
                    "name": best_known["name"],
                    "confidence": round(best_score, 4),
                    "photo_url": best_known.get("photo_url"),
                    "bbox": bbox,
                    "crop_b64": crop_b64,
                    "det_score": round(det_score, 3),
                    "landmarks": landmarks,
                })
            else:
                detections.append({
                    "matched": False,
                    "name": "Unknown",
                    "confidence": round(max(best_score, 0.0), 4),
                    "photo_url": None,
                    "bbox": bbox,
                    "crop_b64": crop_b64,
                    "det_score": round(det_score, 3),
                    "landmarks": landmarks,
                })

        # Summary: was ANY person matched?
        any_matched = any(d["matched"] for d in detections)
        best_det = max(detections, key=lambda d: d["confidence"]) if detections else None

        return jsonify({
            "detections": detections,
            "bodies": bodies,
            "matched": any_matched,
            # Convenience flat fields for backward-compat (first/best match)
            "name": best_det["name"] if best_det and best_det["matched"] else None,
            "confidence": best_det["confidence"] if best_det else 0.0,
            "photo_url": best_det["photo_url"] if best_det and best_det["matched"] else None,
            "bbox": best_det["bbox"] if best_det else None,
            "crop_b64": best_det["crop_b64"] if best_det else None,
        })

    except Exception as e:
        print(f"Error matching face: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/registered_faces", methods=["GET"])
def get_registered_faces():
    try:
        res = supabase.table("known_faces").select("id, name, photo_url, created_at").order("name").execute()
        return jsonify(res.data or [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/registered_faces/<id>", methods=["DELETE"])
def delete_registered_face(id):
    try:
        supabase.table("known_faces").delete().eq("id", id).execute()
        # Refresh in-memory cache so the deleted face is no longer matched
        refresh_cache()
        return jsonify({"success": True, "message": "Face registration deleted."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/face_logs", methods=["GET"])
def get_face_logs():
    try:
        res = supabase.table("face_logs").select("*").order("created_at", desc=True).limit(50).execute()
        return jsonify(res.data or [])
    except Exception as e:
        # Try with 'timestamp' column as fallback
        try:
            res = supabase.table("face_logs").select("*").order("timestamp", desc=True).limit(50).execute()
            return jsonify(res.data or [])
        except Exception as e2:
            return jsonify({"error": str(e2)}), 500

import concurrent.futures

# ── WebSocket Server ──────────────────────────────────────────
WS_CLIENTS = set()
executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)

def process_ws_frame(camera_id, image_b64):
    img = base64_to_cv2(image_b64)
    if img is None: return None
    
    h, w = img.shape[:2]
    
    bodies = []
    if 'yolo_app' in globals() and yolo_app is not None:
        try:
            results = yolo_app(img, verbose=False)
            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    bodies.append([x1, y1, x2, y2, conf])
        except Exception: pass
        
    faces = face_app.get(img)
    detections = []
    if faces:
        for face in faces:
            det_score = float(getattr(face, "det_score", 1.0))
            if det_score < 0.5: continue
            
            bbox = face.bbox.astype(int).tolist()
            x1, y1 = max(0, bbox[0]), max(0, bbox[1])
            x2, y2 = min(w, bbox[2]), min(h, bbox[3])
            
            face_crop = img[y1:y2, x1:x2]
            crop_b64 = cv2_to_base64(face_crop) if face_crop.size > 0 else None
            
            lm = getattr(face, "landmark_2d_106", None)
            landmarks = lm.astype(float).tolist() if lm is not None else []
            
            best_known, best_score = match_embedding(face.embedding, KNOWN_FACES_CACHE, MATCH_THRESHOLD)
            if best_known:
                log_match(camera_id, best_known["name"], best_score, crop_b64)
            
            det = {
                "matched": bool(best_known),
                "name": best_known["name"] if best_known else "Unknown",
                "confidence": round(best_score, 4) if best_known else round(max(best_score, 0.0), 4),
                "photo_url": best_known.get("photo_url") if best_known else None,
                "bbox": bbox,
                "crop_b64": crop_b64,
                "det_score": round(det_score, 3),
                "landmarks": landmarks,
                "camera_id": camera_id
            }
            detections.append(det)
            
    return {
        "camera_id": camera_id,
        "detections": detections,
        "bodies": bodies,
        "frame_width": w,
        "frame_height": h
    }

async def ws_handler(websocket):
    WS_CLIENTS.add(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                image_b64 = data.get("image")
                camera_id = data.get("camera_id")
                if not image_b64 or not camera_id:
                    continue
                
                loop = asyncio.get_running_loop()
                result = await loop.run_in_executor(executor, process_ws_frame, camera_id, image_b64)
                
                if result:
                    await websocket.send(json.dumps(result))
                    
            except Exception as e:
                print(f"WS msg error: {e}")
    finally:
        WS_CLIENTS.remove(websocket)

async def start_server_async():
    async with websockets.serve(ws_handler, "0.0.0.0", 5001, ping_interval=None):
        await asyncio.Future()

def start_ws_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_server_async())

threading.Thread(target=start_ws_server, daemon=True).start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Starting Flask server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
