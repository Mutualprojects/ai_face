import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam === "all" ? 5000 : limitParam ? parseInt(limitParam, 10) : 5000;

    // 1. Fetch detection logs with camera info from database (up to limit)
    // Select only needed columns to avoid fetching unnecessary large fields
    const { data: logsData, error: logsError } = await supabase
      .from("face_logs")
      .select("id, person_name, person_id, confidence, snapshot_url, timestamp, created_at, camera_id, top_matches, cameras(name, place)")
      .order("timestamp", { ascending: false })
      .limit(isNaN(limit) ? 5000 : limit);

    if (logsError) {
      console.error("Supabase logs fetch error:", logsError);
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    const logs = logsData || [];
    if (logs.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Fetch known_faces and visitors to enrich logs by person_name
    const [facesRes, visitorsRes] = await Promise.all([
      supabase
        .from("known_faces")
        .select("id, name, employee_code, department, designation, photo_url"),
      supabase
        .from("visitors")
        .select("visitor_id, full_name, company_name, photo_image"),
    ]);

    const faceNameMap = new Map<string, any>(
      (facesRes.data || []).map((f: any) => [f.name?.trim().toLowerCase(), f])
    );
    const visitorNameMap = new Map<string, any>(
      (visitorsRes.data || []).map((v: any) => [v.full_name?.trim().toLowerCase(), v])
    );

    // 3. Enrich each detection log with camera & face metadata
    const enrichedLogs = logs.map((log: any) => {
      const rawName = (log.person_name || "Unknown").trim();
      const cleanName = rawName.replace(/^visitor:\s*/i, "").toLowerCase();

      const faceObj = faceNameMap.get(cleanName) || faceNameMap.get(rawName.toLowerCase());
      const visitorObj = visitorNameMap.get(cleanName) || visitorNameMap.get(rawName.toLowerCase());

      const isUnknown = rawName.toLowerCase() === "unknown";

      const matchedPhoto =
        faceObj?.photo_url ||
        visitorObj?.photo_image ||
        null;

      return {
        ...log,
        timestamp: log.timestamp || log.created_at || new Date().toISOString(),
        camera_name: log.cameras?.name || log.camera_id || "Primary Surveillance Cam",
        camera_location: log.cameras?.place || "Security Zone A",
        camera_zone: "Default Zone",
        person_name: log.person_name || "Unknown",
        registered_photo: matchedPhoto,
        employee_code: faceObj?.employee_code || null,
        department: faceObj?.department || visitorObj?.company_name || null,
        designation: faceObj?.designation || (visitorObj ? "Visitor" : null),
        is_unknown: isUnknown,
      };
    });

    return NextResponse.json(enrichedLogs);
  } catch (err: any) {
    console.error("Next.js fetch face logs error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/face_logs?id=XYZ or DELETE /api/face_logs?type=unknown|all
 * Deletes individual face log by ID, or clear unknown / all logs from Supabase.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const deleteType = searchParams.get("type");

    if (id) {
      const { data, error } = await supabase
        .from("face_logs")
        .delete()
        .eq("id", id)
        .select();

      if (error) {
        console.error("Error deleting face log by id:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Deleted face log record ${id}.`,
        deleted_count: data?.length || 0,
      });
    }

    if (deleteType === "unknown") {
      // Delete only true unknown logs.
      const { data, error } = await supabase
        .from("face_logs")
        .delete()
        .or("person_name.eq.Unknown,person_name.eq.unknown")
        .select();

      if (error) {
        console.error("Error deleting unknown face logs:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Cleared ${data?.length || 0} unknown face detection logs from database.`,
        deleted_count: data?.length || 0,
      });
    } else if (deleteType === "all") {
      const { data, error } = await supabase
        .from("face_logs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000")
        .select();

      if (error) {
        console.error("Error deleting all face logs:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Cleared all ${data?.length || 0} face detection logs from database.`,
        deleted_count: data?.length || 0,
      });
    }

    return NextResponse.json({ error: "Invalid delete parameter. Pass 'id' or 'type=unknown|all'." }, { status: 400 });
  } catch (err: any) {
    console.error("DELETE /api/face_logs error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete face logs" }, { status: 500 });
  }
}
