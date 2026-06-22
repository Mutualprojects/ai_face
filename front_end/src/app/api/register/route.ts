import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadBase64ToStorage(base64Str: string, path: string): Promise<string> {
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error("Invalid base64 string format");
  }
  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], "base64");

  const { error } = await supabase.storage
    .from("face")
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload to storage: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("face")
    .getPublicUrl(path);

  return urlData.publicUrl;
}

export async function POST(request: Request) {
  try {
    const { name, image } = await request.json();

    if (!name || !image) {
      return NextResponse.json({ error: "Missing name or image" }, { status: 400 });
    }

    // 1. Call the Python backend to extract the face embedding and cropped face base64
    const extractRes = await fetch(`${backendUrl}/api/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const cropPublicUrl = await uploadBase64ToStorage(cropB64, cropPath);

    // 3. Insert the face data into Supabase table
    const { data, error } = await supabase
      .from("known_faces")
      .insert({
        id: profileId,
        name,
        embedding,
        photo_url: cropPublicUrl,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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

