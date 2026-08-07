import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updatePayload: any = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.rtsp_url !== undefined) updatePayload.rtsp_url = body.rtsp_url;
    if (body.location !== undefined) updatePayload.place = body.location;
    if (body.place !== undefined) updatePayload.place = body.place;

    const { data, error } = await supabase
      .from("cameras")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update camera error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = {
      ...data,
      location: data.place,
      status: "active"
    };

    return NextResponse.json({ success: true, data: mappedData });
  } catch (err: any) {
    console.error("Next.js patch camera error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from("cameras")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Supabase delete camera error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Camera deleted" });
  } catch (err: any) {
    console.error("Next.js delete camera error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
