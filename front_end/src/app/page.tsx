"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, Plus, Maximize2, Columns2, Grid2x2, Grid3x3, Activity, Cctv } from "lucide-react";
import WebRTCStream from "./components/WebRTCStream";
import CameraModal from "./components/CameraModal";
import LogPanel from "./components/sentinel/LogPanel";
import GalleryPanel from "./components/sentinel/GalleryPanel";

function HomeContent() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [readyCameras, setReadyCameras] = useState<Set<string>>(new Set());
  const [activeCameraId, setActiveCameraId] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const searchParams = useSearchParams();
  const isGridParam = searchParams.get("grid") === "true";
  const [gridMode, setGridMode] = useState<"single" | "dual" | "quad" | "matrix">(isGridParam ? "matrix" : "single");

  useEffect(() => {
    if (searchParams.get("grid") === "true") {
      setGridMode("matrix");
    }
  }, [searchParams]);

  const currentTab = (searchParams.get("tab") || "register") as "register" | "visitors" | "gallery" | "log";

  // Fetch which paths are READY from MediaMTX API
  const fetchReadyCameras = useCallback(async (): Promise<Set<string>> => {
    try {
      const res = await fetch("/mtx/v3/paths/list");
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
      const fetchList = async () => {
        try {
          const res = await fetch("/flask/api/cameras", {
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

  // Determine cameras to render in grid
  const gridCameras = useMemo(() => {
    if (!cameras || cameras.length === 0) return [];
    if (gridMode === "single") {
      const selected = cameras.find(c => c.id === activeCameraId);
      return selected ? [selected] : [cameras[0]];
    }
    if (gridMode === "dual") return cameras.slice(0, 2);
    if (gridMode === "quad") return cameras.slice(0, 4);
    return cameras; // matrix mode: all cameras
  }, [cameras, activeCameraId, gridMode]);

  const onlineCount = cameras.filter(c => readyCameras.has(c.id)).length;
  const activeCam = cameras.find(c => c.id === activeCameraId);
  const isGrid = gridMode !== "single";

  const GRID_MODES = [
    { id: "single" as const, label: "1x1", icon: Maximize2, hint: "Single" },
    { id: "dual" as const, label: "2x1", icon: Columns2, hint: "Dual" },
    { id: "quad" as const, label: "2x2", icon: Grid2x2, hint: "Quad" },
    { id: "matrix" as const, label: "ALL", icon: Grid3x3, hint: "Matrix" },
  ];

  return (
    <div style={{ width: "100%" }}>
      {showModal && <CameraModal onClose={() => setShowModal(false)} onSuccess={fetchCameras} />}

      {/* Camera Selector Bar — Only shown on live video stream pages */}
      {showCameraSelector && currentTab !== "log" && currentTab !== "gallery" && (
        <div className="snt-cambar">
          <div className="snt-cambrand">
            <div className="snt-cambrand-icon">
              <Camera size={16} color="#fff" />
            </div>
            <div className="snt-cambrand-text">
              <span className="snt-cambrand-label">Live Camera Source</span>
              <span className="snt-cambrand-sub">
                {onlineCount}/{cameras.length} streams online
              </span>
            </div>
          </div>

          {/* Camera chips */}
          <div className="snt-chiprow">
            {cameras.map(c => {
              const online = readyCameras.has(c.id);
              const active = c.id === activeCameraId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCameraId(c.id)}
                  className={`snt-chip ${active ? "snt-chip-active" : ""}`}
                >
                  <span className={`snt-chip-dot ${online ? "snt-chip-dot-on" : "snt-chip-dot-off"}`} />
                  <span className="snt-chip-name">{c.name}</span>
                  <span className="snt-chip-place">{c.place}</span>
                </button>
              );
            })}
          </div>

          {/* Grid layout switcher */}
          <div className="snt-gridseg">
            {GRID_MODES.map(m => {
              const Icon = m.icon;
              const act = gridMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setGridMode(m.id)}
                  title={m.hint}
                  className={`snt-gridseg-btn ${act ? "snt-gridseg-active" : ""}`}
                >
                  <Icon size={13} />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <button onClick={() => setShowModal(true)} className="btn-primary snt-addcam">
            <Plus size={13} />
            Add Camera
          </button>
        </div>
      )}

      {/* Main Content View */}
      <main style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 28px 0" }}>
        {currentTab === "log" ? (
          /* Full Page Detection Log View (No video streams) */
          <div className="snt-pagecard">
            <LogPanel logs={[]} faces={[]} onRefresh={fetchCameras} autoRefresh={true} />
          </div>
        ) : currentTab === "gallery" ? (
          /* Full Page Face Gallery View */
          <div className="snt-pagecard">
            <GalleryPanel faces={[]} onDelete={() => {}} />
          </div>
        ) : gridCameras.length > 0 ? (
          gridMode === "single" ? (
            /* Single view — hero stream with full sidebar */
            <div className="snt-hero">
              <WebRTCStream streamName={activeCam?.id || gridCameras[0].id} serverPort="8891" initialTab={currentTab} detectionOnly={false} />
            </div>
          ) : (
            /* Live Stream Grid View (compact tiles) */
            <div className="snt-grid">
              {gridCameras.map(cam => {
                const online = readyCameras.has(cam.id);
                return (
                  <div key={cam.id} className="snt-gridtile">
                    <div className="snt-tilehead">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span className={`snt-chip-dot ${online ? "snt-chip-dot-on" : "snt-chip-dot-off"}`} />
                        <span className="snt-tilehead-name">{cam.name} <span style={{ opacity: 0.7, fontWeight: 500 }}>({cam.place})</span></span>
                      </div>
                      <span className="snt-tilehead-src">
                        <Cctv size={10} color="var(--text-muted)" />
                        {cam.source_type === "device" ? `USB Dev #${cam.device_index ?? 0}` : "RTSP"}
                      </span>
                    </div>
                    <WebRTCStream streamName={cam.id} serverPort="8891" initialTab={currentTab} detectionOnly={true} />
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="snt-loading">
            <div className="snt-spin" />
            <span>Loading camera feeds…</span>
          </div>
        )}
      </main>

      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "16px 24px",
        textAlign: "center",
        fontSize: 11,
        color: "var(--text-faint)",
        letterSpacing: "0.04em",
      }}>
        © 2026 SENTINEL AI · POWERED BY INSIGHTFACE buffalo_l · WEBRTC ZERO-LATENCY MATRIX
      </footer>

      <style>{`
        .snt-cambar{display:flex;align-items:center;gap:14;flex-wrap:wrap;padding:14px 16px;margin-bottom:20px;
          background:var(--bg-panel);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);
          border-radius:18px;border:1px solid var(--border-strong);box-shadow:var(--shadow-md)}

        .snt-cambrand{display:flex;align-items:center;gap:10;flex-shrink:0}
        .snt-cambrand-icon{width:36px;height:36px;border-radius:12px;
          background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
          box-shadow:0 3px 10px rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center}
        .snt-cambrand-text{display:flex;flex-direction:column;gap:1px}
        .snt-cambrand-label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-faint)}
        .snt-cambrand-sub{font-size:12px;font-weight:700;color:var(--text-primary)}

        .snt-chiprow{flex:1 1 280px;min-width:200px;display:flex;gap:8;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:thin}
        .snt-chip{display:inline-flex;align-items:center;gap:6;padding:7px 11px;border-radius:12px;white-space:nowrap;
          background:var(--bg-panel);border:1px solid var(--border-strong);color:var(--text-secondary);cursor:pointer;
          font-family:inherit;font-size:11.5px;font-weight:650;transition:all .18s ease}
        .snt-chip:hover{border-color:var(--violet);box-shadow:var(--shadow-sm)}
        .snt-chip-active{border-color:var(--violet);background:var(--violet-soft);color:var(--violet-deep);box-shadow:0 0 0 3px rgba(99,102,241,0.12)}
        .snt-chip-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .snt-chip-dot-on{background:var(--green);box-shadow:0 0 6px var(--green)}
        .snt-chip-dot-off{background:var(--red);opacity:0.8}
        .snt-chip-place{font-size:10px;font-weight:500;opacity:0.65}

        .snt-gridseg{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:12px;flex-shrink:0;
          background:var(--bg-input);border:1px solid var(--border-strong)}
        .snt-gridseg-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border:none;border-radius:9px;cursor:pointer;
          background:transparent;color:var(--text-muted);font-family:inherit;font-size:11px;font-weight:700;transition:all .15s ease}
        .snt-gridseg-btn:hover{color:var(--violet-deep)}
        .snt-gridseg-active{background:var(--bg-panel);color:var(--violet-deep);box-shadow:var(--shadow-sm)}

        .snt-addcam{flex-shrink:0}

        .snt-pagecard{background:var(--bg-panel);border-radius:20px;padding:24px;border:1px solid var(--border);box-shadow:var(--shadow-md)}
        .snt-hero{width:100%}

        .snt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
        .snt-gridtile{border-radius:18px;overflow:hidden;border:1px solid var(--border-strong);box-shadow:var(--shadow-sm);background:var(--bg-panel)}
        .snt-tilehead{display:flex;justify-content:space-between;align-items:center;gap:8;padding:10px 14px;background:var(--bg-card);color:var(--text-primary)}
        .snt-tilehead-name{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .snt-tilehead-src{display:inline-flex;align-items:center;gap:5;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)}

        .snt-loading{display:flex;align-items:center;justify-content:center;gap:12;height:280px;color:var(--text-muted);
          font-size:14px;background:var(--bg-panel);border-radius:16px;border:1px solid var(--border)}
        .snt-spin{width:22px;height:22px;border:3px solid rgba(99,102,241,0.25);border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite}

        @media (max-width: 720px){
          .snt-grid{grid-template-columns:1fr}
          .snt-gridseg{width:100%;justify-content:space-between}
          .snt-addcam{width:100%;justify-content:center}
        }
      `}</style>
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
