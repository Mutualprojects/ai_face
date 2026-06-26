"use client";
import { useRef, useState } from "react";

interface Props {
  onSuccess: () => void;
  canCapture: boolean;
  captureFrame: () => string | null;
}

export default function RegisterPanel({ onSuccess, canCapture, captureFrame }: Props) {
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const capture = () => {
    const f = captureFrame();
    if (f) { setImage(f); setError(""); setSuccess(""); }
    else setError("Stream not ready — wait for live feed.");
  };

  const reset = () => { setImage(null); setError(""); setSuccess(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a name.");
    if (!image) return setError("Capture or upload a face photo first.");
    setLoading(true); setError(""); setSuccess("");
    try {
      // Use the Next.js /api/register proxy — it handles Supabase Storage uploads
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), image }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`✓ ${name.trim()} registered successfully!`);
        setName(""); setImage(null);
        onSuccess();
      } else { setError(data.error || "Registration failed."); }
    } catch { setError("Network error — check backend."); }
    finally { setLoading(false); }
  };

  const s: Record<string, React.CSSProperties> = {
    panel:   { display:"flex", flexDirection:"column", gap:16 },
    label:   { fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:"var(--text-muted)", textTransform:"uppercase", marginBottom:4 },
    input:   { width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:10, padding:"10px 14px", color:"var(--text-primary)", fontSize:14, outline:"none" },
    btnPri:  { background:"linear-gradient(135deg,#7c3aed,#4f46e5)", color:"#fff", border:"none",
                borderRadius:10, padding:"11px 0", fontSize:13, fontWeight:700, cursor:"pointer", width:"100%",
                boxShadow:"0 4px 20px rgba(124,58,237,0.35)", transition:"all 0.2s" },
    btnSec:  { background:"rgba(255,255,255,0.05)", color:"var(--text-primary)", border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:10, padding:"8px 14px", fontSize:12, fontWeight:600, cursor:"pointer" },
  };

  return (
    <div style={s.panel}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
        <div style={{ width:28, height:28, borderRadius:8, background:"rgba(124,58,237,0.2)",
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
        </div>
        <span style={{ fontWeight:700, fontSize:13, color:"var(--text-primary)" }}>Register New Face</span>
      </div>

      {/* Image preview / capture area */}
      <div style={{ aspectRatio:"4/3", borderRadius:14, overflow:"hidden", background:"rgba(255,255,255,0.02)",
        border:"1px dashed rgba(255,255,255,0.1)", position:"relative", display:"flex",
        alignItems:"center", justifyContent:"center" }}>
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            <button onClick={reset} style={{ position:"absolute", top:8, right:8,
              background:"rgba(0,0,0,0.7)", border:"1px solid rgba(255,255,255,0.2)",
              color:"#fff", borderRadius:8, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>
              ✕ Clear
            </button>
          </>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:20, textAlign:"center" }}>
            <div style={{ width:48, height:48, borderRadius:"50%", border:"2px dashed rgba(255,255,255,0.15)",
              display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
            <p style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1.5 }}>
              Capture from live feed or upload a clear portrait photo
            </p>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={capture} disabled={!canCapture} suppressHydrationWarning style={{...s.btnSec,
                color: canCapture ? "var(--green)" : "var(--text-muted)",
                borderColor: canCapture ? "rgba(0,255,136,0.3)" : "rgba(255,255,255,0.08)" }}>
                📷 Capture
              </button>
              <button onClick={() => fileRef.current?.click()} style={s.btnSec}>
                ⬆ Upload
              </button>
            </div>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onloadend = () => setImage(r.result as string);
          r.readAsDataURL(f);
        }} />

      <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:12 }}>
        <div>
          <div style={s.label}>Full Name</div>
          <input style={s.input} placeholder="e.g. John Doe" value={name}
            onChange={e => setName(e.target.value)} />
        </div>

        {error && <p style={{ fontSize:12, color:"var(--red)", margin:0 }}>⚠ {error}</p>}
        {success && <p style={{ fontSize:12, color:"var(--green)", margin:0 }}>{success}</p>}

        <button type="submit" disabled={loading || !name.trim() || !image} style={{
          ...s.btnPri, opacity: (loading || !name.trim() || !image) ? 0.45 : 1 }}>
          {loading ? "Registering…" : "Register Profile"}
        </button>
      </form>
    </div>
  );
}
