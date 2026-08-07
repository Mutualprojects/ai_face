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
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("face")
    .getPublicUrl(path);

  return urlData.publicUrl;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Accept either array under 'employees' key or direct array or single object
    const rawList = Array.isArray(body.employees)
      ? body.employees
      : Array.isArray(body)
      ? body
      : [body];

    if (!rawList || rawList.length === 0) {
      return NextResponse.json(
        { error: "No employee data provided for bulk registration." },
        { status: 400 }
      );
    }

    const results = {
      total: rawList.length,
      succeeded: 0,
      failed: 0,
      errors: [] as { employee_code?: string; name?: string; error: string }[],
      registered: [] as any[],
    };

    for (const item of rawList) {
      const {
        name,
        employee_code,
        department,
        designation,
        email,
        mobile,
        photo_base64,
        photo_url,
      } = item;

      if (!name || !name.trim()) {
        results.failed++;
        results.errors.push({ employee_code, name, error: "Missing name field." });
        continue;
      }

      const imgInput = photo_base64 || photo_url;
      if (!imgInput) {
        results.failed++;
        results.errors.push({ employee_code, name, error: "Missing photo (base64 or URL)." });
        continue;
      }

      let embedding: number[] | null = null;
      let finalPhotoUrl = photo_url || "";

      // 1. Face feature extraction via Python backend
      try {
        const extractRes = await fetch(`${backendUrl}/api/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "",
          },
          body: JSON.stringify({ image: imgInput }),
        });

        if (extractRes.ok) {
          const extData = await extractRes.json();
          embedding = extData.embedding || null;
        } else {
          console.warn(`Face extraction warning for ${name}: No face detected.`);
        }
      } catch (err) {
        console.error(`Backend call error for ${name}:`, err);
      }

      // 2. Storage upload if base64 provided
      if (photo_base64 && photo_base64.startsWith("data:")) {
        try {
          const fileId = employee_code
            ? `${employee_code}_${Date.now()}`
            : `emp_${crypto.randomUUID()}`;
          const storagePath = `employees/${fileId}.jpg`;
          finalPhotoUrl = await uploadBase64ToStorage(photo_base64, storagePath);
        } catch (uploadErr: any) {
          console.error(`Storage upload error for ${name}:`, uploadErr);
        }
      }

      // 3. Insert or update record in Supabase known_faces
      const codeToUse = employee_code || `EMP-${Math.floor(100000 + Math.random() * 900000)}`;

      // Check existing by employee_code
      const { data: existing } = await supabase
        .from("known_faces")
        .select("id")
        .eq("employee_code", codeToUse)
        .maybeSingle();

      const payload: any = {
        name: name.trim(),
        employee_code: codeToUse,
        department: department?.trim() || "Staff",
        designation: designation?.trim() || null,
        email: email?.trim() || null,
        mobile: mobile?.trim() || null,
        is_active: true,
        photo_url: finalPhotoUrl || null,
      };

      if (embedding) {
        payload.embedding = embedding;
      }

      let dbError: any = null;
      let record: any = null;

      if (existing) {
        const { data: updated, error: errU } = await supabase
          .from("known_faces")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        dbError = errU;
        record = updated;
      } else {
        const { data: inserted, error: errI } = await supabase
          .from("known_faces")
          .insert(payload)
          .select()
          .single();
        dbError = errI;
        record = inserted;
      }

      if (dbError) {
        results.failed++;
        results.errors.push({ employee_code: codeToUse, name, error: dbError.message });
      } else {
        results.succeeded++;
        results.registered.push(record);
      }
    }

    // 4. Trigger RAM cache refresh on backend
    try {
      await fetch(`${backendUrl}/api/refresh_cache`, {
        method: "POST",
        headers: {
          "x-api-key": process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "",
        },
      });
    } catch (refreshErr) {
      console.error("Error refreshing Python cache after bulk upload:", refreshErr);
    }

    return NextResponse.json({
      success: results.failed === 0,
      message: `Bulk registration completed. ${results.succeeded} succeeded, ${results.failed} failed.`,
      results,
    });
  } catch (err: any) {
    console.error("Bulk registration API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
