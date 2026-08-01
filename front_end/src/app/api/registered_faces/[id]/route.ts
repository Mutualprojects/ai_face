import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const supabase = createClient(
  process.env.SUPABASE_URL || "http://localhost:8005",
  process.env.SUPABASE_KEY || ""
);

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabase.from("known_faces").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Trigger Python backend cache refresh
    try {
      await fetch(`${backendUrl}/api/refresh_cache`, {
        method: "POST",
        headers: { "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "" }
      });
    } catch (refreshErr) {
      console.error("Failed to trigger python backend cache refresh:", refreshErr);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("known_faces")
      .select("id, name, photo_url, created_at, employee_code, department, designation, email, mobile, is_active")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await req.json();
    const {
      name,
      employee_code,
      department,
      designation,
      email,
      mobile,
      is_active,
      image,
    } = payload;

    const updateData: any = {
      name,
      employee_code: employee_code || null,
      department: department || null,
      designation: designation || null,
      email: email || null,
      mobile: mobile || null,
      is_active: is_active ?? true,
    };

    if (image && image.startsWith("data:image/")) {
      // 1. Call the Python backend to extract the face embedding and cropped face base64
      const extractRes = await fetch(`${backendUrl}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "" },
        body: JSON.stringify({ image }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: errData.error || "Failed to process new face image" },
          { status: extractRes.status }
        );
      }

      const { embedding, photo_url: cropB64 } = await extractRes.json();

      // 2. Upload original image and cropped face chip to Supabase Storage
      const originalPath = `enrolled/${id}_original.jpg`;
      const cropPath = `enrolled/${id}_crop.jpg`;

      await uploadBase64ToStorage(image, originalPath);
      const cropPublicUrl = await uploadBase64ToStorage(cropB64, cropPath);

      updateData.embedding = embedding;
      updateData.photo_url = cropPublicUrl;
    }

    // 3. Update the face data in Supabase table
    const { data, error } = await supabase
      .from("known_faces")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
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
      message: `Successfully updated ${name}`,
      data,
    });
  } catch (err: any) {
    console.error("Next.js patch route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
