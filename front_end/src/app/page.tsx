"use client";

import { useEffect, useState } from "react";
import WebRTCStream from "./components/WebRTCStream";
import CameraModal from "./components/CameraModal";

export default function Home() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string>("camera1");
  const [showModal, setShowModal] = useState(false);

  const fetchCameras = async () => {
    try {
      const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const res = await fetch(`http://${host}:5000/api/cameras`);
      if (res.ok) {
        const data = await res.json();
        setCameras(data);
        if (data.length > 0 && !data.find((c:any) => c.id === activeCameraId)) {
          setActiveCameraId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCameras();
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-deep)" }}>
      {showModal && <CameraModal onClose={() => setShowModal(false)} onSuccess={fetchCameras} />}
      {/* Ambient background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div style={{ position:"absolute", top:"-10%", left:"20%", width:600, height:600,
          borderRadius:"50%", background:"radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />
        <div style={{ position:"absolute", bottom:"10%", right:"10%", width:500, height:500,
          borderRadius:"50%", background:"radial-gradient(circle, rgba(0,200,100,0.05) 0%, transparent 70%)" }} />
        <div style={{ position:"absolute", top:"40%", left:"-5%", width:400, height:400,
          borderRadius:"50%", background:"radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)" }} />
      </div>

      {/* Header */}
      <header style={{ borderBottom:"1px solid var(--border)", background:"rgba(6,8,16,0.7)", backdropFilter:"blur(20px)" }}>
        <div style={{ maxWidth:1400, margin:"0 auto", padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {/* Logo */}
            <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
              display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 20px rgba(124,58,237,0.4)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, letterSpacing:"-0.02em", color:"var(--text-primary)" }}>
                Sentinel <span className="shimmer">AI</span>
              </div>
              <div style={{ fontSize:11, color:"var(--text-muted)", letterSpacing:"0.05em" }}>FACIAL RECOGNITION SYSTEM</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:20, fontSize:12, color:"var(--text-muted)" }}>
            
            <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
              <select 
                value={activeCameraId} 
                onChange={(e) => setActiveCameraId(e.target.value)}
                style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "4px 8px", outline: "none", cursor: "pointer" }}
              >
                {cameras.map(c => (
                  <option key={c.id} value={c.id} style={{ background: "#111" }}>{c.name} ({c.place})</option>
                ))}
              </select>
              <button onClick={() => setShowModal(true)} style={{ background: "var(--violet)", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontWeight: "bold" }}>+ Add Camera</button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span className="dot-live" />
              <span style={{ color:"var(--green)", fontWeight:600 }}>SYSTEM ONLINE</span>
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>
              {new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth:1400, margin:"0 auto", padding:"28px 24px" }}>
        <WebRTCStream key={activeCameraId} streamName={activeCameraId} serverPort="1984" />
      </main>

      <footer style={{ borderTop:"1px solid var(--border)", padding:"16px 24px", textAlign:"center",
        fontSize:11, color:"var(--text-muted)", letterSpacing:"0.05em" }}>
        © 2026 SENTINEL AI · POWERED BY INSIGHTFACE buffalo_l · WEBRTC ZERO-LATENCY
      </footer>
    </div>
  );
}
