"""Supabase connection handling.

Connects at import time exactly like the original app.py did (the live
startup behaviour and /api/health contract depend on it), but the client
is owned here so repositories have a single place to read it from.
"""

import threading

from .config import Config
from .logging_setup import get_logger

log = get_logger("sentinel.db")

_client = None
client_lock = threading.Lock()

# Startup connection status, mutated only by connect() below.
connection_status = "Not Checked"
connection_error = None


def _probe(client):
    """The startup probe treats 'table missing' as connected (schema may be
    applied later) — identical to the original behaviour."""
    try:
        client.table("known_faces").select("id").limit(1).execute()
        return True
    except Exception as query_err:
        err_msg = str(query_err)
        if "relation" in err_msg or "404" in err_msg or "PGRST" in err_msg:
            return True
        raise query_err


def connect():
    """Create the Supabase client once and probe it. Idempotent."""
    global _client, connection_status, connection_error
    if _client is not None:
        return _client
    with client_lock:
        if _client is not None:
            return _client
        global_status = "Not Checked"
        global_error = None
        client = None
        if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
            global_status = "Failed: Missing Credentials"
            global_error = "SUPABASE_URL or SUPABASE_KEY is missing from environment"
        else:
            try:
                from supabase import create_client

                client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
                _probe(client)
                global_status = "Connected"
            except Exception as e:
                global_status = "Failed"
                global_error = str(e)
                client = None
                log.error("Supabase connection failed: %s", e)
        connection_status = global_status
        connection_error = global_error
        _client = client
    return _client


def get_client():
    """Return the shared client or None (callers degrade gracefully)."""
    return _client


def is_connected() -> bool:
    """Cheap live check used by health endpoints."""
    return _client is not None


def table(name: str):
    """Return a table handle or None when the DB is unavailable."""
    return _client.table(name) if _client is not None else None
