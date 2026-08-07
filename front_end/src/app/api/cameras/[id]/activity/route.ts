import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CameraActivity } from "@/types/presence";

/**
 * GET /api/cameras/[id]/activity
 * Returns detection count and last-seen timestamp for a specific camera, useful for health checks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: cameraId } = await params;

    if (!cameraId) {
      return NextResponse.json({ error: "Missing camera id parameter" }, { status: 400 });
    }

    // 1. Fetch camera details if stored in cameras table
    const { data: camera } = await supabase
      .from("cameras")
      .select("*")
      .eq("id", cameraId)
      .single();

    // 2. Compute start of today (UTC)
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    // 3. Query total detections today for this camera
    const [totalTodayRes, knownTodayRes, latestRes] = await Promise.all([
      supabase
        .from("face_logs")
        .select("id", { count: "exact", head: true })
        .eq("camera_id", cameraId)
        .gte("created_at", startOfToday),
      supabase
        .from("face_logs")
        .select("id", { count: "exact", head: true })
        .eq("camera_id", cameraId)
        .not("person_id", "is", null)
        .gte("created_at", startOfToday),
      supabase
        .from("face_logs")
        .select("created_at")
        .eq("camera_id", cameraId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

    const totalToday = totalTodayRes.count || 0;
    const knownToday = knownTodayRes.count || 0;
    const unknownToday = Math.max(0, totalToday - knownToday);
    const lastSeenAt = latestRes.data?.created_at || camera?.last_seen_at || null;

    const activity: CameraActivity = {
      camera_id: cameraId,
      camera_name: camera?.name || cameraId,
      location: camera?.location || null,
      zone: camera?.zone || null,
      status: camera?.status || "active",
      last_seen_at: lastSeenAt,
      total_detections_today: totalToday,
      total_known_detections: knownToday,
      total_unknown_detections: unknownToday,
    };

    return NextResponse.json({
      success: true,
      camera_id: cameraId,
      activity,
    });
  } catch (err: any) {
    console.error("GET /api/cameras/[id]/activity error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch camera activity" }, { status: 500 });
  }
}
