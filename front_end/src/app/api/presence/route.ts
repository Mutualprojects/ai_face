import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PresenceRecord } from "@/types/presence";

/**
 * GET /api/presence?minutes=10
 * Derives currently present individuals by querying the most recent detection per person_id
 * from immutable face_logs within a trailing time window of N minutes.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const minutesParam = searchParams.get("minutes");
    const minutes = Math.max(1, parseInt(minutesParam || "10", 10));

    const cutoffDate = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    // Query face_logs for recent detections of enrolled individuals
    const { data: logs, error } = await supabase
      .from("face_logs")
      .select("id, person_id, person_name, camera_id, confidence, snapshot_url, timestamp")
      .not("person_id", "is", null)
      .gte("timestamp", cutoffDate)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Supabase error fetching presence face_logs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!logs || logs.length === 0) {
      return NextResponse.json({
        success: true,
        minutes,
        count: 0,
        present: [],
      });
    }

    // Aggregate latest log per person_id
    const latestPerPersonMap = new Map<string, typeof logs[0]>();
    for (const log of logs) {
      if (log.person_id && !latestPerPersonMap.has(log.person_id)) {
        latestPerPersonMap.set(log.person_id, log);
      }
    }

    const personIds = Array.from(latestPerPersonMap.keys());
    const cameraIds = Array.from(new Set(Array.from(latestPerPersonMap.values()).map((l) => l.camera_id).filter(Boolean))) as string[];

    // Fetch details for known_faces and cameras in parallel
    const [facesRes, camerasRes] = await Promise.all([
      personIds.length > 0
        ? supabase.from("known_faces").select("id, name, employee_code, department, designation, photo_url").in("id", personIds)
        : Promise.resolve({ data: [] }),
      cameraIds.length > 0
        ? supabase.from("cameras").select("id, name").in("id", cameraIds)
        : Promise.resolve({ data: [] }),
    ]);

    const faceMap = new Map((facesRes.data || []).map((f) => [f.id, f]));
    const cameraMap = new Map((camerasRes.data || []).map((c) => [c.id, c.name]));

    const presenceList: PresenceRecord[] = [];
    for (const [pid, log] of latestPerPersonMap.entries()) {
      const face = faceMap.get(pid);
      presenceList.push({
        person_id: pid,
        person_name: face?.name || log.person_name || "Enrolled Person",
        employee_code: face?.employee_code || null,
        department: face?.department || null,
        designation: face?.designation || null,
        photo_url: face?.photo_url || null,
        last_seen_at: log.timestamp,
        camera_id: log.camera_id || null,
        camera_name: log.camera_id ? cameraMap.get(log.camera_id) || log.camera_id : null,
        confidence: log.confidence,
        snapshot_url: log.snapshot_url || null,
      });
    }

    // Sort by most recently seen first
    presenceList.sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());

    return NextResponse.json({
      success: true,
      minutes,
      count: presenceList.length,
      present: presenceList,
    });
  } catch (err: any) {
    console.error("GET /api/presence error:", err);
    return NextResponse.json({ error: err.message || "Failed to derive presence" }, { status: 500 });
  }
}
