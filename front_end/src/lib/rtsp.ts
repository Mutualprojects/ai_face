/**
 * RTSP URL credential handling — single source of truth for the UI and the
 * Next.js API routes.
 *
 * Storage contract (mirrors Backend/app.py `canonicalize_rtsp_url`):
 *   - The database ALWAYS stores credentials percent-encoded exactly once.
 *   - Passwords are never sent back to the browser: the API returns a
 *     password-free "editable" URL plus flags, and the client sends new
 *     credentials as a separate `rtsp_password` field.
 *   - Masked display URLs (`admin:***@`) are rejected everywhere so a
 *     masked value can never be persisted as a real password again.
 */

export interface CanonicalRtspResult {
  url: string;
  hasCredentials: boolean;
}

export function looksMasked(url: string): boolean {
  return /:\*{2,}@/.test(url || "");
}

export function parseRtsp(url: string): {
  scheme: string;
  username: string | null;
  password: string | null;
  hostname: string;
  port: string | null;
  pathname: string;
  search: string;
} | null {
  try {
    const u = new URL((url || "").trim());
    if (!u.hostname) return null;
    return {
      scheme: u.protocol.replace(":", "").toLowerCase(),
      username: u.username ? decodeURIComponent(u.username) : null,
      password: u.password ? decodeURIComponent(u.password) : null,
      hostname: u.hostname,
      port: u.port || null,
      pathname: u.pathname,
      search: u.search,
    };
  } catch {
    return null;
  }
}

/** Validate + normalise into the canonical storage form. Throws on bad input. */
export function canonicalizeRtspUrl(
  rawUrl: string,
  passwordOverride?: string | null
): CanonicalRtspResult {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) throw new Error("Empty RTSP URL");
  if (looksMasked(trimmed)) {
    throw new Error(
      "URL contains a masked password (***). Enter the full RTSP URL with the real camera password."
    );
  }
  const parts = parseRtsp(trimmed);
  if (!parts || parts.scheme !== "rtsp") {
    throw new Error("URL must start with rtsp://[user:pass@]host[:port]/path");
  }

  let pwd = parts.password;
  if (passwordOverride != null && passwordOverride !== "") {
    pwd = passwordOverride;
  }
  const user = parts.username ?? "";
  const hasCredentials = Boolean(user || pwd);

  let auth = "";
  if (hasCredentials) {
    auth = `${encodeURIComponent(user)}:${encodeURIComponent(pwd ?? "")}@`;
  }
  const hostPort = parts.port ? `${parts.hostname}:${parts.port}` : parts.hostname;
  const url = `rtsp://${auth}${hostPort}${parts.pathname}${parts.search}`;
  // Sanity: the produced URL must re-parse cleanly.
  if (!parseRtsp(url)) throw new Error("RTSP URL could not be parsed");
  return { url, hasCredentials };
}

/** Password-free URL that is safe to pre-fill an edit form. */
export function stripPassword(url: string): string {
  const parts = parseRtsp(url);
  if (!parts || !parts.username) return url;
  const hadPassword = Boolean(parts.password);
  const hostPort = parts.port ? `${parts.hostname}:${parts.port}` : parts.hostname;
  return `rtsp://${encodeURIComponent(parts.username)}${hadPassword ? ":" : ""}@${hostPort}${parts.pathname}${parts.search}`;
}
