import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("face_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Supabase logs fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Next.js fetch face logs error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
