import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const supabase = createClient(supabaseUrl, supabaseKey);

/** Upload a base64 image to Supabase Storage 'face' bucket. */
async function uploadBase64ToStorage(base64Str: string, path: string): Promise<string> {
  const matches = base64Str.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Invalid base64 string format");
  }
  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], "base64");

  const { error } = await supabase.storage.from("face").upload(path, buffer, {
    contentType,
    upsert: true,
  });

  if (error) throw new Error(`Failed to upload to storage: ${error.message}`);

  const { data: urlData } = supabase.storage.from("face").getPublicUrl(path);
  return urlData.publicUrl;
}

/** Log a single detection event to face_logs table. */
async function logDetection(detection: {
  name: string;
  confidence: number;
  crop_b64?: string | null;
  matched: boolean;
}) {
  const logId = crypto.randomUUID();
  let snapshotUrl = "";

  if (detection.crop_b64) {
    try {
      const logPath = `logs/${logId}_snapshot.jpg`;
      snapshotUrl = await uploadBase64ToStorage(detection.crop_b64, logPath);
    } catch {
      snapshotUrl = detection.crop_b64;
    }
  }

  // Try inserting with created_at (auto-set by DB), fall back to timestamp
  const { error } = await supabase.from("face_logs").insert({
    id: logId,
    person_name: detection.matched ? detection.name : "Unknown",
    confidence: detection.confidence,
    snapshot_url: snapshotUrl || null,
  });

  if (error) {
    console.error("Failed to insert face log:", error.message);
  }
}

export async function POST(request: Request) {
  try {
    const { image } = await request.json();
    if (!image) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    // 1. Call Python backend /api/match — returns detections array (all faces in frame)
    const matchRes = await fetch(`${backendUrl}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });

    if (!matchRes.ok) {
      const errData = await matchRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || "Backend processing failed" },
        { status: matchRes.status }
      );
    }

    const backendData = await matchRes.json();
    const detections: any[] = backendData.detections || [];

    // 2. Log each detection asynchronously (don't block the response)
    if (detections.length > 0) {
      Promise.all(detections.map((det) => logDetection(det))).catch((e) =>
        console.error("Logging error:", e)
      );
    }

    // 3. Return full detections array + backward-compat flat fields
    return NextResponse.json({
      detections,
      matched: backendData.matched,
      name: backendData.name,
      confidence: backendData.confidence,
      photo_url: backendData.photo_url,
      bbox: backendData.bbox,
      landmarks: backendData.landmarks,
      message: backendData.message,
    });
  } catch (err: any) {
    console.error("Next.js match route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
