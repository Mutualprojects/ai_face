"use client";

import { useState, useEffect } from "react";

interface LocalDevice {
  device_index: number;
  width: number;
  height: number;
}

export default function CameraModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [sourceType, setSourceType] = useState<"rtsp" | "device">("rtsp");
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [rtsp, setRtsp] = useState("");
  const [deviceIndex, setDeviceIndex] = useState<number>(0);
  const [localDevices, setLocalDevices] = useState<LocalDevice[]>([]);
  const [fetchingDevices, setFetchingDevices] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sourceType === "device") {
      fetchLocalDevices();
    }
  }, [sourceType]);

  const fetchLocalDevices = async () => {
    setFetchingDevices(true);
    try {
      const res = await fetch("/flask/api/cameras/local_devices");
      if (res.ok) {
        const data = await res.json();
        const devs = data.devices || [];
        setLocalDevices(devs);
        if (devs.length > 0) {
          setDeviceIndex(devs[0].device_index);
        }
      }
    } catch (e) {
      console.warn("Could not probe server local devices:", e);
    }
    setFetchingDevices(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = sourceType === "device"
        ? { name, place, source_type: "device", device_index: Number(deviceIndex) }
        : { name, place, source_type: "rtsp", rtsp_url: rtsp };

      const res = await fetch("/flask/api/cameras", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add camera");
      }
    } catch (e) {
      setError("Error adding camera");
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15,23,42,0.45)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 20,
      animation: "fadeInUp 0.2s ease",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-panel)",
          padding: 26,
          borderRadius: 20,
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-xl)",
          width: "100%",
          maxWidth: 440,
          animation: "fadeScaleIn 0.22s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            boxShadow: "0 3px 12px rgba(99,102,241,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, color: "var(--text-primary)", fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Register Camera
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              Add a camera stream to the live matrix
            </p>
          </div>
        </div>

        {/* Source Type Toggle */}
        <div style={{
          display: "flex",
          background: "var(--bg-main, rgba(15,23,42,0.4))",
          padding: 3,
          borderRadius: 12,
          border: "1px solid var(--border)",
          marginBottom: 16
        }}>
          <button
            type="button"
            onClick={() => setSourceType("rtsp")}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: sourceType === "rtsp" ? "var(--bg-panel, #1e293b)" : "transparent",
              color: sourceType === "rtsp" ? "#6366f1" : "var(--text-muted)",
              boxShadow: sourceType === "rtsp" ? "0 2px 8px rgba(0,0,0,0.15)" : "none"
            }}
          >
            RTSP Stream
          </button>
          <button
            type="button"
            onClick={() => setSourceType("device")}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 9,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: sourceType === "device" ? "var(--bg-panel, #1e293b)" : "transparent",
              color: sourceType === "device" ? "#8b5cf6" : "var(--text-muted)",
              boxShadow: sourceType === "device" ? "0 2px 8px rgba(0,0,0,0.15)" : "none"
            }}
          >
            Server USB Webcam
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.07em", marginBottom: 6 }}>
              Camera Name *
            </label>
            <input required placeholder={sourceType === "device" ? "e.g. Server Webcam" : "e.g. Main Gate"} value={name} onChange={e => setName(e.target.value)}
              className="input-dark" style={{ width: "100%", padding: "11px 14px", fontSize: 13.5 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.07em", marginBottom: 6 }}>
              Location *
            </label>
            <input required placeholder={sourceType === "device" ? "e.g. Control Room" : "e.g. Entrance Hall"} value={place} onChange={e => setPlace(e.target.value)}
              className="input-dark" style={{ width: "100%", padding: "11px 14px", fontSize: 13.5 }} />
          </div>

          {sourceType === "rtsp" ? (
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.07em", marginBottom: 6 }}>
                RTSP URL *
              </label>
              <input required placeholder="rtsp://user:pass@host:554/stream" value={rtsp} onChange={e => setRtsp(e.target.value)}
                className="input-dark" style={{ width: "100%", padding: "11px 14px", fontSize: 13.5, fontFamily: "var(--font-mono)" }} />
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.07em" }}>
                  Select Server Device *
                </label>
                <button
                  type="button"
                  onClick={fetchLocalDevices}
                  style={{ background: "none", border: "none", color: "#6366f1", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                >
                  {fetchingDevices ? "Refreshing…" : "Scan Devices"}
                </button>
              </div>

              {localDevices.length > 0 ? (
                <select
                  value={deviceIndex}
                  onChange={(e) => setDeviceIndex(Number(e.target.value))}
                  className="input-dark"
                  style={{ width: "100%", padding: "11px 14px", fontSize: 13.5 }}
                >
                  {localDevices.map((dev) => (
                    <option key={dev.device_index} value={dev.device_index}>
                      Server Webcam #{dev.device_index} ({dev.width}x{dev.height})
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min="0"
                    max="9"
                    required
                    value={deviceIndex}
                    onChange={(e) => setDeviceIndex(Number(e.target.value))}
                    className="input-dark"
                    placeholder="Device Index (e.g. 0)"
                    style={{ flex: 1, padding: "11px 14px", fontSize: 13.5 }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Index 0 = /dev/video0</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "9px 12px", color: "#dc2626", fontSize: 12, fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <button type="button" onClick={onClose}
              className="btn-secondary" style={{ flex: 1, padding: "11px 0", fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="btn-primary" style={{ flex: 1, padding: "11px 0", fontSize: 13 }}>
              {loading ? "Adding…" : "Add Camera"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
