"use client";

import { useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Loader2,
  ShieldCheck,
  Filter,
  Camera,
  Clock,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Recognition Control — toggle Active/Inactive for ALL faces         */
/*  (employees + visitors). Only ACTIVE faces are matched on camera.   */
/* ------------------------------------------------------------------ */

interface FaceItem {
  key: string;
  id: string;
  name: string;
  photo: string | null;
  isActive: boolean;
  kind: "employee" | "visitor";
  sub: string;
  badge: string;
  lastCamera: string | null;      // camera name where face was last seen
  lastCameraId: string | null;    // camera id
  lastSeenAt: string | null;      // ISO timestamp of last detection
  seenCameras: string[];          // all cameras that detected this face
}

interface CameraOption {
  id: string;
  name: string;
  location: string | null;
}

const STATUS = {
  active: { color: "#059669", bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)" },
  inactive: { color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.28)" },
};

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return "Never";
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function FacesPage() {
  const [faces, setFaces] = useState<FaceItem[]>([]);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "employee" | "visitor">("all");
  const [cameraFilter, setCameraFilter] = useState<string>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showCameraFilter, setShowCameraFilter] = useState(false);

  const loadFaces = async () => {
    setLoading(true);
    setError("");
    try {
      const [empRes, visRes, logsRes, camRes] = await Promise.all([
        fetch("/api/registered_faces"),
        fetch("/api/visitors"),
        fetch("/api/face_logs?limit=500"),
        fetch("/api/cameras"),
      ]);
      if (!empRes.ok || !visRes.ok) throw new Error("Failed to load faces");

      const employees = (await empRes.json()) as any[];
      const visitors = (await visRes.json()) as any[];
      const logs: any[] = logsRes.ok ? await logsRes.json() : [];
      const camsData: any[] = camRes.ok ? await camRes.json() : [];

      setCameras(
        camsData.map((c: any) => ({ id: c.id, name: c.name, location: c.location || c.place || null }))
      );

      // Build map: person_name (lowercase) → camera info
      const recognitionMap = new Map<string, {
        lastCamera: string;
        lastCameraId: string | null;
        lastSeenAt: string;
        seenCameras: Set<string>;
      }>();

      for (const log of logs) {
        const rawName = (log.person_name || "").trim();
        if (!rawName || rawName.toLowerCase() === "unknown") continue;
        const cleanName = rawName.replace(/^visitor:\s*/i, "").toLowerCase();
        const camName = log.camera_name || log.cameras?.name || log.camera_id || null;
        const camId = log.camera_id || null;
        const ts = log.timestamp || log.created_at || null;

        if (!recognitionMap.has(cleanName)) {
          recognitionMap.set(cleanName, {
            lastCamera: camName || "Unknown Camera",
            lastCameraId: camId,
            lastSeenAt: ts,
            seenCameras: new Set(camName ? [camName] : []),
          });
        } else {
          const existing = recognitionMap.get(cleanName)!;
          if (ts && (!existing.lastSeenAt || new Date(ts) > new Date(existing.lastSeenAt))) {
            existing.lastCamera = camName || "Unknown Camera";
            existing.lastCameraId = camId;
            existing.lastSeenAt = ts;
          }
          if (camName) existing.seenCameras.add(camName);
        }
      }

      const lookup = (name: string) => {
        const rec = recognitionMap.get(name.trim().toLowerCase());
        if (!rec) return { lastCamera: null, lastCameraId: null, lastSeenAt: null, seenCameras: [] };
        return {
          lastCamera: rec.lastCamera,
          lastCameraId: rec.lastCameraId,
          lastSeenAt: rec.lastSeenAt,
          seenCameras: Array.from(rec.seenCameras),
        };
      };

      const empItems: FaceItem[] = employees.map((e) => ({
        key: `emp-${e.id}`,
        id: e.id,
        name: e.name || "Unknown",
        photo: e.photo_url || null,
        isActive: e.is_active !== false,
        kind: "employee",
        sub: e.department || e.designation || e.employee_code || "Employee",
        badge: "Employee",
        ...lookup(e.name || ""),
      }));

      const visItems: FaceItem[] = visitors.map((v) => ({
        key: `vis-${v.visitor_id}`,
        id: v.visitor_id,
        name: v.full_name || "Unknown",
        photo: v.photo_image || null,
        isActive: v.is_active !== false,
        kind: "visitor",
        sub: v.check_out_time ? "Checked out" : "Visitor",
        badge: "Visitor",
        ...lookup(v.full_name || ""),
      }));

      setFaces([...empItems, ...visItems]);
    } catch (err: any) {
      setError(err.message || "Failed to load faces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFaces();
  }, []);

  const toggleFace = async (face: FaceItem) => {
    const target = !face.isActive;
    setBusyKey(face.key);
    try {
      const url =
        face.kind === "employee"
          ? `/api/registered_faces/${face.id}/status`
          : `/api/visitors/${face.id}/status`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to update recognition status.");
        return;
      }
      setFaces((prev) =>
        prev.map((f) => (f.key === face.key ? { ...f, isActive: target } : f))
      );
    } catch (err) {
      console.error("Error toggling face:", err);
      alert("Network error while updating recognition status.");
    } finally {
      setBusyKey(null);
    }
  };

  const activeCount = faces.filter((f) => f.isActive).length;
  const inactiveCount = faces.length - activeCount;
  const empCount = faces.filter((f) => f.kind === "employee").length;
  const visCount = faces.length - empCount;

  const q = search.trim().toLowerCase();
  const filtered = faces.filter((f) => {
    if (filter === "active" && !f.isActive) return false;
    if (filter === "inactive" && f.isActive) return false;
    if (filter === "employee" && f.kind !== "employee") return false;
    if (filter === "visitor" && f.kind !== "visitor") return false;
    if (cameraFilter !== "all") {
      const cam = cameras.find((c) => c.id === cameraFilter);
      if (cam && !f.seenCameras.includes(cam.name) && f.lastCameraId !== cameraFilter) return false;
    }
    if (q && !(f.name.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q))) return false;
    return true;
  });

  const stats = [
    { label: "Active", value: activeCount, color: "#059669" },
    { label: "Inactive", value: inactiveCount, color: "#dc2626" },
    { label: "Employees", value: empCount, color: "#3b82f6" },
    { label: "Visitors", value: visCount, color: "#f59e0b" },
  ];

  const selectedCamLabel =
    cameraFilter === "all"
      ? "All Cameras"
      : cameras.find((c) => c.id === cameraFilter)?.name || "Camera";

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: "linear-gradient(135deg, #059669, #10b981)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 6px 18px rgba(5,150,105,0.3)",
          }}>
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em", margin: 0 }}>
              Recognition Control
            </h1>
            <p style={{ fontSize: 12.5, color: "#6b7280", margin: "3px 0 0" }}>
              Only <strong style={{ color: "#059669" }}>Active</strong> faces are matched on camera. Inactive faces show as Unknown.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadFaces}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 16px", borderRadius: 10,
            background: "#fff", border: "1px solid #e5e7eb", color: "#374151",
            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22,
      }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            background: "#fff", border: "1px solid #eef0f6", borderRadius: 12, padding: "14px 16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", fontWeight: 700 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, marginTop: 2, letterSpacing: "-0.03em" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {/* Search */}
        <div style={{
          flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 9,
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          padding: "9px 12px",
        }}>
          <Search size={14} color="#9ca3af" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or department..."
            style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "#111827", background: "transparent" }}
          />
        </div>

        {/* Status / Kind filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f3f4f6", borderRadius: 10, padding: 4 }}>
          <Filter size={13} color="#9ca3af" style={{ margin: "0 4px 0 6px" }} />
          {(["all", "active", "inactive", "employee", "visitor"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              style={{
                padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600,
                background: filter === opt ? "#fff" : "transparent",
                color: filter === opt ? "#111827" : "#6b7280",
                boxShadow: filter === opt ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>

        {/* Camera filter dropdown */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowCameraFilter((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 14px", borderRadius: 10,
              background: cameraFilter !== "all" ? "rgba(99,102,241,0.08)" : "#fff",
              border: cameraFilter !== "all" ? "1px solid rgba(99,102,241,0.35)" : "1px solid #e5e7eb",
              color: cameraFilter !== "all" ? "#4f46e5" : "#374151",
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              whiteSpace: "nowrap",
            }}
          >
            <Camera size={13} />
            {selectedCamLabel}
          </button>

          {showCameraFilter && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 210, overflow: "hidden",
            }}>
              {[{ id: "all", name: "All Cameras", location: null }, ...cameras].map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => { setCameraFilter(cam.id); setShowCameraFilter(false); }}
                  style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 9,
                    padding: "9px 14px", border: "none", cursor: "pointer",
                    background: cameraFilter === cam.id ? "rgba(99,102,241,0.06)" : "transparent",
                    color: cameraFilter === cam.id ? "#4f46e5" : "#374151",
                    fontSize: 12.5, fontWeight: cameraFilter === cam.id ? 700 : 500,
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <Camera size={12} color={cameraFilter === cam.id ? "#4f46e5" : "#9ca3af"} />
                  <div>
                    <div>{cam.name}</div>
                    {cam.location && (
                      <div style={{ fontSize: 10.5, color: "#9ca3af", marginTop: 1 }}>{cam.location}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Camera filter active badge */}
      {cameraFilter !== "all" && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "#4f46e5", fontWeight: 600,
          marginBottom: 14,
        }}>
          <Camera size={12} />
          Showing faces seen on: <strong style={{ marginLeft: 3 }}>{selectedCamLabel}</strong>
          <button
            type="button"
            onClick={() => setCameraFilter("all")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0, marginLeft: 2, fontSize: 13 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading && faces.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 13 }}>
          <Loader2 size={26} style={{ animation: "spin 1s linear infinite", margin: "0 auto 10px" }} />
          Loading faces…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af", fontSize: 13 }}>
          No faces match.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map((face) => {
            const active = face.isActive;
            const st = active ? STATUS.active : STATUS.inactive;
            const busy = busyKey === face.key;
            const hasCamera = !!face.lastCamera;
            return (
              <div key={face.key} style={{
                background: "#fff", border: "1px solid #eef0f6", borderRadius: 14,
                padding: 16, display: "flex", flexDirection: "column", gap: 11,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.2s ease",
              }}>
                {/* Top row: avatar + info + toggle button */}
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  {face.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={face.photo}
                      alt={face.name}
                      width={52} height={52}
                      style={{ borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid #eef0f6" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div style={{
                      width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                      background: face.kind === "employee"
                        ? "linear-gradient(135deg, #3b82f6, #06b6d4)"
                        : "linear-gradient(135deg, #f59e0b, #ef4444)",
                      color: "#fff", fontWeight: 800, fontSize: 18,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {(face.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {face.name}
                      </span>
                      <span style={{
                        fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase",
                        padding: "2px 6px", borderRadius: 5, flexShrink: 0,
                        background: face.kind === "employee" ? "rgba(59,130,246,0.1)" : "rgba(245,158,11,0.12)",
                        color: face.kind === "employee" ? "#2563eb" : "#d97706",
                      }}>
                        {face.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {face.sub}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                      {active ? <UserCheck size={12} color="#059669" /> : <UserX size={12} color="#dc2626" />}
                      <span style={{ fontSize: 11, fontWeight: 700, color: st.color }}>
                        {active ? "Recognition Active" : "Recognition Off"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFace(face)}
                    disabled={busy}
                    title={active ? "Click to turn OFF recognition" : "Click to turn ON recognition"}
                    style={{
                      padding: "8px 14px", borderRadius: 999, border: `1px solid ${st.border}`,
                      background: st.bg, color: st.color, cursor: "pointer",
                      fontSize: 12, fontWeight: 800, flexShrink: 0,
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {busy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
                    {active ? "Active" : "Inactive"}
                  </button>
                </div>

                {/* Camera recognition info bar */}
                <div style={{
                  borderRadius: 10,
                  background: hasCamera
                    ? active ? "rgba(5,150,105,0.05)" : "rgba(220,38,38,0.04)"
                    : "#f9fafb",
                  border: `1px solid ${hasCamera ? (active ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.15)") : "#f3f4f6"}`,
                  padding: "9px 12px",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <Camera size={13} color={hasCamera ? (active ? "#059669" : "#dc2626") : "#d1d5db"} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {active ? "Recognised on" : "Last seen on"}
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: hasCamera ? "#374151" : "#d1d5db",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        maxWidth: 160,
                      }}>
                        {face.lastCamera || "Not detected yet"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <Clock size={12} color="#9ca3af" />
                    <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>
                      {timeAgo(face.lastSeenAt)}
                    </span>
                  </div>
                </div>

                {/* Multi-camera chips */}
                {face.seenCameras.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Also on:
                    </span>
                    {face.seenCameras
                      .filter((cn) => cn !== face.lastCamera)
                      .slice(0, 3)
                      .map((cn) => (
                        <span key={cn} style={{
                          fontSize: 10.5, fontWeight: 600, color: "#4f46e5",
                          background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)",
                          borderRadius: 6, padding: "2px 8px",
                        }}>
                          {cn}
                        </span>
                      ))}
                    {face.seenCameras.length > 4 && (
                      <span style={{ fontSize: 10.5, color: "#9ca3af" }}>+{face.seenCameras.length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Click-away backdrop for camera dropdown */}
      {showCameraFilter && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
          onClick={() => setShowCameraFilter(false)}
        />
      )}
    </div>
  );
}
