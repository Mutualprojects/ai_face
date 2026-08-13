import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
import base64
import json
import uuid
import queue
import logging
import secrets
import hashlib
import subprocess
import functools
import ipaddress
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
import hmac

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

    # Best-of-best matching: the worker keeps the HIGHEST score seen for a
    # person across the whole walk (see presence_update) instead of
    # averaging noisy frames, so the clearest frame of the walk decides the
    # identity. Threshold kept lenient so walking/partial faces still match.
    MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.35"))

    # Margin-based rejection. A cosine score can clear the threshold and
    # STILL be a bad match if a second identity scores almost as high
    # (common with siblings, similar lighting, low-quality crops). The
    # winner must beat the runner-up by this margin. Set to 0 to disable
    # and fall back to pure threshold behaviour.
    MATCH_MARGIN = float(os.getenv("MATCH_MARGIN", "0.02"))

    # Detection confidence gate — blurry/unclear detections are skipped
    # BEFORE matching so their noisy embeddings can never produce a match.
    DET_SCORE_MIN = float(os.getenv("DET_SCORE_MIN", "0.25"))
    REGISTER_DET_SCORE_MIN = float(os.getenv("REGISTER_DET_SCORE_MIN", "0.70"))

    # Faces smaller than this many px are too low-resolution to embed
    # reliably — tiny crops are a classic false-positive source.
    MIN_FACE_PX = int(os.getenv("MIN_FACE_PX", "15"))

    # Temporal confirmation: log on the first matched frame. The
    # best-of-best tracker in presence_update keeps upgrading the recorded
    # score/crop as the walk produces clearer frames, so a single blurry
    # first frame never caps the final match.
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

    # ── SCREEN / TV FACE FILTER ──────────────────────────
    # Faces detected on TV screens, digital displays, or photo frames are
    # frequently picked up and logged as "Unknown". Two complementary
    # mechanisms suppress them:
    #
    # 1. Per-camera EXCLUSION ZONES — rectangular regions (as fractions
    #    0.0–1.0 of the frame) where any detected face is ignored. Zones
    #    are stored in the `screen_zones` column of the cameras table and
    #    can be updated via PATCH /api/cameras/<id>/screen_zones without
    #    restarting the backend.
    #
    # 2. Auto-screen detection — analyzes the HSV color stats of a face
    #    crop. Real faces have limited saturation variance and warm skin
    #    hues. Screen images have high blue/cold saturation, blocky
    #    brightness patterns, or near-uniform color grids. When
    #    SCREEN_AUTO_FILTER=true (default), any face crop that looks
    #    like a screen is silently dropped regardless of zone settings.
    SCREEN_AUTO_FILTER = os.getenv("SCREEN_AUTO_FILTER", "true").lower() == "true"

    # Minimum skin-tone pixel ratio a crop must have to be treated as a
    # real face. Screens show a wide range of colors; genuine faces are
    # dominated by skin tones in YCrCb space. Set to 0 to disable.
    SCREEN_SKIN_RATIO_MIN = float(os.getenv("SCREEN_SKIN_RATIO_MIN", "0.08"))

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
# AUTH DECORATOR  (static master key + per-integration keys)
# ──────────────────────────────────────────────────────────
# Every protected endpoint accepts either:
#   Authorization: Bearer <key>
#   x-api-key: <key>
#
# Two kinds of keys are valid:
#   1. The static master key (Config.API_KEY) — always valid.
#   2. Integration-partner keys stored in the Supabase `api_keys`
#      table (hashed SHA-256). These can be created/revoked from the
#      SDK management portal without redeploying the backend.
#
# If no API_KEY env var is set AND the api_keys table is unreachable,
# the server still runs for local dev but logs a loud warning.

API_KEY_PREFIX = "sentinel_live_"


def hash_api_key(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_api_key():
    """Return a new (prefix, full_key) pair. The full key is shown to the
    integrator exactly once at creation; only its hash is persisted."""
    secret = secrets.token_urlsafe(32)
    prefix = API_KEY_PREFIX + secrets.token_hex(4)
    return prefix, f"{prefix}.{secret}"


_API_KEYS_TABLE_CHECK = {"ready": None, "ts": 0.0}
_API_KEYS_TABLE_TTL = 30.0


def api_keys_table_ready():
    """True if the api_keys table exists. Cached for a few seconds to avoid
    a Supabase round-trip on every protected request."""
    now = time.time()
    if _API_KEYS_TABLE_CHECK["ready"] is not None and (now - _API_KEYS_TABLE_CHECK["ts"]) < _API_KEYS_TABLE_TTL:
        return _API_KEYS_TABLE_CHECK["ready"]
    if supabase is None:
        _API_KEYS_TABLE_CHECK["ready"] = False
        _API_KEYS_TABLE_CHECK["ts"] = now
        return False
    try:
        supabase.table("api_keys").select("id").limit(1).execute()
        _API_KEYS_TABLE_CHECK["ready"] = True
    except Exception as e:
        log.warning("api_keys table not ready: %s", e)
        _API_KEYS_TABLE_CHECK["ready"] = False
    _API_KEYS_TABLE_CHECK["ts"] = now
    return _API_KEYS_TABLE_CHECK["ready"]


def lookup_api_key(token):
    """Return key record dict for a valid token, or None."""
    if not token:
        return None
    if Config.API_KEY and secrets.compare_digest(token, Config.API_KEY):
        return {"id": "master", "name": "Master Key", "scopes": ["*"], "master": True,
                "org_id": None, "app_id": None, "rate_limit_rpm": None}
    if supabase is None:
        return None
    try:
        res = (
            supabase.table("api_keys")
            .select("id, name, scopes, revoked, prefix, org_id, app_id, rate_limit_rpm, expires_at, allowed_origins, allowed_ips, last_used_ip")
            .eq("key_hash", hash_api_key(token))
            .maybe_single()
            .execute()
        )
        row = res.data
        if not row:
            return None
        if row.get("revoked"):
            return None
        expires_at = row.get("expires_at")
        if expires_at:
            try:
                exp = datetime.datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=datetime.timezone.utc)
                if datetime.datetime.now(datetime.timezone.utc) > exp:
                    return None
            except Exception:
                pass
        return {
            "id": row["id"],
            "name": row["name"],
            "scopes": row.get("scopes") or ["read"],
            "prefix": row.get("prefix", ""),
            "master": False,
            "org_id": row.get("org_id"),
            "app_id": row.get("app_id"),
            "rate_limit_rpm": row.get("rate_limit_rpm") or 60,
            "allowed_origins": row.get("allowed_origins") or [],
            "allowed_ips": row.get("allowed_ips") or [],
        }
    except Exception as e:
        log.warning("api key lookup failed: %s", e)
        return None


def update_key_last_used(key_id, ip=None):
    """Fire-and-forget: stamp last_used_at + ip without blocking the request."""
    if not key_id or key_id == "master" or supabase is None:
        return
    try:
        payload = {"last_used_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        if ip:
            payload["last_used_ip"] = ip
        supabase.table("api_keys").update(payload).eq("id", key_id).execute()
    except Exception as e:
        log.debug("Could not update last_used_at: %s", e)


def enforce_rate_limit(key):
    """Return True if the request may proceed, else False (limit exceeded)."""
    rpm = key.get("rate_limit_rpm")
    if not rpm or key.get("master") or supabase is None:
        return True
    try:
        since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)).isoformat()
        res = (
            supabase.table("api_usage_logs")
            .select("id")
            .eq("api_key_id", key["id"])
            .gte("created_at", since)
            .limit(rpm)
            .execute()
        )
        return len(res.data or []) < rpm
    except Exception as e:
        log.debug("rate limit check failed: %s", e)
        return True


def record_api_usage(key, status_code, method, path, latency_ms, ip, user_agent=""):
    """Fire-and-forget: log one authenticated API call for metering/billing."""
    if not key or key.get("master") or supabase is None:
        return
    try:
        supabase.table("api_usage_logs").insert({
            "api_key_id": key.get("id"),
            "org_id": key.get("org_id"),
            "app_id": key.get("app_id"),
            "method": method,
            "path": path,
            "status_code": status_code,
            "latency_ms": latency_ms,
            "ip": ip,
            "user_agent": user_agent,
        }).execute()
    except Exception as e:
        log.debug("usage log insert failed: %s", e)


