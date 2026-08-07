import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/logs/unknown?date=today
 * Retrieves unmatched/unknown face detections for a given day.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date") || "today";

    let startDate: Date;
    let endDate: Date;

    if (dateParam.toLowerCase() === "today") {
      const now = new Date();
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    } else {
      const parsed = new Date(dateParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid date format. Use 'today' or 'YYYY-MM-DD'" }, { status: 400 });
      }
      startDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0));
      endDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999));
    }

    // Query face_logs for unknown/unmatched detections
    const { data: logs, error } = await supabase
      .from("face_logs")
      .select("id, person_id, person_name, camera_id, confidence, snapshot_url, created_at")
      .or("person_id.is.null,person_name.eq.Unknown,person_name.eq.unknown")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching unknown face_logs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve camera names if any
    const cameraIds = Array.from(new Set((logs || []).map((l) => l.camera_id).filter(Boolean))) as string[];
    const cameraRes = cameraIds.length > 0
      ? await supabase.from("cameras").select("id, name").in("id", cameraIds)
      : { data: [] };

    const cameraMap = new Map((cameraRes.data || []).map((c) => [c.id, c.name]));

    const formattedLogs = (logs || []).map((l) => ({
      ...l,
      camera_name: l.camera_id ? cameraMap.get(l.camera_id) || l.camera_id : null,
    }));

    return NextResponse.json({
      success: true,
      date: dateParam,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      count: formattedLogs.length,
      logs: formattedLogs,
    });
  } catch (err: any) {
    console.error("GET /api/logs/unknown error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch unknown face logs" }, { status: 500 });
  }
}

/**
 * DELETE /api/logs/unknown
 * Deletes all unknown / unidentified face detection records from face_logs table at once.
 */
export async function DELETE() {
  try {
    const { data, error } = await supabase
      .from("face_logs")
      .delete()
      .or("person_name.eq.Unknown,person_name.eq.unknown,person_id.is.null")
      .select();

    if (error) {
      console.error("Error deleting unknown logs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${data?.length || 0} unknown face detection records from database.`,
      deleted_count: data?.length || 0,
    });
  } catch (err: any) {
    console.error("DELETE /api/logs/unknown error:", err);
    return NextResponse.json({ error: err.message || "Failed to clear unknown logs" }, { status: 500 });
  }
}
