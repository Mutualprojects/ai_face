"""Centralized configuration for the Sentinel detection engine.

Every tunable value lives here and can be overridden through environment
variables so the same code runs identically in dev and production.
"""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Config:
    # ── database ─────────────────────────────────────────────
    SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:8005")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    # ── matching ─────────────────────────────────────────────
    MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.35"))
    MATCH_MARGIN = float(os.getenv("MATCH_MARGIN", "0.02"))
    DET_SCORE_MIN = float(os.getenv("DET_SCORE_MIN", "0.25"))
    MIN_FACE_PX = int(os.getenv("MIN_FACE_PX", "15"))

    # ── YOLO ─────────────────────────────────────────────────
    YOLO_MODEL_PATH = os.getenv(
        "YOLO_MODEL_PATH", str(BACKEND_DIR / "yolov8n.pt")
    )
    YOLO_CONF = float(os.getenv("YOLO_CONF", "0.40"))
    YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))
    YOLO_ENABLED = os.getenv("YOLO_ENABLED", "true").lower() == "true"

    # ── capture / inference cadence ──────────────────────────
    FRAME_INTERVAL = float(os.getenv("FRAME_INTERVAL", "0.12"))
    MAX_WIDTH = int(os.getenv("DIRECT_MAX_WIDTH", "1280"))
    CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "1280"))
    CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "720"))

    # ── presence ─────────────────────────────────────────────
    PRESENCE_CONFIRM_FRAMES = int(os.getenv("PRESENCE_CONFIRM_FRAMES", "2"))
    PRESENCE_TIMEOUT_SEC = float(os.getenv("PRESENCE_TIMEOUT_SEC", "8.0"))

    # ── database logging cadence ─────────────────────────────
    LOG_COOLDOWN_KNOWN_SEC = float(os.getenv("LOG_COOLDOWN_KNOWN_SEC", "10.0"))
    LOG_COOLDOWN_UNKNOWN_SEC = float(os.getenv("LOG_COOLDOWN_UNKNOWN_SEC", "30.0"))
    LOG_UNKNOWN = os.getenv("LOG_UNKNOWN", "true").lower() == "true"

    # ── realtime / service ports ─────────────────────────────
    WS_BROADCAST_PORT = int(os.getenv("WS_BROADCAST_PORT", "5002"))
    CACHE_REFRESH_SEC = int(os.getenv("CACHE_REFRESH_SEC", "60"))

    # ── logging ──────────────────────────────────────────────
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR = Path(os.getenv("LOG_DIR", str(REPO_ROOT / "logs")))
    LOG_JSON = os.getenv("LOG_JSON", "false").lower() == "true"
    LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024)))
    LOG_BACKUPS = int(os.getenv("LOG_BACKUPS", "5"))

    # ── seeding ──────────────────────────────────────────────
    SEED_DEVICE_CAMERA = os.getenv("SEED_DEVICE_CAMERA", "true").lower() == "true"
    SEED_DEMO_FACE = os.getenv("SEED_DEMO_FACE", str(REPO_ROOT / "lena.jpg"))
