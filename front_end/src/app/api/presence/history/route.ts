import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PresenceHistoryItem } from "@/types/presence";

/**
 * GET /api/presence/history?person_id=X&page=1&limit=20
 * Retrieves full visit/detection history for a specific individual, paginated, most recent first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("person_id");

    if (!personId) {
      return NextResponse.json({ error: "Missing required query parameter: person_id" }, { status: 400 });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    // Count total historical records for this person
    const { count, error: countErr } = await supabase
      .from("face_logs")
      .select("*", { count: "exact", head: true })
      .eq("person_id", personId);

    if (countErr) {
      console.error("Error counting presence history:", countErr);
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    // Fetch paginated history entries
    const { data: logs, error } = await supabase
      .from("face_logs")
      .select("id, person_id, person_name, camera_id, confidence, snapshot_url, created_at")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching presence history:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Resolve camera names
    const cameraIds = Array.from(new Set((logs || []).map((l) => l.camera_id).filter(Boolean))) as string[];
    const cameraRes = cameraIds.length > 0
      ? await supabase.from("cameras").select("id, name").in("id", cameraIds)
      : { data: [] };

    const cameraMap = new Map((cameraRes.data || []).map((c) => [c.id, c.name]));

    const historyItems: PresenceHistoryItem[] = (logs || []).map((l) => ({
      id: l.id,
      person_id: l.person_id,
      person_name: l.person_name,
      camera_id: l.camera_id || null,
      camera_name: l.camera_id ? cameraMap.get(l.camera_id) || l.camera_id : null,
      confidence: l.confidence,
      snapshot_url: l.snapshot_url || null,
      created_at: l.created_at,
    }));

    return NextResponse.json({
      success: true,
      person_id: personId,
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      data: historyItems,
    });
  } catch (err: any) {
    console.error("GET /api/presence/history error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch presence history" }, { status: 500 });
  }
}
