"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const API = "http://localhost:5000";
const KEY = "ph0-secr3t-k3y-v1-992";
const H = { Authorization: `Bearer ${KEY}` };

function fmt(n: number, d = 1) { return n.toFixed(d); }
function fmtBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 ** 2) return fmt(bytes / 1024) + " KB";
  if (bytes < 1024 ** 3) return fmt(bytes / 1024 ** 2) + " MB";
  return fmt(bytes / 1024 ** 3) + " GB";
}
function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function buildHourBuckets(logs: { timestamp: string; person_name: string }[]) {
  const now = Date.now();
  const buckets: { hour: string; known: number; unknown: number }[] = [];
  for (let h = 23; h >= 0; h--) {
    const t = now - h * 3600000;
    const d = new Date(t);
    buckets.push({ hour: d.getHours().toString().padStart(2, "0") + ":00", known: 0, unknown: 0 });
  }
  logs.forEach(l => {
    const t = new Date(l.timestamp).getTime();
    const hoursAgo = (now - t) / 3600000;
    if (hoursAgo > 24) return;
    const idx = 23 - Math.floor(hoursAgo);
    if (idx < 0 || idx > 23) return;
    if (l.person_name === "Unknown") buckets[idx].unknown++;
    else buckets[idx].known++;
  });
  return buckets;
}

function BarChart({ data, color1 = "#6366f1", color2 = "#f59e0b" }: {
  data: { hour: string; known: number; unknown: number }[];
  color1?: string; color2?: string;
}) {
  const maxVal = Math.max(...data.map(d => d.known + d.unknown), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 70, width: "100%" }}>
      {data.map((d, i) => {
        const total = d.known + d.unknown;
        const pct = total / maxVal;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}
            title={`${d.hour}: ${d.known} known, ${d.unknown} unknown`}>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60 }}>
              <div style={{
                width: "100%", height: `${pct * 60}px`,
                borderRadius: "3px 3px 0 0",
                background: total > 0 ? `linear-gradient(to top, ${color2}, ${color1})` : "#e5e7eb",
                transition: "height 0.5s ease", minHeight: total > 0 ? 4 : 2,
              }} />
            </div>
            {(i % 4 === 0) && <div style={{ fontSize: 8, color: "#9ca3af", whiteSpace: "nowrap", marginTop: 2 }}>{d.hour}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Donut({ pct, color, label, size = 80 }: { pct: number; color: string; label: string; size?: number }) {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
        <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#111827">
          {Math.round(pct)}%
        </text>
      </svg>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return null;
  const max = Math.max(...vals, 1);
  const w = 80, h = 28;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

function StatCard({ label, value, sub, color, icon, trend }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ReactNode; trend?: number[];
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "16px 16px 0 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#111827", letterSpacing: "-0.04em", marginTop: 4 }}>{value}</div>
          {sub && <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 2 }}>{sub}</div>}
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>{icon}</div>
      </div>
      {trend && <Sparkline vals={trend} color={color} />}
    </div>
  );
}

