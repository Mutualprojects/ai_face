"use client";

import { useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  UserCheck,
  UserX,
  Loader2,
  ShieldCheck,
  Users,
  Filter,
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
}

const STATUS = {
  active: { color: "#059669", bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.3)" },
  inactive: { color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.28)" },
};

export default function FacesPage() {
  const [faces, setFaces] = useState<FaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "employee" | "visitor">("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const loadFaces = async () => {
    setLoading(true);
    setError("");
    try {
      const [empRes, visRes] = await Promise.all([
        fetch("/api/registered_faces"),
        fetch("/api/visitors"),
      ]);
      if (!empRes.ok || !visRes.ok) {
        throw new Error("Failed to load faces");
      }
      const employees = (await empRes.json()) as any[];
      const visitors = (await visRes.json()) as any[];

      const empItems: FaceItem[] = employees.map((e) => ({
        key: `emp-${e.id}`,
        id: e.id,
        name: e.name || "Unknown",
        photo: e.photo_url || null,
        isActive: e.is_active !== false,
        kind: "employee",
        sub: e.department || e.designation || e.employee_code || "Employee",
        badge: "Employee",
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
    if (q && !(f.name.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q))) return false;
    return true;
  });

  const stats = [
    { label: "Active", value: activeCount, color: "#059669" },
    { label: "Inactive", value: inactiveCount, color: "#dc2626" },
    { label: "Employees", value: empCount, color: "#3b82f6" },
    { label: "Visitors", value: visCount, color: "#f59e0b" },
  ];

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
      </div>

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map((face) => {
            const active = face.isActive;
            const st = active ? STATUS.active : STATUS.inactive;
            const busy = busyKey === face.key;
            return (
              <div key={face.key} style={{
                background: "#fff", border: "1px solid #eef0f6", borderRadius: 14,
                padding: 16, display: "flex", alignItems: "center", gap: 13,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                transition: "box-shadow 0.2s ease",
              }}>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
