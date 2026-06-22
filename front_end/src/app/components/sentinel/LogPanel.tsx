"use client";
import { FaceLog, RegisteredFace } from "./types";

interface Props {
  logs: FaceLog[];
  faces: RegisteredFace[];
  onRefresh: () => void;
}

function timeAgo(ts?: string) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  return `${Math.floor(diff/3600)}h ago`;
}

export default function LogPanel({ logs, faces, onRefresh }: Props) {
  const s: Record<string, React.CSSProperties> = {
    header: { display:"flex", alignItems:"center", gap:8, marginBottom:14 },
    icon:   { width:28, height:28, borderRadius:8, background:"rgba(255,179,0,0.12)",
               display:"flex", alignItems:"center", justifyContent:"center" },
    row:    { display:"flex", flexDirection:"column", gap:8, padding:"12px 0",
               borderBottom:"1px solid rgba(255,255,255,0.05)", animation:"fadeInUp 0.3s ease" },
    avatar: { width:44, height:44, borderRadius:8, objectFit:"cover" as const, flexShrink:0 },
    avatarPH:{ width:44, height:44, borderRadius:8, flexShrink:0, background:"rgba(255,255,255,0.05)",
               display:"flex", alignItems:"center", justifyContent:"center" },
    comparisonContainer: { display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.02)",
                            padding:"6px 10px", borderRadius:10, border:"1px solid rgba(255,255,255,0.04)" },
    photoLabel: { fontSize:8, color:"var(--text-muted)", textAlign:"center", marginTop:2, display:"block", textTransform:"uppercase" }
  };

  return (
    <div>
      <div style={s.header}>
        <div style={s.icon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb300" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <span style={{ fontWeight:700, fontSize:13, color:"var(--text-primary)" }}>Detection Log</span>
        <button onClick={onRefresh} style={{ marginLeft:"auto", background:"none", border:"none",
          color:"var(--text-muted)", cursor:"pointer", fontSize:11, display:"flex", alignItems:"center", gap:4 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
          </svg>
          Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <div style={{ textAlign:"center", padding:"28px 0", color:"var(--text-muted)", fontSize:12 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
            style={{ margin:"0 auto 8px", display:"block" }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          No detections yet. Enable Face Matcher to start.
        </div>
      ) : (
        <div style={{ maxHeight:340, overflowY:"auto" }}>
          {logs.map(log => {
            const isKnown = log.person_name !== "Unknown";
            const ts = log.created_at || log.timestamp;
            const matchedFace = faces.find(f => f.name.toLowerCase() === log.person_name.toLowerCase());

            return (
              <div key={log.id} style={s.row}>
                {/* Header of Log item */}
                <div style={{ display:"flex", justifyContent:"between", alignItems:"center", width:"100%" }}>
                  <div style={{ fontWeight:700, fontSize:12, color: isKnown ? "var(--green)" : "var(--red)" }}>
                    {isKnown ? "✓ " : "? "}{log.person_name}
                  </div>
                  <div style={{ fontSize:10, color:"var(--text-muted)", marginLeft:"auto" }}>
                    {timeAgo(ts)}
                  </div>
                </div>

                {/* Subtitle / confidence */}
                <div style={{ fontSize:11, color:"var(--text-muted)" }}>
                  Confidence: <span style={{ color:"var(--text-primary)", fontFamily:"'JetBrains Mono', monospace", fontWeight:600 }}>
                    {Math.round(log.confidence * 100)}%
                  </span>
                </div>

                {/* Comparison UI (Live Chunk vs Bucket Image) */}
                <div style={s.comparisonContainer}>
                  {/* Left: Live Chunk */}
                  <div>
                    <div style={{ position: "relative", width: 44, height: 44 }}>
                      {log.snapshot_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={log.snapshot_url} 
                          alt="Live" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const placeholder = document.getElementById(`live-ph-${log.id}`);
                            if (placeholder) placeholder.style.display = 'flex';
                          }}
                          style={{
                            ...s.avatar, 
                            position: "absolute",
                            top: 0,
                            left: 0,
                            border:`2px solid ${isKnown ? "var(--green)" : "var(--red)"}` 
                          }} 
                        />
                      )}
                      <div 
                        id={`live-ph-${log.id}`}
                        style={{ 
                          ...s.avatarPH, 
                          display: log.snapshot_url ? "none" : "flex",
                          border:`2px solid ${isKnown ? "var(--green)" : "var(--red)"}`
                        }}
                      >
                        <span style={{ fontSize:10 }}>Live</span>
                      </div>
                    </div>
                    <span style={s.photoLabel}>Live Crop</span>
                  </div>

                  {/* Middle Arrow / Status indicator */}
                  <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
                    <span style={{ fontSize:14, color: isKnown ? "var(--green)" : "var(--text-muted)" }}>
                      {isKnown ? "⟶" : "⤏"}
                    </span>
                    <span style={{ fontSize:8, fontWeight:700, color: isKnown ? "var(--green)" : "var(--red)",
                      background: isKnown ? "rgba(0,255,136,0.1)" : "rgba(255,59,92,0.1)",
                      padding:"1px 4px", borderRadius:4 }}>
                      {isKnown ? "MATCHED" : "UNKNOWN"}
                    </span>
                  </div>

                  {/* Right: Bucket Image */}
                  <div>
                    <div style={{ position: "relative", width: 44, height: 44 }}>
                      {isKnown && matchedFace?.photo_url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={matchedFace.photo_url} 
                            alt="Enrolled" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              const placeholder = document.getElementById(`bucket-ph-${log.id}`);
                              if (placeholder) placeholder.style.display = 'flex';
                            }}
                            style={{
                              ...s.avatar, 
                              position: "absolute",
                              top: 0,
                              left: 0,
                              border:"2px solid var(--violet)" 
                            }} 
                          />
                          <div 
                            id={`bucket-ph-${log.id}`}
                            style={{ 
                              ...s.avatarPH, 
                              display: "none", 
                              border:"2px dashed rgba(255,255,255,0.1)" 
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
                              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                            </svg>
                          </div>
                        </>
                      ) : (
                        <div style={{ ...s.avatarPH, border:"2px dashed rgba(255,255,255,0.1)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
                            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <span style={s.photoLabel}>Bucket</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
