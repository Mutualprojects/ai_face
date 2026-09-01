"""Authentication & authorization: static master key + per-integration keys.

Every protected endpoint accepts either:
  Authorization: Bearer <key>
  x-api-key: <key>

Two kinds of keys are valid:
  1. The static master key (Config.API_KEY) — always valid.
  2. Integration-partner keys stored in the Supabase `api_keys`
     table (hashed SHA-256), optionally scoped to an organization.

If no API_KEY env var is set AND the api_keys table is unreachable, the
server still runs for local dev but logs a loud warning.
"""

import datetime
import functools
import hashlib
import ipaddress
import secrets
import time

from flask import jsonify, request

from . import repositories
from .config import Config
from .logging_setup import get_logger

log = get_logger("sentinel.auth")

API_KEY_PREFIX = "sentinel_live_"

_API_KEYS_TABLE_CHECK = {"ready": None, "ts": 0.0}
_API_KEYS_TABLE_TTL = 30.0

VALID_KEY_SCOPES = {"read", "write", "admin"}


def hash_api_key(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_api_key():
    """Return a new (prefix, full_key) pair. The full key is shown to the
    integrator exactly once at creation; only its hash is persisted."""
    secret = secrets.token_urlsafe(32)
    prefix = API_KEY_PREFIX + secrets.token_hex(4)
    return prefix, f"{prefix}.{secret}"


def api_keys_table_ready():
    """True if the api_keys table exists. Cached for a few seconds to avoid
    a Supabase round-trip on every protected request."""
    now = time.time()
    if _API_KEYS_TABLE_CHECK["ready"] is not None and (now - _API_KEYS_TABLE_CHECK["ts"]) < _API_KEYS_TABLE_TTL:
        return _API_KEYS_TABLE_CHECK["ready"]
    ready = repositories.api_keys.table_ready()
    _API_KEYS_TABLE_CHECK["ready"] = ready
    _API_KEYS_TABLE_CHECK["ts"] = now
    return ready


def lookup_api_key(token):
    """Return key record dict for a valid token, or None."""
    if not token:
        return None
    if Config.API_KEY and secrets.compare_digest(token, Config.API_KEY):
        return {"id": "master", "name": "Master Key", "scopes": ["*"], "master": True,
                "org_id": None, "app_id": None, "rate_limit_rpm": None}
    row = repositories.api_keys.find_by_hash(hash_api_key(token))
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


def enforce_rate_limit(key):
    """Return True if the request may proceed, else False (limit exceeded)."""
    rpm = key.get("rate_limit_rpm")
    if not rpm or key.get("master"):
        return True
    since = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)).isoformat()
    used = repositories.api_keys.count_recent_usage(key["id"], since)
    return used < rpm


def record_api_usage(key, status_code, method, path, latency_ms, ip, user_agent=""):
    """Fire-and-forget: log one authenticated API call for metering/billing."""
    if not key or key.get("master"):
        return
    repositories.api_keys.record_usage({
        "api_key_id": key.get("id"),
        "org_id": key.get("org_id"),
        "app_id": key.get("app_id"),
        "method": method,
        "path": path,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "ip": ip,
        "user_agent": user_agent,
    })


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
        repositories.api_keys.update_last_used(key.get("id"), ip=client_ip)
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


# ── Organization authorization ─────────────────────────────

def org_access(key, org_id) -> bool:
    """True if the authenticated key may operate on this org (or is master)."""
    if not key:
        return False
    if key.get("master"):
        return True
    return bool(key.get("org_id")) and str(key.get("org_id")) == str(org_id)


def org_guard(key, org_id):
    """Return a (response, status) tuple when access must be denied, else None."""
    if not org_access(key, org_id):
        return (jsonify({"error": "Forbidden: key is not scoped to this organization"}), 403)
    return None
