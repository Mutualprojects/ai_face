"use client";
import { RegisteredFace } from "./types";

interface Props {
  faces: RegisteredFace[];
  onDelete: (id: string) => void;
}

export default function GalleryPanel({ faces, onDelete }: Props) {
  const s: Record<string, React.CSSProperties> = {
    header: { display:"flex", alignItems:"center", gap:8, marginBottom:12 },
    icon:   { width:28, height:28, borderRadius:8, background:"#ec489915",
               display:"flex", alignItems:"center", justifyContent:"center" },
    grid:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxHeight:320, overflowY:"auto", paddingRight:4 },
    card:   { background:"#f9fafb", border:"1px solid #e5e7eb",
               borderRadius:12, padding:"10px", display:"flex", flexDirection:"column", gap:8,
               alignItems:"center", position:"relative", transition:"border-color 0.2s" },
    avatar: { width:56, height:56, borderRadius:10, objectFit:"cover" as const,
               border:"2px solid #10b981" },
    name:   { fontSize:11.5, fontWeight:700, color:"#111827", textAlign:"center" as const,
               overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const, width:"100%" },
    del:    { position:"absolute" as const, top:6, right:6, background:"#ef444415",
               border:"1px solid #ef444430", borderRadius:6, color:"#ef4444",
               cursor:"pointer", width:20, height:20, display:"flex", alignItems:"center",
               justifyContent:"center", fontSize:10, fontWeight:700 },
    empty:  { display:"flex", flexDirection:"column" as const, alignItems:"center", gap:8,
               padding:"32px 16px", color:"#6b7280", fontSize:12, textAlign:"center" as const },
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
      <div style={s.header}>
        <div style={s.icon}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2.5" strokeLinecap="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </div>
        <span style={{ fontWeight:700, fontSize:13, color:"#111827" }}>
          Enrolled Profiles
        </span>
        <span style={{ marginLeft:"auto", fontSize:11, background:"#6366f115",
          color:"#4f46e5", borderRadius:20, padding:"2px 8px", fontWeight:700 }}>
          {faces.length}
        </span>
      </div>

      {faces.length === 0 ? (
        <div style={s.empty}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
            <circle cx="9" cy="7" r="4"/><path d="M3 20c0-4 2.7-7 6-7"/>
            <line x1="17" y1="14" x2="23" y2="14"/><line x1="20" y1="11" x2="20" y2="17"/>
          </svg>
          No faces enrolled yet.<br />Register a profile to start recognition.
        </div>
      ) : (
        <div style={s.grid}>
          {faces.map(f => (
            <div key={f.id} style={s.card}>
              {f.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={f.photo_url} alt={f.name} style={s.avatar} />
                : <div style={{ ...s.avatar, background:"#6366f115",
                    display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    </svg>
                  </div>
              }
              <div style={s.name} title={f.name}>{f.name}</div>
              <button style={s.del} title="Delete"
                onClick={() => {
                  if (confirm(`Remove "${f.name}" from the database?`)) onDelete(f.id);
                }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
