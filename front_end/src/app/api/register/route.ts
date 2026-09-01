import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const supabase = createClient(supabaseUrl, supabaseKey);

import { uploadOrDataUrl } from "../../../lib/storage-upload";
async function uploadBase64ToStorage(base64Str: string, path: string): Promise<{
  url: string; usedStorage: boolean;
}> {
  return uploadOrDataUrl(supabase, base64Str, path);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const {
      name,
      image,
      employee_code,
      department,
      designation,
      email,
      mobile,
      is_active,
    } = payload;

    if (!name || !image) {
      return NextResponse.json({ error: "Missing name or image" }, { status: 400 });
    }

    // 1. Call the Python backend to extract the face embedding and cropped face base64
    const extractRes = await fetch(`${backendUrl}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "" },
      body: JSON.stringify({ image }),
    });

    if (!extractRes.ok) {
      const errData = await extractRes.json();
      return NextResponse.json({ error: errData.error || "Failed to process face image" }, { status: extractRes.status });
    }

    const { embedding, photo_url: cropB64 } = await extractRes.json();
    const profileId = crypto.randomUUID();

    // 2. Upload original image and cropped face chip to Supabase Storage ('face' bucket)
    const originalPath = `enrolled/${profileId}_original.jpg`;
    const cropPath = `enrolled/${profileId}_crop.jpg`;

    await uploadBase64ToStorage(image, originalPath);
    const cropUp = await uploadBase64ToStorage(cropB64, cropPath);
    const cropPublicUrl = cropUp.url;

    // 3. Insert the face data into Supabase table
    const { data, error } = await supabase
      .from("known_faces")
      .insert({
        id: profileId,
        name,
        embedding,
        photo_url: cropPublicUrl,
        employee_code: employee_code || null,
        department: department || null,
        designation: designation || null,
        email: email || null,
        mobile: mobile || null,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. Trigger Python backend cache refresh
    try {
      await fetch(`${backendUrl}/api/refresh_cache`, {
        method: "POST",
        headers: { "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "" }
      });
    } catch (refreshErr) {
      console.error("Failed to trigger python backend cache refresh:", refreshErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully registered ${name}`,
      data: {
        id: data.id,
        name: data.name,
        photo_url: data.photo_url,
      },
    });
  } catch (err: any) {
    console.error("Next.js register route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

