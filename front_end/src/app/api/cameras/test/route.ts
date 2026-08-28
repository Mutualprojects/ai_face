import { NextResponse } from "next/server";

const backendUrl =
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:5000";
const backendKey = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "";

/**
 * Probe an RTSP URL without saving anything (backend ffprobe, ~10s max).
 * Body: { rtsp_url, rtsp_password? } → { state, detail, masked_url }
 * States: ONLINE | OFFLINE | AUTH_FAILED | RTSP_ERROR | INVALID
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.rtsp_url || !String(body.rtsp_url).trim()) {
      return NextResponse.json({ error: "Missing rtsp_url" }, { status: 400 });
    }

    const res = await fetch(`${backendUrl}/api/cameras/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": backendKey,
      },
      body: JSON.stringify({
        rtsp_url: String(body.rtsp_url),
        rtsp_password: body.rtsp_password || null,
        via_relay: Boolean(body.via_relay),
      }),
      // ffprobe itself times out at 10s — allow headroom.
      signal: AbortSignal.timeout(20000),
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("Camera test proxy error:", err?.message);
    return NextResponse.json(
      { state: "OFFLINE", detail: "Backend probe unreachable — is the Flask service running?" },
      { status: 502 }
    );
  }
}
