"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import WebRTCStream from "./components/WebRTCStream";
import CameraModal from "./components/CameraModal";

function HomeContent() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [readyCameras, setReadyCameras] = useState<Set<string>>(new Set());
  const [activeCameraId, setActiveCameraId] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") || "register") as "register" | "gallery" | "log";

  // Fetch which paths are READY from MediaMTX API
  const fetchReadyCameras = useCallback(async (): Promise<Set<string>> => {
    try {
      const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const res = await fetch(`http://${host}:9997/v3/paths/list`);
      if (res.ok) {
        const data = await res.json();
        const ready = new Set<string>(
          (data.items || [])
            .filter((p: any) => p.ready === true)
            .map((p: any) => p.name as string)
        );
        setReadyCameras(ready);
        return ready;
      }
    } catch {}
    return new Set<string>();
  }, []);

  const fetchCameras = useCallback(async () => {
    try {
      const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
      
      const fetchList = async () => {
        try {
          const res = await fetch(`http://${host}:5000/api/cameras`, {
            headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" }
          });
          if (res.ok) return await res.json();
        } catch (err) {
          console.warn("Backend API not online yet, retrying...", err);
        }
        return null;
      };

      const [data, ready] = await Promise.all([
        fetchList(),
        fetchReadyCameras(),
      ]);

      if (data) {
        setCameras(data);

        // Smart default: prefer first ONLINE camera from MediaMTX, fall back to first camera
        setActiveCameraId(prev => {
          if (prev && data.find((c: any) => c.id === prev)) return prev; // keep current selection if still valid
          const firstOnline = data.find((c: any) => ready.has(c.id));
          const fallback = data[0];
          return (firstOnline || fallback)?.id || prev;
        });
      }
    } catch (e) {
      console.error("fetchCameras error:", e);
    }
  }, [fetchReadyCameras]);

  useEffect(() => {
    fetchCameras();
    // Refresh camera list & online status every 30s
    const iv = setInterval(fetchCameras, 30000);
    return () => clearInterval(iv);
  }, [fetchCameras]);

  const showCameraSelector = cameras.length > 0;

  return (
    <div style={{ width: "100%" }}>
      {showModal && <CameraModal onClose={() => setShowModal(false)} onSuccess={fetchCameras} />}

      {/* Camera Selector Bar */}
      {showCameraSelector && (
        <div style={{
          background: "#ffffff",
          borderRadius: 12,
          padding: "12px 20px",
          marginBottom: 20,
          boxShadow: "var(--shadow-sm)",
          border: "1px solid rgba(0,0,0,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Camera icon */}
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: "var(--bg-deep)",
              border: "1px solid rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>

            <select
              value={activeCameraId}
              onChange={(e) => setActiveCameraId(e.target.value)}
              style={{
                background: "var(--bg-deep)",
                color: "var(--text-primary)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                padding: "7px 12px",
                outline: "none",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "inherit",
                minWidth: 200,
              }}
            >
              {cameras.map(c => {
                const online = readyCameras.has(c.id);
                return (
                  <option key={c.id} value={c.id}>
                    {online ? "🟢" : "🔴"} {c.name} ({c.place})
                  </option>
                );
              })}
            </select>

            <button
              onClick={() => setShowModal(true)}
              style={{
                background: "var(--violet)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12.5,
                fontFamily: "inherit",
                boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
                transition: "all 0.2s ease",
              }}
            >
              + Add Camera
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dot-live" />
            <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em" }}>SYSTEM ONLINE</span>
          </div>
        </div>
      )}

      {/* Main */}
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "0 0 28px 0" }}>
        {activeCameraId ? (
          <WebRTCStream key={activeCameraId} streamName={activeCameraId} serverPort="8889" initialTab={currentTab} />
        ) : (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 300, color: "var(--text-muted)", fontSize: 14,
            background: "#ffffff", borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.06)",
          }}>
            Loading cameras…
          </div>
        )}
      </main>

      <footer style={{
        borderTop: "1px solid rgba(0,0,0,0.06)",
        padding: "16px 24px",
        textAlign: "center",
        fontSize: 11,
        color: "var(--text-faint)",
        letterSpacing: "0.04em",
      }}>
        © 2026 SENTINEL AI · POWERED BY INSIGHTFACE buffalo_l · WEBRTC ZERO-LATENCY
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "var(--text-muted)", fontSize: 14 }}>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
