"use client";
import { useState, useEffect, useCallback } from "react";
import { Detection } from "./types";

interface TopMatch {
  id: string;
  name: string;
  photo_url: string | null;
  similarity: number;
  pct: number;
  match: boolean;
}

interface Props {
  unknowns: Detection[];
  backendUrl: string;
  onRegisterClick: (crop: string) => void;
}

// ── Circular Similarity Progress Ring ───────────────────────────────
function CircularProgress({ pct, match }: { pct: number; match: boolean }) {
  const radius = 32;
  const stroke = 4;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const color = match ? "#10b981" : pct > 30 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg height={radius * 2} width={radius * 2} style={{ transform: "rotate(-90deg)" }}>
        <circle
          stroke="#e5e7eb"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + " " + circumference}
          style={{ strokeDashoffset, transition: "stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div style={{
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "monospace", color }}>
          {pct.toFixed(0)}%
        </span>
        <span style={{ fontSize: 7.5, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: -2, fontWeight: 700 }}>
          SIM
        </span>
      </div>
    </div>
  );
}

// ── Horizontal Confidence Bar ──────────────────────────────────────────
function ConfidenceBar({ pct, match }: { pct: number; match: boolean }) {
  const color = match
    ? "#10b981"
    : pct > 30
    ? "#f59e0b"
    : "#ef4444";
  return (
    <div style={{ position: "relative", height: 5, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${Math.max(pct, 2)}%`,
        background: color, borderRadius: 4,
        transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
      }} />
    </div>
  );
}

// ── Match List Card ─────────────────────────────────────────────────
function MatchCard({ m, rank, threshold }: { m: TopMatch; rank: number; threshold: number }) {
  const isTop = rank === 0;
  const borderColor = m.match
    ? "rgba(16,185,129,0.3)"
    : isTop
    ? "rgba(245,158,11,0.3)"
    : "#e5e7eb";
  
  const statusColor = m.match ? "#059669" : m.pct > (threshold * 100) - 5 ? "#d97706" : "#6b7280";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: m.match ? "rgba(16,185,129,0.04)" : "#ffffff",
      border: `1px solid ${borderColor}`, borderRadius: 12, padding: "8px 12px",
      transition: "all 0.25s ease", position: "relative"
    }}>
      <div style={{ position: "absolute", top: 4, right: 8, fontSize: 8.5, fontWeight: 900, color: "#9ca3af" }}>
        #{rank + 1}
      </div>
      <div style={{ position: "relative", flexShrink: 0 }}>
        {m.photo_url
          ? <img src={m.photo_url} alt={m.name} style={{
              width: 38, height: 38, borderRadius: 8, objectFit: "cover",
              border: `1.5px solid ${m.match ? "#10b981" : "#e5e7eb"}`
            }} />
          : <div style={{
              width: 38, height: 38, borderRadius: 8, background: "#f3f4f6",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
            }}>👤</div>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: m.match ? "#059669" : "#111827",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginRight: 8 }}>
            {m.name}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: statusColor, fontFamily: "monospace" }}>
            {m.pct.toFixed(0)}%
          </span>
        </div>
        <ConfidenceBar pct={m.pct} match={m.match} />
      </div>
    </div>
  );
}

// ── Main Comparison Panel Component ─────────────────────────────────
export default function ComparisonPanel({ unknowns, backendUrl, onRegisterClick }: Props) {
  const [matches, setMatches] = useState<TopMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCrop, setActiveCrop] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.35);
  const [lastKey, setLastKey] = useState("");

  const fetchMatches = useCallback(async (crop: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/top_matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" },
        body: JSON.stringify({ image: crop, top_n: 5 }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches || []);
        setThreshold(data.threshold || 0.35);
      }
    } catch {}
    finally { setLoading(false); }
  }, [backendUrl]);

  // ── Multi-person tab: track which unknown is actively shown
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const first = unknowns[0];
    if (!first?.crop_b64) return;
    const key = first.crop_b64.slice(-32);
    if (key === lastKey) return;
    setLastKey(key);
    setActiveIdx(0);
    setActiveCrop(first.crop_b64);
    fetchMatches(first.crop_b64);
  }, [unknowns, fetchMatches, lastKey]);

  // When tab changes, fetch matches for that specific unknown
  const handleTabChange = (idx: number) => {
    setActiveIdx(idx);
    const target = unknowns[idx];
    if (target?.crop_b64) {
      setActiveCrop(target.crop_b64);
      fetchMatches(target.crop_b64);
    }
  };

  if (unknowns.length === 0 && matches.length === 0) return null;

  const best = matches[0];
  const topPct = best?.pct ?? 0;
  const threshPct = threshold * 100;
  const isMatch = topPct >= threshPct;

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid rgba(239,68,68,0.25)",
      borderRadius: 16, overflow: "hidden",
      boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      animation: "fadeSlideIn 0.3s ease",
    }}>
      {/* ── Dynamic Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderBottom: "1px solid #f3f4f6",
        background: "rgba(239,68,68,0.05)"
      }}>
        <span className="live-scanner-dot" />
        <span style={{ fontSize: 10, fontWeight: 900, color: "#dc2626", letterSpacing: "0.12em" }}>
          MATCH ANALYSIS
        </span>
        <span style={{
          marginLeft: "auto", fontSize: 9.5, fontWeight: 700,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 6, padding: "2px 6px", color: "#dc2626"
        }}>
          {unknowns.length} Unknown
        </span>
      </div>

      {/* ── Multi-person tab strip ── */}
      {unknowns.length > 1 && (
        <div style={{
          display: "flex", gap: 4, padding: "8px 14px 0",
          borderBottom: "1px solid #f3f4f6", overflowX: "auto"
        }}>
          {unknowns.map((_, idx) => (
            <button
              key={idx}
              onClick={() => handleTabChange(idx)}
              style={{
                flexShrink: 0, padding: "4px 10px", borderRadius: 8,
                cursor: "pointer", fontSize: 10.5, fontWeight: activeIdx === idx ? 800 : 500,
                background: activeIdx === idx ? "rgba(239,68,68,0.12)" : "#f9fafb",
                color: activeIdx === idx ? "#dc2626" : "#6b7280",
                border: activeIdx === idx ? "1px solid rgba(239,68,68,0.3)" : "1px solid transparent",
                transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 4
              }}
            >
              {unknowns[idx]?.crop_b64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={unknowns[idx].crop_b64!} alt={`face ${idx+1}`}
                  style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover",
                    border: `1.5px solid ${activeIdx === idx ? "#ef4444" : "#e5e7eb"}` }} />
              )}
              #{idx + 1}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        
        {/* ── High-Tech Side-by-Side Verification Screen ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#f9fafb", border: "1px solid #e5e7eb",
          borderRadius: 14, padding: 12, position: "relative", overflow: "hidden"
        }}>
          {/* Laser scanning connector line in background */}
          <div className="laser-scanner-line" />

          {/* Left: Live Crop — enlarged to 120×120 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 2 }}>
            <div style={{
              width: 120, height: 120, borderRadius: 12, overflow: "hidden",
              border: "2.5px solid #ef4444",
              boxShadow: "0 0 16px rgba(239,68,68,0.2)", background: "#ffffff"
            }}>
              {activeCrop
                ? <img src={activeCrop} alt="Live Crop" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>❓</div>
              }
            </div>
            <span style={{
              fontSize: 8.5, color: "#dc2626", fontWeight: 800, letterSpacing: "0.08em",
              background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: 4
            }}>
              LIVE CROP (HD)
            </span>
          </div>

          {/* Center Gauge Indicator */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2, padding: "0 8px" }}>
            <CircularProgress pct={topPct} match={isMatch} />
            <span style={{
              fontSize: 7.5, fontWeight: 700, fontFamily: "monospace",
              color: isMatch ? "#059669" : "#d97706", marginTop: 4, letterSpacing: "0.04em"
            }}>
              {isMatch ? "MATCH OK" : "LOW MATCH"}
            </span>
          </div>

          {/* Right: Enrolled Match — enlarged to 120×120 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 2 }}>
            <div style={{
              width: 120, height: 120, borderRadius: 12, overflow: "hidden",
              border: `2.5px solid ${isMatch ? "#10b981" : "#e5e7eb"}`,
              boxShadow: isMatch ? "0 0 16px rgba(16,185,129,0.25)" : "none", background: "#ffffff"
            }}>
              {best?.photo_url
                ? <img src={best.photo_url} alt={best.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>👤</div>
              }
            </div>
            <span style={{
              fontSize: 8.5, color: isMatch ? "#059669" : "#6b7280", fontWeight: 800, letterSpacing: "0.08em",
              background: isMatch ? "rgba(16,185,129,0.1)" : "#f3f4f6", padding: "1px 6px", borderRadius: 4,
              maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}>
              {best ? best.name : "UNKNOWN"}
            </span>
          </div>
        </div>

        {/* ── Threshold Alerts / Suggestions ── */}
        {topPct > 0 && !isMatch && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fef3c7",
            borderRadius: 10, padding: 8, fontSize: 10.5, color: "#d97706",
            display: "flex", gap: 6, lineHeight: 1.4, fontWeight: 500
          }}>
            <span style={{ fontSize: 11 }}>⚠</span>
            <span>
              Best match <strong>{best?.name}</strong> is below the {threshPct.toFixed(0)}% verification threshold. Enrolling a new clear photo is recommended.
            </span>
          </div>
        )}

        {/* ── Similarity Candidates List ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Top Database Matches
          </div>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", color: "#6b7280", fontSize: 11 }}>
              <div className="mini-spinner" />
              Comparing face chunks…
            </div>
          ) : matches.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map((m, i) => (
                <MatchCard key={m.id ?? i} m={m} rank={i} threshold={threshold} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", padding: "8px 0" }}>
              No candidates found in database.
            </div>
          )}
        </div>

        {/* ── Register + Rescan Buttons ── */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              const target = unknowns[activeIdx];
              if (target?.crop_b64) {
                fetchMatches(target.crop_b64);
              }
            }}
            disabled={loading}
            style={{
              flex: "0 0 auto", padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb",
              cursor: "pointer", background: "#f9fafb", color: "#374151",
              fontSize: 12, fontWeight: 700, transition: "all 0.2s"
            }}
          >
            🔄 Rescan
          </button>
          <button
            onClick={() => activeCrop && onRegisterClick(activeCrop)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "#fff", fontSize: 12.5, fontWeight: 700,
              boxShadow: "0 3px 12px rgba(99,102,241,0.25)",
              transition: "all 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.filter = "brightness(1.05)"}
            onMouseOut={(e) => e.currentTarget.style.filter = "brightness(1.0)"}
          >
            ➕ Register as New Person
          </button>
        </div>
      </div>

      {/* Embedded scanning stylesheets */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes laserSweep {
          0% { left: 0%; opacity: 0.1; }
          50% { opacity: 0.8; }
          100% { left: 100%; opacity: 0.1; }
        }
        @keyframes pulseScanner {
          0% { transform: scale(0.9); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.5; }
        }
        .live-scanner-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ef4444;
          box-shadow: 0 0 6px #ef4444;
          animation: pulseScanner 1.5s infinite ease-in-out;
        }
        .laser-scanner-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: linear-gradient(180deg, transparent, #ef4444, transparent);
          box-shadow: 0 0 6px rgba(239,68,68,0.5);
          animation: laserSweep 4s infinite linear;
          z-index: 1;
        }
        .mini-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(99,102,241,0.2);
          border-top: 2px solid #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}</style>
    </div>
  );
}