def require_api_key(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        master_configured = bool(Config.API_KEY)
        table_ready = api_keys_table_ready()

        if not master_configured and not table_ready:
            log.warning(
                "AUTH DISABLED: %s called with no API_KEY configured and no api_keys table. "
                "Set the API_KEY env var (or create the api_keys table) before deploying "
                "this outside a trusted network.",
                request.path,
            )
            return fn(*args, **kwargs)

        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else None
        if not token:
            token = request.headers.get("x-api-key", "")

        key = lookup_api_key(token)
        if not key:
            return jsonify({"error": "Unauthorized: invalid or expired API key"}), 401

        client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        if "," in client_ip:
            client_ip = client_ip.split(",")[0].strip()

        # IP allowlist
        allowed_ips = key.get("allowed_ips") or []
        if allowed_ips:
            try:
                addr = ipaddress.ip_address(client_ip)
                if not any(addr in ipaddress.ip_network(cidr, strict=False) for cidr in allowed_ips):
                    return jsonify({"error": "Forbidden: IP not allowed"}), 403
            except Exception:
                return jsonify({"error": "Forbidden: invalid IP"}), 403

        # Browser origin allowlist
        allowed_origins = key.get("allowed_origins") or []
        origin = request.headers.get("Origin", "")
        if allowed_origins and origin and origin not in allowed_origins:
            return jsonify({"error": "Forbidden: Origin not allowed"}), 403

        # Rate limit
        if not enforce_rate_limit(key):
            return jsonify({"error": "Too Many Requests: rate limit exceeded"}), 429

        start_ts = time.time()
        update_key_last_used(key.get("id"), ip=client_ip)
        request.api_key = key

        try:
            resp = fn(*args, **kwargs)
            record_api_usage(key, getattr(resp, "status_code", 200), request.method,
                             request.path, int((time.time() - start_ts) * 1000), client_ip,
                             (request.headers.get("User-Agent") or "")[:200])
            return resp
        except Exception:
            record_api_usage(key, 500, request.method, request.path,
                             int((time.time() - start_ts) * 1000), client_ip,
                             (request.headers.get("User-Agent") or "")[:200])
            raise
    return wrapper


def require_scope(*needed):
    """Compose with require_api_key to enforce a permission scope, e.g.
    @require_api_key
    @require_scope("write", "admin")"""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = getattr(request, "api_key", None)
            scopes = (key or {}).get("scopes") or []
            if "*" in scopes or any(s in scopes for s in needed):
                return fn(*args, **kwargs)
            return jsonify({"error": "Forbidden: key lacks required scope(s): %s" % ", ".join(needed)}), 403
        return wrapper
    return decorator


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


def is_face_in_exclusion_zone(bbox, frame_w, frame_h, zones):
    """
    Returns True if the face bounding box center falls inside ANY of the
    given exclusion zones.

    zones: list of dicts with keys x1, y1, x2, y2  (all 0.0–1.0 fractions
    of the frame dimensions). This normalised format means zones survive
    frame resizes without needing to be recalculated.
    """
    if not zones or frame_w == 0 or frame_h == 0:
        return False
    fx1, fy1, fx2, fy2 = bbox
    cx = (fx1 + fx2) / 2.0
    cy = (fy1 + fy2) / 2.0
    # Normalise face center to 0-1
    nx = cx / frame_w
    ny = cy / frame_h
    for z in zones:
        try:
            if z["x1"] <= nx <= z["x2"] and z["y1"] <= ny <= z["y2"]:
                return True
        except (KeyError, TypeError):
            continue
    return False


def is_screen_face(crop_img):
    """
    Heuristic to detect whether a face crop is from a TV/monitor/photo
    rather than a live person in the scene. Screens tend to have:
      - Very low skin-tone pixel ratio (faces on a screen can have ANY color
        scheme around them, reducing overall skin pixels).
      - Very high blue-channel dominance or unnaturally uniform saturation.

    Returns True (= looks like a screen, skip it) when:
      - Skin-tone pixel ratio < SCREEN_SKIN_RATIO_MIN, AND
      - Mean HSV saturation > 80 (vivid screen colors) OR
        The crop has very low overall brightness variance (screen flat-color
        blocks) compared to real faces.

    This is intentionally conservative: it only rejects when MULTIPLE
    indicators point to a screen simultaneously, to avoid false-positives
    on dark-skinned or heavily made-up faces.
    """
    if not Config.SCREEN_AUTO_FILTER:
        return False
    if crop_img is None or crop_img.size == 0:
        return False
    try:
        h, w = crop_img.shape[:2]
        if h < 10 or w < 10:
            return False

        # ── Skin tone detection (YCrCb) ──────────────────
        ycrcb = cv2.cvtColor(crop_img, cv2.COLOR_BGR2YCrCb)
        y_ch, cr_ch, cb_ch = cv2.split(ycrcb)
        # Standard skin-tone range in YCrCb
        skin_mask = (
            (y_ch  >= 80)  & (y_ch  <= 240) &
            (cr_ch >= 135) & (cr_ch <= 180) &
            (cb_ch >= 85)  & (cb_ch <= 135)
        )
        skin_ratio = skin_mask.sum() / float(h * w)

        if skin_ratio >= Config.SCREEN_SKIN_RATIO_MIN:
            # Enough skin pixels — almost certainly a real face
            return False

        # ── Secondary: HSV saturation & brightness variance ──
        hsv = cv2.cvtColor(crop_img, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1].astype(np.float32)
        val = hsv[:, :, 2].astype(np.float32)
        mean_sat = float(np.mean(sat))
        std_val  = float(np.std(val))

        # Screen-like: vivid saturated colours (>80) AND low skin
        if mean_sat > 80:
            log.debug("[ScreenFilter] Rejected: skin_ratio=%.3f mean_sat=%.1f", skin_ratio, mean_sat)
            return True

        # Screen-like: nearly flat brightness (e.g. solid-colour overlay)
        if std_val < 12:
            log.debug("[ScreenFilter] Rejected flat brightness: skin_ratio=%.3f std_val=%.1f", skin_ratio, std_val)
            return True

        # Low skin + high-blue channel dominance (typical cold screen tone)
        b_ch = crop_img[:, :, 0].astype(np.float32)
        g_ch = crop_img[:, :, 1].astype(np.float32)
        r_ch = crop_img[:, :, 2].astype(np.float32)
        mean_b = float(np.mean(b_ch))
        mean_r = float(np.mean(r_ch))
        if mean_b > mean_r * 1.35:   # distinctly blue/cold tone
            log.debug("[ScreenFilter] Rejected cold-blue: skin_ratio=%.3f B/R=%.2f", skin_ratio, mean_b / max(mean_r, 1))
            return True

        return False
    except Exception:
        return False

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
        # Only ACTIVE employees are recognized. Inactive employees are excluded
        # from the matching cache so they never match on camera.
        # Fallback: if the is_active column doesn't exist, return all faces.
        try:
            res = supabase.table("known_faces").select(
                "id, name, employee_code, department, designation, email, embedding, photo_url"
            ).eq("is_active", True).execute()
        except Exception:
            log.warning("known_faces is_active filter failed, falling back to all faces")
            res = supabase.table("known_faces").select(
                "id, name, employee_code, department, designation, email, embedding, photo_url"
            ).execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching known faces: %s", e)
        return []

def fetch_visitors():
    try:
        # Only ACTIVE visitors are recognized. Inactive visitors are excluded
        # from the matching cache so they never match on camera.
        # Fallback: if the is_active column doesn't exist yet (migration not
        # run), return all visitors so recognition keeps working.
        try:
            res = supabase.table("visitors").select("visitor_id, full_name, photo_image, embedding").eq("is_active", True).execute()
        except Exception:
            log.warning("is_active filter failed (column missing?), falling back to all visitors")
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


def match_embedding(input_emb, snapshot: _CacheSnapshot = None, threshold=None, margin=None, top_n: int = 3):
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

    Returns (best_face_or_None, best_score, runner_up_score, top_candidates)
    where top_candidates is a list of up to `top_n` dicts
    {name, score, photo_url} ranked by similarity — the "who is this
    closest to" comparison data shown in the UI.
    """
    if threshold is None:
        threshold = Config.MATCH_THRESHOLD
    if margin is None:
        margin = Config.MATCH_MARGIN
    if snapshot is None:
        snapshot = get_cache_snapshot()

    if not snapshot.faces or snapshot.matrix is None or len(snapshot.matrix) == 0:
        return None, -1.0, -1.0, []

    input_vec = np.asarray(input_emb, dtype=np.float32)
    if snapshot.matrix.shape[1] != input_vec.shape[0]:
        log.warning(
            "[match_embedding] Dimension mismatch: cache=%s-d, input=%s-d. "
            "Likely a stale model/embedding mismatch — run /api/refresh_cache "
            "after confirming embeddings are regenerated.",
            snapshot.matrix.shape[1], input_vec.shape[0],
        )
        return None, -1.0, -1.0, []

    norm_in = np.linalg.norm(input_vec)
    if norm_in == 0:
        return None, -1.0, -1.0, []
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

    # Top-N candidates for the comparison view (always computed so the UI
    # can show exactly which enrolled identities a face is closest to).
    n = min(top_n, len(sims))
    top_idx = np.argpartition(sims, -n)[-n:] if n > 1 else np.array([best_idx])
    top_idx = top_idx[np.argsort(-sims[top_idx])]
    top_candidates = [
        {
            "name": snapshot.faces[int(i)]["name"],
            "score": round(float(sims[int(i)]), 4),
            "photo_url": snapshot.faces[int(i)].get("photo_url"),
        }
        for i in top_idx
    ]

    if best_score >= threshold and (best_score - runner_up) >= margin:
        return snapshot.faces[best_idx], best_score, runner_up, top_candidates
    return None, best_score, runner_up, top_candidates


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
                   yolo_imgsz: int = None, min_face_px: int = None,
                   exclusion_zones: list = None):
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

    if min_face_px is None:
        min_face_px = Config.MIN_FACE_PX

    for face in faces:
        det_score = float(getattr(face, "det_score", 1.0))
        if det_score < Config.DET_SCORE_MIN:
            continue

        bbox = face.bbox.astype(int).tolist()
        x1, y1 = max(0, bbox[0]), max(0, bbox[1])
        x2, y2 = min(w, bbox[2]), min(h, bbox[3])
        if (x2 - x1) < min_face_px or (y2 - y1) < min_face_px:
            continue

        # ── Screen / TV exclusion zone filter ───────────
        if exclusion_zones and is_face_in_exclusion_zone(bbox, w, h, exclusion_zones):
            log.debug("[ScreenFilter] Face at %s suppressed by exclusion zone", bbox)
            continue

        raw_crop = img[y1:y2, x1:x2]
        if raw_crop.size == 0:
            continue

        # ── Auto-screen detection (no manual zone needed) ─
        if is_screen_face(raw_crop):
            log.debug("[ScreenFilter] Face at %s auto-rejected as screen image", bbox)
            continue

        enhanced_crop = enhance_face_for_embedding(raw_crop.copy())
        crop_b64 = cv2_to_base64(enhanced_crop if enhanced_crop is not None else raw_crop)

        embedding = face.embedding
        lm = getattr(face, "landmark_2d_106", None)
        best_known, best_score, runner_up, top_candidates = match_embedding(embedding, snapshot)

        # Retry pass on the enhanced, padded crop if no match was found —
        # identical padding/retry behaviour on every call site now. When the
        # enhanced-crop embedding produces a HIGHER score than the raw
        # full-frame embedding, the enhanced result wins: it is the strongest
        # signal for small/blurry/low-contrast live crops, which is exactly
        # when the raw embedding under-scores a genuine match.
        if (not best_known or best_score < 0.90) and enhanced_crop is not None and enhanced_crop.size > 0:
            try:
                padded_crop = pad_image(enhanced_crop, 50)
                enh_faces = face_app.get(padded_crop)
                if enh_faces:
                    best_enh = max(enh_faces, key=lambda f: float(getattr(f, 'det_score', 0)))
                    enh_known, enh_score, enh_runner_up, enh_top = match_embedding(best_enh.embedding, snapshot)
                    if enh_score > best_score:
                        best_known, best_score, runner_up, top_candidates = enh_known, enh_score, enh_runner_up, enh_top
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
            "top3": top_candidates,
            "bbox": bbox,
            "crop_b64": crop_b64,
            "det_score": round(det_score, 3),
            "landmarks": landmarks,
            "is_visitor": bool(best_known and best_known.get("is_visitor")),
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


def presence_update(camera_id: str, name: str, score: float, photo_url, crop_b64, top_matches: list = None, person_id=None, is_visitor=False):
    """Track a matched face across frames. Returns (is_confirmed, best_score).

    Best-of-best semantics: instead of averaging the noisy per-frame
    scores (which lets a single blurry frame drag a confident match down
    below threshold), we keep the HIGHEST score seen during the walk and
    keep upgrading the stored crop/photo/top-matches with it. The clearest
    frame of the walk therefore decides the final match, which is what
    "best of best" means here."""
    now = time.time()
    with PRESENCE_LOCK:
        if camera_id not in PRESENCE_TRACKER:
            PRESENCE_TRACKER[camera_id] = {}
        tracker = PRESENCE_TRACKER[camera_id]
        if name not in tracker:
            tracker[name] = {"frames": 0, "scores": [], "best_score": -1.0,
                             "last_seen": 0, "photo_url": photo_url,
                             "crop": crop_b64, "best_top": top_matches,
                             "person_id": person_id, "is_visitor": is_visitor,
                             "confirmed": False}
        entry = tracker[name]
        entry["frames"] += 1
        entry["scores"] = (entry["scores"] + [score])[-10:]
        if score > entry.get("best_score", -1.0):
            entry["best_score"] = score
            entry["photo_url"] = photo_url
            entry["crop"] = crop_b64
            entry["best_top"] = top_matches
            if person_id is not None:
                entry["person_id"] = person_id
            entry["is_visitor"] = is_visitor
        entry["last_seen"] = now
        if entry["frames"] >= Config.PRESENCE_CONFIRM_FRAMES:
            entry["confirmed"] = True
        best = entry["best_score"]
    return entry["confirmed"], best


def presence_cleanup(camera_id: str):
    """Remove stale entries from the presence tracker.

    A matched face is only logged to the database when it LEAVES the
    presence window — by then presence_update has accumulated the best-of-
    best score/crop of the whole walk, so the row stores the clearest frame
    rather than the first (possibly blurry) one."""
    now = time.time()
    to_flush = []
    with PRESENCE_LOCK:
        if camera_id not in PRESENCE_TRACKER:
            return
        stale = [n for n, d in PRESENCE_TRACKER[camera_id].items()
                 if now - d["last_seen"] > Config.PRESENCE_TIMEOUT_SEC]
        for n in stale:
            entry = PRESENCE_TRACKER[camera_id].pop(n)
            if entry.get("confirmed") and n != "Unknown":
                to_flush.append((n, entry))

    for name, entry in to_flush:
        worker_log_match(
            camera_id, name, entry["best_score"], entry.get("crop"),
            person_id=None if entry.get("is_visitor") else entry.get("person_id"),
            top_matches=entry.get("best_top"),
        )


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


def _safe_person_id(person_id, name=None):
    """face_logs.person_id is a FOREIGN KEY into known_faces(id). Visitors live
    in their own id space (visitors.visitor_id), so writing a visitor_id into
    person_id violates the FK constraint and the whole recognition row is
    silently rejected — the visitor gets recognised but never lands in the DB.
    Return None for any person that is not a known employee."""
    if not person_id:
        return None
    if name and str(name).lower().startswith("visitor: "):
        return None
    snap = get_cache_snapshot()
    if snap and snap.faces:
        for fitem in snap.faces:
            if fitem.get("id") == person_id:
                return None if fitem.get("is_visitor") else person_id
    return person_id


def _execute_safe_insert(payload: dict, camera_id: str = ""):
    """Inserts payload into Supabase face_logs with multi-stage fallback (schema alignment + FK safety)."""
    if supabase is None:
        return

    if payload.get("person_id"):
        payload["person_id"] = _safe_person_id(payload["person_id"], payload.get("person_name"))

    try:
        supabase.table("face_logs").insert(payload).execute()
        log.info("[Logger %s] Logged face: %s (conf=%.2f)", camera_id, payload.get("person_name"), payload.get("confidence", 0))
    except Exception as e:
        # Fallback Level 1: Strip columns not present in standard face_logs schema
        allowed_keys = {"id", "person_name", "confidence", "snapshot_url", "timestamp", "camera_id", "person_id", "org_id"}
        clean_payload = {k: v for k, v in payload.items() if k in allowed_keys}

        try:
            supabase.table("face_logs").insert(clean_payload).execute()
            log.info("[Logger %s] Clean schema fallback insert succeeded for %s", camera_id, payload.get("person_name"))
        except Exception as e_clean:
            # Fallback Level 2: Handle Foreign Key violations (23503 on camera_id or person_id)
            err_fk = str(e_clean)
            if "camera_id" in err_fk or "23503" in err_fk or "fkey" in err_fk:
                clean_payload["camera_id"] = None
            if "person_id" in err_fk or "23503" in err_fk or "fkey" in err_fk:
                clean_payload["person_id"] = None

            try:
                supabase.table("face_logs").insert(clean_payload).execute()
                log.info("[Logger %s] FK-safe fallback insert succeeded for %s", camera_id, payload.get("person_name"))
            except Exception as e_final:
                log.error("[Logger %s] Log insert failed after all fallbacks: %s", camera_id, e_final)


def log_match(camera_id: str, name: str, confidence: float, crop_b64: str, person_id: str = None, top_matches: list = None):
    if supabase is None:
        return
    person_id = _safe_person_id(person_id, name)
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
            "person_id": person_id,
            "person_name": name,
            "confidence": round(confidence, 4),
            "snapshot_url": crop_b64,
            "timestamp": created_at,
            "camera_id": camera_id
        }
        if top_matches:
            payload["top_matches"] = [
                {"name": m.get("name"), "score": m.get("score"), "photo_url": m.get("photo_url")}
                for m in top_matches
            ]
        _execute_safe_insert(payload, camera_id)

        try:
            publish_event(get_camera_org(camera_id),
                          "unknown_person" if (not person_id or name.lower() == "unknown") else "face_detected",
                          {**payload, "person_id": person_id})
        except Exception as e_ev:
            log.debug("[Logger event] %s", e_ev)

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
                "top_matches": [m for m in (top_matches or [])],
            })
        except queue.Full:
            pass
    except Exception as e:
        log.error("[Logger %s] Log error: %s", camera_id, e)


def worker_log_match(camera_id: str, name: str, confidence: float, crop_b64: str, person_id: str = None, top_matches: list = None):
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

    person_id = _safe_person_id(person_id, name)

    def run_db_insert():
        try:
            from datetime import datetime, timezone
            payload = {
                "id": str(uuid.uuid4()),
                "person_id": person_id,
                "person_name": name,
                "confidence": round(confidence, 4),
                "snapshot_url": crop_b64,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "camera_id": camera_id
            }
            if top_matches:
                payload["top_matches"] = [
                    {"name": m.get("name"), "score": m.get("score"), "photo_url": m.get("photo_url")}
                    for m in top_matches
                ]
            _execute_safe_insert(payload, camera_id)
            try:
                publish_event(get_camera_org(camera_id),
                              "unknown_person" if (not person_id or name.lower() == "unknown") else "face_detected",
                              {**payload, "person_id": person_id})
            except Exception as e_ev:
                log.debug("[Async Logger event] %s", e_ev)
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

    def __init__(self, camera_id: str, source_type: str = "rtsp", device_index: int = None,
                 screen_zones: list = None):
        self.camera_id = camera_id
        self.source_type = source_type
        self.device_index = device_index
        self.url = f"rtsp://localhost:{Config.GO2RTC_RTSP_PORT}/{camera_id}" if source_type == "rtsp" else None
        self._stop = threading.Event()
        self._latest_frame = None
        self._frame_lock = threading.Lock()
        # Exclusion zones: list of {x1,y1,x2,y2} (0-1 fractions) for TV/screen suppression.
        # Hot-reloadable: call update_screen_zones() without restarting the worker.
        self._screen_zones = screen_zones or []
        self._zones_lock = threading.Lock()

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

    def update_screen_zones(self, zones: list):
        """Hot-reload screen exclusion zones without restarting the worker thread."""
        with self._zones_lock:
            self._screen_zones = zones or []
        log.info("[Worker %s] Screen exclusion zones updated: %d zone(s)", self.camera_id, len(self._screen_zones))

    def _process_frame(self, frame):
        try:
            h, w = frame.shape[:2]
            target_w = 1280
            proc_frame = cv2.resize(frame, (target_w, int(h * target_w / w)))

            with self._zones_lock:
                zones = list(self._screen_zones)

            snapshot = get_cache_snapshot()
            detections, bodies = analyze_frame(
                proc_frame, snapshot, run_yolo=True,
                exclusion_zones=zones
            )

            presence_cleanup(self.camera_id)

            for d in detections:
                d["camera_id"] = self.camera_id
                if d["matched"]:
                    confirmed, best_score = presence_update(
                        self.camera_id, d["name"], d["confidence"], d.get("photo_url"), d["crop_b64"],
                        top_matches=d.get("top3"), person_id=d.get("id"), is_visitor=d.get("is_visitor"),
                    )
                    d["confirmed"] = confirmed
                    d["confidence"] = round(best_score, 4)
                else:
                    d["confirmed"] = False
                    worker_log_match(self.camera_id, "Unknown", d["confidence"], d["crop_b64"], person_id=None, top_matches=d.get("top3"))

            with LATEST_DETECTIONS_LOCK:
                LATEST_DETECTIONS[self.camera_id] = {
                    "detections": detections, "timestamp": time.time(), "bodies": bodies,
                    "frame_width": target_w, "frame_height": int(h * target_w / w),
                }
        except Exception as e:
            log.error("[Worker %s] Frame error: %s", self.camera_id, e)


def _parse_screen_zones(raw):
    """Normalise screen_zones from DB: accepts list[dict] or JSON string."""
    if not raw:
        return []
    try:
        if isinstance(raw, str):
            raw = json.loads(raw)
        if isinstance(raw, list):
            return [
                {"x1": float(z["x1"]), "y1": float(z["y1"]),
                 "x2": float(z["x2"]), "y2": float(z["y2"])}
                for z in raw
                if all(k in z for k in ("x1", "y1", "x2", "y2"))
            ]
    except Exception as e:
        log.warning("[ScreenZones] Could not parse zones: %s", e)
    return []


def start_all_workers():
    if supabase is None or face_app is None:
        log.warning("[Workers] Skipping — Supabase or InsightFace not ready.")
        return
    try:
        # Warm the matching cache before workers start so known faces are
        # recognized from the very first frame (not just after a manual
        # /api/refresh_cache call).
        try:
            refresh_cache()
        except Exception as _r:
            log.warning("[Workers] Initial cache refresh failed: %s", _r)
        res = supabase.table("cameras").select("*").execute()
        cameras = res.data or []
        with WORKERS_LOCK:
            for cam in cameras:
                cam_id = cam["id"]
                if cam_id not in CAMERA_WORKERS:
                    rtsp_url = cam.get("rtsp_url", "") or ""
                    src_type = cam.get("source_type")
                    dev_idx = cam.get("device_index")
                    screen_zones = _parse_screen_zones(cam.get("screen_zones"))
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
                        w = CameraWorker(cam_id, source_type="device",
                                         device_index=dev_idx if dev_idx is not None else 0,
                                         screen_zones=screen_zones)
                    else:
                        w = CameraWorker(cam_id, source_type="rtsp", screen_zones=screen_zones)
                    if screen_zones:
                        log.info("[Workers] Camera '%s' loaded with %d screen exclusion zone(s).",
                                 cam_id, len(screen_zones))
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


def cache_refresh_worker():
    """Background worker that periodically reloads the known-face embedding
    cache.

    The cache is ONLY refreshed at process startup today, which means a
    transient DB hiccup at boot (or a registration made while the backend is
    already running) leaves the cache empty/stale forever — every face then
    gets logged as 'Unknown' because there are no embeddings to match
    against. Running a refresh loop here guarantees the live camera workers
    always have the freshest enrollment data within CACHE_REFRESH_SEC."""
    interval = float(os.getenv("CACHE_REFRESH_SEC", "60"))
    log.info("[Cache] Cache refresh worker started (every %.0fs).", interval)
    while True:
        try:
            time.sleep(interval)
            if supabase is not None:
                refresh_cache()
        except Exception as e:
            log.error("[Cache] Background refresh error: %s", e)
            time.sleep(interval)


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
        # Ensure the matching cache is warm BEFORE camera workers go live —
        # otherwise the first minutes log every face as "Unknown".
        refresh_cache()
        start_all_workers()
        threading.Thread(target=cache_refresh_worker, daemon=True, name="cache-refresh").start()
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
                conf = data.get("best_score", -1.0)
                if conf < 0:
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
        "database": {"status": ("Connected" if _live_db_connected() else "Failed"), "url": Config.SUPABASE_URL, "error": db_connection_error},
        "model_loaded": face_app is not None,
        "active_model": ACTIVE_MODEL_NAME,
        "match_threshold": Config.MATCH_THRESHOLD,
        "match_margin": Config.MATCH_MARGIN,
        "cached_faces": len(snapshot.faces),
        "auth_enabled": bool(Config.API_KEY) or api_keys_table_ready(),
        "auth": {"api_keys_table_ready": api_keys_table_ready()},
    })

_DB_STATUS_TTL = 15.0
_db_status_cache = {"ts": 0.0, "ok": False}

def _live_db_connected() -> bool:
    """Re-test the Supabase connection instead of trusting the startup flag.
    The startup probe can fail if the DB was briefly unreachable while the
    backend booted, leaving db_connection_status='Failed' forever even though
    the DB is fine a minute later."""
    global db_connection_status
    global _db_status_cache
    now = time.time()
    if now - _db_status_cache["ts"] < _DB_STATUS_TTL:
        return _db_status_cache["ok"]
    ok = False
    try:
        if supabase is not None:
            supabase.table("known_faces").select("id").limit(1).execute()
            ok = True
    except Exception as e:
        log.debug("Live DB health probe failed: %s", e)
    _db_status_cache = {"ts": now, "ok": ok}
    if ok and db_connection_status != "Connected":
        db_connection_status = "Connected"
    return ok


@app.route("/api/health", methods=["GET"])
def health():
    snapshot = get_cache_snapshot()
    with WORKERS_LOCK:
        workers = list(CAMERA_WORKERS.keys())
    return jsonify({
        "status": "healthy",
        "database_connected": _live_db_connected(),
        "model_loaded": face_app is not None,
        "active_model": ACTIVE_MODEL_NAME,
        "match_threshold": Config.MATCH_THRESHOLD,
        "match_margin": Config.MATCH_MARGIN,
        "cached_faces": len(snapshot.faces),
        "active_workers": workers,
        "auth": {"api_keys_table_ready": api_keys_table_ready()},
    })

# ──────────────────────────────────────────────────────────
# INTEGRATION PARTNER / SDK API KEY MANAGEMENT
# ──────────────────────────────────────────────────────────
VALID_KEY_SCOPES = {"read", "write", "admin"}

@app.route("/api/auth/keys", methods=["GET"])
@require_api_key
def list_api_keys():
    if not api_keys_table_ready():
        return jsonify({"error": "api_keys table not created. Apply Backend/schema_api_keys.sql in Supabase."}), 503
    try:
        res = (
            supabase.table("api_keys")
            .select("id, name, description, prefix, scopes, revoked, created_at, last_used_at")
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify({"keys": res.data or []})
    except Exception as e:
        log.error("Error listing api keys: %s", e)
        return jsonify({"error": "Database error"}), 500

@app.route("/api/auth/keys", methods=["POST"])
@require_api_key
def create_api_key():
    if not api_keys_table_ready():
        return jsonify({"error": "api_keys table not created. Apply Backend/schema_api_keys.sql in Supabase."}), 503
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Missing name"}), 400

    scopes = data.get("scopes") or ["read"]
    if isinstance(scopes, str):
        scopes = [s.strip() for s in scopes.split(",") if s.strip()]
    invalid = set(scopes) - VALID_KEY_SCOPES
    if invalid:
        return jsonify({"error": f"Invalid scope(s): {', '.join(sorted(invalid))}. Valid: {', '.join(sorted(VALID_KEY_SCOPES))}"}), 400
    scopes = sorted(set(scopes)) or ["read"]

    prefix, full_key = generate_api_key()
    key_row = {
        "name": name,
        "description": (data.get("description") or "").strip() or None,
        "prefix": prefix,
        "key_hash": hash_api_key(full_key),
        "scopes": scopes,
        "created_by": (data.get("created_by") or "").strip() or None,
    }
    try:
        res = supabase.table("api_keys").insert(key_row).execute()
        row = res.data[0]
    except Exception as e:
        log.error("Error creating api key: %s", e)
        return jsonify({"error": "Database error"}), 500

    return jsonify({
        "success": True,
        "key": {
            "id": row["id"],
            "name": row["name"],
            "prefix": row["prefix"],
            "scopes": row.get("scopes", []),
            # The ONLY time the full key is ever returned.
            "secret_key": full_key,
            "created_at": row.get("created_at"),
        },
    }), 201

@app.route("/api/auth/keys/<key_id>/revoke", methods=["POST"])
@require_api_key
def revoke_api_key(key_id):
    if not api_keys_table_ready():
        return jsonify({"error": "api_keys table not created. Apply Backend/schema_api_keys.sql in Supabase."}), 503
    try:
        res = (
            supabase.table("api_keys")
            .update({"revoked": True, "revoked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()})
            .eq("id", key_id)
            .execute()
        )
        if not res.data:
            return jsonify({"error": "Key not found"}), 404
        return jsonify({"success": True, "key": {"id": key_id, "revoked": True}})
    except Exception as e:
        log.error("Error revoking api key: %s", e)
        return jsonify({"error": "Database error"}), 500

# ──────────────────────────────────────────────────────────
# MULTI-TENANT ORGANIZATION / INTEGRATION PLATFORM
# organizations → integration_apps → keys / webhooks / events
# ──────────────────────────────────────────────────────────
VALID_EVENT_TYPES = {
    "face_detected", "unknown_person", "presence_changed",
    "visitor_checked_in", "visitor_checked_out", "employee_enrolled",
    "camera_added", "camera_removed", "system_alert",
}


def slugify(name):
    slug = "".join(c if c.isalnum() else "-" for c in (name or "").lower()).strip("-")
    return slug or "org-" + secrets.token_hex(3)


def org_access(key, org_id):
    """True if the authenticated key may operate on this org (or is master)."""
    if not key:
        return False
    if key.get("master"):
        return True
    return bool(key.get("org_id")) and str(key.get("org_id")) == str(org_id)


_CAMERA_ORG_CACHE = {}
_CAMERA_ORG_CACHE_TIME = 0.0


def get_camera_org(camera_id):
    """Resolve the org a camera belongs to (cached). Falls back to DEFAULT_ORG_ID."""
    if not camera_id:
        return os.environ.get("DEFAULT_ORG_ID") or None
    now = time.time()
    with LOG_LOCK:
        global _CAMERA_ORG_CACHE_TIME
        if not _CAMERA_ORG_CACHE or now - _CAMERA_ORG_CACHE_TIME > 60:
            if supabase is not None:
                try:
                    res = supabase.table("cameras").select("id, org_id").neq("org_id", None).execute()
                    _CAMERA_ORG_CACHE = {str(c.get("id")): c.get("org_id") for c in (res.data or []) if c.get("org_id")}
                    _CAMERA_ORG_CACHE_TIME = now
                except Exception:
                    pass
    return _CAMERA_ORG_CACHE.get(str(camera_id)) or os.environ.get("DEFAULT_ORG_ID") or None


def publish_event(org_id, event_type, payload=None):
    """Insert an integration_event and enqueue webhook deliveries (fire-and-forget)."""
    if not org_id or not event_type:
        return
    if supabase is None:
        return
    try:
        res = supabase.table("integration_events").insert({
            "org_id": org_id,
            "event_type": event_type,
            "source": "engine",
            "payload": payload or {},
        }).execute()
        event_id = res.data[0]["id"]
        enqueue_webhook_deliveries(org_id, event_type, event_id, payload or {})
    except Exception as e:
        log.debug("publish_event failed: %s", e)


def enqueue_webhook_deliveries(org_id, event_type, event_id, payload):
    if supabase is None:
        return
    try:
        res = supabase.table("webhook_endpoints").select("id, secret").eq("org_id", org_id).eq("active", True).execute()
        for ep in (res.data or []):
            # empty event_types = all events
            allowed = ep.get("event_types") or []
            if allowed and event_type not in allowed:
                continue
            supabase.table("webhook_deliveries").insert({
                "endpoint_id": ep["id"],
                "event_id": event_id,
                "event_type": event_type,
                "payload": payload,
                "status": "pending",
            }).execute()
    except Exception as e:
        log.debug("enqueue_webhook_deliveries failed: %s", e)


def _webhook_deliver_pending():
    """Dispatcher: POST pending webhook deliveries with HMAC signature + retry."""
    if supabase is None:
        return
    try:
        res = (
            supabase.table("webhook_deliveries")
            .select("id, endpoint_id, event_type, payload, attempts, next_retry_at")
            .eq("status", "pending")
            .lte("next_retry_at", datetime.datetime.now(datetime.timezone.utc).isoformat())
            .order("created_at", desc=False)
            .limit(20)
            .execute()
        )
        for d in (res.data or []):
            _dispatch_one_webhook(d)
    except Exception as e:
        log.debug("webhook dispatch pass failed: %s", e)


def _dispatch_one_webhook(delivery):
    try:
        endpoint_res = (
            supabase.table("webhook_endpoints")
            .select("id, url, secret, active")
            .eq("id", delivery["endpoint_id"])
            .maybe_single()
            .execute()
        )
        ep = endpoint_res.data
        if not ep or not ep.get("active"):
            return
        body = json.dumps({
            "id": delivery["id"],
            "event": delivery["event_type"],
            "payload": delivery.get("payload") or {},
            "delivered_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }).encode("utf-8")
        secret = (ep.get("secret") or "").encode("utf-8")
        signature = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
        resp = requests.post(
            ep["url"], data=body, timeout=8,
            headers={
                "Content-Type": "application/json",
                "X-Sentinel-Signature": signature,
                "X-Sentinel-Event": delivery["event_type"],
                "User-Agent": "Sentinel-Webhook/1.0",
            },
        )
        ok = resp.status_code in (200, 201, 202, 204)
        supabase.table("webhook_deliveries").update({
            "status": "success" if ok else "failed",
            "last_http_status": resp.status_code,
            "last_error": None if ok else (resp.text[:500] if resp.text else ""),
            "delivered_at": datetime.datetime.now(datetime.timezone.utc).isoformat() if ok else None,
        }).eq("id", delivery["id"]).execute()
    except Exception as e:
        attempts = int(delivery.get("attempts") or 0) + 1
        backoff = min(60 * 60, 5 * (2 ** attempts))
        supabase.table("webhook_deliveries").update({
            "status": "failed",
            "attempts": attempts,
            "last_error": str(e)[:500],
            "next_retry_at": (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=backoff)).isoformat(),
        }).eq("id", delivery["id"]).execute()


def _webhook_loop():
    while True:
        try:
            _webhook_deliver_pending()
        except Exception as e:
            log.debug("webhook loop error: %s", e)
        time.sleep(10)


def _require_org(key, org_id):
    if not org_access(key, org_id):
        return jsonify({"error": "Forbidden: key is not scoped to this organization"}), 403
    return None


_ORG_PLATFORM_READY = {"ready": None, "ts": 0.0}
_ORG_PLATFORM_TTL = 10


def org_platform_ready():
    """True if the integration-platform tables exist (cached briefly)."""
    now = time.time()
    if _ORG_PLATFORM_READY["ready"] is not None and (now - _ORG_PLATFORM_READY["ts"]) < _ORG_PLATFORM_TTL:
        return _ORG_PLATFORM_READY["ready"]
    if supabase is None:
        return False
    try:
        supabase.table("organizations").select("id").limit(1).execute()
        _ORG_PLATFORM_READY["ready"] = True
    except Exception:
        _ORG_PLATFORM_READY["ready"] = False
    _ORG_PLATFORM_READY["ts"] = now
    return _ORG_PLATFORM_READY["ready"]


# ── Organizations ──────────────────────────────────────────
@app.route("/api/orgs", methods=["GET"])
@require_api_key
def list_orgs():
    if not org_platform_ready():
        return jsonify({"error": "Organization platform not provisioned. Apply Backend/schema_integration_platform.sql in Supabase."}), 503
    key = request.api_key
    try:
        q = supabase.table("organizations").select("id, name, slug, logo_url, plan, status, created_at, updated_at")
        if key.get("master"):
            pass
        elif key.get("org_id"):
            q = q.eq("org_id", key.get("org_id"))
        else:
            return jsonify({"orgs": []})
        res = q.order("created_at", desc=False).execute()
        return jsonify({"orgs": res.data or []})
    except Exception as e:
        log.error("Error listing orgs: %s", e)
        return jsonify({"error": "Database error"}), 500


@app.route("/api/orgs", methods=["POST"])
@require_api_key
@require_scope("admin")
def create_org():
    if not org_platform_ready():
        return jsonify({"error": "Organization platform not provisioned. Apply Backend/schema_integration_platform.sql in Supabase."}), 503
    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Missing organization name"}), 400
    try:
        res = supabase.table("organizations").insert({
            "name": name,
            "slug": slugify(data.get("slug") or name),
            "plan": data.get("plan") or "free",
            "status": "active",
            "created_by": (data.get("created_by") or "").strip() or None,
            "settings": data.get("settings") or {},
        }).execute()
        return jsonify({"success": True, "org": res.data[0]}), 201
    except Exception as e:
        log.error("Error creating org: %s", e)
        return jsonify({"error": "Database error (slug may already exist)"}), 500


@app.route("/api/orgs/<org_id>", methods=["GET", "PUT"])
@require_api_key
def get_update_org(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "GET":
            res = supabase.table("organizations").select("*").eq("id", org_id).maybe_single().execute()
            if not res.data:
                return jsonify({"error": "Organization not found"}), 404
            return jsonify({"org": res.data})
        data = request.json or {}
        updates = {k: v for k, v in data.items() if k in ("name", "logo_url", "plan", "status", "settings")}
        if not updates:
            return jsonify({"error": "No updateable fields provided"}), 400
        res = supabase.table("organizations").update(updates).eq("id", org_id).execute()
        if not res.data:
            return jsonify({"error": "Organization not found"}), 404
        return jsonify({"success": True, "org": res.data[0]})
    except Exception as e:
        log.error("Error updating org: %s", e)
        return jsonify({"error": "Database error"}), 500


# ── Members ────────────────────────────────────────────────
@app.route("/api/orgs/<org_id>/members", methods=["GET", "POST"])
@require_api_key
def manage_org_members(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "GET":
            res = supabase.table("organization_members").select("*").eq("org_id", org_id).order("created_at", desc=False).execute()
            return jsonify({"members": res.data or []})
        data = request.json or {}
        email = (data.get("email") or "").strip().lower()
        if not email:
            return jsonify({"error": "Missing member email"}), 400
        role = data.get("role") or "developer"
        if role not in ("owner", "admin", "developer", "viewer"):
            return jsonify({"error": "Invalid role"}), 400
        res = supabase.table("organization_members").insert({
            "org_id": org_id,
            "name": (data.get("name") or "").strip() or None,
            "email": email,
            "role": role,
        }).execute()
        return jsonify({"success": True, "member": res.data[0]}), 201
    except Exception as e:
        log.error("Error managing members: %s", e)
        return jsonify({"error": "Database error (member may already exist)"}), 500


# ── Integration Apps ───────────────────────────────────────
@app.route("/api/orgs/<org_id>/apps", methods=["GET", "POST"])
@require_api_key
def manage_org_apps(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "GET":
            res = supabase.table("integration_apps").select("*").eq("org_id", org_id).order("created_at", desc=False).execute()
            return jsonify({"apps": res.data or []})
        data = request.json or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Missing app name"}), 400
        app_type = data.get("app_type") or "other"
        if app_type not in ("hrms", "attendance", "erp", "visitor_kiosk", "mobile", "dashboard", "analytics", "iot", "other"):
            return jsonify({"error": "Invalid app_type"}), 400
        res = supabase.table("integration_apps").insert({
            "org_id": org_id,
            "name": name,
            "app_type": app_type,
            "description": (data.get("description") or "").strip() or None,
            "homepage_url": (data.get("homepage_url") or "").strip() or None,
            "icon_url": (data.get("icon_url") or "").strip() or None,
            "status": "active",
        }).execute()
        return jsonify({"success": True, "app": res.data[0]}), 201
    except Exception as e:
        log.error("Error managing apps: %s", e)
        return jsonify({"error": "Database error"}), 500


@app.route("/api/orgs/<org_id>/apps/<app_id>", methods=["PUT", "DELETE"])
@require_api_key
def update_delete_org_app(org_id, app_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "DELETE":
            supabase.table("integration_apps").delete().eq("id", app_id).eq("org_id", org_id).execute()
            return jsonify({"success": True})
        data = request.json or {}
        updates = {k: v for k, v in data.items() if k in ("name", "app_type", "description", "homepage_url", "icon_url", "status")}
        if not updates:
            return jsonify({"error": "No updateable fields provided"}), 400
        res = supabase.table("integration_apps").update(updates).eq("id", app_id).eq("org_id", org_id).execute()
        if not res.data:
            return jsonify({"error": "App not found"}), 404
        return jsonify({"success": True, "app": res.data[0]})
    except Exception as e:
        log.error("Error updating app: %s", e)
        return jsonify({"error": "Database error"}), 500


# ── App-scoped API keys ────────────────────────────────────
@app.route("/api/orgs/<org_id>/keys", methods=["GET", "POST"])
@require_api_key
def manage_org_keys(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "GET":
            res = supabase.table("api_keys").select("*").eq("org_id", org_id).order("created_at", desc=True).execute()
            return jsonify({"keys": res.data or []})
        data = request.json or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Missing key name"}), 400
        scopes = data.get("scopes") or ["read"]
        if isinstance(scopes, str):
            scopes = [s.strip() for s in scopes.split(",") if s.strip()]
        invalid = set(scopes) - VALID_KEY_SCOPES
        if invalid:
            return jsonify({"error": f"Invalid scope(s): {', '.join(sorted(invalid))}"}), 400
        scopes = sorted(set(scopes)) or ["read"]
        prefix, full_key = generate_api_key()
        expires_at = data.get("expires_at")
        row = {
            "org_id": org_id,
            "app_id": data.get("app_id") or None,
            "name": name,
            "description": (data.get("description") or "").strip() or None,
            "prefix": prefix,
            "key_hash": hash_api_key(full_key),
            "scopes": scopes,
            "rate_limit_rpm": int(data.get("rate_limit_rpm") or 60),
            "expires_at": expires_at,
            "allowed_origins": data.get("allowed_origins") or [],
            "allowed_ips": data.get("allowed_ips") or [],
            "created_by": (data.get("created_by") or "").strip() or None,
        }
        res = supabase.table("api_keys").insert(row).execute()
        return jsonify({
            "success": True,
            "key": {**res.data[0], "secret_key": full_key},
        }), 201
    except Exception as e:
        log.error("Error managing org keys: %s", e)
        return jsonify({"error": "Database error"}), 500


# ── Webhooks ───────────────────────────────────────────────
@app.route("/api/orgs/<org_id>/webhooks", methods=["GET", "POST"])
@require_api_key
def manage_org_webhooks(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "GET":
            res = supabase.table("webhook_endpoints").select("*").eq("org_id", org_id).order("created_at", desc=False).execute()
            return jsonify({"webhooks": res.data or []})
        data = request.json or {}
        name = (data.get("name") or "").strip()
        url = (data.get("url") or "").strip()
        if not name or not url:
            return jsonify({"error": "Missing webhook name or url"}), 400
        secret = (data.get("secret") or "").strip() or secrets.token_hex(24)
        event_types = data.get("event_types") or []
        invalid = set(event_types) - VALID_EVENT_TYPES
        if invalid:
            return jsonify({"error": f"Invalid event type(s): {', '.join(sorted(invalid))}"}), 400
        res = supabase.table("webhook_endpoints").insert({
            "org_id": org_id,
            "app_id": data.get("app_id") or None,
            "name": name,
            "url": url,
            "secret": secret,
            "event_types": sorted(set(event_types)),
            "active": True,
        }).execute()
        row = res.data[0]
        return jsonify({"success": True, "webhook": {**row, "secret": secret}}), 201
    except Exception as e:
        log.error("Error managing webhooks: %s", e)
        return jsonify({"error": "Database error (url may already exist)"}), 500


@app.route("/api/orgs/<org_id>/webhooks/<webhook_id>", methods=["PUT", "DELETE"])
@require_api_key
def update_delete_webhook(org_id, webhook_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        if request.method == "DELETE":
            supabase.table("webhook_endpoints").delete().eq("id", webhook_id).eq("org_id", org_id).execute()
            return jsonify({"success": True})
        data = request.json or {}
        updates = {k: v for k, v in data.items() if k in ("name", "url", "active", "event_types")}
        if not updates:
            return jsonify({"error": "No updateable fields provided"}), 400
        res = supabase.table("webhook_endpoints").update(updates).eq("id", webhook_id).eq("org_id", org_id).execute()
        if not res.data:
            return jsonify({"error": "Webhook not found"}), 404
        return jsonify({"success": True, "webhook": res.data[0]})
    except Exception as e:
        log.error("Error updating webhook: %s", e)
        return jsonify({"error": "Database error"}), 500


@app.route("/api/orgs/<org_id>/webhooks/<webhook_id>/deliveries", methods=["GET"])
@require_api_key
def list_webhook_deliveries(org_id, webhook_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        res = supabase.table("webhook_deliveries").select("*").eq("endpoint_id", webhook_id).order("created_at", desc=True).limit(50).execute()
        return jsonify({"deliveries": res.data or []})
    except Exception as e:
        log.error("Error listing deliveries: %s", e)
        return jsonify({"error": "Database error"}), 500


# ── Usage metering ─────────────────────────────────────────
@app.route("/api/orgs/<org_id>/usage", methods=["GET"])
@require_api_key
def org_usage(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    try:
        res = supabase.table("api_usage_logs").select("status_code, created_at").eq("org_id", org_id).order("created_at", desc=True).limit(2000).execute()
        rows = res.data or []
        errors = sum(1 for r in rows if (r.get("status_code") or 0) >= 500)
        return jsonify({
            "total_requests": len(rows),
            "error_requests": errors,
            "recent": rows[:200],
        })
    except Exception as e:
        log.error("Error reading usage: %s", e)
        return jsonify({"error": "Database error"}), 500


# ── Generic org-scoped partner log feed (any app type, not HRMS-only) ──
@app.route("/api/orgs/<org_id>/logs", methods=["GET"])
@require_api_key
def org_partner_logs(org_id):
    key = request.api_key
    guard = _require_org(key, org_id)
    if guard:
        return guard
    args = request.args
    try:
        since = args.get("since")
        to = args.get("to")
        employee_code = args.get("employee_code")
        limit = min(int(args.get("limit") or 200), 1000)
        offset = max(int(args.get("offset") or 0), 0)
        include_snapshots = args.get("include_snapshots", "false").lower() in ("1", "true", "yes")

        logs_res = supabase.table("face_logs").select("*").eq("org_id", org_id).order("timestamp", desc=True)
        if since:
            logs_res = logs_res.gte("timestamp", since)
        if to:
            logs_res = logs_res.lte("timestamp", to)
        logs_res = logs_res.range(offset, offset + limit - 1)
        logs = (logs_res.execute().data) or []
    except Exception as e:
        log.error("Error querying org logs: %s", e)
        return jsonify({"error": "Database error"}), 500

    try:
        known_res = supabase.table("known_faces").select("id, name, employee_code, department, designation, photo_url").eq("org_id", org_id).execute()
        cam_res = supabase.table("cameras").select("id, name, place").eq("org_id", org_id).execute()
    except Exception:
        known_res = cam_res = None

    known_by_id = {k["id"]: k for k in (known_res.data or []) if known_res}
    known_by_name = {k["name"].lower(): k for k in (known_res.data or []) if known_res}
    cam_by_id = {c["id"]: c for c in (cam_res.data or []) if cam_res}

    out = []
    for l in logs:
        person_id = l.get("person_id")
        person_name = l.get("person_name") or "Unknown"
        meta = known_by_id.get(person_id) or known_by_name.get((person_name or "").lower(), {})
        cam = cam_by_id.get(l.get("camera_id"), {})
        entry = {
            "id": l.get("id"),
            "person_name": person_name,
            "confidence": l.get("confidence"),
            "timestamp": l.get("timestamp") or l.get("created_at"),
            "camera_id": l.get("camera_id"),
            "camera_name": cam.get("name"),
            "camera_place": cam.get("place"),
            "employee_code": meta.get("employee_code"),
            "department": meta.get("department"),
            "designation": meta.get("designation"),
        }
        if include_snapshots:
            entry["snapshot_url"] = l.get("snapshot_url")
        out.append(entry)

    if employee_code:
        out = [e for e in out if e.get("employee_code") == employee_code]

    return jsonify({"logs": out, "total": len(out)})


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

@app.route("/api/detections/<camera_id>/snapshot", methods=["POST"])
@require_api_key
def save_detection_snapshot(camera_id):
    """Store an HD face crop ('chunk') captured from the browser view into
    the face_logs table. Cooldown-guarded by log_match(), so rapid polling
    never floods the database. Optionally registers presence for matched
    faces so the snapshot also shows up on the live presence feed."""
    data = request.json or {}
    crop_b64 = data.get("image")
    if not crop_b64:
        return jsonify({"error": "Missing image"}), 400
    try:
        name = (data.get("name") or "Unknown").strip() or "Unknown"
        confidence = float(data.get("confidence") or 0.0)
        person_id = data.get("person_id")
        zoom = data.get("zoom")
        source = data.get("source", "browser")

        is_unknown = (name.lower() == "unknown") or not person_id

        if is_unknown:
            log_match(camera_id, "Unknown", confidence, crop_b64, person_id=None)
        else:
            log_match(camera_id, name, confidence, crop_b64, person_id=person_id)

        # Track presence for matched faces (confirmed = seen in a snapshot)
        if not is_unknown and confidence > 0:
            presence_update(camera_id, name, confidence, None, crop_b64)

        log.debug("[Snapshot %s] Stored HD %s crop: name=%s conf=%.2f zoom=%s",
                  camera_id, source, name, confidence, zoom)
        return jsonify({"success": True, "camera_id": camera_id, "name": name})
    except Exception as e:
        log.error("[Snapshot %s] Error storing HD crop: %s", camera_id, e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/cameras/<camera_id>/snapshot_direct", methods=["GET"])
def get_camera_snapshot_direct(camera_id):
    if supabase is None:
        return jsonify({"error": "DB not connected"}), 500
    try:
        res = supabase.table("cameras").select("rtsp_url").eq("id", camera_id).execute()
        if not res.data:
            return jsonify({"error": "Camera not found"}), 404
        
        rtsp_url = res.data[0]["rtsp_url"]
        import cv2
        import base64
        
        # Disable buffer to get latest frame
        cap = cv2.VideoCapture(rtsp_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            return jsonify({"error": "Failed to capture frame from camera"}), 500
            
        _, buffer = cv2.imencode(".jpg", frame)
        b64_image = base64.b64encode(buffer).decode("utf-8")
        
        return jsonify({"image": f"data:image/jpeg;base64,{b64_image}"})
    except Exception as e:
        log.error("Error grabbing direct snapshot for %s: %s", camera_id, e)
        return jsonify({"error": str(e)}), 500


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
    with PRESENCE_LOCK:
        PRESENCE_TRACKER.pop(camera_id, None)
    with LOG_LOCK:
        for key in [k for k in LAST_LOGGED_TIME if k[0] == camera_id]:
            del LAST_LOGGED_TIME[key]
    log.info("[Camera] Deleted camera '%s' (DB + mediamtx + worker cleaned up).", camera_id)

    return jsonify({"success": True})


@app.route("/api/cameras/activate", methods=["POST"])
@require_api_key
def activate_camera():
    """Wire up a camera that was already inserted into Supabase by the web
    UI (the frontend talks to Supabase directly, not to Flask). This endpoint
    builds the mediamtx entry, restarts the relay, and (re)starts the
    recognition worker so the camera actually streams and produces
    detections. Idempotent — safe to call on create AND edit."""
    data = request.json or {}
    camera_id = data.get("id")
    rtsp_url = data.get("rtsp_url")
    if not camera_id:
        return jsonify({"error": "Missing camera id"}), 400
    if not rtsp_url or str(rtsp_url).lower() in ("null", "none", ""):
        return jsonify({"error": "Missing rtsp_url"}), 400

    # Make sure a DB row exists for this camera (created via the UI).
    try:
        res = supabase.table("cameras").select("id").eq("id", camera_id).execute()
        if not res.data:
            supabase.table("cameras").insert({
                "id": camera_id,
                "name": data.get("name") or camera_id,
                "place": data.get("place") or data.get("location"),
                "rtsp_url": rtsp_url,
            }).execute()
    except Exception as e:
        log.error("[Camera activate] DB ensure failed for '%s': %s", camera_id, e)

    src = build_mediamtx_src(rtsp_url)
    write_mediamtx_yaml_entry(camera_id, src)
    restart_mediamtx()

    with WORKERS_LOCK:
        worker = CAMERA_WORKERS.get(camera_id)
    if worker:
        worker.stop()
        with WORKERS_LOCK:
            CAMERA_WORKERS.pop(camera_id, None)

    with WORKERS_LOCK:
        if camera_id not in CAMERA_WORKERS:
            w = CameraWorker(camera_id, source_type="rtsp")
            CAMERA_WORKERS[camera_id] = w
            w.start()

    log.info("[Camera] Activated camera '%s' (mediamtx + worker up).", camera_id)
    return jsonify({"success": True, "camera_id": camera_id})


@app.route("/api/cameras/<camera_id>/screen_zones", methods=["GET"])
def get_screen_zones(camera_id):
    """Return the current screen exclusion zones for a camera."""
    try:
        res = supabase.table("cameras").select("id, screen_zones").eq("id", camera_id).execute()
        if not res.data:
            return jsonify({"error": "Camera not found"}), 404
        raw = res.data[0].get("screen_zones")
        zones = _parse_screen_zones(raw)
        return jsonify({"camera_id": camera_id, "screen_zones": zones})
    except Exception as e:
        log.error("[ScreenZones] GET error for %s: %s", camera_id, e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/cameras/<camera_id>/screen_zones", methods=["PATCH"])
@require_api_key
def set_screen_zones(camera_id):
    """
    Set (or clear) the TV/screen exclusion zones for a camera.

    Body JSON: { "screen_zones": [ {"x1":0.3,"y1":0.0,"x2":0.65,"y2":0.4}, ... ] }

    Each zone uses normalised 0.0–1.0 coordinates relative to the processed
    frame (1280 px wide). Any face whose centre falls inside a zone is silently
    dropped from detection. Send an empty list [] to clear all zones.

    Changes take effect immediately — the live camera worker is hot-reloaded
    without any restart.
    """
    data = request.json or {}
    raw_zones = data.get("screen_zones", [])
    if not isinstance(raw_zones, list):
        return jsonify({"error": "screen_zones must be a list"}), 400

    zones = _parse_screen_zones(raw_zones)

    try:
        res = supabase.table("cameras").select("id").eq("id", camera_id).execute()
        if not res.data:
            return jsonify({"error": "Camera not found"}), 404
        supabase.table("cameras").update({"screen_zones": json.dumps(zones)}).eq("id", camera_id).execute()
    except Exception as e:
        log.error("[ScreenZones] DB update error for %s: %s", camera_id, e)
        return jsonify({"error": "Database error"}), 500

    # Hot-reload the live worker without restart
    with WORKERS_LOCK:
        worker = CAMERA_WORKERS.get(camera_id)
    if worker:
        worker.update_screen_zones(zones)

    log.info("[ScreenZones] Camera '%s' updated: %d zone(s)", camera_id, len(zones))
    return jsonify({"success": True, "camera_id": camera_id, "screen_zones": zones})


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
        q = supabase.table("face_logs").select("*").order("timestamp", desc=True).limit(100)
        if log_type == "known":
            q = q.neq("person_name", "Unknown")
        elif log_type == "unknown":
            q = q.eq("person_name", "Unknown")
        res = q.execute()
        logs = res.data or []
    except Exception:
        try:
            q = supabase.table("face_logs").select("*").order("created_at", desc=True).limit(100)
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

@app.route("/api/hrms/logs", methods=["GET"])
@require_api_key
def hrms_face_logs():
    """Partner-facing feed for third-party HRMS apps.

    Returns known-person face matching logs (enriched with employee_code,
    department, designation and camera location) so the HRMS can display
    every employee's CCTV recognition events.

    Query params:
        since         ISO timestamp — only logs at/after this time
        to            ISO timestamp — only logs at/before this time
        employee_code filter to a single employee
        limit         page size (default 200, max 1000)
        offset        for pagination
        include_snapshots  set 'true' to include snapshot images (default off — keeps payload small)
    """
    try:
        since = request.args.get("since")
        to = request.args.get("to")
        emp_code = request.args.get("employee_code")
        include_snapshots = request.args.get("include_snapshots", "false").lower() == "true"
        limit = min(int(request.args.get("limit", "200")), 1000)
        offset = max(int(request.args.get("offset", "0")), 0)
    except ValueError:
        return jsonify({"error": "Invalid limit/offset. Must be integers."}), 400

    try:
        q = supabase.table("face_logs").select("*").order("timestamp", desc=True)
        q = q.neq("person_name", "Unknown")
        if request.api_key.get("org_id"):
            q = q.eq("org_id", request.api_key.get("org_id"))
        if since:
            q = q.gte("timestamp", since)
        if to:
            q = q.lte("timestamp", to)
        res = q.limit(5000).execute()
        logs = res.data or []
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if not logs:
        return jsonify({"logs": [], "count": 0, "total": 0, "paginated": False})

    # Enrich with employee + camera info from known_faces/cameras.
    # Tables are small, so we load them fully and map in memory — avoids
    # postgrest "URI too long" errors when filtering by many face ids.
    emp_map = {}
    name_map = {}
    try:
        emp_res = supabase.table("known_faces").select(
            "id, name, employee_code, department, designation"
        ).execute()
        for e in (emp_res.data or []):
            emp_map[e["id"]] = e
            key = (e.get("name") or "").strip().lower()
            if key:
                name_map[key] = e
    except Exception:
        pass

    cam_map = {}
    try:
        cams = supabase.table("cameras").select("id, name, place").execute().data or []
        for c in cams:
            cam_map[c["id"]] = {"name": c["name"], "place": c.get("place")}
    except Exception:
        pass

    rows = []
    for l in logs:
        emp = emp_map.get(l.get("person_id")) or name_map.get((l.get("person_name") or "").strip().lower()) or {}
        code = emp.get("employee_code")
        if emp_code and code != emp_code:
            continue
        cam = cam_map.get(l.get("camera_id")) or {}
        row = {
            "id": l.get("id"),
            "employee_code": code,
            "person_name": l.get("person_name") or emp.get("name"),
            "department": emp.get("department"),
            "designation": emp.get("designation"),
            "camera_id": l.get("camera_id"),
            "camera_name": cam.get("name"),
            "camera_place": cam.get("place"),
            "timestamp": l.get("timestamp"),
            "confidence": round(l.get("confidence") or 0, 4),
        }
        if include_snapshots:
            row["snapshot_url"] = l.get("snapshot_url")
        rows.append(row)

    total = len(rows)
    page = rows[offset:offset + limit]
    return jsonify({"logs": page, "count": len(page), "total": total, "paginated": total > limit})

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
            conf = data.get("best_score", -1.0)
            if conf < 0:
                scores = data.get("scores", [1.0])
                conf = sum(scores) / len(scores)
            present.append({
                "name": name, "confidence": round(conf, 4),
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
    detections, bodies = analyze_frame(img, snapshot, run_yolo=True, yolo_imgsz=320)

    presence_cleanup(camera_id)
    for d in detections:
        d["camera_id"] = camera_id
        if d["matched"]:
            confirmed, best_score = presence_update(
                camera_id, d["name"], d["confidence"], d.get("photo_url"), d["crop_b64"],
                top_matches=d.get("top3"), person_id=d.get("id"), is_visitor=d.get("is_visitor"),
            )
            d["confirmed"] = confirmed
            d["confidence"] = round(best_score, 4)
        else:
            d["confirmed"] = False
            worker_log_match(camera_id, "Unknown", d["confidence"], d["crop_b64"], top_matches=d.get("top3"))

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
threading.Thread(target=_webhook_loop, daemon=True, name="webhook-dispatcher").start()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    snapshot = get_cache_snapshot()
    log.info("Starting Flask server on port %d...", port)
    log.info("Active model: %s | MATCH_THRESHOLD: %s | MATCH_MARGIN: %s | Cached faces: %d | Auth: %s",
              ACTIVE_MODEL_NAME, Config.MATCH_THRESHOLD, Config.MATCH_MARGIN,
              len(snapshot.faces), "ENABLED" if Config.API_KEY else "DISABLED")
    app.run(host="0.0.0.0", port=port, debug=False)