function SH({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const C = {
  purple: "#6366f1", green: "#10b981", amber: "#f59e0b",
  red: "#ef4444", blue: "#3b82f6", cyan: "#06b6d4", pink: "#ec4899", teal: "#14b8a6",
};
const HUE_LIST = [C.purple, C.blue, C.green, C.teal, C.amber, C.red, C.pink, C.cyan];

export default function AnalyticsPage() {
  const [health, setHealth] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [faces, setFaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [hR, lR, cR, fR] = await Promise.allSettled([
      fetch(`${API}/api/health`),
      fetch(`${API}/api/face_logs?limit=1000`, { headers: H }),
      fetch(`${API}/api/cameras`, { headers: H }),
      fetch(`${API}/api/registered_faces`, { headers: H }),
    ]);
    if (hR.status === "fulfilled" && hR.value.ok) setHealth(await hR.value.json());
    if (lR.status === "fulfilled" && lR.value.ok) { const d = await lR.value.json(); setLogs(Array.isArray(d) ? d : (d.logs || [])); }
    if (cR.status === "fulfilled" && cR.value.ok) { const d = await cR.value.json(); setCameras(Array.isArray(d) ? d : []); }
    if (fR.status === "fulfilled" && fR.value.ok) { const d = await fR.value.json(); setFaces(Array.isArray(d) ? d : []); }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); ivRef.current = setInterval(load, 15000); return () => { if (ivRef.current) clearInterval(ivRef.current); }; }, [load]);

  const now = Date.now();
  const hourBuckets = buildHourBuckets(logs);
  const total = logs.length;
  const known = logs.filter(l => l.person_name !== "Unknown").length;
  const unknown = total - known;
  const matchRate = total > 0 ? (known / total) * 100 : 0;
  const logs1h = logs.filter(l => now - new Date(l.timestamp).getTime() < 3600000).length;

  const camStats: Record<string, { name: string; count: number; lastSeen: string }> = {};
  logs.forEach(l => {
    const id = l.camera_id || "unknown";
    if (!camStats[id]) camStats[id] = { name: l.camera_name || id, count: 0, lastSeen: l.timestamp };
    camStats[id].count++;
    if (new Date(l.timestamp) > new Date(camStats[id].lastSeen)) camStats[id].lastSeen = l.timestamp;
  });
  const camList = Object.entries(camStats).sort((a, b) => b[1].count - a[1].count).slice(0, 8);

  const personStats: Record<string, { name: string; count: number; last: string }> = {};
  logs.filter(l => l.person_name !== "Unknown").forEach(l => {
    const k = l.person_id || l.person_name;
    if (!personStats[k]) personStats[k] = { name: l.person_name, count: 0, last: l.timestamp };
    personStats[k].count++;
    if (new Date(l.timestamp) > new Date(personStats[k].last)) personStats[k].last = l.timestamp;
  });
  const personList = Object.values(personStats).sort((a, b) => b.count - a.count).slice(0, 8);

  const deptMap: Record<string, number> = {};
  faces.forEach((f: any) => { const d = f.department || "Unknown"; deptMap[d] = (deptMap[d] || 0) + 1; });
  const deptList = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);

  const faceCount = faces.length;
  const logCount = logs.length;
  const camCount = cameras.length;
  const embMB = (faceCount * 2) / 1024;
  const logMB = (logCount * 30) / 1024;
  const totalMB = embMB + logMB + 0.5;

  const sparkVals = Array.from({ length: 6 }, (_, i) => {
    const from = now - (6 - i) * 4 * 3600000;
    const to = now - (5 - i) * 4 * 3600000;
    return logs.filter(l => { const t = new Date(l.timestamp).getTime(); return t >= from && t < to; }).length;
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid #e5e7eb", borderTop: `3px solid ${C.purple}`, animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 13, color: "#9ca3af" }}>Loading analytics...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Inter,system-ui,sans-serif" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fu{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .ac{animation:fu .3s ease both}
        .ar:hover{background:#f9fafb!important}
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#111827", letterSpacing: "-0.04em" }}>
            Analytics <span style={{ background: "linear-gradient(90deg,#6366f1,#8b5cf6,#06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Dashboard</span>
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
            Last updated {relTime(lastRefresh.toISOString())} · auto-refresh every 15s
          </div>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 8, background: C.purple, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 14px ${C.purple}44` }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>

      {/* Health banner */}
      {health && (
        <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", border: "1px solid #bbf7d0", borderRadius: 14, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.green, display: "inline-block", boxShadow: `0 0 6px ${C.green}` }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>System Healthy</span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>·</span>
          <span style={{ fontSize: 12, color: "#374151" }}>Model: <b>{health.active_model}</b></span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>·</span>
          <span style={{ fontSize: 12, color: "#374151" }}>Cached Faces: <b>{health.cached_faces}</b></span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>·</span>
          <span style={{ fontSize: 12, color: "#374151" }}>Workers: <b>{(health.active_workers || []).length}</b></span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>·</span>
          <span style={{ fontSize: 12, color: "#374151" }}>Threshold: <b>{health.match_threshold}</b></span>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Total Detections", value: total.toLocaleString(), sub: "All time", color: C.purple, trend: sparkVals, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> },
          { label: "Known Faces", value: known.toLocaleString(), sub: `${fmt(matchRate, 0)}% match rate`, color: C.green, trend: sparkVals.map(v => Math.round(v * matchRate / 100)), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
          { label: "Unknown Faces", value: unknown.toLocaleString(), sub: "Unregistered", color: C.amber, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
          { label: "Last 1 Hour", value: logs1h, sub: "Recent detections", color: C.blue, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { label: "Registered Faces", value: faceCount, sub: `${camCount} cameras`, color: C.teal, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
          { label: "DB Size Est.", value: fmtBytes(totalMB * 1024 * 1024), sub: `${logCount} log rows`, color: C.pink, icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
        ].map((s, i) => (
          <div key={s.label} className="ac" style={{ animationDelay: `${i * 60}ms` }}>
            <StatCard {...s} />
          </div>
        ))}
      </div>

      {/* Bar chart + Donut */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 28 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <SH title="Detections — Last 24 Hours" sub="Hourly breakdown" />
          <BarChart data={hourBuckets} color1={C.purple} color2={C.amber} />
          <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "flex-end" }}>
            {[{ c: C.purple, l: "Known" }, { c: C.amber, l: "Unknown" }].map(({ c, l }) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />{l}
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 20 }}>
          <SH title="Recognition Rates" />
          <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16 }}>
            <Donut pct={matchRate} color={C.green} label="Match Rate" />
            <Donut pct={camCount > 0 ? ((health?.active_workers?.length || 0) / camCount) * 100 : 0} color={C.blue} label="Camera Active" />
            <Donut pct={faceCount > 0 ? Math.min((logCount / faceCount) * 10, 100) : 0} color={C.purple} label="Log Density" />
          </div>
        </div>
      </div>

      {/* Camera + Person rankings */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <SH title="Camera Activity" sub="Detections per camera" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {camList.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 20 }}>No data</div>}
            {camList.map(([id, st], i) => {
              const pct = (st.count / (camList[0]?.[1].count || 1)) * 100;
              const col = `hsl(${(i * 47) % 360},65%,52%)`;
              return (
                <div key={id} className="ar" style={{ borderRadius: 10, padding: "8px 10px", transition: "background .15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: col, marginLeft: 8 }}>{st.count}</div>
                  </div>
                  <div style={{ height: 5, background: "#f3f4f6", borderRadius: 99 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99, transition: "width .8s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>{relTime(st.lastSeen)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <SH title="Most Detected Persons" sub="Ranked by total detections" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {personList.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 20 }}>No known persons detected</div>}
            {personList.map((p, i) => {
              const pct = (p.count / (personList[0]?.count || 1)) * 100;
              const col = HUE_LIST[i % HUE_LIST.length];
              const initials = p.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={i} className="ar" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, padding: "8px 10px", transition: "background .15s" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: col + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: col, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: col, marginLeft: 8 }}>{p.count}×</div>
                    </div>
                    <div style={{ height: 4, background: "#f3f4f6", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 99, transition: "width .8s ease" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dept + DB */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <SH title="Department Breakdown" sub="Registered employees" />
          {deptList.length === 0 ? <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 20 }}>No data</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {deptList.map(([dept, cnt], i) => {
                const col = HUE_LIST[i % HUE_LIST.length];
                return (
                  <div key={dept}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, color: "#374151", fontWeight: 600 }}>{dept}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: col }}>{cnt} people</span>
                    </div>
                    <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${(cnt / (deptList[0]?.[1] || 1)) * 100}%`, background: col, borderRadius: 99, transition: "width .8s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <SH title="Database Storage" sub="Estimated usage" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "Face Embeddings", size: embMB, color: C.purple, icon: "🧬", note: `${faceCount} faces × ~2KB` },
              { label: "Detection Logs", size: logMB, color: C.blue, icon: "📋", note: `${logCount} rows × ~30KB` },
              { label: "System Config", size: 0.5, color: C.green, icon: "⚙️", note: "Cameras, keys, orgs" },
            ].map(({ label, size, color, icon, note }) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111827" }}>{label}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{note}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color, flexShrink: 0 }}>{fmtBytes(size * 1024 * 1024)}</div>
                </div>
                <div style={{ height: 8, background: "#f3f4f6", borderRadius: 99 }}>
                  <div style={{ height: "100%", width: `${(size / totalMB) * 100}%`, background: color, borderRadius: 99, transition: "width .8s ease" }} />
                </div>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#374151" }}>Total Estimated</span>
              <span style={{ fontSize: 16, fontWeight: 900, color: "#111827" }}>{fmtBytes(totalMB * 1024 * 1024)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Camera grid */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", marginBottom: 28 }}>
        <SH title="Active Cameras" sub={`${camCount} registered · ${(health?.active_workers || []).length} workers running`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {cameras.map((cam: any) => {
            const isActive = (health?.active_workers || []).includes(cam.id);
            const st = camStats[cam.id];
            return (
              <div key={cam.id} style={{ border: `1.5px solid ${isActive ? C.green + "50" : "#e5e7eb"}`, borderRadius: 12, padding: "14px 16px", background: isActive ? "#f0fdf4" : "#fafafa", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{cam.name || cam.id}</div>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", background: isActive ? C.green : "#9ca3af", color: "#fff", borderRadius: 99, padding: "2px 7px" }}>{isActive ? "LIVE" : "OFF"}</span>
                </div>
                {cam.location && <div style={{ fontSize: 11, color: "#6b7280" }}>📍 {cam.location}</div>}
                {st ? <div style={{ fontSize: 11, color: "#9ca3af" }}>{st.count} detections · {relTime(st.lastSeen)}</div>
                  : <div style={{ fontSize: 11, color: "#d1d5db" }}>No detections yet</div>}
              </div>
            );
          })}
          {cameras.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", gridColumn: "1/-1", textAlign: "center", padding: 20 }}>No cameras found</div>}
        </div>
      </div>

      {/* Recent feed table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <SH title="Recent Detection Feed" sub="Last 20 events" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                {["Person", "Camera", "Confidence", "When", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, color: "#9ca3af", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 20).map((l, i) => {
                const isKnown = l.person_name !== "Unknown";
                return (
                  <tr key={i} className="ar" style={{ borderBottom: "1px solid #f9fafb", transition: "background .15s" }}>
                    <td style={{ padding: "8px 10px", fontWeight: isKnown ? 700 : 400, color: isKnown ? "#111827" : "#6b7280" }}>{l.person_name}</td>
                    <td style={{ padding: "8px 10px", color: "#374151" }}>{l.camera_name || l.camera_id || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ display: "inline-block", background: l.confidence > 0.7 ? C.green + "20" : l.confidence > 0.4 ? C.amber + "20" : "#f3f4f6", color: l.confidence > 0.7 ? C.green : l.confidence > 0.4 ? C.amber : "#9ca3af", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        {fmt(l.confidence * 100, 0)}%
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#9ca3af", whiteSpace: "nowrap" }}>{relTime(l.timestamp)}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ display: "inline-block", background: isKnown ? C.green + "18" : C.amber + "18", color: isKnown ? C.green : C.amber, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{isKnown ? "Known" : "Unknown"}</span>
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 13 }}>No detection logs yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
