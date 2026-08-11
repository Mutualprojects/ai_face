import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * PATCH /api/visitors/[id]/status
 * Body: { "active": true | false }
 * Marks a visitor active or inactive. Only active visitors are recognised
 * by the cameras, so the backend recognition cache is refreshed afterwards.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing visitor_id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const active = body.active;
    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "active must be a boolean (true/false)" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("visitors")
      .update({ is_active: active })
      .eq("visitor_id", id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Visitor not found" },
        { status: error ? 500 : 404 }
      );
    }

    // Refresh the backend face cache so recognition takes effect immediately
    try {
      await fetch(`${backendUrl}/api/refresh_cache`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY || ""}` },
      });
    } catch (refreshErr) {
      console.error("Failed to refresh recognition cache:", refreshErr);
    }

    return NextResponse.json({ success: true, visitor: data });
  } catch (err: any) {
    console.error("Visitor status toggle error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
