"""Repository: cameras table (including via_relay legacy handling)."""

import json
import os

from . import db
from .config import mediabstractmethod
from .logging_setup import get_logger

log = get_logger("sentinel.repos.cameras")

# Local fallback store for per-camera relay flags when the DB column does
# not exist yet. Survives restarts; authoritative only until the migration
# is applied (after that the DB column wins).
RELAY_FLAGS_FILE = mediabstractmethod(".relay_flags.json")

# Set by ensure_via_relay_column() at startup.
VIA_RELAY_COLUMN_OK = False


def ensure_via_relay_column():
    """Detect once whether migration_cameras_via_relay.sql was applied."""
    global VIA_RELAY_COLUMN_OK
    client = db.get_client()
    if client is None:
        VIA_RELAY_COLUMN_OK = False
        return
    try:
        client.table("cameras").select("id,via_relay").limit(1).execute()
        VIA_RELAY_COLUMN_OK = True
    except Exception:
        VIA_RELAY_COLUMN_OK = False
        log.info("[Relay] cameras.via_relay column absent — using local "
                 ".relay_flags.json until migration_cameras_via_relay.sql is run.")


def _load_relay_flags() -> dict:
    try:
        with open(RELAY_FLAGS_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_relay_flag(cam_id: str, enabled: bool):
    flags = _load_relay_flags()
    if enabled:
        flags[cam_id] = True
    else:
        flags.pop(cam_id, None)
    try:
        tmp = RELAY_FLAGS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(flags, f)
        os.replace(tmp, RELAY_FLAGS_FILE)
    except Exception as e:
        log.error("[Relay] persisting flag failed for '%s': %s", cam_id, e)


def via_relay_flag(value) -> bool:
    return bool(value) and str(value).lower() in ("true", "1", "yes", "on")


def cameras_select(base: str) -> str:
    """Include via_relay in a cameras select only when the column exists."""
    return f"{base},via_relay" if VIA_RELAY_COLUMN_OK else base


def cam_via_relay(cam: dict) -> bool:
    if VIA_RELAY_COLUMN_OK:
        return via_relay_flag(cam.get("via_relay"))
    return bool(_load_relay_flags().get(cam.get("id") or ""))


def store_via_relay(camera_id: str, enabled: bool):
    """Persist the flag wherever it lives (DB column or local store)."""
    if VIA_RELAY_COLUMN_OK:
        return   # caller already writes it inside the row payload
    _save_relay_flag(camera_id, enabled)


def fetch_all(base_cols: str = "*"):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("cameras").select(cameras_select(base_cols)).execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching cameras: %s", e)
        return []


def fetch_all_ordered():
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("cameras").select("*").order("created_at").execute()
        return res.data or []
    except Exception as e:
        log.error("Error fetching cameras from DB: %s", e)
        return []


def fetch_all_for_duplicate_check():
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("cameras").select("id,name,rtsp_url").execute()
        return res.data or []
    except Exception as e:
        log.warning("[Camera] duplicate check skipped: %s", e)
        return []


def fetch_rtsp_url(camera_id: str):
    client = db.get_client()
    if client is None:
        return None
    try:
        res = client.table("cameras").select("rtsp_url").eq("id", camera_id).execute()
        if res.data:
            return (res.data[0] or {}).get("rtsp_url")
    except Exception as e:
        log.error("Error fetching camera '%s': %s", camera_id, e)
    return None


def exists(camera_id: str) -> bool:
    client = db.get_client()
    if client is None:
        return False
    try:
        res = client.table("cameras").select("id").eq("id", camera_id).execute()
        return bool(res.data)
    except Exception as e:
        log.error("[Camera] exists check failed for '%s': %s", camera_id, e)
        return False


def insert(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("cameras").insert(payload).execute()


def update(camera_id: str, payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("cameras").update(payload).eq("id", camera_id).execute()


def delete(camera_id: str):
    client = db.get_client()
    if client is None:
        return None
    return client.table("cameras").delete().eq("id", camera_id).execute()


def fetch_screen_zones(camera_id: str):
    client = db.get_client()
    if client is None:
        return None
    try:
        res = client.table("cameras").select("id, screen_zones").eq("id", camera_id).execute()
        if not res.data:
            return None
        return (res.data[0] or {}).get("screen_zones")
    except Exception as e:
        log.error("[ScreenZones] DB error for %s: %s", camera_id, e)
        raise


def update_screen_zones(camera_id: str, zones_json: str):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("cameras").update({"screen_zones": zones_json}).eq("id", camera_id).execute()


def fetch_org_map() -> dict:
    """camera_id -> org_id for all cameras that belong to an org."""
    client = db.get_client()
    if client is None:
        return {}
    try:
        res = client.table("cameras").select("id, org_id").neq("org_id", None).execute()
        return {str(c.get("id")): c.get("org_id") for c in (res.data or []) if c.get("org_id")}
    except Exception:
        return {}


def fetch_id_name_place(org_id=None):
    client = db.get_client()
    if client is None:
        return []
    try:
        q = client.table("cameras").select("id, name, place")
        if org_id:
            q = q.eq("org_id", org_id)
        return q.execute().data or []
    except Exception:
        return []


def insert_missing_camera(cam_id: str, name: str, place: str, rtsp_url: str) -> bool:
    client = db.get_client()
    if client is None:
        return False
    try:
        client.table("cameras").insert({
            "id": cam_id, "name": name, "place": place, "rtsp_url": rtsp_url,
        }).execute()
        return True
    except Exception as e:
        log.error("[Sync] Could not insert camera '%s': %s", cam_id, e)
        return False
