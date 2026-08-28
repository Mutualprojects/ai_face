import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canonicalizeRtspUrl, looksMasked, parseRtsp } from "@/lib/rtsp";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Fetch the stored row FIRST — needed to keep the existing password
    // when the edit form submits a password-free URL.
    const { data: currentRow, error: fetchErr } = await supabase
      .from("cameras")
      .select("id, name, rtsp_url")
      .eq("id", id)
      .single();

    if (fetchErr || !currentRow) {
      return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    }

    const updatePayload: any = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.location !== undefined) updatePayload.location = body.location;
    if (body.place !== undefined) updatePayload.place = body.place;
    if (body.zone !== undefined) updatePayload.zone = body.zone;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.via_relay !== undefined) updatePayload.via_relay = Boolean(body.via_relay);

    let canonicalUrl: string | null = null;
    if (body.rtsp_url !== undefined && String(body.rtsp_url || "").trim()) {
      if (looksMasked(String(body.rtsp_url))) {
        return NextResponse.json(
          { error: "RTSP URL contains a masked password (***). Enter the real camera password." },
          { status: 400 }
        );
      }

      // Credential merge:
      //   - new password typed in the form  → use it
      //   - password embedded in the URL    → use it
      //   - neither                         → KEEP the stored password so
      //     editing name/location never breaks authentication. A legacy
      //     corrupted '***' password is never reused — it must be re-entered.
      let mergedPassword: string | null = null;
      const incoming = parseRtsp(String(body.rtsp_url));
      if (incoming?.password) {
        mergedPassword = incoming.password;
      } else if (body.rtsp_password) {
        mergedPassword = String(body.rtsp_password);
      } else {
        const stored = parseRtsp(String(currentRow.rtsp_url || ""));
        if (stored?.password && !/^\*+$/.test(stored.password)) {
          mergedPassword = stored.password;
        }
      }

      try {
        canonicalUrl = canonicalizeRtspUrl(String(body.rtsp_url), mergedPassword).url;
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      updatePayload.rtsp_url = canonicalUrl;
    }

    const { data, error } = await supabase
      .from("cameras")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update camera error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep the streaming relay + recognition worker in sync with the edit.
    if (canonicalUrl) {
      const backend = await notifyBackend("/api/cameras/activate", "POST", {
        id,
        name: updatePayload.name || data?.name,
        rtsp_url: canonicalUrl,
        via_relay: Boolean(body.via_relay),
      });
      if (!backend.ok && backend.status !== 404) {
        console.warn("Backend camera activation (edit) warning:", backend.status, backend.data);
      }
    }

    const mappedData = {
      ...data,
      location: data.location || data.place,
    };

    return NextResponse.json({ success: true, data: mappedData });
  } catch (err: any) {
    console.error("Next.js patch camera error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Deleting a camera MUST tear down the mediamtx relay entry and the
    // recognition worker too — otherwise the backend re-creates the camera
    // row on its next restart (sync_cameras_to_db) and the "deleted" camera
    // keeps coming back. The Flask endpoint does all of that atomically.
    const backend = await notifyBackend(`/api/cameras/${id}`, "DELETE");
    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.data?.error || `Backend delete failed (${backend.status})` },
        { status: backend.status || 500 }
      );
    }

    // The backend already removed the row; delete again defensively in case
    // the row was created directly in Supabase.
    await supabase.from("cameras").delete().eq("id", id);

    return NextResponse.json({ success: true, message: "Camera deleted" });
  } catch (err: any) {
    console.error("Next.js delete camera error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
