"""Repository: api_keys + api_usage_logs (authentication & metering)."""

import datetime

from . import db
from .logging_setup import get_logger

log = get_logger("sentinel.repos.api_keys")


def table_ready() -> bool:
    """True if the api_keys table exists (cheap probe; caller caches)."""
    client = db.get_client()
    if client is None:
        return False
    try:
        client.table("api_keys").select("id").limit(1).execute()
        return True
    except Exception as e:
        log.warning("api_keys table not ready: %s", e)
        return False


def find_by_hash(key_hash: str):
    client = db.get_client()
    if client is None:
        return None
    try:
        res = (
            client.table("api_keys")
            .select("id, name, scopes, revoked, prefix, org_id, app_id, rate_limit_rpm, expires_at, allowed_origins, allowed_ips, last_used_ip")
            .eq("key_hash", key_hash)
            .maybe_single()
            .execute()
        )
        return res.data
    except Exception as e:
        log.warning("api key lookup failed: %s", e)
        return None


def update_last_used(key_id: str, ip: str = None):
    """Fire-and-forget: stamp last_used_at + ip without blocking the request."""
    client = db.get_client()
    if not key_id or client is None:
        return
    try:
        payload = {"last_used_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        if ip:
            payload["last_used_ip"] = ip
        client.table("api_keys").update(payload).eq("id", key_id).execute()
    except Exception as e:
        log.debug("Could not update last_used_at: %s", e)


def count_recent_usage(key_id: str, since_iso: str) -> int:
    client = db.get_client()
    if client is None:
        return 0
    try:
        res = (
            client.table("api_usage_logs")
            .select("id")
            .eq("api_key_id", key_id)
            .gte("created_at", since_iso)
            .limit(10000)
            .execute()
        )
        return len(res.data or [])
    except Exception as e:
        log.debug("rate limit check failed: %s", e)
        return 0


def record_usage(payload: dict):
    client = db.get_client()
    if client is None:
        return
    try:
        client.table("api_usage_logs").insert(payload).execute()
    except Exception as e:
        log.debug("usage log insert failed: %s", e)


def list_keys():
    client = db.get_client()
    if client is None:
        return None
    try:
        res = (
            client.table("api_keys")
            .select("id, name, description, prefix, scopes, revoked, created_at, last_used_at")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.error("Error listing api keys: %s", e)
        raise


def insert_key(key_row: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("api_keys").insert(key_row).execute()


def revoke(key_id: str):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return (
        client.table("api_keys")
        .update({"revoked": True, "revoked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()})
        .eq("id", key_id)
        .execute()
    )


def list_for_org(org_id: str):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("api_keys").select("*").eq("org_id", org_id).order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        log.error("Error managing org keys: %s", e)
        raise


def fetch_usage_for_org(org_id: str, limit: int = 2000):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = (
            client.table("api_usage_logs")
            .select("status_code, created_at")
            .eq("org_id", org_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.error("Error reading usage: %s", e)
        raise
