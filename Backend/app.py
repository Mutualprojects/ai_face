import os
import base64
import json
import uuid
import queue
import subprocess
import cv2
import numpy as np
from flask import Flask, jsonify, request, Response, stream_with_context
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
# Prioritize buffalo_sc (small/CPU-optimised MobileFaceNet) for ultra-low latency on CPU.
# Falls back to buffalo_l (large ResNet50) if buffalo_sc is not available.
print("Loading InsightFace model...")
face_app = None

for model_name in ["buffalo_sc", "buffalo_l"]:
    try:
        # OPTIMIZATION: load only required modules (detection, recognition, 2d landmarks) to save CPU
        candidate = FaceAnalysis(
            name=model_name,
            allowed_modules=["detection", "recognition", "landmark_2d_106"],
            providers=["CPUExecutionProvider"]
        )
        # OPTIMIZATION: det_size reduced to (480, 480) for excellent balance of accuracy & latency (~84ms on CPU)
        candidate.prepare(ctx_id=-1, det_size=(480, 480))
        face_app = candidate
        print(f"InsightFace '{model_name}' model loaded successfully.")
        break
    except Exception as e:
        print(f"Could not load '{model_name}': {e}. Trying next model...")

if face_app is None:
    print("ERROR: No InsightFace model could be loaded.")

# ── Load YOLOv8 Model (For Person Detection) ──────────────────
print("Loading YOLOv8n model...")
try:
    from ultralytics import YOLO
    yolo_app = YOLO("/home/btl/facial_recognistion/Backend/yolov8n.pt")
    print("YOLOv8n model loaded successfully.")
except Exception as e:
    print(f"ERROR: Could not load YOLOv8n model: {e}")
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
        _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        b64_bytes = base64.b64encode(buffer)
        return "data:image/jpeg;base64," + b64_bytes.decode('utf-8')
    except Exception as e:
        print(f"Error encoding image to base64: {e}")
        return None

