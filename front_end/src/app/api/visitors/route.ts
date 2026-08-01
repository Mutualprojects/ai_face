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
    const payload = await request.json();
    const {
      full_name,
      phone,
      company_name,
      id_proof_number,
      purpose_of_visit,
      meet_employee_id,
      photo_image,
      signature_image,
    } = payload;

    if (!full_name || !phone || !meet_employee_id || !purpose_of_visit || !photo_image || !signature_image) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const visitorId = crypto.randomUUID();
    let embedding: number[] | null = null;
    let finalPhotoB64 = photo_image;

    // 1. Call the Python backend to extract the face embedding and cropped face base64
    try {
      const extractRes = await fetch(`${backendUrl}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "" },
        body: JSON.stringify({ image: photo_image }),
      });

      if (!extractRes.ok) {
        const regData = await extractRes.json().catch(() => ({}));
        return NextResponse.json({
          error: regData.error || "No face detected in the visitor photo. Please take a clearer photo.",
        }, { status: 400 });
      }

      const extData = await extractRes.json();
      embedding = extData.embedding || null;
      if (extData.photo_url) {
        finalPhotoB64 = extData.photo_url;
      }
    } catch (regErr: any) {
      console.error("Error calling Python face extraction:", regErr);
      // Proceed anyway if backend is temporarily unreachable, to keep system resilient
    }

    // 2. Upload original photo and cropped face chip to Supabase Storage
    const originalPath = `visitors/${visitorId}_original.jpg`;
    const photoPath = `visitors/${visitorId}_photo.jpg`;
    
    await uploadBase64ToStorage(photo_image, originalPath);
    const photoPublicUrl = await uploadBase64ToStorage(finalPhotoB64, photoPath);

    // 3. Upload signature to Supabase Storage
    const signaturePath = `visitors/${visitorId}_sig.png`;
    const signaturePublicUrl = await uploadBase64ToStorage(signature_image, signaturePath);

    // 4. Insert record into visitors table
    const { data, error } = await supabase
      .from("visitors")
      .insert({
        visitor_id: visitorId,
        full_name,
        phone,
        company_name,
        id_proof_number,
        purpose_of_visit,
        meet_employee_id,
        photo_image: photoPublicUrl,
        signature_image: signaturePublicUrl,
        embedding,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase visitors insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. Trigger Python backend cache refresh so the visitor is immediately recognized
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
      message: `Successfully registered visitor ${full_name}`,
      data,
    });
  } catch (err: any) {
    console.error("Next.js visitors route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("visitors")
      .select("*")
      .order("check_in_time", { ascending: false });

    if (error) {
      console.error("Supabase fetch visitors error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Next.js fetch visitors error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { visitor_id } = await request.json();
    if (!visitor_id) {
      return NextResponse.json({ error: "Missing visitor_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("visitors")
      .update({ check_out_time: new Date().toISOString() })
      .eq("visitor_id", visitor_id)
      .select()
      .single();

    if (error) {
      console.error("Supabase visitors update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Next.js visitors PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

