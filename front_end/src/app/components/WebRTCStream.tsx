"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Detection, RegisteredFace, FaceLog, StreamMode, PlayState } from "./sentinel/types";
import BoundingBoxes from "./sentinel/BoundingBoxes";
import RegisterPanel from "./sentinel/RegisterPanel";
import GalleryPanel from "./sentinel/GalleryPanel";
import LogPanel from "./sentinel/LogPanel";
import ComparisonPanel from "./sentinel/ComparisonPanel";


const WEBRTC_TIMEOUT = 20000;

// Safely compute backend URL (only runs on client, avoids SSR hydration mismatch)
function getBackendUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:5000";
  const host = window.location.hostname;
  return `http://${host === "localhost" ? "127.0.0.1" : host}:5000`;
}

interface Props {
  streamName?: string;
  serverPort?: string;
  initialTab?: "register" | "gallery" | "log";
}

interface DetectionHistoryItem extends Detection {
  timestamp: number;
  id: string;
}

// ─── tiny stat card ─────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)",
      borderRadius:12, padding:"12px 16px", flex:1, minWidth:100, boxShadow:"var(--shadow-sm)" }}>
      <div style={{ fontSize:10, color:"var(--text-muted)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:4 }}>
        {label}
      </div>
      <div style={{ fontSize:22, fontWeight:800, color: color || "var(--text-primary)", fontFamily:"monospace" }}>
        {value}
      </div>
    </div>
  );
}

// ─── status chip ─────────────────────────────────────────────────
function Chip({ dot, label }: { dot: string; label: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, fontWeight:600,
      background:"var(--bg-card)", border:"1px solid var(--border)",
      borderRadius:20, padding:"4px 10px", boxShadow:"var(--shadow-sm)" }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:dot, boxShadow:`0 0 6px ${dot}`, flexShrink:0 }} />
      {label}
    </div>
  );
}

