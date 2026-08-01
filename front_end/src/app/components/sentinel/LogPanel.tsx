"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { FaceLog, RegisteredFace } from "./types";

interface Top3Candidate {
  name: string;
  score: number;
  photo_url?: string | null;
}

interface Props {
  logs: FaceLog[];
  faces: RegisteredFace[];
  onRefresh: () => void;
  autoRefresh?: boolean;
}

type FilterTab = "all" | "matched" | "unknown";

function timeAgo(ts?: string) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function ConfidenceMeter({ value, color }: { value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 9.5, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Confidence</span>
        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 3,
          background: pct >= 70 ? "#10b981"
            : pct >= 45 ? "#f59e0b"
            : "#ef4444",
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

function Top3Comparison({ candidates, faces }: { candidates: Top3Candidate[], faces: RegisteredFace[] }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9.5, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, fontWeight: 600 }}>
        Top candidates from gallery
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {candidates.map((c, i) => {
          const regFace = faces.find(f => f.name.toLowerCase() === c.name.toLowerCase());
          const photoUrl = c.photo_url || regFace?.photo_url;
          const pct = Math.round(c.score * 100);
          const isTop = i === 0;
          return (
            <div key={c.name} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              background: isTop ? "rgba(99,102,241,0.06)" : "#f9fafb",
              border: `1px solid ${isTop ? "rgba(99,102,241,0.3)" : "#e5e7eb"}`,
              borderRadius: 8, padding: "6px 4px",
            }}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt={c.name} style={{
                  width: 36, height: 36, borderRadius: 6, objectFit: "cover",
                  border: `2px solid ${isTop ? "#6366f1" : "#e5e7eb"}`,
                }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: 6,
                  background: "#e5e7eb",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              )}
              <div style={{ fontSize: 8.5, color: isTop ? "#4f46e5" : "#374151", fontWeight: 700, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </div>
              <div style={{
                fontSize: 8.5, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                color: pct >= 30 ? "#d97706" : "#6b7280",
                background: pct >= 30 ? "#fef3c7" : "#e5e7eb",
                padding: "1px 4px", borderRadius: 3,
              }}>
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LogPanel({ logs, faces, onRefresh, autoRefresh = false }: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [allLogs, setAllLogs] = useState<(FaceLog & { top3?: Top3Candidate[] })[]>(logs);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";

  const fetchFilteredLogs = useCallback(async (tab: FilterTab) => {
    try {
      const apiType = tab === "all" ? "all" : tab === "matched" ? "known" : "unknown";
      const res = await fetch(`http://${host}:5000/api/face_logs?type=${apiType}`, {
        headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" }
      });
      if (res.ok) {
        const data = await res.json();
        setAllLogs(data);
      }
    } catch {}
  }, [host]);

  useEffect(() => {
    fetchFilteredLogs(filter);
  }, [filter, fetchFilteredLogs]);

  // SSE subscription — real-time push from /api/logs/stream (no polling lag)
  useEffect(() => {
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    let es: EventSource | null = null;
    try {
      const apiKey = process.env.NEXT_PUBLIC_API_KEY || "";
      es = new EventSource(`http://${host}:5000/api/logs/stream?api_key=${apiKey}`);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.ping) return; // keepalive
          setAllLogs(prev => {
            if (prev.some(l => l.id === data.id)) return prev; // dedup
            return [data, ...prev].slice(0, 100);
          });
        } catch {}
      };
      es.onerror = () => { es?.close(); };
    } catch {}
    return () => { es?.close(); };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    intervalRef.current = setInterval(() => fetchFilteredLogs(filter), 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, filter, fetchFilteredLogs]);

  useEffect(() => {
    if (filter === "all") setAllLogs(logs);
  }, [logs, filter]);

  const handleDeleteUnknown = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`http://${host}:5000/api/face_logs/unknown`, {
        method: "DELETE",
        headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" }
      });
      if (res.ok) {
        setDeleteMsg("Unknown logs cleared!");
        fetchFilteredLogs(filter);
      } else {
        setDeleteMsg("Failed to delete.");
      }
    } catch {
      setDeleteMsg("Error.");
    }
    setIsDeleting(false);
    setTimeout(() => setDeleteMsg(""), 3000);
  };

  const knownCount  = allLogs.filter(l => l.person_name !== "Unknown").length;
  const unknownCount = allLogs.filter(l => l.person_name === "Unknown").length;

  const displayed = allLogs.filter(log => {
    if (filter === "matched") return log.person_name !== "Unknown";
    if (filter === "unknown") return log.person_name === "Unknown";
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#ef444415", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Detection Log</span>
        <button onClick={() => fetchFilteredLogs(filter)} style={{
          marginLeft: "auto", background: "none", border: "none",
          color: "#6b7280", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4, fontWeight: 600
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#059669", fontFamily: "'JetBrains Mono',monospace" }}>{knownCount}</div>
          <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", fontWeight: 700 }}>Matched</div>
        </div>
        <div style={{ flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#dc2626", fontFamily: "'JetBrains Mono',monospace" }}>{unknownCount}</div>
          <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase", fontWeight: 700 }}>Unknown</div>
        </div>
        <button
          onClick={handleDeleteUnknown}
          disabled={isDeleting || unknownCount === 0}
          title="Delete all unknown logs"
          style={{
            background: unknownCount > 0 ? "rgba(239,68,68,0.1)" : "#f3f4f6",
            border: `1px solid ${unknownCount > 0 ? "rgba(239,68,68,0.3)" : "#e5e7eb"}`,
            borderRadius: 8, padding: "6px 10px", cursor: unknownCount > 0 ? "pointer" : "not-allowed",
            color: unknownCount > 0 ? "#dc2626" : "#9ca3af",
            fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.2s",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
          </svg>
          {deleteMsg || "Clear"}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
        {(["all", "matched", "unknown"] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10.5,
              fontWeight: filter === tab ? 700 : 500, letterSpacing: "0.02em",
              background: filter === tab ? "#ffffff" : "transparent",
              color: filter === tab
                ? tab === "matched" ? "#059669"
                  : tab === "unknown" ? "#dc2626"
                  : "#111827"
                : "#6b7280",
              boxShadow: filter === tab ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
              transition: "all 0.2s",
            }}
          >
            {tab === "all" ? `All (${allLogs.length})` : tab === "matched" ? `✓ Matched (${knownCount})` : `? Unknown (${unknownCount})`}
          </button>
        ))}
      </div>

      {/* Log list */}
      {displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#6b7280", fontSize: 12 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"
            style={{ margin: "0 auto 8px", display: "block" }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {filter === "all" ? "No detections yet. Enable Face Matcher to start." : `No ${filter} logs.`}
        </div>
      ) : (
        <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {displayed.map(log => {
            const isKnown = log.person_name !== "Unknown";
            const ts = log.created_at || (log as any).timestamp;
            const pct = Math.round(log.confidence * 100);
            const top3: Top3Candidate[] = (log as any).top3 || [];

            const statusColor = isKnown
              ? pct >= 70 ? "#059669" : pct >= 50 ? "#0284c7" : "#d97706"
              : "#dc2626";

            return (
              <div key={log.id} style={{
                background: "#ffffff",
                border: `1px solid ${isKnown ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                borderRadius: 12, padding: "10px 12px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                animation: "fadeInUp 0.3s ease",
              }}>
                {/* Row 1: name + time */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", background: statusColor,
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 12, color: statusColor }}>
                      {isKnown ? log.person_name : "Unknown Person"}
                    </span>
                    {!isKnown && (
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, color: "#dc2626",
                        background: "rgba(239,68,68,0.08)", padding: "1px 5px", borderRadius: 3,
                        border: "1px solid rgba(239,68,68,0.2)", textTransform: "uppercase",
                      }}>
                        Unidentified
                      </span>
                    )}
                    {isKnown && pct >= 70 && (
                      <span style={{
                        fontSize: 8.5, fontWeight: 700, color: "#059669",
                        background: "rgba(16,185,129,0.08)", padding: "1px 5px", borderRadius: 3,
                        border: "1px solid rgba(16,185,129,0.2)", textTransform: "uppercase",
                      }}>
                        High Confidence
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 9.5, color: "#6b7280", flexShrink: 0, fontWeight: 500 }}>{timeAgo(ts)}</span>
                </div>

                {/* Row 2: images side-by-side */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  {/* Live crop */}
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", border: `2px solid ${statusColor}`, position: "relative" }}>
                      {log.snapshot_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={log.snapshot_url} alt="Live" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 7.5, color: "#6b7280", fontWeight: 700, display: "block", textAlign: "center", marginTop: 2, textTransform: "uppercase" }}>
                      Live
                    </span>
                  </div>

                  {/* Arrow */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 52, gap: 3, flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span style={{
                      fontSize: 7.5, fontWeight: 700, textTransform: "uppercase",
                      color: isKnown ? "#059669" : "#dc2626",
                      background: isKnown ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                      padding: "1px 4px", borderRadius: 3,
                    }}>
                      {isKnown ? "MATCH" : "NONE"}
                    </span>
                  </div>

                  {/* Enrolled / candidates */}
                  <div style={{ flex: 1 }}>
                    {isKnown ? (
                      (() => {
                        const enrolled = faces.find(f => f.name.toLowerCase() === log.person_name.toLowerCase());
                        return enrolled?.photo_url ? (
                          <div>
                            <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", border: "2px solid #6366f1" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={enrolled.photo_url} alt={enrolled.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </div>
                            <span style={{ fontSize: 7.5, color: "#4f46e5", fontWeight: 700, display: "block", textAlign: "center", marginTop: 2, textTransform: "uppercase" }}>
                              Enrolled
                            </span>
                          </div>
                        ) : (
                          <div style={{ width: 52, height: 52, borderRadius: 8, border: "2px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 8.5, color: "#6b7280" }}>No photo</span>
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{
                          padding: "4px 6px", background: "rgba(239,68,68,0.06)",
                          border: "1px dashed rgba(239,68,68,0.2)", borderRadius: 6,
                          fontSize: 8.5, color: "#dc2626", fontWeight: 600
                        }}>
                          No match found in gallery
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Confidence meter */}
                <ConfidenceMeter value={log.confidence} color={statusColor} />

                {/* Top-3 candidates for unknowns */}
                {!isKnown && top3.length > 0 && (
                  <Top3Comparison candidates={top3} faces={faces} />
                )}

                {/* Det score footnote */}
                {(log as any).det_score !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 8.5, color: "#9ca3af", fontWeight: 500 }}>
                    Detection confidence: {Math.round(((log as any).det_score || 0) * 100)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
