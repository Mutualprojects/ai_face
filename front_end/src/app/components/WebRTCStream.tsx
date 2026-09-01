"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  UserPlus,
  Users,
  UserCheck,
  ScrollText,
  Video,
  RefreshCw,
  Zap,
  Activity,
  Radio,
  ScanFace,
  MonitorPlay,
  WifiOff,
  Sparkles,
} from "lucide-react";
import { Detection, RegisteredFace, FaceLog, StreamMode, PlayState } from "./sentinel/types";
import BoundingBoxes from "./sentinel/BoundingBoxes";
import RegisterPanel from "./sentinel/RegisterPanel";
import VisitorsPanel from "./sentinel/VisitorsPanel";
import GalleryPanel from "./sentinel/GalleryPanel";
import LogPanel from "./sentinel/LogPanel";
import ComparisonPanel from "./sentinel/ComparisonPanel";


const WEBRTC_TIMEOUT = 20000;

// Backend proxied through Next.js rewrite — works from any browser/IP
function getBackendUrl() {
  return "/flask";
}

interface Props {
  streamName?: string;
  serverPort?: string;
  initialTab?: "register" | "visitors" | "gallery" | "log";
  detectionOnly?: boolean;
}

interface DetectionHistoryItem extends Detection {
  timestamp: number;
  id: string;
}

// ─── status chip ─────────────────────────────────────────────────
function Chip({ dot, label, tint }: { dot: string; label: string; tint?: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700,
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 99, padding: "5px 11px", boxShadow: "var(--shadow-sm)",
      color: tint || "var(--text-secondary)", whiteSpace: "nowrap"
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />
      {label}
    </div>
  );
}

