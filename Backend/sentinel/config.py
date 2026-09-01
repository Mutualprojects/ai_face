"""Central configuration for the Sentinel backend.

Every tunable constant lives here, overridable via environment variables,
so the same code runs identically in dev and production. Values mirror the
original single-file app.py exactly (defaults preserved for API behaviour).
"""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    # Load Backend/.env before any value is read (same behaviour as the
    # original top-of-file load_dotenv() call in app.py).
    load_dotenv()
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# OpenCV log noise off before cv2 is imported anywhere.
os.environ.setdefault("OPENCV_LOG_LEVEL", "OFF")
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")


def _flag(name: str, default: str) -> bool:
    return os.getenv(name, default).lower() == "true"


class Config:
    # ── database ─────────────────────────────────────────────
    SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8005")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # ── matching ─────────────────────────────────────────────
    # Best-of-best matching: workers keep the HIGHEST score seen for a
    # person across the whole walk (see presence.update) instead of
    # averaging noisy frames. Margin-based rejection drops matches that
    # only barely beat the runner-up. Set margin=0 for pure threshold.
    MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.35"))
    MATCH_MARGIN = float(os.getenv("MATCH_MARGIN", "0.02"))

    # Detection confidence gate — blurry/unclear detections are skipped
    # BEFORE matching so their noisy embeddings can never produce a match.
    DET_SCORE_MIN = float(os.getenv("DET_SCORE_MIN", "0.25"))
    REGISTER_DET_SCORE_MIN = float(os.getenv("REGISTER_DET_SCORE_MIN", "0.70"))

    # Faces smaller than this many px are too low-resolution to embed
    # reliably — tiny crops are a classic false-positive source.
    MIN_FACE_PX = int(os.getenv("MIN_FACE_PX", "15"))

    # Temporal confirmation: log on the first matched frame (the presence
    # tracker upgrades score/crop as clearer frames arrive).
    PRESENCE_CONFIRM_FRAMES = int(os.getenv("PRESENCE_CONFIRM_FRAMES", "1"))
    PRESENCE_TIMEOUT_SEC = float(os.getenv("PRESENCE_TIMEOUT_SEC", "8.0"))
    FRAME_INTERVAL = float(os.getenv("FRAME_INTERVAL", "0.10"))

    # ── cooldowns ────────────────────────────────────────────
    EMAIL_COOLDOWN_SECONDS = float(os.getenv("EMAIL_COOLDOWN_SECONDS", "300.0"))
    LOG_COOLDOWN_KNOWN_SEC = float(os.getenv("LOG_COOLDOWN_KNOWN_SEC", "10.0"))
    LOG_COOLDOWN_UNKNOWN_SEC = float(os.getenv("LOG_COOLDOWN_UNKNOWN_SEC", "5.0"))
    WORKER_LOG_COOLDOWN_SEC = float(os.getenv("WORKER_LOG_COOLDOWN_SEC", "60.0"))

    # ── ports / streaming ────────────────────────────────────
    GO2RTC_RTSP_PORT = int(os.getenv("GO2RTC_RTSP_PORT", "8554"))
    WS_PORT = int(os.getenv("WS_PORT", "5001"))
    MEDIAMTX_API_PORT = int(os.getenv("MEDIAMTX_API_PORT", "9997"))

    # ── UNIVERSAL RTSP RELAY (firewalled / unreachable cameras) ──
    # Cameras flagged via_relay are pulled as:
    #   camera → relay (go2rtc) → local MediaMTX → recognition workers
    RTSP_RELAY_API_URL = os.getenv("RTSP_RELAY_API_URL", "").rstrip("/")
    RTSP_RELAY_RTSP_URL = os.getenv("RTSP_RELAY_RTSP_URL", "").rstrip("/")

    # ── DEVICE CAMERAS ──────────────────────────────────────
    # Off by default: local webcams (/dev/videoX) must never be pulled
    # into the detection pipeline unless explicitly enabled.
    ALLOW_DEVICE_CAMERAS = _flag("ALLOW_DEVICE_CAMERAS", "false")

    # ── SCREEN / TV FACE FILTER ──────────────────────────────
    # 1. Per-camera exclusion zones (screen_zones column, hot-reloadable).
    # 2. Auto-screen detection via HSV/YCrCb colour statistics.
    SCREEN_AUTO_FILTER = _flag("SCREEN_AUTO_FILTER", "true")
    SCREEN_SKIN_RATIO_MIN = float(os.getenv("SCREEN_SKIN_RATIO_MIN", "0.08"))

    # ── YOLO ─────────────────────────────────────────────────
    YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", str(BACKEND_DIR / "yolov8n.pt"))

    # ── AUTH ─────────────────────────────────────────────────
    # If API_KEY is set, mutating endpoints require
    #   Authorization: Bearer <API_KEY>   (or x-api-key)
    # If it is not set, the server still runs (local dev) but logs a loud
    # warning on every request to a protected endpoint.
    API_KEY = os.getenv("API_KEY")

    # ── maintenance / background cadence ─────────────────────
    CAMERA_HEALTH_INTERVAL = float(os.getenv("CAMERA_HEALTH_INTERVAL", "45"))
    CACHE_REFRESH_SEC = float(os.getenv("CACHE_REFRESH_SEC", "60"))
    RETENTION_UNKNOWN_MINUTES = int(os.getenv("RETENTION_UNKNOWN_MINUTES", "50"))
    RETENTION_SWEEP_SEC = float(os.getenv("RETENTION_SWEEP_SEC", "60"))
    WEBHOOK_DISPATCH_INTERVAL = float(os.getenv("WEBHOOK_DISPATCH_INTERVAL", "10"))

    # ── paths ────────────────────────────────────────────────
    MEDIAMTX_YAML = str(BACKEND_DIR / "mediamtx.yml")
    MEDIAMTX_BIN = str(BACKEND_DIR / "mediamtx")
    MEDIAMTX_LOG = str(BACKEND_DIR / "mediamtx_run.log")


def mediabstractmethod(name: str) -> str:
    """Path inside the Backend directory for runtime state files."""
    return str(BACKEND_DIR / name)
