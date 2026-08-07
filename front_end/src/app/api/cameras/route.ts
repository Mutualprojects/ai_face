import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data: camerasData, error } = await supabase
      .from("cameras")
      .select("id, name, rtsp_url, place, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch cameras error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = (camerasData || []).map((cam: any) => ({
      ...cam,
      location: cam.place,
      status: "active"
    }));

    return NextResponse.json(mappedData);
  } catch (err: any) {
    console.error("Next.js fetch cameras error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { id, name, rtsp_url, location, zone, status } = payload;

    if (!id || !name) {
      return NextResponse.json(
        { error: "Camera ID and Name are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("cameras")
      .insert({
        id: id.trim(),
        name: name.trim(),
        rtsp_url: rtsp_url?.trim() || null,
        place: location?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase create camera error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = {
      ...data,
      location: data.place,
      status: "active"
    };

    return NextResponse.json({ success: true, data: mappedData });
  } catch (err: any) {
    console.error("Next.js create camera error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
