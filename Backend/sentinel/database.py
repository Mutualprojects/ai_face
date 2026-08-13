"""Supabase persistence layer for the Sentinel engine.

Responsibilities:
  * connect to Supabase (with graceful degradation when offline)
  * upsert camera rows
  * write enriched detection logs into `face_logs`
  * fetch known faces + visitors for the embedding cache
"""

import json
import threading
import time
import uuid
from datetime import datetime, timezone

import numpy as np

from .config import Config
from .logger import get_logger

log = get_logger("sentinel.db")

_client = None
_client_lock = threading.Lock()

COOLDOWNS = {}
COOLDOWNS_LOCK = threading.Lock()


def get_client():
    global _client
    if _client is not None:
        return _client
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        log.warning("Supabase credentials missing — database features disabled.")
        return None
    with _client_lock:
        if _client is None:
            try:
                from supabase import create_client

                _client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
                log.info("Supabase client connected (%s)", Config.SUPABASE_URL)
            except Exception as e:
                log.error("Supabase connection failed: %s", e)
    return _client


def is_connected():
    try:
        db = get_client()
        if db is None:
            return False
        db.table("known_faces").select("id").limit(1).execute()
        return True
    except Exception as e:
        log.warning("Database health check failed: %s", e)
        return False


def upsert_camera(camera_id, name, rtsp_url=None):
    db = get_client()
    if db is None:
        return False
    try:
        payload = {"id": camera_id, "name": name, "place": name, "rtsp_url": rtsp_url or ""}
        existing = db.table("cameras").select("id").eq("id", camera_id).execute()
        if existing.data:
            db.table("cameras").update(payload).eq("id", camera_id).execute()
        else:
            db.table("cameras").insert(payload).execute()
        log.info("Camera '%s' upserted.", camera_id)
        return True
    except Exception as e:
        log.warning("Could not upsert camera '%s': %s", camera_id, e)
        return False


def log_detection(camera_id, person_name, confidence, snapshot_url, person_id=None,
                  matched=False, det_score=None, model_name=None, process_ms=None,
                  event_type="detection", cooldown_key=None, cooldown_sec=None):
    """Write one structured detection row to `face_logs` with cooldown.

    Cooldown is keyed per camera + identity so a stream of identical frames
    does not flood the database.
    """
    db = get_client()
    if db is None:
        return False

    key = cooldown_key or (camera_id, person_id or person_name)
    cooldown_sec = cooldown_sec or (
        Config.LOG_COOLDOWN_UNKNOWN_SEC
        if person_id is None or person_name.lower() == "unknown"
        else Config.LOG_COOLDOWN_KNOWN_SEC
    )

    with COOLDOWNS_LOCK:
        last = COOLDOWNS.get(key, 0.0)
        now = time.time()
        if now - last < cooldown_sec:
            return False
        COOLDOWNS[key] = now

    def insert():
        try:
            payload = {
                "id": str(uuid.uuid4()),
                "person_id": person_id,
                "person_name": person_name,
                "confidence": round(float(confidence), 4),
                "snapshot_url": snapshot_url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "camera_id": camera_id,
                "event_type": event_type,
                "matched": bool(matched),
                "det_score": round(float(det_score), 4) if det_score is not None else None,
                "model_name": model_name,
                "process_ms": round(float(process_ms), 2) if process_ms is not None else None,
            }
            try:
                db.table("face_logs").insert(payload).execute()
            except Exception as e_ins:
                # If Supabase lacks extended columns, fallback to core schema columns
                core_payload = {
                    "id": payload["id"],
                    "person_id": person_id,
                    "person_name": person_name,
                    "confidence": payload["confidence"],
                    "snapshot_url": snapshot_url,
                    "camera_id": camera_id,
                    "timestamp": payload["timestamp"]
                }
                try:
                    db.table("face_logs").insert(core_payload).execute()
                except Exception as e_fk:
                    err_s = str(e_fk)
                    if "camera_id" in err_s or "23503" in err_s or "fkey" in err_s:
                        core_payload["camera_id"] = None
                    if "person_id" in err_s or "23503" in err_s or "fkey" in err_s:
                        core_payload["person_id"] = None
                    db.table("face_logs").insert(core_payload).execute()
            log.info(
                "[%s] LOG -> %s (conf=%.2f, matched=%s)",
                camera_id, person_name, payload["confidence"], matched,
                extra={"camera_id": camera_id, "person_name": person_name,
                       "confidence": payload["confidence"], "event": "face_log"},
            )
        except Exception as e:
            log.error("[%s] Log insert error: %s", camera_id, e)

    threading.Thread(target=insert, daemon=True, name="db-insert").start()
    return True


def fetch_known_faces():
    db = get_client()
    if db is None:
        return []
    try:
        try:
            res = db.table("known_faces").select(
                "id, name, employee_code, department, designation, email, embedding, photo_url"
            ).eq("is_active", True).execute()
        except Exception:
            res = db.table("known_faces").select(
                "id, name, employee_code, department, designation, email, embedding, photo_url"
            ).execute()
        return res.data or []
    except Exception as e:
        log.error("fetch_known_faces error: %s", e)
        return []


def fetch_visitors():
    db = get_client()
    if db is None:
        return []
    try:
        try:
            res = db.table("visitors").select(
                "visitor_id, full_name, photo_image, embedding"
            ).eq("is_active", True).execute()
        except Exception:
            res = db.table("visitors").select(
                "visitor_id, full_name, photo_image, embedding"
            ).execute()
        visitors = []
        for row in res.data or []:
            if row.get("embedding"):
                visitors.append({
                    "id": row["visitor_id"],
                    "name": f"Visitor: {row['full_name']}",
                    "employee_code": None,
                    "department": "Visitor",
                    "designation": "Visitor",
                    "photo_url": row["photo_image"],
                    "embedding": row["embedding"],
                })
        return visitors
    except Exception as e:
        log.error("fetch_visitors error: %s", e)
        return []


def fetch_cameras():
    db = get_client()
    if db is None:
        return []
    try:
        res = db.table("cameras").select("*").execute()
        return res.data or []
    except Exception as e:
        log.error("fetch_cameras error: %s", e)
        return []


def parse_embedding(value):
    if not value:
        return None
    try:
        arr = json.loads(value) if isinstance(value, str) else value
        emb = np.asarray(arr, dtype=np.float32)
        return emb if emb.size > 0 else None
    except Exception:
        return None
