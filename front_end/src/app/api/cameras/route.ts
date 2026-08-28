import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalizeRtspUrl, looksMasked, parseRtsp } from "@/lib/rtsp";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const backendUrl =
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";
const backendKey = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function notifyBackend(path: string, method: string, body?: any) {
  const res = await fetch(`${backendUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": backendKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

export async function GET() {
  // Proxy the Flask backend: it masks RTSP credentials and attaches live
  // stream_state (CONNECTING/ONLINE/OFFLINE/AUTH_FAILED/RTSP_ERROR).
  try {
    const r = await fetch(`${backendUrl}/api/cameras`, { cache: "no-store" });
    if (r.ok) {
      const cameras = await r.json();
      return NextResponse.json(cameras);
    }
    console.error("Backend cameras fetch failed:", r.status);
  } catch (err: any) {
    console.error("Backend cameras fetch error:", err?.message);
  }

  // Fallback: Supabase direct (backend unreachable) — credentials masked.
  try {
    const { data: camerasData, error } = await supabase
      .from("cameras")
      .select("id, name, rtsp_url, place, location, zone, via_relay, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch cameras error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = (camerasData || []).map((cam: any) => {
      const stored = cam.rtsp_url ? String(cam.rtsp_url) : null;
      const parts = stored ? parseRtsp(stored) : null;
      return {
        ...cam,
        rtsp_url: stored ? stored.replace(/(\/\/[^:/@]+:)[^@]+(@)/, "$1***$2") : null,
        rtsp_url_editable: stored && !stored.startsWith("device:") ? undefined : stored,
        has_credentials: Boolean(parts?.password),
        credentials_corrupted: false,
        location: cam.location || cam.place,
        status: "active",
        stream_state: "CONNECTING",
      };
    });

    return NextResponse.json(mappedData);
  } catch (err: any) {
    console.error("Next.js fetch cameras error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { id, name, rtsp_url, rtsp_password, location, zone, status, via_relay } = payload;

    if (!id || !name) {
      return NextResponse.json(
        { error: "Camera ID and Name are required." },
        { status: 400 }
      );
    }

    let canonicalUrl: string | null = null;
    if (rtsp_url && String(rtsp_url).trim()) {
      if (looksMasked(String(rtsp_url))) {
        return NextResponse.json(
          { error: "RTSP URL contains a masked password (***). Enter the real camera password." },
          { status: 400 }
        );
      }
      try {
        canonicalUrl = canonicalizeRtspUrl(String(rtsp_url), rtsp_password || null).url;
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }

      // Duplicate stream guard: same host+path already registered.
      const incoming = parseRtsp(canonicalUrl!);
      const { data: existing } = await supabase
        .from("cameras")
        .select("id, name, rtsp_url");
      const dup = (existing || []).find((row: any) => {
        const p = parseRtsp(String(row.rtsp_url || ""));
        return (
          p &&
          incoming &&
          p.hostname === incoming.hostname &&
          p.port === incoming.port &&
          p.pathname === incoming.pathname
        );
      });
      if (dup) {
        return NextResponse.json(
          {
            error: `This camera/stream is already registered as "${dup.name}" (ID: ${dup.id}). Edit that camera instead of adding it twice.`,
          },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("cameras")
      .insert({
        id: id.trim(),
        name: name.trim(),
        rtsp_url: canonicalUrl,
        place: location?.trim() || null,
        location: location?.trim() || null,
        zone: zone?.trim() || null,
        status: status === "inactive" ? "inactive" : "active",
        ...(via_relay !== undefined ? { via_relay: Boolean(via_relay) } : {}),
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase create camera error:", error);
      const msg =
        error.code === "23505" || /duplicate/i.test(error.message || "")
          ? "Camera ID already exists."
          : error.message;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Wire up the relay + recognition worker so the camera streams NOW
    // instead of waiting for a backend restart to discover the row.
    if (canonicalUrl) {
      const backend = await notifyBackend("/api/cameras/activate", "POST", {
        id: id.trim(),
        name: name.trim(),
        rtsp_url: canonicalUrl,
        via_relay: Boolean(via_relay),
      });
      if (!backend.ok) {
        console.warn("Backend camera activation warning:", backend.status, backend.data);
      }
    }

    const mappedData = {
      ...data,
      location: data.location || data.place,
      status: data.status || "active",
    };

    return NextResponse.json({ success: true, data: mappedData });
  } catch (err: any) {
    console.error("Next.js create camera error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
