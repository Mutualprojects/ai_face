"use client";

import { useState } from "react";

export default function CameraModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const res = await fetch(`http://${host}:5000/api/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, place, rtsp_url: rtsp })
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        alert("Failed to add camera");
      }
    } catch (e) {
      alert("Error adding camera");
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#111", padding: 24, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", width: 400 }}>
        <h2 style={{ margin: "0 0 16px", color: "#fff", fontSize: 20 }}>Register Camera</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input required placeholder="Camera Name (e.g. Main Gate)" value={name} onChange={e => setName(e.target.value)}
            style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14 }} />
          <input required placeholder="Location" value={place} onChange={e => setPlace(e.target.value)}
            style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14 }} />
          <input required placeholder="RTSP URL" value={rtsp} onChange={e => setRtsp(e.target.value)}
            style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14 }} />
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "12px 0", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold" }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 1, padding: "12px 0", borderRadius: 8, background: "var(--violet)", color: "#fff", border: "none", cursor: "pointer", fontWeight: "bold" }}>
              {loading ? "Adding..." : "Add Camera"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