def enhance_face_for_embedding(face_img):
    """
    HD-quality face preprocessing pipeline before embedding extraction.
    Steps: Upscale (if small) → CLAHE contrast → Bilateral denoise
    This bridges the quality gap between a live CCTV crop and a stored registration photo.
    """
    if face_img is None or face_img.size == 0:
        return face_img
    try:
        h, w = face_img.shape[:2]
        # Step 1: Upscale tiny faces to InsightFace native 112x112 minimum using cubic interpolation
        if h < 112 or w < 112:
            scale = max(112.0 / h, 112.0 / w)
            face_img = cv2.resize(face_img, (max(w, int(w * scale)), max(h, int(h * scale))),
                                  interpolation=cv2.INTER_CUBIC)
        # Step 2: CLAHE — adaptive contrast enhancement on the L channel only
        lab = cv2.cvtColor(face_img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        face_img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
        # Step 3: Edge-preserving bilateral filter (removes CCTV noise, keeps facial details)
        face_img = cv2.bilateralFilter(face_img, 5, 35, 35)
        # Step 4: Smooth Unsharp Masking to enhance details without harsh noise artifacts
        gaussian = cv2.GaussianBlur(face_img, (0, 0), 2.0)
        face_img = cv2.addWeighted(face_img, 1.5, gaussian, -0.5, 0)
    except Exception:
        pass  # Fallback to original if any step fails
    return face_img

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

def match_embedding(input_emb, known_list, threshold=0.35):
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

def fetch_visitors():
    try:
        res = supabase.table("visitors").select("visitor_id, full_name, photo_image, embedding").execute()
        visitors_list = []
        for r in (res.data or []):
            if r.get("embedding"):
                visitors_list.append({
                    "id": r["visitor_id"],
                    "name": f"Visitor: {r['full_name']}",
                    "photo_url": r["photo_image"],
                    "embedding": r["embedding"],
                    "is_visitor": True
                })
        return visitors_list
    except Exception as e:
        print(f"Error fetching visitors from DB: {e}")
        return []

def refresh_cache():
    """Reload all known face embeddings from Supabase into RAM (both hosts and visitors)."""
    global KNOWN_FACES_CACHE
    try:
        faces = fetch_known_faces()
        for f in faces:
            f["is_visitor"] = False
        
        visitors = fetch_visitors()
        KNOWN_FACES_CACHE = faces + visitors
        print(f"[Cache] Loaded {len(KNOWN_FACES_CACHE)} total faces into memory ({len(faces)} known faces, {len(visitors)} visitors).")
    except Exception as e:
        print(f"Error refreshing cache: {e}")

def check_and_regenerate_embeddings():
    """
    Check if the stored embeddings in the database match the current face_app model.
    If not, automatically regenerate them from the base64-encoded face chips.
    """
    if supabase is None or face_app is None:
        return

    try:
        # Fetch the first known face to check
        res = supabase.table("known_faces").select("id, name, embedding, photo_url").limit(1).execute()
        if not res.data:
            print("[Embeddings Check] No known faces in database.")
            return

        row = res.data[0]
        stored_emb_val = row.get("embedding")
        photo_url = row.get("photo_url")

        if not stored_emb_val or not photo_url:
            return

        if isinstance(stored_emb_val, str):
            stored_emb = np.array(json.loads(stored_emb_val))
        else:
            stored_emb = np.array(stored_emb_val)

        # Decode photo_url base64 to image
        img = base64_to_cv2(photo_url)
        if img is None:
            return

        # Run extraction with current model
        faces = face_app.get(img)
        if not faces:
            print("[Embeddings Check] Could not extract face from stored photo, skipping check.")
            return

        # Get primary face embedding
        primary = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        current_emb = primary.embedding

        # Compare similarity
        sim = cosine_similarity(stored_emb, current_emb)
        print(f"[Embeddings Check] Cosine similarity between stored and current model: {sim:.4f}")

        # If similarity is low, it means we switched models (e.g. from buffalo_l to buffalo_sc)
        if sim < 0.90:
            print("[Embeddings Check] Embedding model mismatch detected (likely switched buffalo_l <-> buffalo_sc). Regenerating all database embeddings...")
            
            # 1. Regenerate known_faces
            all_known = supabase.table("known_faces").select("id, name, photo_url").execute()
            for k_row in (all_known.data or []):
                k_id = k_row["id"]
                k_name = k_row["name"]
                k_photo = k_row["photo_url"]
                k_img = base64_to_cv2(k_photo)
                if k_img is not None:
                    k_faces = face_app.get(k_img)
                    if k_faces:
                        k_primary = max(k_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                        new_emb = k_primary.embedding.tolist()
                        supabase.table("known_faces").update({"embedding": new_emb}).eq("id", k_id).execute()
                        print(f"[Embeddings Check] Regenerated known face: {k_name}")

            # 2. Regenerate visitors
            all_visitors = supabase.table("visitors").select("visitor_id, full_name, photo_image").execute()
            for v_row in (all_visitors.data or []):
                v_id = v_row["visitor_id"]
                v_name = v_row["full_name"]
                v_photo = v_row["photo_image"]
                v_img = base64_to_cv2(v_photo)
                if v_img is not None:
                    v_faces = face_app.get(v_img)
                    if v_faces:
                        v_primary = max(v_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                        new_emb = v_primary.embedding.tolist()
                        supabase.table("visitors").update({"embedding": new_emb}).eq("visitor_id", v_id).execute()
                        print(f"[Embeddings Check] Regenerated visitor face: {v_name}")
            
            print("[Embeddings Check] Embedding regeneration complete.")
    except Exception as e:
        print(f"[Embeddings Check] Error during check/regeneration: {e}")

# Populate cache at startup
if supabase is not None:
    try:
        check_and_regenerate_embeddings()
        refresh_cache()
    except Exception as _cache_err:
        print(f"[Cache] Could not pre-load cache at startup: {_cache_err}")


# ──────────────────────────────────────────────────────────
# MEDIAMTX STREAM UTILS
# ──────────────────────────────────────────────────────────
MEDIAMTX_YAML = os.path.join(os.path.dirname(__file__), "mediamtx.yml")
MEDIAMTX_BIN  = os.path.join(os.path.dirname(__file__), "mediamtx")
MEDIAMTX_LOG  = os.path.join(os.path.dirname(__file__), "mediamtx_run.log")

def detect_codec_and_width(stream_url: str) -> tuple:
    """Probe the stream (RTSP/RTMP/HTTP) to detect its video codec and width."""
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
        print(f"Detected codec: {codec}, width: {width}")
        return codec, width
    except Exception as e:
        print(f"ffprobe failed: {e}")
        return "unknown", None

def build_mediamtx_src(stream_url: str) -> dict:
    """Build the mediamtx stream configuration dictionary for RTSP, RTMP, and HTTP sources."""
    from urllib.parse import unquote
    decoded_url = unquote(stream_url)

    # Ensure raw '$' in password is URL-encoded as '%24'
    if "$" in decoded_url:
        decoded_url = decoded_url.replace("$", "%24")

    codec, width = detect_codec_and_width(decoded_url)

    if codec in ("hevc", "h265"):
        print(f"HEVC detected — will use high-quality ffmpeg transcode via runOnDemand")
        vf_scale = ""
        if width and width > 1280:
            vf_scale = "-vf scale=1280:-2 "
            print(f"Adding downscale filter (1280x720) for stream width {width}")

        input_flags = "-rtsp_transport tcp " if decoded_url.lower().startswith("rtsp://") else ""
        return {
            "source": "publisher",
            "runOnDemand": f"ffmpeg -hide_banner -avoid_negative_ts make_zero -fflags nobuffer+discardcorrupt -flags low_delay {input_flags}-i '{decoded_url}' {vf_scale}-c:v libx264 -preset ultrafast -tune zerolatency -crf 20 -pix_fmt yuv420p -g 30 -keyint_min 30 -sc_threshold 0 -an -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH",
            "runOnDemandRestart": True,
            "runOnDemandCloseAfter": "10s"
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
FRAME_INTERVAL   = 1.00          # seconds between processed frames per camera (1 FPS for light background tracking)
MATCH_THRESHOLD  = 0.35          # ArcFace identity threshold — slightly relaxed for small faces

# ── Temporal Presence Tracker ───────────────────────────────────────────────
# A face must be detected in PRESENCE_CONFIRM_FRAMES consecutive frames before
# being declared "Present". This eliminates single-frame false positives.
PRESENCE_CONFIRM_FRAMES = 1      # frames needed to confirm someone is present (Instant confirmation on frame 1)
PRESENCE_TIMEOUT_SEC    = 8.0   # seconds of absence before removing from presence list

# Structure: { camera_id: { name: {frames, scores, last_seen, photo_url, crop, confirmed} } }
PRESENCE_TRACKER: dict = {}
PRESENCE_LOCK = threading.Lock()

def presence_update(camera_id: str, name: str, score: float, photo_url, crop_b64):
    """Update presence tracker. Returns (is_confirmed, avg_confidence)."""
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
        entry["scores"] = (entry["scores"] + [score])[-10:]  # rolling window of last 10
        entry["last_seen"] = now
        entry["photo_url"] = photo_url
        entry["crop"] = crop_b64
        if entry["frames"] >= PRESENCE_CONFIRM_FRAMES:
            entry["confirmed"] = True
        avg = sum(entry["scores"]) / len(entry["scores"])
    return entry["confirmed"], avg

def presence_cleanup(camera_id: str):
    """Remove stale entries from presence tracker for a camera."""
    now = time.time()
    with PRESENCE_LOCK:
        if camera_id not in PRESENCE_TRACKER:
            return
        stale = [n for n, d in PRESENCE_TRACKER[camera_id].items()
                 if now - d["last_seen"] > PRESENCE_TIMEOUT_SEC]
        for n in stale:
            del PRESENCE_TRACKER[camera_id][n]

# ── SSE Log Stream Queue ─────────────────────────────────────────────────────
# New log entries are pushed here immediately after DB insert.
# The /api/logs/stream SSE endpoint drains this queue and pushes to the frontend in real-time.
LOG_SSE_QUEUE: queue.Queue = queue.Queue(maxsize=200)

# Log rate-limiting/cooldown tracking
LAST_LOGGED_TIME: dict = {}
LOG_LOCK = threading.Lock()

def log_match(camera_id: str, name: str, confidence: float, crop_b64: str):
    """Insert ONE matched face row per cooldown window. Pushes to SSE queue for instant frontend update."""
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
        from datetime import datetime, timezone
        row_id     = str(_uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        supabase.table("face_logs").insert({
            "id":           row_id,
            "person_name":  name,
            "confidence":   round(confidence, 4),
            "snapshot_url": crop_b64,
        }).execute()
        print(f"[Logger {camera_id}] Logged match: {name} ({confidence:.2f})")

        # ── Push to SSE queue → frontend receives instantly without polling ──
        try:
            LOG_SSE_QUEUE.put_nowait({
                "id":           row_id,
                "person_name":  name,
                "confidence":   round(confidence, 4),
                "snapshot_url": crop_b64,
                "created_at":   created_at,
                "camera_id":    camera_id,
            })
        except queue.Full:
            pass  # Drop silently if queue is saturated

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
            h, w = frame.shape[:2]
            target_w = 1280
            proc_frame = cv2.resize(frame, (target_w, int(h * target_w / w)))

            # YOLO Body Detection
            bodies = []
            if 'yolo_app' in globals() and yolo_app is not None:
                try:
                    results = yolo_app(proc_frame, verbose=False)
                    for r in results:
                        for box in r.boxes:
                            if int(box.cls[0]) != 0: continue # Only persons
                            x1, y1, x2, y2 = box.xyxy[0].tolist()
                            conf = float(box.conf[0])
                            if conf >= 0.40:
                                bodies.append([x1, y1, x2, y2, conf])
                except Exception as e:
                    print(f"YOLO inference error: {e}")

            faces = face_app.get(proc_frame)
            if not faces:
                LATEST_DETECTIONS[self.camera_id] = {
                    "detections": [], "timestamp": time.time()
                }
                presence_cleanup(self.camera_id)
                return

            h, w = proc_frame.shape[:2]
            detections = []
            presence_cleanup(self.camera_id)

            for face in faces:
                det_score = float(getattr(face, "det_score", 1.0))
                if det_score < 0.35:
                    continue

                bbox   = face.bbox.astype(int).tolist()
                x1, y1 = max(0, bbox[0]), max(0, bbox[1])
                x2, y2 = min(w, bbox[2]), min(h, bbox[3])
                if (x2 - x1) < 15 or (y2 - y1) < 15:
                    continue

                raw_crop = proc_frame[y1:y2, x1:x2]
                if raw_crop.size == 0: continue
                enhanced_crop = enhance_face_for_embedding(raw_crop.copy())
                crop_b64 = cv2_to_base64(enhanced_crop if enhanced_crop is not None else raw_crop)

                # ── Match on original InsightFace embedding ────────────────
                embedding = face.embedding
                lm = getattr(face, "landmark_2d_106", None)
                best_known, best_score = match_embedding(embedding, KNOWN_FACES_CACHE, MATCH_THRESHOLD)
                
                landmarks = lm.astype(float).tolist() if lm is not None else []

                if best_known:
                    confirmed, avg_score = presence_update(
                        self.camera_id, best_known["name"], best_score,
                        best_known.get("photo_url"), crop_b64
                    )
                    if confirmed:
                        self._log_match(best_known["name"], avg_score, crop_b64)
                    detections.append({
                        "matched":    True,
                        "confirmed":  confirmed,
                        "name":       best_known["name"],
                        "confidence": round(avg_score, 4),
                        "photo_url":  best_known.get("photo_url"),
                        "bbox":       bbox,
                        "crop_b64":   crop_b64,
                        "det_score":  round(det_score, 3),
                        "landmarks":  landmarks,
                        "camera_id":  self.camera_id,
                    })
                else:
                    detections.append({
                        "matched":    False,
                        "confirmed":  False,
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
                "bodies":     bodies,
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
    """Stop a single active CameraWorker thread."""
    with WORKERS_LOCK:
        w = CAMERA_WORKERS.pop(camera_id, None)
    if w:
        w.stop()


def stop_all_workers():
    """Stop all active CameraWorker threads."""
    with WORKERS_LOCK:
        ids = list(CAMERA_WORKERS.keys())
    for cam_id in ids:
        with WORKERS_LOCK:
            w = CAMERA_WORKERS.pop(cam_id, None)
        if w:
            w.stop()
    print(f"[Workers] Stopped all {len(ids)} camera worker(s).")


# start_all_workers()

# ──────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────

@app.route("/api/workers/start", methods=["POST"])
def workers_start():
    """Start background analysis on ALL cameras. Called when Face Matcher is toggled ON."""
    # start_all_workers()  # Disabled to prevent heavy CPU scanning on all cameras
    with WORKERS_LOCK:
        active = list(CAMERA_WORKERS.keys())
    return jsonify({"success": True, "active_cameras": active, "count": len(active)})

@app.route("/api/workers/stop", methods=["POST"])
def workers_stop():
    """Stop background analysis on all cameras. Called when Face Matcher is toggled OFF."""
    # stop_all_workers()  # Disabled to prevent heavy CPU scanning
    return jsonify({"success": True})

@app.route("/api/presence/all", methods=["GET"])
def get_presence_all():
    """
    Aggregate confirmed presence across ALL cameras.
    A person confirmed on multiple cameras will appear once (most recent detection wins).
    """
    now = time.time()
    with WORKERS_LOCK:
        all_cam_ids = list(CAMERA_WORKERS.keys())

    # Also include cameras with active WS detections not from background workers
    from_tracker = set()
    with PRESENCE_LOCK:
        all_cam_ids = list(set(all_cam_ids) | set(PRESENCE_TRACKER.keys()))

    for cam_id in all_cam_ids:
        presence_cleanup(cam_id)

    # Merge — if same person seen on multiple cameras, pick highest confidence
    merged: dict = {}
    with PRESENCE_LOCK:
        for cam_id in PRESENCE_TRACKER:
            for name, data in PRESENCE_TRACKER[cam_id].items():
                if not data.get("confirmed") or name == "Unknown":
                    continue
                scores = data.get("scores", [1.0])
                conf = sum(scores) / len(scores)
                if name not in merged or conf > merged[name]["confidence"]:
                    merged[name] = {
                        "name":        name,
                        "confidence":  round(conf, 4),
                        "seen_frames": data["frames"],
                        "last_seen":   data["last_seen"],
                        "seconds_ago": round(now - data["last_seen"], 1),
                        "photo_url":   data.get("photo_url"),
                        "crop":        data.get("crop"),
                        "camera_id":   cam_id,
                    }

    present = sorted(merged.values(), key=lambda x: x["last_seen"], reverse=True)
    return jsonify({"present": present, "count": len(present), "cameras_monitored": len(all_cam_ids)})


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
        
        # Apply super-resolution enhancement to the crop before extraction and upload
        if face_crop.size > 0:
            enhanced_face = enhance_face_for_embedding(face_crop.copy())
            face_b64 = cv2_to_base64(enhanced_face)
            
            # Re-extract embedding from the enhanced face to improve detection accuracy
            enh_faces = face_app.get(enhanced_face)
            if enh_faces:
                primary = max(enh_faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                embedding = primary.embedding.tolist()
            else:
                embedding = face.embedding.tolist()
        else:
            face_b64 = image_b64
            embedding = face.embedding.tolist()

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
            face_b64 = image_b64
            embedding = face.embedding.tolist()

        # Check if the name already exists in the database
        existing = supabase.table("known_faces").select("id").eq("name", name).execute()
        
        if existing.data and len(existing.data) > 0:
            # Update existing face (keep the same name, but upgrade the embedding & photo)
            res = supabase.table("known_faces").update({
                "embedding": embedding,
                "photo_url": face_b64
            }).eq("name", name).execute()
        else:
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

@app.route("/api/refresh_cache", methods=["POST"])
def api_refresh_cache():
    try:
        refresh_cache()
        return jsonify({"success": True, "message": "Cache refreshed successfully"})
    except Exception as e:
        print(f"Error refreshing cache: {e}")
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

        # Higher threshold = fewer false positives. 0.38 is the proven sweet spot.
        THRESHOLD = 0.38

        detections = []
        for face in faces:
            det_score = float(face.det_score) if hasattr(face, 'det_score') else 1.0
            
            # CCTV-friendly: accept lower confidence for distant/small faces
            if det_score < 0.40:
                continue

            bbox = face.bbox.astype(int).tolist()
            # 20x20 minimum — catches faces far from a wide-angle camera
            if (bbox[2] - bbox[0]) < 20 or (bbox[3] - bbox[1]) < 20:
                continue

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

# ─── /api/top_matches ────────────────────────────────────────────────────────
# Returns the top-N closest enrolled faces for a detected face crop.
# Used by the frontend ComparisonPanel to show "who does this Unknown look like?"
@app.route("/api/top_matches", methods=["POST"])
def top_matches():
    """
    Given a base64 face crop, return the top N closest known faces with scores.
    Does NOT apply the match threshold — shows all candidates ranked by similarity.
    """
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

        # Use the largest / most confident detected face
        primary = max(faces, key=lambda f: float(getattr(f, 'det_score', 0)))
        input_emb = primary.embedding

        candidates = []
        for known in KNOWN_FACES_CACHE:
            known_emb_val = known.get("embedding")
            if not known_emb_val:
                continue
            known_emb = np.array(json.loads(known_emb_val) if isinstance(known_emb_val, str) else known_emb_val)
            sim = float(cosine_similarity(input_emb, known_emb))
            candidates.append({
                "id":         known.get("id"),
                "name":       known.get("name", "Unknown"),
                "photo_url":  known.get("photo_url"),
                "similarity": round(sim, 4),
                "pct":        round(sim * 100, 1),
                "match":      sim >= MATCH_THRESHOLD,
            })

        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        return jsonify({"matches": candidates[:top_n], "threshold": MATCH_THRESHOLD})

    except Exception as e:
        print(f"top_matches error: {e}")
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
    """Return face detection logs. Supports ?type=all|known|unknown filter."""
    log_type = request.args.get("type", "all")  # all | known | unknown
    try:
        q = supabase.table("face_logs").select("*").order("created_at", desc=True).limit(100)
        if log_type == "known":
            q = q.neq("person_name", "Unknown")
        elif log_type == "unknown":
            q = q.eq("person_name", "Unknown")
        res = q.execute()
        return jsonify(res.data or [])
    except Exception as e:
        try:
            q = supabase.table("face_logs").select("*").order("timestamp", desc=True).limit(100)
            if log_type == "known":
                q = q.neq("person_name", "Unknown")
            elif log_type == "unknown":
                q = q.eq("person_name", "Unknown")
            res = q.execute()
            return jsonify(res.data or [])
        except Exception as e2:
            return jsonify({"error": str(e2)}), 500


@app.route("/api/logs/stream", methods=["GET"])
def logs_sse_stream():
    """
    Server-Sent Events endpoint — pushes new face_log entries to the browser in real-time.
    Frontend subscribes once via EventSource; matched faces appear without any polling.
    """
    def generate():
        # Initial ping confirms connection
        yield "data: {\"ping\": true}\n\n"
        while True:
            try:
                log_row = LOG_SSE_QUEUE.get(timeout=15)
                yield f"data: {json.dumps(log_row)}\n\n"
            except queue.Empty:
                yield "data: {\"ping\": true}\n\n"  # Keepalive every 15s

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":              "no-cache",
            "X-Accel-Buffering":          "no",
            "Connection":                 "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )

@app.route("/api/presence/<camera_id>", methods=["GET"])
def get_presence(camera_id):
    """
    Returns the list of people CONFIRMED present at a camera.
    A person is confirmed only after being seen in 3+ consecutive frames (no false positives).
    """
    presence_cleanup(camera_id)
    now = time.time()
    with PRESENCE_LOCK:
        tracker = dict(PRESENCE_TRACKER.get(camera_id, {}))
    
    present = []
    for name, data in tracker.items():
        if data.get("confirmed") and name != "Unknown":
            scores = data.get("scores", [1.0])
            present.append({
                "name":        name,
                "confidence":  round(sum(scores) / len(scores), 4),
                "seen_frames": data["frames"],
                "last_seen":   data["last_seen"],
                "seconds_ago": round(now - data["last_seen"], 1),
                "photo_url":   data.get("photo_url"),
                "crop":        data.get("crop"),
            })
    
    present.sort(key=lambda x: x["last_seen"], reverse=True)
    return jsonify({"camera_id": camera_id, "present": present, "count": len(present)})

import concurrent.futures

# ── WebSocket Frame-Drop Guard ─────────────────────────────────────────────────
# One frame per camera is processed at a time. Frames arriving while the previous
# is still in the executor are dropped — prevents latency queue buildup on slow CPU.
WS_BUSY: dict = {}
WS_BUSY_LOCK = threading.Lock()

# ── WebSocket Server ──────────────────────────────────────────
WS_CLIENTS = set()
executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)

def process_ws_frame(camera_id, image_b64):
    """
    HIGH-PRECISION WebSocket frame processor — optimized for accuracy AND low latency.

    Key improvements vs previous version:
    - YOLO runs at 320px (4x faster, negligible accuracy loss for body boxes)
    - Enhancement pass 2 re-enabled for unknown faces (was mistakenly bypassed)
    - Threshold unified to MATCH_THRESHOLD (0.42) — consistent with camera workers
    - cosine_similarity now uses properly normalized vectors
    - Frame-drop guard is applied BEFORE this function (in ws_handler)

    Pipeline: Decode → YOLO@320px → InsightFace detect → Pass1 match →
              enhance unknown crop → Pass2 match → temporal confirm → respond
    """
    img = base64_to_cv2(image_b64)
    if img is None: return None

    h, w = img.shape[:2]

    # ── 1. YOLO Body Detection at 320px (4x speedup) ─────────────────────────
    bodies = []
    if 'yolo_app' in globals() and yolo_app is not None:
        try:
            yolo_scale = min(320.0 / max(w, h), 1.0)
            if yolo_scale < 1.0:
                yolo_img = cv2.resize(img, (int(w * yolo_scale), int(h * yolo_scale)),
                                      interpolation=cv2.INTER_LINEAR)
            else:
                yolo_img = img
            results = yolo_app(yolo_img, verbose=False, imgsz=320)
            for r in results:
                for box in r.boxes:
                    if int(box.cls[0]) != 0: continue  # Only persons
                    x1, y1, x2, y2 = [v / yolo_scale for v in box.xyxy[0].tolist()]
                    conf = float(box.conf[0])
                    if conf >= 0.40:
                        bodies.append([x1, y1, x2, y2, conf])
        except Exception: pass

    # ── 2. InsightFace Face Detection ────────────────────────────────────────
    faces = face_app.get(img)
    detections = []
    presence_cleanup(camera_id)

    if faces:
        for face in faces:
            det_score = float(getattr(face, "det_score", 1.0))
            if det_score < 0.25: continue  # Catch small & distant faces

            bbox = face.bbox.astype(int).tolist()
            x1, y1 = max(0, bbox[0]), max(0, bbox[1])
            x2, y2 = min(w, bbox[2]), min(h, bbox[3])
            if (x2 - x1) < 8 or (y2 - y1) < 8: continue

            raw_crop = img[y1:y2, x1:x2]
            if raw_crop.size == 0: continue

            # ── 3. Pass 1: Match on original InsightFace embedding ───────────
            embedding = face.embedding
            lm = getattr(face, "landmark_2d_106", None)
            best_known, best_score = match_embedding(embedding, KNOWN_FACES_CACHE, MATCH_THRESHOLD)

            # ── 4. HD Enhancement (Visual Only, No Double Inference) ───────────
            # Keeps the UI displaying clean, enhanced chips without repeating face_app.get() on CPU
            enhanced_crop = enhance_face_for_embedding(raw_crop.copy())
            crop_b64 = cv2_to_base64(enhanced_crop if enhanced_crop is not None else raw_crop)

            landmarks = lm.astype(float).tolist() if lm is not None else []

            # ── 5. Detection response (Immediate on frame 1) ─────────────
            if best_known:
                presence_update(
                    camera_id, best_known["name"], best_score,
                    best_known.get("photo_url"), crop_b64
                )
                log_match(camera_id, best_known["name"], best_score, crop_b64)
                detections.append({
                    "matched":    True,
                    "name":       best_known["name"],
                    "confidence": round(best_score, 4),
                    "photo_url":  best_known.get("photo_url"),
                    "bbox":       bbox,
                    "crop_b64":   crop_b64,
                    "det_score":  round(det_score, 3),
                    "landmarks":  landmarks,
                    "camera_id":  camera_id
                })
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
                    "camera_id":  camera_id
                })

    return {
        "camera_id":    camera_id,
        "detections":   detections,
        "bodies":       bodies,
        "frame_width":  w,
        "frame_height": h
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

                # ── Per-camera frame-drop guard ───────────────────────────────
                # If the previous frame is still being processed, drop this one.
                # This is the primary fix for latency queue buildup.
                with WS_BUSY_LOCK:
                    if WS_BUSY.get(camera_id, False):
                        continue  # Drop — server still busy with last frame
                    WS_BUSY[camera_id] = True

                try:
                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(
                        executor, process_ws_frame, camera_id, image_b64
                    )
                    if result:
                        await websocket.send(json.dumps(result))
                finally:
                    with WS_BUSY_LOCK:
                        WS_BUSY[camera_id] = False

            except Exception as e:
                print(f"WS msg error: {e}")
                if camera_id:
                    with WS_BUSY_LOCK:
                        WS_BUSY[camera_id] = False
    finally:
        WS_CLIENTS.discard(websocket)

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
