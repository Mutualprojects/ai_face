"""Input validation and credential handling for RTSP URLs.

VENDOR-AGNOSTIC: the RTSP URL is treated as a fully OPAQUE source string.
Any valid rtsp:// URL — any vendor, model, port, path, query string, auth
style or stream naming — is accepted. Only transport-safety transforms are
applied (never structural ones):

  - percent-decoding so ffmpeg receives real credentials
  - '$' → '%24' so MediaMTX/shell substitution cannot eat password chars
  - POSIX single-quote escaping for the ffmpeg command line
"""

import re
from urllib.parse import unquote, urlsplit, urlunsplit, quote

from .logging_setup import get_logger

log = get_logger("sentinel.validation")


def validate_rtsp_url(raw_url: str) -> str:
    """Structural validation only — zero assumptions about path/format.
    Rejects masked credentials (admin:***) so a display-safe URL can never
    be persisted back into the database as a real password."""
    url = (raw_url or "").strip()
    if not url:
        raise ValueError("Empty RTSP URL")
    if re.search(r":\*{2,}@", url):
        raise ValueError(
            "URL contains a masked password (***). "
            "Enter the full RTSP URL with the real camera password."
        )
    parts = urlsplit(url)
    if parts.scheme.lower() != "rtsp":
        raise ValueError(f"Unsupported scheme '{parts.scheme or 'none'}' — URL must start with rtsp://")
    if not parts.hostname:
        raise ValueError("RTSP URL has no host — expected rtsp://[user:pass@]host[:port]/path[?query]")
    return url


def mask_url(url: str) -> str:
    """Hide credentials in anything shown to clients or logs."""
    return re.sub(r"(//[^:/@]+:)[^@]+(@)", r"\1***\2", url)


def strip_password_url(url: str) -> str:
    """URL safe to pre-fill an edit form: username kept, password removed."""
    try:
        parts = urlsplit(url or "")
        if not parts.username:
            return url
        netloc = quote(str(parts.username), safe="")
        if parts.password:
            netloc += ":"
        host = parts.hostname or ""
        if parts.port:
            host = f"{host}:{parts.port}"
        return urlunsplit((parts.scheme, f"{netloc}@{host}", parts.path, parts.query, ""))
    except Exception:
        return url


def rtsp_credentials(raw_url: str) -> tuple:
    """Raw (percent-DECODED) (username, password) from an RTSP URL."""
    parts = urlsplit(raw_url or "")
    if not parts.username:
        return None, None
    user = unquote(str(parts.username))
    pwd = unquote(str(parts.password)) if parts.password else ""
    return user, pwd


def canonicalize_rtsp_url(raw_url: str, password_override: str = None) -> str:
    """Single canonical storage form for ANY rtsp URL: credentials are
    percent-encoded EXACTLY ONCE ($ → %24, @ → %40, % → %25 …), so every
    consumer can safely unquote() before use and passwords containing
    special characters survive round-trips through UI → DB → player."""
    url = validate_rtsp_url(raw_url)
    parts = urlsplit(url)
    user, pwd = rtsp_credentials(url)
    if password_override is not None:
        pwd = password_override
        user = user if user is not None else ""
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    netloc = host
    if user is not None:
        userinfo = quote(user, safe="")
        if pwd:
            userinfo += ":" + quote(pwd, safe="")
        netloc = f"{userinfo}@{netloc}"
    return urlunsplit((parts.scheme.lower(), netloc, parts.path, parts.query, ""))


def credentials_corrupted(rtsp_url: str) -> bool:
    """True when a stored row holds the literal '***' mask as its password
    (legacy bug) — the UI must force re-entering the real password."""
    _, pwd = rtsp_credentials(rtsp_url or "")
    return bool(pwd) and set(pwd) == {"*"}


def shell_single_quote(s: str) -> str:
    """POSIX-safe single quoting (survives passwords containing quotes)."""
    return "'" + s.replace("'", "'\\''") + "'"


def decode_rtsp(stream_url: str) -> str:
    """Percent-decode a stored canonical URL for direct ffmpeg/OpenCV use."""
    return unquote(stream_url or "")


def transport_safe_url(decoded_url: str) -> str:
    """Escape ONLY '$' — the URL structure stays untouched."""
    return decoded_url.replace("$", "%24")