export default function WebRTCStream({ streamName = "camera1", serverPort = "8891", initialTab = "register", detectionOnly = false }: Props) {
  // Computed on client only to avoid SSR/client hydration mismatch
  const [backendUrl, setBackendUrl] = useState("/flask");
  const [cleanView, setCleanView] = useState(detectionOnly);
  useEffect(() => { setCleanView(detectionOnly); }, [detectionOnly]);
  useEffect(() => { setBackendUrl(getBackendUrl()); }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<StreamMode>("webrtc");
  const psRef = useRef<PlayState>("connecting");

  const [mode, setMode] = useState<StreamMode>("webrtc");
  const [ps, setPs] = useState<PlayState>("connecting");
  const [errMsg, setErrMsg] = useState("");
  const [fps, setFps] = useState<number | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [dbOk, setDbOk] = useState<boolean | null>(null);
  const [rtcOk, setRtcOk] = useState<boolean | null>(null);
  const [modelOk, setModelOk] = useState<boolean | null>(null);

  // Video dimensions (for bbox scaling)
  const [vidW, setVidW] = useState(0);
  const [vidH, setVidH] = useState(0);



  // Face matching
  const [matchOn, setMatchOn] = useState(true);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [bodies, setBodies] = useState<[number, number, number, number, number][]>([]);
  const [history, setHistory] = useState<DetectionHistoryItem[]>([]);

  // Sidebar tab
  const [tab, setTab] = useState<"register" | "visitors" | "gallery" | "log">(initialTab);

  // Keep tab state in sync with initialTab prop changes
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Pre-filled capture for registration from ComparisonPanel
  const [pendingRegisterCrop, setPendingRegisterCrop] = useState<string | null>(null);

  // Pre-filled capture for VISITOR registration from ComparisonPanel (CC camera)
  const [pendingVisitorCrop, setPendingVisitorCrop] = useState<string | null>(null);

  // Selected detection for popup modal
  const [modalDetection, setModalDetection] = useState<{ det: Detection; cameraName: string } | null>(null);


  // DB data
  const [faces, setFaces] = useState<RegisteredFace[]>([]);
  const [logs, setLogs] = useState<FaceLog[]>([]);

  // Stats
  const [totalScans, setTotalScans] = useState(0);
  const [matchedToday, setMatchedToday] = useState(0);

  // Presence analytics (confirmed 3-frame rule)
  const [presence, setPresence] = useState<{ name: string; confidence: number; seconds_ago: number; photo_url: string | null; crop: string | null }[]>([]);

  const setM = (m: StreamMode) => { setMode(m); modeRef.current = m; };
  const setPS = (s: PlayState) => { setPs(s); psRef.current = s; };

  // ── cleanup ──────────────────────────────────────────────────
  const sessionRef = useRef(0); // increment on every cleanup to invalidate stale callbacks

  const cleanup = useCallback(() => {
    sessionRef.current++;              // invalidate all in-flight callbacks
    if (timerRef.current) clearTimeout(timerRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);
    pcRef.current?.close(); pcRef.current = null;
    wsRef.current?.close(); wsRef.current = null;
    hlsRef.current?.destroy(); hlsRef.current = null;
    const v = videoRef.current;
    if (v) { v.src = ""; v.removeAttribute("src"); v.load(); }
    setFps(null);
  }, []);

  // ── track video dimensions ───────────────────────────────────
  // Note: vidW and vidH are synced directly from the backend detection poll
  // so that the SVG bounding boxes correctly scale over any video resolution.

  // ── FPS meter ────────────────────────────────────────────────
  const startFps = () => {
    const v = videoRef.current;
    if (!v || !("getVideoPlaybackQuality" in v)) return;
    let lf = 0, lt = performance.now();
    const tick = () => {
      if (psRef.current !== "playing" || !videoRef.current) return;
      const q = (v as any).getVideoPlaybackQuality();
      const now = performance.now();
      if (now - lt >= 1000) {
        setFps(Math.round((q.totalVideoFrames - lf) / ((now - lt) / 1000)));
        lf = q.totalVideoFrames; lt = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // ── HLS ────────────────────────────────────────────
  const startHLS = useCallback(() => {
    cleanup(); setPS("connecting"); setErrMsg("");
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const hlsPort = "8892";
    const url = `http://${host}:${hlsPort}/${streamName}/index.m3u8`;
    const v = videoRef.current; if (!v) return;
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        // Buffer: keep only 1s ahead — prevents 4s lag buildup
        maxBufferLength: 1,
        maxMaxBufferLength: 2,
        backBufferLength: 0,
        // LL-HLS sync: target 1s behind live edge
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        // Catch-up: if we fall behind, play at 2x to resync
        maxLiveSyncPlaybackRate: 2,
        // Fragment loading
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
      });
      hlsRef.current = hls;
      hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
        setPS("playing"); startFps();
      });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setPS("error"); setErrMsg(d.details); cleanup(); }
      });
    } else { setPS("error"); setErrMsg("HLS not supported."); }
     
  }, [cleanup, streamName]);

  // ── WebRTC ────────────────────────────────────────────
  const startWebRTC = useCallback(() => {
    cleanup(); setPS("connecting"); setErrMsg("");
    const session = sessionRef.current;
    const alive = () => session === sessionRef.current;

    const webrtcUrl = `/api/whep/${streamName}/whep`;
    const fallback = (msg: string) => {
      if (!alive()) return;
      console.warn("WebRTC fallback:", msg); cleanup(); setM("hls"); startHLS();
    };

    timerRef.current = setTimeout(() => {
      if (alive() && psRef.current !== "playing") fallback("WebRTC timeout");
    }, WEBRTC_TIMEOUT);

    try {
      // On LAN: skip public STUN — use host candidates only for sub-100ms ICE
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },  // fallback for non-LAN
        ],
        iceTransportPolicy: "all",
        // Prefer host candidates (LAN) before reflexive (internet STUN)
        iceCandidatePoolSize: 4,
      });
      pcRef.current = pc;

      // Add bandwidth constraint: 2Mbps max — prevents jitter buffer bloat
      const trx = pc.addTransceiver("video", { direction: "recvonly" });
      trx.setCodecPreferences(
        RTCRtpReceiver.getCapabilities("video")?.codecs
          // Prefer H.264 baseline for lowest decode latency
          .sort((a, b) =>
            (a.mimeType.toLowerCase().includes("h264") ? -1 : 0) -
            (b.mimeType.toLowerCase().includes("h264") ? -1 : 0)
          ) ?? []
      );

      pc.ontrack = ev => {
        if (!alive()) return;
        const vid = videoRef.current;
        if (vid && ev.streams[0]) {
          vid.srcObject = ev.streams[0];
          setPS("playing"); startFps();
          vid.play().catch(() => { vid.muted = true; vid.play().catch(() => { }); });
        }
      };

      pc.onconnectionstatechange = () => {
        if (!alive()) return;
        if (pc.connectionState === "connected") { setPS("playing"); startFps(); }
        else if (["failed", "disconnected"].includes(pc.connectionState)) {
          retryRef.current = setTimeout(() => {
            if (alive() && modeRef.current === "webrtc") startWebRTC();
          }, 2500);
        }
      };

      pc.createOffer()
        .then(o => pc.setLocalDescription(o))
        .then(async () => {
          if (!alive()) return;
          const sdp = pc.localDescription?.sdp;
          if (!sdp) throw new Error("No local SDP description");

          let res: Response | null = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            if (!alive()) return;
            try {
              res = await fetch(webrtcUrl, {
                method: "POST",
                body: sdp,
                headers: { "Content-Type": "application/sdp" },
              });
              if (res.ok) break;
            } catch (e) {
              // network exception
            }
            if (attempt < 4) {
              await new Promise((r) => setTimeout(r, 800));
            }
          }
          if (!res || !res.ok) throw new Error(`MediaMTX WHEP offer rejected (${res?.status || "network"})`);
          return res.text();
        })
        .then(sdpAnswer => {
          if (!alive() || !sdpAnswer) return;
          pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer }).catch(e => fallback(`SDP: ${e.message}`));
        })
        .catch(e => fallback(e.message));

    } catch (e: any) { fallback(e.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, startHLS, serverPort, streamName]);

  // ── status checks ────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    // Check Flask backend health
    try {
      const r = await fetch(`${backendUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      setDbOk(d.database_connected); setModelOk(d.model_loaded);
    } catch { setDbOk(false); }
    // Check MediaMTX via WHEP OPTIONS — any HTTP response (not a network error) means it's alive
    try {
      const r = await fetch(`/api/whep/${streamName}/whep`, {
        method: "OPTIONS",
        signal: AbortSignal.timeout(3000)
      });
      // status >= 100 means we got a real HTTP response from MediaMTX
      setRtcOk(r.status >= 100 && r.status < 600);
    } catch { setRtcOk(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, serverPort, streamName]);

  // ── init ─────────────────────────────────────────────────────
  useEffect(() => {
    checkStatus().then(() => { modeRef.current === "webrtc" ? startWebRTC() : startHLS(); });
    const iv = setInterval(checkStatus, 6000);
    return () => { clearInterval(iv); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, streamName]);

  const retry = () => { cleanup(); setRetryKey(k => k + 1); };
  const toggleMode = () => {
    const next: StreamMode = modeRef.current === "webrtc" ? "hls" : "webrtc";
    setM(next); cleanup(); setRetryKey(k => k + 1);
  };

  // ── DB loaders ───────────────────────────────────────────────
  const loadFaces = useCallback(async () => {
    try { const r = await fetch("/api/registered_faces"); if (r.ok) setFaces(await r.json()); } catch { }
  }, []);
  const loadLogs = useCallback(async () => {
    try { const r = await fetch("/api/face_logs"); if (r.ok) setLogs(await r.json()); } catch { }
  }, []);
  const deleteFace = async (id: string) => {
    await fetch(`/api/registered_faces/${id}`, { method: "DELETE" }); loadFaces();
  };
  useEffect(() => { loadFaces(); loadLogs(); }, [loadFaces, loadLogs]);

  // ── Presence Analytics Poll (ALL cameras) ────────────────────────────
  useEffect(() => {
    if (!matchOn || ps !== "playing") { setPresence([]); return; }
    const iv = setInterval(async () => {
      try {
        // /api/presence/all aggregates confirmed presence from ALL camera workers
        const r = await fetch(`${backendUrl}/api/presence/all`, {
          headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" }
        });
        if (r.ok) { const d = await r.json(); setPresence(d.present || []); }
      } catch { }
    }, 1000);
    return () => clearInterval(iv);
  }, [matchOn, ps, streamName, backendUrl]);

  // ── High Resolution capture for enrollment / database storage ────────────
  const captureHighResFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const naturalW = v.videoWidth || 1920;
    const naturalH = v.videoHeight || 1080;
    const MAX_WIDTH = 1920;
    let targetW = naturalW;
    let targetH = naturalH;
    if (naturalW > MAX_WIDTH) {
      const scale = MAX_WIDTH / naturalW;
      targetW = MAX_WIDTH;
      targetH = Math.round(naturalH * scale);
    }
    const c = document.createElement("canvas");
    c.width = targetW; c.height = targetH;
    c.getContext("2d")?.drawImage(v, 0, 0, targetW, targetH);
    return c.toDataURL("image/jpeg", 0.95);
  }, []);

  // ── Server-Side RTSP Detection Poll ──────────────────────────────────────
  // Recognition runs DIRECTLY on the RTSP camera feed inside the Flask
  // backend (CameraWorker → analyze_frame). The browser only renders the
  // server's latest detection boxes — no canvas frame is uploaded anywhere.
  // Polling is NOT gated on video playback: even if the raw stream codec
  // (e.g. H.265) can't be decoded by the browser, we still render the live
  // server recognition view so the "view always comes".
  useEffect(() => {
    if (!matchOn) {
      setDetections([]);
      setBodies([]);
      setHistory([]);
      return;
    }

    let mounted = true;

    const poll = async () => {
      if (!mounted) return;
      try {
        const r = await fetch(`${backendUrl}/api/detections/${encodeURIComponent(streamName)}`);
        if (!r.ok) return;
        const data = await r.json();
        if (!mounted) return;

        setVidW(data.frame_width || 640);
        setVidH(data.frame_height || 480);

        const dets: Detection[] = data.detections || [];
        const bds: [number, number, number, number, number][] = data.bodies || [];

        setDetections(dets);
        setBodies(bds);
        setTotalScans(n => n + 1);

        const now = Date.now();
        if (dets.length > 0) {
          setHistory(prev => {
            const updated = [...prev];
            dets.forEach(det => {
              const isMatch = det.matched;
              const matchName = det.name;

              if (isMatch) {
                const existingIdx = updated.findIndex(h => h.matched && h.name === matchName);
                if (existingIdx !== -1) {
                  updated[existingIdx] = {
                    ...det,
                    timestamp: now,
                    id: updated[existingIdx].id
                  };
                } else {
                  updated.unshift({
                    ...det,
                    timestamp: now,
                    id: Math.random().toString(36).substring(2)
                  });
                }
              } else {
                const recentUnknown = updated.find(h => !h.matched && (now - h.timestamp < 3000));
                if (!recentUnknown) {
                  updated.unshift({
                    ...det,
                    timestamp: now,
                    id: Math.random().toString(36).substring(2)
                  });
                }
              }
            });
            return updated.slice(0, 6);
          });

          // Refresh logs on any detection (matched OR unknown)
          loadLogs();

          const newMatches = dets.filter(d => d.matched).length;
          if (newMatches > 0) {
            setMatchedToday(n => n + newMatches);
          }
        }
      } catch { }
    };

    poll();
    const iv = setInterval(poll, 700);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [matchOn, streamName, backendUrl, loadLogs]);

  // ── render ───────────────────────────────────────────────────
  const playing = ps === "playing";
  const matchedCount = detections.filter(d => d.matched).length;
  const unknownCount = detections.filter(d => !d.matched).length;
  const hasFeed = detections.length > 0 || bodies.length > 0;
  // Fallback capture: if the video isn't decodable, reuse the latest server crop
  const fallbackCrop = detections[0]?.crop_b64 || history.find(h => h.crop_b64)?.crop_b64 || null;

  const psDot = playing ? "#10b981" : ps === "connecting" ? "#f59e0b" : "#ef4444";
  const psLabel = playing ? "Live" : ps === "connecting" ? "Connecting…" : ps === "offline" ? "MediaMTX offline" : "Stream error";

  const TABS = [
    { id: "register" as const, label: "Register", icon: UserPlus, count: null as number | null },
    { id: "visitors" as const, label: "Visitors", icon: UserCheck, count: null as number | null },
    { id: "gallery" as const, label: "Gallery", icon: Users, count: faces.length },
    { id: "log" as const, label: "Activity Log", icon: ScrollText, count: null as number | null },
  ];

  return (
    <div className="snt-wrap">
      {/* ── Detection Popup Modal ── */}
      {modalDetection && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          animation: "fadeInUp 0.2s ease"
        }} onClick={() => setModalDetection(null)}>
          <div style={{
            background: "var(--bg-panel, #ffffff)", borderRadius: 22,
            border: "1px solid var(--border, #e2e8f0)",
            padding: 24, width: "100%", maxWidth: 440,
            boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
            position: "relative", overflow: "hidden"
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 4,
              background: modalDetection.det.matched
                ? "linear-gradient(90deg, #10b981, #059669)"
                : "linear-gradient(90deg, #ef4444, #f59e0b)"
            }} />

            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12,
                  background: modalDetection.det.matched ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: modalDetection.det.matched ? "#10b981" : "#ef4444", fontSize: 18, fontWeight: 800
                }}>
                  {modalDetection.det.matched ? "✓" : "🚨"}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-primary, #1e293b)" }}>
                    {modalDetection.det.matched ? "Known Face Match" : "Unknown Person Alert"}
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-muted, #64748b)" }}>
                    Detected by Camera: <strong style={{ color: "#6366f1" }}>{modalDetection.cameraName}</strong>
                  </p>
                </div>
              </div>
              <button onClick={() => setModalDetection(null)} style={{
                background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", fontWeight: 700
              }}>✕</button>
            </div>

            {/* Detection snapshot & metrics */}
            <div style={{
              display: "flex", gap: 16, alignItems: "center",
              background: "rgba(15,23,42,0.03)", borderRadius: 14, padding: 14,
              border: "1px solid rgba(0,0,0,0.06)", marginBottom: 18
            }}>
              {modalDetection.det.crop_b64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={modalDetection.det.crop_b64} alt="crop" style={{
                  width: 84, height: 84, borderRadius: 12, objectFit: "cover",
                  border: `2.5px solid ${modalDetection.det.matched ? "#10b981" : "#ef4444"}`,
                  boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
                }} />
              ) : (
                <div style={{
                  width: 84, height: 84, borderRadius: 12, background: "var(--bg-input)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32
                }}>👤</div>
              )}

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: modalDetection.det.matched ? "#059669" : "#dc2626" }}>
                  {modalDetection.det.name || "Unknown Person"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Match Confidence: <strong style={{ color: "var(--text-primary)" }}>{Math.round((modalDetection.det.confidence || 0) * 100)}%</strong>
                </div>
                {modalDetection.det.det_score !== undefined && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    Detector Score: {Math.round(modalDetection.det.det_score * 100)}%
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: "#10b981", marginTop: 6, fontWeight: 700 }}>
                  ● Real-time Frame Analysis Active
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              {!modalDetection.det.matched && (
                <button onClick={() => {
                  if (modalDetection.det.crop_b64) {
                    if (tab === "visitors") {
                      setPendingVisitorCrop(modalDetection.det.crop_b64);
                    } else {
                      setPendingRegisterCrop(modalDetection.det.crop_b64);
                      setCleanView(false);
                      setTab("register");
                    }
                  }
                  setModalDetection(null);
                }} className="btn-primary" style={{ flex: 1, padding: "11px 0", fontSize: 12.5 }}>
                  ➕ {tab === "visitors" ? "Register Visitor" : "Register Face"}
                </button>
              )}
              <button onClick={() => setModalDetection(null)} className="btn-secondary" style={{ flex: 1, padding: "11px 0", fontSize: 12.5 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="snt-main">

        {/* ─ Video column ─ */}
        <div className="snt-videocol">

          {/* Control Bar */}
          {!detectionOnly && (
            <div className="snt-cbar">
              <button className="snt-btn" onClick={() => setCleanView(prev => !prev)}>
                {cleanView ? <><MonitorPlay size={13} color="#4f46e5" /> Stream View</> : <><Video size={13} color="#4f46e5" /> Full View</>}
              </button>

              <button className={`snt-btn ${matchOn ? "snt-btn-on" : ""}`} onClick={async () => {
                const next = !matchOn;
                setMatchOn(next);
                try {
                  await fetch(`${backendUrl}/api/workers/${next ? "start" : "stop"}`, {
                    method: "POST",
                    headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" }
                  });
                } catch { }
              }}>
                <Activity size={13} color={matchOn ? "#059669" : "#4b5563"} />
                {matchOn ? "Matcher ON" : "Matcher OFF"}
              </button>

              <button className="snt-btn" onClick={toggleMode}>
                {mode === "webrtc" ? <Zap size={13} color="#f59e0b" /> : <Radio size={13} color="#0ea5e9" />}
                {mode === "webrtc" ? "WebRTC" : "HLS"}
              </button>

              <div className="snt-chips">
                {fps !== null && <Chip dot="#10b981" label={`${fps} FPS`} />}
                {vidW > 0 && <Chip dot="#6366f1" label={`${vidW}×${vidH}`} />}
                <Chip dot={psDot} label={psLabel} tint={ps === "playing" ? "#059669" : ps === "connecting" ? "#b45309" : "#dc2626"} />
                {rtcOk === false && <Chip dot="#ef4444" label="MediaMTX down" tint="#dc2626" />}
              </div>

              <button className="snt-btn snt-retry" onClick={retry} title="Reconnect">
                <RefreshCw size={14} color="#4b5563" className={ps === "connecting" ? "snt-spin-icon" : ""} />
              </button>
            </div>
          )}

          {/* Video Viewport Container */}
          <div className="snt-viewport" style={{
            aspectRatio: vidW && vidH ? `${vidW}/${vidH}` : "16/9"
          }}>

            <div className="snt-zoom">
              <video ref={videoRef} autoPlay muted playsInline
                style={{
                  width: "100%", height: "100%", objectFit: "contain", display: "block",
                  opacity: playing ? 1 : 0, transition: "opacity 0.4s"
                }} />

              {/* Bounding Boxes overlay with click handler (live video) */}
              {playing && (
                <BoundingBoxes
                  detections={detections}
                  bodies={bodies}
                  videoWidth={vidW}
                  videoHeight={vidH}
                  onSelectDetection={(det) => setModalDetection({ det, cameraName: streamName })}
                />
              )}
            </div>

            {/* ── SERVER AI DETECTION VIEW ──
                Rendered whenever the raw stream can't be decoded by the
                browser (e.g. H.265), so the live view ALWAYS comes. */}
            {!playing && matchOn && (
              <div className="snt-aiview">
                <div className="snt-aigrid" />

                {hasFeed && (
                  <BoundingBoxes
                    detections={detections}
                    bodies={bodies}
                    videoWidth={vidW}
                    videoHeight={vidH}
                    onSelectDetection={(det) => setModalDetection({ det, cameraName: streamName })}
                  />
                )}

                <div className="snt-scan" />

                {/* AI feed badge */}
                <div className="snt-aibadge">
                  <ScanFace size={11} color="#00ff88" />
                  SERVER AI FEED
                </div>

                {hasFeed ? (
                  <div className="snt-aistrip">
                    <span>{vidW}×{vidH} · {detections.length} face{detections.length === 1 ? "" : "s"} · {matchedCount} matched</span>
                    <span>video offline — live server recognition</span>
                  </div>
                ) : (
                  <div className="snt-aiwait">
                    <div className="snt-spin" />
                    <div className="snt-aiwait-title">
                      {ps === "error" || ps === "offline" ? "Waiting for stream…" : "Analyzing camera feed…"}
                    </div>
                    <div className="snt-aiwait-sub">
                      {ps === "connecting"
                        ? `Establishing ${mode.toUpperCase()} connection`
                        : ps === "error" || ps === "offline"
                          ? "Server recognition ready — reconnecting video"
                          : "Awaiting first server detection frame"}
                    </div>
                    <button className="snt-btn snt-aiwait-btn" onClick={retry}>
                      <RefreshCw size={12} color="#6366f1" /> Reconnect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Scanner line over live video */}
            {playing && matchOn && <div className="snt-scan" />}

            {/* LIVE Badge */}
            {playing && (
              <div className="snt-badge snt-badge-live">
                <span className="snt-badge-dot" />
                LIVE
              </div>
            )}

            {/* Mode / state badge */}
            <div className="snt-badge snt-badge-mode">
              {mode === "webrtc" ? <Zap size={9} color="#fff" /> : <Radio size={9} color="#fff" />}
              {playing ? (mode === "webrtc" ? "WEBRTC" : "HLS") : ps === "connecting" ? "CONNECTING" : "OFFLINE"}
            </div>

            {/* ── LIVE DETECTION NOTIFICATION BANNER (Click detection to open Modal) ── */}
            {matchOn && (
              <div className="snt-banner">
                <div className="snt-banner-left">
                  <span className={`snt-banner-dot ${hasFeed ? (matchedCount > 0 ? "snt-banner-dot-match" : "snt-banner-dot-unknown") : ""}`} />

                  {detections.length === 0 ? (
                    <span className="snt-banner-empty">Scanning camera stream for detections…</span>
                  ) : (
                    detections.map((d, i) => (
                      <button key={i} onClick={() => setModalDetection({ det: d, cameraName: streamName })} className={`snt-banner-det ${d.matched ? "snt-banner-det-match" : "snt-banner-det-unknown"}`}>
                        <span>{d.matched ? `✓ ${d.name}` : "🚨 Unknown"}</span>
                        <span className="snt-banner-det-pct">({Math.round((d.confidence || 0) * 100)}%)</span>
                      </button>
                    ))
                  )}
                </div>

                {detections.length > 0 && (
                  <span className="snt-banner-hint">Click for details ↗</span>
                )}
              </div>
            )}

            {/* Overlay states (only when matcher is OFF so AI view can render) */}
            {!matchOn && !playing && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(17,24,39,0.9)"
              }}>
                {ps === "connecting" && (
                  <>
                    <div className="snt-spin snt-spin-lg" />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>Connecting via {mode.toUpperCase()}…</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                        Establishing {mode === "webrtc" ? "zero-latency peer" : "HLS buffered"} connection
                      </div>
                    </div>
                  </>
                )}
                {ps === "offline" && (
                  <>
                    <WifiOff size={40} color="#ef4444" />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#ef4444" }}>MediaMTX Offline</div>
                      <div style={{
                        fontSize: 11, color: "#d1d5db", fontFamily: "monospace",
                        background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "4px 10px", marginTop: 8
                      }}>
                        ./mediamtx mediamtx.yml
                      </div>
                    </div>
                    <button onClick={retry} className="btn-primary">Retry</button>
                  </>
                )}
                {ps === "error" && (
                  <>
                    <WifiOff size={40} color="#ef4444" />
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#ef4444" }}>Stream Error</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, maxWidth: 300 }}>{errMsg}</div>
                    </div>
                    <button onClick={retry} className="btn-primary">Try Again</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─ Sidebar column (now rendered underneath the camera view panel/viewport) ─ */}
        {!cleanView && (
          <div className="snt-sidebar">
            {/* Tab bar */}
            <div className="snt-tabs">
              {TABS.map(t => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)} className={`snt-tab ${active ? "snt-tab-active" : ""}`}>
                    <Icon size={13} />
                    <span className="snt-tab-label">{t.label}</span>
                    {t.count !== null && <span className="snt-tab-count">{t.count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="snt-sidebar-content">
              {tab === "register" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch", width: "100%" }}>
                  {/* Left sub-column: Unknown Candidates (Comparison list) */}
                  {detections.filter(d => !d.matched).length > 0 && (
                    <div style={{ flex: "1 1 300px", minWidth: "260px" }}>
                      <ComparisonPanel
                        unknowns={detections.filter(d => !d.matched)}
                        backendUrl={backendUrl}
                        onRegisterClick={(crop) => {
                          setPendingRegisterCrop(crop);
                          setTab("register");
                        }}
                      />
                    </div>
                  )}

                  {/* Right sub-column: Registration Form details */}
                  <div style={{ flex: "2 1 400px" }}>
                    <RegisterPanel
                      canCapture={playing || !!fallbackCrop}
                      captureFrame={pendingRegisterCrop
                        ? () => { const c = pendingRegisterCrop; setPendingRegisterCrop(null); return c; }
                        : () => captureHighResFrame() ?? fallbackCrop
                      }
                      onSuccess={() => { loadFaces(); setTab("gallery"); setPendingRegisterCrop(null); }}
                    />
                  </div>
                </div>
              )}
              {tab === "visitors" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "stretch", width: "100%" }}>
                  {/* Left sub-column: Unknown Candidates → auto-detect & prefill visitor photo */}
                  {detections.filter(d => !d.matched).length > 0 && (
                    <div style={{ flex: "1 1 300px", minWidth: "260px" }}>
                      <ComparisonPanel
                        unknowns={detections.filter(d => !d.matched)}
                        backendUrl={backendUrl}
                        onRegisterClick={(crop) => setPendingVisitorCrop(crop)}
                      />
                    </div>
                  )}

                  {/* Right sub-column: Visitor Registration Form (CC camera capture) */}
                  <div style={{ flex: "2 1 400px" }}>
                    <VisitorsPanel
                      canCapture={playing || !!fallbackCrop}
                      captureFrame={pendingVisitorCrop
                        ? () => { const c = pendingVisitorCrop; setPendingVisitorCrop(null); return c; }
                        : () => captureHighResFrame() ?? fallbackCrop
                      }
                      pendingCrop={pendingVisitorCrop}
                      onSuccess={() => { setPendingVisitorCrop(null); }}
                    />
                  </div>
                </div>
              )}
              {tab === "gallery" && (
                <GalleryPanel faces={faces} onDelete={deleteFace} />
              )}
              {tab === "log" && (
                <LogPanel logs={logs} faces={faces} onRefresh={loadLogs} autoRefresh={true} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Component styles (scoped, responsive) */}
      <style>{`
        .snt-wrap{display:flex;flex-direction:column;gap:16;width:100%}
        .snt-main{display:flex;flex-direction:column;gap:20;width:100%}
        .snt-videocol{width:100%;display:flex;flex-direction:column;gap:12}

        .snt-cbar{display:flex;flex-wrap:wrap;gap:8;align-items:center;padding:10px 12px;
          background:rgba(255,255,255,0.8);backdrop-filter:blur(14px) saturate(1.3);
          -webkit-backdrop-filter:blur(14px) saturate(1.3);
          border:1px solid rgba(255,255,255,0.65);border-radius:16px;box-shadow:var(--shadow-sm)}
        .snt-btn{display:inline-flex;align-items:center;gap:6;padding:7px 12px;border-radius:12px;
          border:1px solid var(--border-strong);background:#fff;color:var(--text-secondary);
          cursor:pointer;font-size:11.5px;font-weight:700;font-family:inherit;transition:all .18s ease}
        .snt-btn:hover{border-color:var(--violet);color:var(--violet-deep);box-shadow:var(--shadow-sm)}
        .snt-btn-on{border-color:#10b981;background:rgba(16,185,129,0.08);color:#059669}
        .snt-btn-on:hover{border-color:#10b981;color:#047857}
        .snt-retry{padding:7px;width:32px;height:32px;justify-content:center;margin-left:auto}
        .snt-spin-icon{animation:spin 1s linear infinite}
        .snt-chips{display:inline-flex;flex-wrap:wrap;gap:6}

        .snt-viewport{position:relative;border-radius:20px;overflow:hidden;background:#05070d;
          border:1px solid rgba(15,23,42,0.12);
          box-shadow:0 10px 34px rgba(15,23,42,0.12), 0 0 0 1px rgba(99,102,241,0.06)}
        .snt-viewport::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;z-index:25;pointer-events:none;
          background:linear-gradient(90deg,transparent,rgba(99,102,241,0.55),rgba(139,92,246,0.45),transparent)}

        .snt-zoom{position:absolute;inset:0;will-change:transform;
          transition:transform .5s cubic-bezier(.22,1,.36,1)}

        .snt-scan{position:absolute;top:0;left:0;right:0;height:2px;z-index:15;pointer-events:none;
          background:linear-gradient(90deg,transparent,#7c3aed,#00ff88,#7c3aed,transparent);
          animation:scanline 3s linear infinite;box-shadow:0 0 15px #7c3aed}

        .snt-badge{position:absolute;top:14px;z-index:20;display:inline-flex;align-items:center;gap:6;
          background:rgba(0,0,0,0.72);border-radius:20px;padding:4px 12px;font-size:10px;font-weight:800;
          color:#fff;letter-spacing:0.12em;backdrop-filter:blur(8px)}
        .snt-badge-live{left:14px;border:1px solid rgba(255,59,92,0.6)}
        .snt-badge-dot{width:7px;height:7px;border-radius:50%;background:#ff3b5c;animation:pulse-ring 1.2s ease-out infinite;box-shadow:0 0 8px #ff3b5c}
        .snt-badge-mode{right:14px;border:1px solid rgba(255,255,255,0.2)}

        /* Server AI detection view */
        .snt-aiview{position:absolute;inset:0;z-index:5;background:linear-gradient(180deg,#0a0f1d 0%,#0f172a 55%,#0a0f1d 100%)}
        .snt-aigrid{position:absolute;inset:0;opacity:0.5;
          background-image:linear-gradient(rgba(99,102,241,0.10) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.10) 1px,transparent 1px);
          background-size:42px 42px;
          mask-image:radial-gradient(ellipse at center,black 30%,transparent 85%);
          -webkit-mask-image:radial-gradient(ellipse at center,black 30%,transparent 85%)}
        .snt-aibadge{position:absolute;top:14px;left:14px;z-index:20;display:inline-flex;align-items:center;gap:6;
          background:rgba(0,0,0,0.72);border:1px solid rgba(0,255,136,0.45);border-radius:20px;padding:4px 12px;
          font-size:10px;font-weight:800;color:#fff;letter-spacing:0.12em;backdrop-filter:blur(8px)}
        .snt-aistrip{position:absolute;bottom:52px;left:12px;right:12px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:10;
          background:rgba(15,23,42,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:7px 12px;
          font-size:10.5px;color:rgba(255,255,255,0.72);font-weight:600;backdrop-filter:blur(10px)}
        .snt-aiwait{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10;z-index:18}
        .snt-spin{width:34px;height:34px;border:3px solid rgba(99,102,241,0.3);border-top:3px solid #6366f1;border-radius:50%;animation:spin 0.8s linear infinite}
        .snt-spin-lg{width:48px;height:48px;border-width:3px}
        .snt-aiwait-title{font-weight:700;font-size:14px;color:#fff}
        .snt-aiwait-sub{font-size:11.5px;color:#94a3b8;text-align:center;max-width:340px;line-height:1.4}
        .snt-aiwait-btn{margin-top:6px}

        /* Detection banner */
        .snt-banner{position:absolute;bottom:12px;left:12px;right:12px;z-index:22;display:flex;align-items:center;justify-content:space-between;gap:10;
          background:rgba(15,23,42,0.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
          border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:8px 12px;box-shadow:0 8px 24px rgba(0,0,0,0.3)}
        .snt-banner-left{display:flex;align-items:center;gap:8;flex-wrap:wrap}
        .snt-banner-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;flex-shrink:0}
        .snt-banner-dot-match{background:#10b981;box-shadow:0 0 8px #10b981}
        .snt-banner-dot-unknown{background:#ef4444;box-shadow:0 0 8px #ef4444}
        .snt-banner-empty{font-size:11px;color:rgba(255,255,255,0.65);font-style:italic}
        .snt-banner-det{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 11px;border-radius:12px;
          font-size:11.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6;transition:transform .15s}
        .snt-banner-det:hover{transform:translateY(-1px)}
        .snt-banner-det-match{background:rgba(16,185,129,0.22);border-color:#10b981}
        .snt-banner-det-unknown{background:rgba(239,68,68,0.25);border-color:#ef4444}
        .snt-banner-det-pct{opacity:0.8;font-size:10px;font-family:var(--font-mono)}
        .snt-banner-hint{font-size:10px;color:rgba(255,255,255,0.55);font-weight:600;white-space:nowrap}

        /* Sidebar */
        .snt-sidebar{width:100%;max-width:none;display:flex;flex-direction:column;overflow:hidden;
          background:#fff;border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow-md)}
        .snt-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px;background:#f8f9fd;border-bottom:1px solid var(--border)}
        .snt-tab{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 6px;border:none;background:transparent;
          color:var(--text-muted);font-weight:600;font-size:11.5px;cursor:pointer;border-radius:12px;transition:all .18s ease;font-family:inherit;white-space:nowrap}
        .snt-tab:hover{color:var(--violet-deep);background:rgba(99,102,241,0.06)}
        .snt-tab-active{background:#fff;color:var(--violet-deep);font-weight:700;box-shadow:var(--shadow-sm);border:1px solid var(--border-light)}
        .snt-tab-count{margin-left:2px;background:rgba(99,102,241,0.12);color:var(--violet-deep);border-radius:99px;padding:1px 7px;font-size:9.5px;font-weight:800}
        .snt-sidebar-content{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px}

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 1000px){
          .snt-sidebar{max-width:none;flex-basis:100%}
          .snt-videocol{flex-basis:100%}
        }
        @media (max-width: 560px){
          .snt-tab-label{display:none}
          .snt-tabs{grid-template-columns:repeat(3, auto)}
        }
      `}</style>
    </div>
  );
}