export default function WebRTCStream({ streamName = "camera1", serverPort = "8889", initialTab = "register" }: Props) {
  // Computed on client only to avoid SSR/client hydration mismatch
  const [backendUrl, setBackendUrl] = useState("http://127.0.0.1:5000");
  useEffect(() => { setBackendUrl(getBackendUrl()); }, []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pcRef    = useRef<RTCPeerConnection | null>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const hlsRef   = useRef<Hls | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef  = useRef<StreamMode>("webrtc");
  const psRef    = useRef<PlayState>("connecting");

  const [mode, setMode]           = useState<StreamMode>("webrtc");
  const [ps, setPs]               = useState<PlayState>("connecting");
  const [errMsg, setErrMsg]       = useState("");
  const [fps, setFps]             = useState<number | null>(null);
  const [retryKey, setRetryKey]   = useState(0);
  const [dbOk, setDbOk]           = useState<boolean | null>(null);
  const [rtcOk, setRtcOk]         = useState<boolean | null>(null);
  const [modelOk, setModelOk]     = useState<boolean | null>(null);

  // Video dimensions (for bbox scaling)
  const [vidW, setVidW] = useState(0);
  const [vidH, setVidH] = useState(0);

  // Face matching
  const [matchOn, setMatchOn]       = useState(true);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [bodies, setBodies] = useState<[number, number, number, number, number][]>([]);
  const [history, setHistory] = useState<DetectionHistoryItem[]>([]);

  // Sidebar tab
  const [tab, setTab] = useState<"register" | "gallery" | "log">(initialTab);
  
  // Keep tab state in sync with initialTab prop changes
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Pre-filled capture for registration from ComparisonPanel
  const [pendingRegisterCrop, setPendingRegisterCrop] = useState<string | null>(null);


  // DB data
  const [faces, setFaces]   = useState<RegisteredFace[]>([]);
  const [logs, setLogs]     = useState<FaceLog[]>([]);

  // Stats
  const [totalScans, setTotalScans]     = useState(0);
  const [matchedToday, setMatchedToday] = useState(0);
  
  // Presence analytics (confirmed 3-frame rule)
  const [presence, setPresence] = useState<{name:string; confidence:number; seconds_ago:number; photo_url:string|null; crop:string|null}[]>([]);

  const setM  = (m: StreamMode) => { setMode(m); modeRef.current = m; };
  const setPS = (s: PlayState)  => { setPs(s);   psRef.current   = s; };

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
  // Note: vidW and vidH are now synced directly from the backend detection WebSocket payload
  // so that the SVG bounding boxes correctly scale over any video resolution seamlessly.

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
    const hlsPort = "8888";
    const url  = `http://${host}:${hlsPort}/${streamName}/index.m3u8`;
    const v    = videoRef.current; if (!v) return;
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
        v.play().catch(() => { v.muted = true; v.play().catch(()=>{}); });
        setPS("playing"); startFps();
      });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setPS("error"); setErrMsg(d.details); cleanup(); }
      });
    } else { setPS("error"); setErrMsg("HLS not supported."); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, streamName]);

  // ── WebRTC ────────────────────────────────────────────
  const startWebRTC = useCallback(() => {
    cleanup(); setPS("connecting"); setErrMsg("");
    const session = sessionRef.current;
    const alive   = () => session === sessionRef.current;

    const webrtcUrl  = `/api/whep/${streamName}/whep`;
    const fallback   = (msg: string) => {
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
          vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
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
        .then(() => {
          if (!alive()) return;
          return fetch(webrtcUrl, {
            method: "POST",
            body: pc.localDescription?.sdp,
            headers: { "Content-Type": "application/sdp" },
          });
        })
        .then(res => {
          if (!res) return;
          if (!res.ok) throw new Error("MediaMTX WHEP offer rejected");
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

  const retry = () => { cleanup(); setRetryKey(k => k+1); };
  const toggleMode = () => {
    const next: StreamMode = modeRef.current === "webrtc" ? "hls" : "webrtc";
    setM(next); cleanup(); setRetryKey(k => k+1);
  };

  // ── DB loaders ───────────────────────────────────────────────
  const loadFaces = useCallback(async () => {
    try { const r = await fetch("/api/registered_faces"); if (r.ok) setFaces(await r.json()); } catch {}
  }, []);
  const loadLogs = useCallback(async () => {
    try { const r = await fetch("/api/face_logs"); if (r.ok) setLogs(await r.json()); } catch {}
  }, []);
  const deleteFace = async (id: string) => {
    await fetch(`/api/registered_faces/${id}`, { method:"DELETE" }); loadFaces();
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
      } catch {}
    }, 1000);
    return () => clearInterval(iv);
  }, [matchOn, ps, streamName, backendUrl]);

  // ── capture (kept for face registration AND live WebSocket stream) ────────────
  const captureFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const naturalW = v.videoWidth || 640;
    const naturalH = v.videoHeight || 480;
    
    // Frame resolution (640px max width prevents UI thread lockups)
    const MAX_WIDTH = 640; 
    let targetW = naturalW;
    let targetH = naturalH;
    if (naturalW > MAX_WIDTH) {
      const scale = MAX_WIDTH / naturalW;
      targetW = MAX_WIDTH;
      targetH = Math.round(naturalH * scale);
    }
    
    // Reuse a single canvas element instead of allocating a new one in DOM on every tick
    let c = canvasRef.current;
    if (!c) {
      c = document.createElement("canvas");
      canvasRef.current = c;
    }
    c.width = targetW; 
    c.height = targetH;
    
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, targetW, targetH);
    return c.toDataURL("image/jpeg", 0.75);
  }, []);

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

  // ── WebSocket Detection Stream (adaptive send — no queue buildup) ────────
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: NodeJS.Timeout;
    let nextFrameTimer: NodeJS.Timeout;
    let isProcessing = false;
    let mounted = true;

    const sendFrame = () => {
      if (!mounted) return;
      if (ws && ws.readyState === WebSocket.OPEN && !isProcessing) {
        const image = captureFrame();
        if (image) {
          isProcessing = true;
          ws.send(JSON.stringify({ camera_id: streamName, image }));
        } else {
          // Video not ready yet — retry shortly
          nextFrameTimer = setTimeout(sendFrame, 100);
        }
      }
    };

    const connectWS = () => {
      if (!matchOn || ps !== "playing" || !mounted) return;

      const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
      const wsHost = host === "localhost" ? "127.0.0.1" : host;
      const apiKey = process.env.NEXT_PUBLIC_API_KEY || "";
      ws = new WebSocket(`ws://${wsHost}:5001?api_key=${apiKey}`);

      ws.onopen = () => {
        // Kick off the first frame immediately on connect
        sendFrame();
      };

      ws.onmessage = (event) => {
        isProcessing = false;
        try {
          const data = JSON.parse(event.data);
          if (data.camera_id === streamName) {
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
                let updated = [...prev];
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
          }
        } catch (e) {}

        // ── Adaptive scheduling: send next frame 150ms after response ──
        // This prevents queue buildup: server always processes the LATEST frame.
        // (Previously: fixed 120ms interval that kept firing regardless of server load)
        nextFrameTimer = setTimeout(sendFrame, 150);
      };

      ws.onclose = () => {
        clearTimeout(nextFrameTimer);
        if (mounted) {
          reconnectTimer = setTimeout(connectWS, 2000);
        }
      };
    };

    if (matchOn && ps === "playing") {
      connectWS();
    } else {
      setDetections([]);
      setBodies([]);
      setHistory([]);
    }

    return () => {
      mounted = false;
      clearTimeout(nextFrameTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      clearTimeout(reconnectTimer);
    };
  }, [matchOn, ps, streamName, loadLogs]);

  // ── render ───────────────────────────────────────────────────
  const playing = ps === "playing";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* ── Stats bar ── */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
        <Stat label="Enrolled Faces" value={faces.length} color="#a78bfa" />
        <Stat label="Frame Scans"    value={totalScans}   color="#22d3ee" />
        <Stat label="Present Now"    value={presence.length} color="var(--green)" />
        <Stat label="Unknown Alerts" value={detections.filter(d=>!d.matched).length} color="var(--red)" />
      </div>

      {/* ── Main layout: video left, sidebar right ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 360px", gap:16 }}>

        {/* ─ Video column ─ */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

          {/* Control bar */}
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            {/* Face Matcher toggle — starts/stops background workers on ALL cameras */}
            <button onClick={async () => {
              const next = !matchOn;
              setMatchOn(next);
              try {
                await fetch(`${backendUrl}/api/workers/${next ? "start" : "stop"}`, {
                  method: "POST",
                  headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" }
                });
              } catch {}
            }} style={{
              display:"flex", alignItems:"center", gap:7, padding:"8px 16px",
              borderRadius:20, border:`1px solid ${matchOn ? "#10b981" : "#d1d5db"}`,
              background: matchOn ? "rgba(16,185,129,0.1)" : "#f9fafb",
              color: matchOn ? "#059669" : "#4b5563",
              cursor:"pointer", fontWeight:700, fontSize:12, transition:"all 0.2s" }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background: matchOn ? "#10b981" : "#9ca3af",
                boxShadow: matchOn ? "0 0 6px #10b981" : "none" }} />
              {matchOn ? "Face Matcher ON" : "Face Matcher OFF"}
            </button>

            {/* Mode toggle */}
            <button onClick={toggleMode} style={{
              display:"flex", alignItems:"center", gap:6, padding:"8px 14px",
              borderRadius:20, border:"1px solid #e5e7eb",
              background:"#ffffff", color:"#374151",
              cursor:"pointer", fontSize:11, fontWeight:600 }}>
              {mode === "webrtc" ? "⚡ WebRTC" : "📡 HLS"}
            </button>

            {/* Status chips */}
            <Chip dot={rtcOk === true ? "#10b981" : rtcOk === false ? "#ef4444" : "#f59e0b"}
              label={`MediaMTX ${rtcOk === true ? "OK" : rtcOk === false ? "Down" : "…"}`} />
            <Chip dot={dbOk === true ? "#10b981" : dbOk === false ? "#ef4444" : "#f59e0b"}
              label={`DB ${dbOk === true ? "Connected" : dbOk === false ? "Error" : "…"}`} />
            <Chip dot={modelOk === true ? "#10b981" : "#ef4444"}
              label={`AI ${modelOk === true ? "buffalo_l" : "Offline"}`} />

            {fps !== null && (
              <Chip dot="#10b981" label={`${fps} FPS`} />
            )}

            {/* Retry */}
            <button onClick={retry} title="Reconnect" style={{
              marginLeft:"auto", width:34, height:34, borderRadius:10,
              background:"#ffffff", border:"1px solid #e5e7eb",
              color:"#4b5563", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: ps === "connecting" ? "spin 1s linear infinite" : "none" }}>
                <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
              </svg>
            </button>
          </div>

          {/* Video viewport */}
          <div style={{ position:"relative", aspectRatio: vidW && vidH ? `${vidW}/${vidH}` : "16/9", borderRadius:16, overflow:"hidden",
            background:"#000", border:"1px solid #e5e7eb",
            boxShadow:"0 4px 20px rgba(0,0,0,0.08)" }}>

            <video ref={videoRef} autoPlay muted playsInline
              style={{ width:"100%", height:"100%", objectFit:"contain", display:"block",
                opacity: playing ? 1 : 0, transition:"opacity 0.4s" }} />

            {/* Bounding boxes (Tensor SVG Animation approach + YOLO Bodies) */}
            {playing && <BoundingBoxes detections={detections} bodies={bodies} videoWidth={vidW} videoHeight={vidH} />}

            {/* Scanner line (when matcher on) */}
            {playing && matchOn && (
              <div style={{ position:"absolute", top:0, left:0, right:0, height:2,
                background:"linear-gradient(90deg,transparent,#7c3aed,#00ff88,#7c3aed,transparent)",
                animation:"scanline 3s linear infinite", boxShadow:"0 0 15px #7c3aed", pointerEvents:"none", zIndex:15 }} />
            )}

            {/* LIVE badge */}
            {playing && (
              <div style={{ position:"absolute", top:14, left:14, display:"flex", alignItems:"center", gap:6,
                background:"rgba(0,0,0,0.75)", border:"1px solid rgba(255,59,92,0.6)", borderRadius:20,
                padding:"4px 12px", zIndex:20, backdropFilter:"blur(8px)" }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:"#ff3b5c",
                  animation:"pulse-ring 1.2s ease-out infinite", boxShadow:"0 0 8px #ff3b5c" }} />
                <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.12em", color:"#fff" }}>LIVE</span>
              </div>
            )}

            {/* Mode badge */}
            {playing && (
              <div style={{ position:"absolute", top:14, right:14, background:"rgba(0,0,0,0.7)",
                border:"1px solid rgba(255,255,255,0.2)", borderRadius:20, padding:"4px 12px",
                fontSize:10, fontWeight:700, color:"#fff", letterSpacing:"0.08em", backdropFilter:"blur(8px)", zIndex:20 }}>
                {mode === "webrtc" ? "⚡ WEBRTC" : "📡 HLS"}
              </div>
            )}

            {/* ── PRESENCE PANEL (replaces history banner) ── */}
            {playing && matchOn && (
              <div style={{ position:"absolute", bottom:14, left:14, right:14,
                background:"rgba(255,255,255,0.95)", backdropFilter:"blur(16px)",
                border:"1px solid #e5e7eb", borderRadius:14,
                padding:"10px 14px", zIndex:20, boxShadow:"0 8px 30px rgba(0,0,0,0.12)" }}>
                
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:presence.length>0?"#10b981":"#9ca3af",
                    boxShadow:presence.length>0?"0 0 6px #10b981":"none" }} />
                  <span style={{ fontSize:10, fontWeight:800, color:"#6366f1", letterSpacing:"0.08em", textTransform:"uppercase" }}>
                    Presence — {presence.length > 0 ? `${presence.length} Confirmed` : "Scanning…"}
                  </span>
                  {detections.filter(d=>!d.matched).length > 0 && (
                    <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700,
                      color:"#ef4444", background:"rgba(239,68,68,0.1)",
                      border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"2px 8px" }}>
                      {detections.filter(d=>!d.matched).length} Unknown
                    </span>
                  )}
                </div>

                {presence.length === 0 ? (
                  <div style={{ fontSize:11, color:"#6b7280", fontStyle:"italic", textAlign:"center", padding:"4px 0" }}>
                    No registered faces confirmed yet. Needs 3+ frames to confirm presence.
                  </div>
                ) : (
                  <div style={{ display:"flex", gap:10, overflowX:"auto" }}>
                    {presence.map((p, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0,
                        background:"#f9fafb", border:"1px solid #e5e7eb",
                        borderRadius:10, padding:"6px 10px", transition:"all 0.3s" }}>
                        
                        {/* Live crop */}
                        {p.crop && (
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.crop} alt="live" style={{ width:38, height:38, borderRadius:6, objectFit:"cover",
                              border:"2px solid #10b981", boxShadow:"0 0 6px rgba(16,185,129,0.3)" }} />
                            <span style={{ fontSize:7, fontWeight:700, color:"#6b7280", marginTop:2 }}>LIVE</span>
                          </div>
                        )}

                        {/* Arrow */}
                        <span style={{ fontSize:12, color:"#10b981" }}>→</span>

                        {/* Registered photo */}
                        {p.photo_url && (
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.photo_url} alt="reg" style={{ width:38, height:38, borderRadius:6, objectFit:"cover",
                              border:"2px solid #6366f1", boxShadow:"0 0 6px rgba(99,102,241,0.3)" }} />
                            <span style={{ fontSize:7, fontWeight:700, color:"#6b7280", marginTop:2 }}>BUCKET</span>
                          </div>
                        )}

                        {/* Info */}
                        <div style={{ borderLeft:"1px solid #e5e7eb", paddingLeft:8 }}>
                          <div style={{ fontSize:12, fontWeight:800, color:"#111827" }}>✓ {p.name}</div>
                          <div style={{ fontSize:9.5, color:"#6b7280", fontFamily:"monospace", marginTop:2, fontWeight:600 }}>
                            {Math.round(p.confidence*100)}% · {p.seconds_ago}s ago
                          </div>
                          {/* Confidence bar */}
                          <div style={{ width:60, height:4, background:"#e5e7eb", borderRadius:2, marginTop:4 }}>
                            <div style={{ width:`${Math.round(p.confidence*100)}%`, height:"100%",
                              background:"#10b981", borderRadius:2,
                              transition:"width 0.5s ease" }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Overlay states */}
            {!playing && (
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:16, background:"rgba(17,24,39,0.9)" }}>
                {ps === "connecting" && (
                  <>
                    <div style={{ width:48, height:48, border:"3px solid rgba(99,102,241,0.3)",
                      borderTop:"3px solid #6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontWeight:700, fontSize:15, color:"#fff" }}>Connecting via {mode.toUpperCase()}…</div>
                      <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>
                        Establishing {mode === "webrtc" ? "zero-latency peer" : "HLS buffered"} connection
                      </div>
                    </div>
                  </>
                )}
                {ps === "offline" && (
                  <>
                    <div style={{ fontSize:36 }}>📡</div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontWeight:700, fontSize:15, color:"#ef4444" }}>MediaMTX Offline</div>
                      <div style={{ fontSize:11, color:"#d1d5db", fontFamily:"monospace",
                        background:"rgba(255,255,255,0.1)", borderRadius:8, padding:"4px 10px", marginTop:8 }}>
                        ./mediamtx mediamtx.yml
                      </div>
                    </div>
                    <button onClick={retry} style={{ background:"#6366f1", color:"#fff",
                      border:"none", borderRadius:10, padding:"10px 24px", cursor:"pointer", fontWeight:700 }}>
                      Retry
                    </button>
                  </>
                )}
                {ps === "error" && (
                  <>
                    <div style={{ fontSize:36 }}>⚠️</div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontWeight:700, fontSize:15, color:"#ef4444" }}>Stream Error</div>
                      <div style={{ fontSize:12, color:"#9ca3af", marginTop:4, maxWidth:300 }}>{errMsg}</div>
                    </div>
                    <button onClick={retry} style={{ background:"#6366f1", color:"#fff",
                      border:"none", borderRadius:10, padding:"10px 24px", cursor:"pointer", fontWeight:700 }}>
                      Try Again
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Source info */}
          <div style={{ fontSize:11, color:"#6b7280", fontFamily:"monospace",
            background:"#ffffff", border:"1px solid #e5e7eb",
            borderRadius:10, padding:"8px 14px", boxShadow:"0 1px 2px rgba(0,0,0,0.02)" }}>
            <span style={{ color:"#9ca3af", fontWeight:700 }}>SOURCE </span>
            Stream ID: {streamName} · mediamtx:{serverPort} · {mode.toUpperCase()}
          </div>
        </div>

        {/* ─ Sidebar column ─ */}
        <div style={{ display:"flex", flexDirection:"column", gap:0,
          background:"#ffffff", border:"1px solid #e5e7eb",
          borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.03)" }}>

          {/* Tab bar */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
            borderBottom:"1px solid #e5e7eb", background:"#f9fafb" }}>
            {(["register","gallery","log"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:"12px 4px", border:"none", background:"none",
                borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
                color: tab === t ? "#4f46e5" : "#6b7280",
                fontWeight: tab === t ? 700 : 500, fontSize:11.5,
                cursor:"pointer", textTransform:"capitalize", letterSpacing:"0.02em",
                transition:"all 0.15s" }}>
                {t === "register" ? "➕ Register" : t === "gallery" ? `👤 Gallery (${faces.length})` : "📋 Log"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding:16, flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:16 }}>
            {/* Comparison panel — only shown when unknowns detected */}
            {detections.filter(d => !d.matched).length > 0 && tab === "register" && (
              <ComparisonPanel
                unknowns={detections.filter(d => !d.matched)}
                backendUrl={backendUrl}
                onRegisterClick={(crop) => {
                  setPendingRegisterCrop(crop);
                  setTab("register");
                }}
              />
            )}
            {tab === "register" && (
              <RegisterPanel
                canCapture={playing}
                captureFrame={pendingRegisterCrop
                  ? () => { const c = pendingRegisterCrop; setPendingRegisterCrop(null); return c; }
                  : captureHighResFrame
                }
                onSuccess={() => { loadFaces(); setTab("gallery"); setPendingRegisterCrop(null); }}
              />
            )}
            {tab === "gallery" && (
              <GalleryPanel faces={faces} onDelete={deleteFace} />
            )}
            {tab === "log" && (
              <LogPanel logs={logs} faces={faces} onRefresh={loadLogs} autoRefresh={true} />
            )}
          </div>
        </div>
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}