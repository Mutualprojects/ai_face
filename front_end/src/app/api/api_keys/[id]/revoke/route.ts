import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from("api_keys")
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, prefix, revoked")
      .single();

    if (error) {
      console.error("Supabase revoke api_key error:", error);
      if (error.message && /PGRST116|not found|no rows/i.test(error.message)) {
        return NextResponse.json({ error: "Key not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, key: data });
  } catch (err) {
    console.error("Next.js revoke api_key error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
