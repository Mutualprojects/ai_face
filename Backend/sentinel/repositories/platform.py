"""Repository: integration platform (orgs, members, apps, webhooks, events).

All functions return raw rows and let the service/API layer decide response
shapes and error mapping, exactly like the original route bodies did.
"""

import datetime

from . import db
from .logging_setup import get_logger

log = get_logger("sentinel.repos.platform")

utcnow_iso = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()


def platform_ready() -> bool:
    """True if the integration-platform tables exist (caller caches)."""
    client = db.get_client()
    if client is None:
        return False
    try:
        client.table("organizations").select("id").limit(1).execute()
        return True
    except Exception:
        return False


def list_orgs(org_id=None):
    client = db.get_client()
    if client is None:
        return []
    q = client.table("organizations").select(
        "id, name, slug, logo_url, plan, status, created_at, updated_at")
    if org_id:
        q = q.eq("org_id", org_id)
    return q.order("created_at", desc=False).execute().data or []


def get_org(org_id: str):
    client = db.get_client()
    if client is None:
        return None
    res = client.table("organizations").select("*").eq("id", org_id).maybe_single().execute()
    return res.data


def insert_org(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("organizations").insert(payload).execute()


def update_org(org_id: str, updates: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("organizations").update(updates).eq("id", org_id).execute()


def list_members(org_id: str):
    client = db.get_client()
    if client is None:
        return []
    res = (client.table("organization_members").select("*")
           .eq("org_id", org_id).order("created_at", desc=False).execute())
    return res.data or []


def insert_member(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("organization_members").insert(payload).execute()


def list_apps(org_id: str):
    client = db.get_client()
    if client is None:
        return []
    res = (client.table("integration_apps").select("*")
           .eq("org_id", org_id).order("created_at", desc=False).execute())
    return res.data or []


def insert_app(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("integration_apps").insert(payload).execute()


def delete_app(org_id: str, app_id: str):
    client = db.get_client()
    if client is None:
        return
    client.table("integration_apps").delete().eq("id", app_id).eq("org_id", org_id).execute()


def update_app(org_id: str, app_id: str, updates: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return (client.table("integration_apps").update(updates)
            .eq("id", app_id).eq("org_id", org_id).execute())


def list_webhooks(org_id: str):
    client = db.get_client()
    if client is None:
        return []
    res = (client.table("webhook_endpoints").select("*")
           .eq("org_id", org_id).order("created_at", desc=False).execute())
    return res.data or []


def insert_webhook(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("webhook_endpoints").insert(payload).execute()


def delete_webhook(org_id: str, webhook_id: str):
    client = db.get_client()
    if client is None:
        return
    client.table("webhook_endpoints").delete().eq("id", webhook_id).eq("org_id", org_id).execute()


def update_webhook(org_id: str, webhook_id: str, updates: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return (client.table("webhook_endpoints").update(updates)
            .eq("id", webhook_id).eq("org_id", org_id).execute())


def get_webhook(webhook_id: str):
    client = db.get_client()
    if client is None:
        return None
    res = client.table("webhook_endpoints").select("id, url, secret, active").eq(
        "id", webhook_id).maybe_single().execute()
    return res.data


def list_active_webhooks_for_org(org_id: str):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = (client.table("webhook_endpoints").select("id, secret")
               .eq("org_id", org_id).eq("active", True).execute())
        return res.data or []
    except Exception as e:
        log.debug("listing webhook endpoints failed: %s", e)
        return []


def insert_delivery(payload: dict):
    client = db.get_client()
    if client is None:
        return
    try:
        client.table("webhook_deliveries").insert(payload).execute()
    except Exception as e:
        log.debug("enqueue_webhook_deliveries failed: %s", e)


def fetch_pending_deliveries(limit: int = 20):
    client = db.get_client()
    if client is None:
        return []
    try:
        res = (
            client.table("webhook_deliveries")
            .select("id, endpoint_id, event_type, payload, attempts, next_retry_at")
            .eq("status", "pending")
            .lte("next_retry_at", utcnow_iso())
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.debug("webhook dispatch pass failed: %s", e)
        return []


def update_delivery(delivery_id: str, updates: dict):
    client = db.get_client()
    if client is None:
        return
    try:
        client.table("webhook_deliveries").update(updates).eq("id", delivery_id).execute()
    except Exception as e:
        log.debug("webhook delivery update failed: %s", e)


def list_deliveries(webhook_id: str, limit: int = 50):
    client = db.get_client()
    if client is None:
        return []
    res = (client.table("webhook_deliveries").select("*")
           .eq("endpoint_id", webhook_id).order("created_at", desc=True)
           .limit(limit).execute())
    return res.data or []


def insert_event(payload: dict):
    client = db.get_client()
    if client is None:
        raise RuntimeError("Database not connected")
    return client.table("integration_events").insert(payload).execute()


def fetch_known_faces_for_org(org_id: str):
    client = db.get_client()
    if client is None:
        return None
    try:
        res = client.table("known_faces").select(
            "id, name, employee_code, department, designation, photo_url").eq("org_id", org_id).execute()
        return res.data or []
    except Exception:
        return None


def fetch_known_faces_all():
    client = db.get_client()
    if client is None:
        return []
    try:
        res = client.table("known_faces").select(
            "id, name, employee_code, department, designation").execute()
        return res.data or []
    except Exception:
        return []
