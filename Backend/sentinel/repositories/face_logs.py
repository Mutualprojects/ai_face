"""Repository: face_logs (recognition event persistence)."""

from . import db
from .logging_setup import get_logger

log = get_logger("sentinel.repos.face_logs")


def insert(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("face_logs").insert(payload).execute()


def delete_unknown_before(cutoff_time: str):
    """Retention sweep: purge Unknown logs older than the cutoff. Falls back
    to created_at when the timestamp column is unavailable."""
    client = db.get_client()
    if client is None:
        return 0
    try:
        try:
            res = (client.table("face_logs").delete()
                   .eq("person_name", "Unknown")
                   .lt("timestamp", cutoff_time)
                   .execute())
        except Exception:
            res = (client.table("face_logs").delete()
                   .eq("person_name", "Unknown")
                   .lt("created_at", cutoff_time)
                   .execute())
        return len(res.data) if res.data else 0
    except Exception as e:
        log.error("[Retention Policy] Error purging old Unknown logs: %s", e)
        return 0


def fetch_recent(log_type: str = "all", limit: int = 100, order_col: str = "timestamp"):
    """Fetch recent logs, optionally filtered to known/unknown. Falls back to
    created_at ordering when timestamp ordering fails (legacy schema)."""
    client = db.get_client()
    if client is None:
        return []
    try:
        q = client.table("face_logs").select("*").order(order_col, desc=True).limit(limit)
        if log_type == "known":
            q = q.neq("person_name", "Unknown")
        elif log_type == "unknown":
            q = q.eq("person_name", "Unknown")
        res = q.execute()
        return res.data or []
    except Exception:
        if order_col == "timestamp":
            return fetch_recent(log_type, limit, order_col="created_at")
        raise


def fetch_known_since_org(org_id=None, since=None, to=None):
    """Known-person logs for the HRMS feed, optionally org-scoped."""
    client = db.get_client()
    if client is None:
        return []
    try:
        q = client.table("face_logs").select("*").order("timestamp", desc=True)
        q = q.neq("person_name", "Unknown")
        if org_id:
            q = q.eq("org_id", org_id)
        if since:
            q = q.gte("timestamp", since)
        if to:
            q = q.lte("timestamp", to)
        res = q.limit(5000).execute()
        return res.data or []
    except Exception as e:
        raise e


def fetch_org_logs(org_id, since=None, to=None, limit=200, offset=0):
    client = db.get_client()
    if client is None:
        return []
    q = client.table("face_logs").select("*").eq("org_id", org_id).order("timestamp", desc=True)
    if since:
        q = q.gte("timestamp", since)
    if to:
        q = q.lte("timestamp", to)
    q = q.range(offset, offset + limit - 1)
    return q.execute().data or []
