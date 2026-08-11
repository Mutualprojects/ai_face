import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
const backendKey = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || "";

/**
 * PATCH /api/registered_faces/[id]/status
 * Body: { "active": true | false }
 * Toggles recognition for an employee without touching their other fields.
 * Only active employees are loaded into the camera matching cache.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing face id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const active = body.active;
    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "active must be a boolean (true/false)" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("known_faces")
      .update({ is_active: active })
      .eq("id", id)
      .select("id, name, is_active")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Face not found" },
        { status: error ? 500 : 404 }
      );
    }

    // Refresh backend recognition cache so the change takes effect immediately
    try {
      await fetch(`${backendUrl}/api/refresh_cache`, {
        method: "POST",
        headers: { "x-api-key": backendKey },
      });
    } catch (refreshErr) {
      console.error("Failed to refresh recognition cache:", refreshErr);
    }

    return NextResponse.json({ success: true, face: data });
  } catch (err: any) {
    console.error("Face status toggle error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
