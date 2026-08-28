"use client";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Camera, Upload, Cctv, RefreshCw, Check, X, Scissors, User,
} from "lucide-react";
import { Detection } from "./types";
import BoundingBoxes from "./BoundingBoxes";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Props {
  onPhoto: (dataUrl: string) => void;
  canCapture?: boolean;
  captureFrame?: () => string | null;
}

interface Cam {
  id: string;
  name: string;
  place?: string | null;
  location?: string | null;
  status?: string;
}

type Source = "cctv" | "webcam" | "upload";

const T = {
  accent: "#4F46E5",
  accentDim: "#4338CA",
  bgField: "#F1F5F9",
  paper: "#FFFFFF",
  line: "#E2E8F0",
  lineStrong: "#CBD5E1",
  text: "#0F172A",
  textMuted: "#475569",
  textFaint: "#94A3B8",
  ok: "#10B981",
  stamp: "#EF4444",
};

const chipBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 12px", borderRadius: 10, border: `1px solid ${T.lineStrong}`,
  background: "var(--bg-card)", color: T.text, fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", transition: "all .18s ease",
};
const chipActive: React.CSSProperties = {
  borderColor: T.accent, background: "rgba(79,70,229,0.08)", color: T.accentDim,
  boxShadow: "0 0 0 3px rgba(79,70,229,0.12)",
};
const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: T.accent, color: "#fff", border: "none", borderRadius: 9,
  padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
};
const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "transparent", color: T.text, border: `1px solid ${T.lineStrong}`,
  borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};

function getBackendUrl() {
  if (typeof window === "undefined") return "http://127.0.0.1:5000";
  const host = window.location.hostname;
  return `http://${host === "localhost" ? "127.0.0.1" : host}:5000`;
}

function hostname() {
  return typeof window !== "undefined" ? window.location.hostname : "localhost";
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function VisitorCapture({ onPhoto, canCapture = false, captureFrame }: Props) {
  const backendUrl = getBackendUrl();

  // Source tabs (kiosk mode only — no captureFrame prop)
  const [source, setSource] = useState<Source>("cctv");

  // CCTV cameras
  const [cameras, setCameras] = useState<Cam[]>([]);
  const [readySet, setReadySet] = useState<Set<string>>(new Set());
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [feedState, setFeedState] = useState<"idle" | "connecting" | "playing" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [workersOn, setWorkersOn] = useState(false);

  // Detection overlay
  const [detections, setDetections] = useState<Detection[]>([]);
  const [bodies, setBodies] = useState<[number, number, number, number, number][]>([]);
  const [vidW, setVidW] = useState(0);
  const [vidH, setVidH] = useState(0);

  // Webcam
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState(false);

  // Capture & manual crop
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [cropDims, setCropDims] = useState<{ iw: number; ih: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef({ x: 30, y: 15, s: 40 });
  const dragRef = useRef<{ mode: "move" | "resize"; dx: number; dy: number } | null>(null);

  /* ---------------- camera list + ready status ---------------- */
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/cameras");
        if (res.ok) {
          const data = await res.json();
          if (mounted) setCameras(data || []);
        }
      } catch { }
    };
    load();
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`http://${hostname()}:9997/v3/paths/list`);
        if (r.ok) {
          const d = await r.json();
          const ready = new Set<string>(
            (d.items || []).filter((p: any) => p.ready === true).map((p: any) => p.name as string)
          );
          if (mounted) setReadySet(ready);
        }
      } catch { }
    }, 10000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  /* ---------------- start workers (run models on cameras) ---------------- */
  const startWorkers = async () => {
    try {
      await fetch(`${backendUrl}/api/workers/start`, {
        method: "POST",
        headers: { "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "" },
      });
      setWorkersOn(true);
    } catch { }
  };

  /* ---------------- HLS playback ---------------- */
  const stopFeed = () => {
    hlsRef.current?.destroy(); hlsRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const v = videoRef.current;
    if (v) { v.src = ""; v.removeAttribute("src"); v.load(); }
    setFeedState("idle");
    setDetections([]);
    setBodies([]);
  };

  const playFeed = (camId: string) => {
    stopFeed();
    setFeedState("connecting");
    const url = `http://${hostname()}:8892/${camId}/index.m3u8`;
    const v = videoRef.current;
    if (!v) return;
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        maxBufferLength: 1,
        maxMaxBufferLength: 2,
        backBufferLength: 0,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxLiveSyncPlaybackRate: 2,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
      });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
        setFeedState("playing");
      });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setFeedState("error"); setErrMsg(d.details); stopFeed(); }
      });
    } else {
      setFeedState("error");
      setErrMsg("HLS not supported in this browser.");
    }
  };

  const selectCam = async (camId: string) => {
    setSelectedCam(camId);
    if (!workersOn) await startWorkers();
    playFeed(camId);
  };

  /* ---------------- detection poll (server model) ---------------- */
  useEffect(() => {
    if (!selectedCam) return;
    const poll = async () => {
      try {
        const r = await fetch(`${backendUrl}/api/detections/${encodeURIComponent(selectedCam)}`);
        if (!r.ok) return;
        const d = await r.json();
        setVidW(d.frame_width || 640);
        setVidH(d.frame_height || 480);
        setDetections(d.detections || []);
        setBodies(d.bodies || []);
      } catch { }
    };
    poll();
    pollRef.current = setInterval(poll, 700);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [selectedCam, backendUrl]);

  /* ---------------- webcam (front-desk kiosk) ---------------- */
  const startWebcam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
      webcamStreamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setWebcamActive(true);
      setWebcamError(false);
    } catch {
      setWebcamActive(false);
      setWebcamError(true);
    }
  };

  const stopWebcam = () => {
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    webcamStreamRef.current = null;
    setWebcamActive(false);
  };

  useEffect(() => {
    if (source === "webcam") startWebcam();
    else stopWebcam();
    return () => stopWebcam();
     
  }, [source]);

  // Auto-capture a crisp square headshot once the webcam video is actually
  // streaming (polls until the frames are ready, then snaps after a short
  // settle delay so the camera exposure/white-balance stabilises).
  useEffect(() => {
    if (source !== "webcam" || !webcamActive) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const iv = setInterval(() => {
      const v = videoRef.current;
      if (settleTimer) return;
      if (!v || v.videoWidth < 2 || v.videoHeight < 2) {
        attempts += 1;
        if (attempts > 30) clearInterval(iv);
        return;
      }
      settleTimer = setTimeout(() => {
        clearInterval(iv);
        const side = Math.min(v.videoWidth, v.videoHeight);
        const sx = (v.videoWidth - side) / 2;
        const sy = (v.videoHeight - side) / 2;
        const c = document.createElement("canvas");
        c.width = side; c.height = side;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, sx, sy, side, side, 0, 0, side, side);
          onPhoto(c.toDataURL("image/jpeg", 0.92));
          stopWebcam();
        }
      }, 1000);
    }, 200);
    return () => { clearInterval(iv); if (settleTimer) clearTimeout(settleTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, webcamActive]);

  /* ---------------- capture & crop ---------------- */
  const captureVideoFrame = (): string | null => {
    const v = videoRef.current;
    if (!v || v.videoWidth < 2) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.95);
  };

  const cropToFace = (det: Detection) => {
    if (det.crop_b64) { onPhoto(det.crop_b64); return; }
    const frame = captureVideoFrame();
    if (!frame) { setErrMsg("Feed not ready yet — wait for the video to load."); return; }
    const img = new Image();
    img.onload = () => {
      const sx0 = img.naturalWidth / (vidW || 640);
      const sy0 = img.naturalHeight / (vidH || 480);
      const [x1, y1, x2, y2] = det.bbox;
      const pw = (x2 - x1) * 0.22;
      const ph = (y2 - y1) * 0.3;
      const px = Math.max(0, (x1 - pw) * sx0);
      const py = Math.max(0, (y1 - ph) * sy0);
      const pw2 = Math.min(img.naturalWidth - px, (x2 + pw) * sx0 - px);
      const ph2 = Math.min(img.naturalHeight - py, (y2 + ph) * sy0 - py);
      const side = Math.min(pw2, ph2);
      const dx = (pw2 - side) / 2;
      const dy = (ph2 - side) / 2;
      const SIZE = 512;
      const c = document.createElement("canvas");
      c.width = SIZE; c.height = SIZE;
      c.getContext("2d")?.drawImage(img, px + dx, py + dy, side, side, 0, 0, SIZE, SIZE);
      onPhoto(c.toDataURL("image/jpeg", 0.92));
    };
    img.src = frame;
  };

  const openCropModal = () => {
    const frame = captureVideoFrame();
    if (!frame) { setErrMsg("Feed not ready yet — wait for the video to load."); return; }
    setCapturedFrame(frame);
    setCropDims(null);
    cropRef.current = { x: 30, y: 15, s: 40 };
  };

  /* ---------------- manual crop modal ---------------- */
  const cropH = cropDims ? cropRef.current.s * (cropDims.iw / cropDims.ih) : cropRef.current.s;
  const cropClamped = {
    x: Math.min(Math.max(cropRef.current.x, 0), 100 - cropRef.current.s),
    y: Math.min(Math.max(cropRef.current.y, 0), 100 - cropH),
    s: cropRef.current.s,
  };

  const onCropPointerDown = (e: React.PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    if (mode === "move") {
      dragRef.current = { mode, dx: px - cropClamped.x, dy: py - cropClamped.y };
    } else {
      dragRef.current = { mode, dx: px - cropClamped.x, dy: py - cropClamped.y };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    const ar = cropDims ? cropDims.ih / cropDims.iw : 1;
    if (drag.mode === "move") {
      const nx = Math.min(Math.max(px - drag.dx, 0), 100 - cropRef.current.s);
      const ny = Math.min(Math.max(py - drag.dy, 0), 100 - cropH);
      cropRef.current = { ...cropRef.current, x: nx, y: ny };
    } else {
      const w = Math.max(18, Math.min(100, Math.max(px - cropClamped.x, (py - cropClamped.y) * ar)));
      cropRef.current = { x: cropClamped.x, y: cropClamped.y, s: Math.min(w, 100 - cropClamped.x) };
    }
    setCropDims(cropDims ? { ...cropDims } : null);
  };

  const onCropPointerUp = () => {
    dragRef.current = null;
  };

  const confirmCrop = () => {
    const img = imgRef.current;
    if (!img || !cropDims) return;
    const { iw, ih } = cropDims;
    const px = Math.round((cropClamped.x / 100) * iw);
    const py = Math.round((cropClamped.y / 100) * ih);
    const side = Math.round((cropClamped.s / 100) * iw);
    const SIZE = 512;
    const c = document.createElement("canvas");
    c.width = SIZE; c.height = SIZE;
    c.getContext("2d")?.drawImage(img, px, py, side, side, 0, 0, SIZE, SIZE);
    onPhoto(c.toDataURL("image/jpeg", 0.92));
    setCapturedFrame(null);
    setCropDims(null);
  };

  /* ---------------- upload ---------------- */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onPhoto(reader.result);
    };
    reader.readAsDataURL(f);
  };

  /* ---------------- render helpers ---------------- */
  const renderSourceTabs = () => {
    if (captureFrame) return null;
    const tabs: { id: Source; label: string }[] = [
      { id: "cctv", label: "CCTV Camera" },
      { id: "webcam", label: "Webcam" },
      { id: "upload", label: "Upload" },
    ];
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSource(t.id)}
            style={{ ...chipBtn, ...(source === t.id ? chipActive : {}) }}
          >
            {t.id === "cctv" ? <Cctv size={13} /> : t.id === "webcam" ? <Camera size={13} /> : <Upload size={13} />}
            {t.label}
          </button>
        ))}
      </div>
    );
  };

  const renderCCTV = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cameras.length === 0 ? (
        <p style={{ fontSize: 12.5, color: T.textMuted, margin: 0 }}>
          No CCTV cameras found. Add one on the Cameras page first.
        </p>
      ) : (
        <>
          {/* Camera chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cameras.map(c => {
              const online = readySet.has(c.id);
              const active = c.id === selectedCam;
              return (
                <button key={c.id} onClick={() => selectCam(c.id)} style={{ ...chipBtn, ...(active ? chipActive : {}) }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: online ? T.ok : T.stamp, boxShadow: online ? `0 0 6px ${T.ok}` : "none",
                  }} />
                  {c.name}
                  {c.place ? <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 500 }}>· {c.place}</span> : null}
                </button>
              );
            })}
          </div>

          {!selectedCam ? (
            <div style={{
              padding: "26px 16px", textAlign: "center", borderRadius: 12, background: T.bgField,
              border: `1px dashed ${T.lineStrong}`, fontSize: 12.5, color: T.textMuted,
            }}>
              Select a camera above. The model runs on it, faces are detected live,
              and you can pick a face crop or capture a frame and crop it.
            </div>
          ) : (
            <>
              {/* Live feed + detection overlay */}
              <div style={{
                position: "relative", borderRadius: 14, overflow: "hidden", background: "var(--bg-deep)",
                aspectRatio: vidW && vidH ? `${vidW}/${vidH}` : "16/9", border: `1px solid ${T.line}`,
              }}>
                <video ref={videoRef} autoPlay muted playsInline
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                {feedState === "playing" && (detections.length > 0 || bodies.length > 0) && (
                  <BoundingBoxes
                    detections={detections}
                    bodies={bodies}
                    videoWidth={vidW}
                    videoHeight={vidH}
                    onSelectDetection={(det) => cropToFace(det)}
                  />
                )}
                {feedState !== "playing" && (
                  <div style={{
                    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 10, color: "#fff",
                    background: "rgba(5,7,13,0.92)",
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%",
                      border: "3px solid rgba(99,102,241,0.3)", borderTopColor: "#6366f1",
                      animation: "spin 0.8s linear infinite",
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {feedState === "error" ? `Feed error — ${errMsg}` : "Connecting to camera feed…"}
                    </span>
                  </div>
                )}
                {feedState === "playing" && (
                  <div style={{
                    position: "absolute", bottom: 8, left: 8, background: "rgba(15,23,42,0.75)",
                    color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "4px 10px", borderRadius: 99, backdropFilter: "blur(6px)",
                  }}>
                    {detections.length} FACE{detections.length === 1 ? "" : "S"} DETECTED · CLICK A BOX
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={openCropModal} disabled={feedState !== "playing"} style={{ ...btnPrimary, ...(feedState !== "playing" ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}>
                  <Scissors size={14} /> Capture & Crop
                </button>
                {!workersOn && (
                  <button onClick={startWorkers} style={btnSecondary}>
                    <RefreshCw size={13} /> Start face model
                  </button>
                )}
              </div>

              {/* Detected-face quick pick */}
              {detections.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {detections.map((det, i) => (
                    <button key={i} onClick={() => cropToFace(det)} style={chipBtn}>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: det.matched ? T.ok : T.stamp,
                      }} />
                      {det.matched ? det.name : "Unknown"} · {Math.round((det.confidence || 0) * 100)}%
                    </button>
                  ))}
                </div>
              )}

              <p style={{ fontSize: 11.5, color: T.textFaint, margin: 0 }}>
                Click a detected face box (or chip) to auto-crop and use that face,
                or press <strong>Capture &amp; Crop</strong> to frame the visitor manually.
              </p>
              {errMsg && <p style={{ fontSize: 12, color: T.stamp, margin: 0 }}>{errMsg}</p>}
            </>
          )}
        </>
      )}
    </div>
  );

  const renderWebcam = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 180, height: 180, borderRadius: "50%", overflow: "hidden",
        background: T.bgField, border: `2px dashed ${T.lineStrong}`,
        display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <video ref={videoRef} autoPlay playsInline muted
          style={{ width: "100%", height: "100%", objectFit: "cover", display: webcamActive ? "block" : "none" }} />
        {!webcamActive && (
          <p style={{ fontSize: 12, color: T.textMuted, margin: 0, padding: 12, textAlign: "center" }}>
            {webcamError ? "Camera unavailable — use Upload instead." : "Opening camera…"}
          </p>
        )}
        {webcamActive && (
          <span style={{
            position: "absolute", bottom: 14, fontSize: 10, fontWeight: 700, color: T.accent,
            background: "rgba(255,255,255,0.88)", padding: "3px 10px", borderRadius: 99,
            border: `1px solid ${T.line}`, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            Capturing…
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {webcamError && (
          <button onClick={startWebcam} style={btnSecondary}>
            <Camera size={13} /> Retry Camera
          </button>
        )}
        <button onClick={() => fileRef.current?.click()} style={btnSecondary}>
          <Upload size={13} /> Upload Photo
        </button>
      </div>
    </div>
  );

  const renderUpload = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0" }}>
      <div style={{
        width: 180, height: 180, borderRadius: "50%", border: `2px dashed ${T.lineStrong}`,
        background: T.bgField, display: "flex", flexDirection: "column", gap: 6,
        alignItems: "center", justifyContent: "center", color: T.textFaint,
      }}>
        <Upload size={26} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Upload a photo</span>
      </div>
      <button onClick={() => fileRef.current?.click()} style={btnPrimary}>
        <Upload size={14} /> Choose Photo
      </button>
    </div>
  );

  /* ---------------- kiosk mode (live-feed from parent) ---------------- */
  if (captureFrame) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canCapture && (
            <button
              onClick={() => {
                const f = captureFrame();
                if (f) { onPhoto(f); } else { setErrMsg("Live feed frame not ready — wait a moment."); }
              }}
              style={btnPrimary}
            >
              <Camera size={14} /> Capture Live Feed
            </button>
          )}
          <button onClick={() => fileRef.current?.click()} style={btnSecondary}>
            <Upload size={13} /> Upload Photo
          </button>
        </div>
        {errMsg && <p style={{ fontSize: 12, color: T.stamp, margin: 0 }}>{errMsg}</p>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
      </div>
    );
  }

  return (
    <div>
      {renderSourceTabs()}
      {source === "cctv" && renderCCTV()}
      {source === "webcam" && renderWebcam()}
      {source === "upload" && renderUpload()}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />

      {/* Manual crop modal */}
      {capturedFrame && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999, background: "rgba(15,23,42,0.6)",
          backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} onClick={() => { setCapturedFrame(null); setCropDims(null); }}>
          <div style={{
            background: "var(--bg-card)", borderRadius: 18, padding: 20, maxWidth: 640, width: "100%",
            boxShadow: "0 25px 60px rgba(0,0,0,0.3)", color: T.text,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Crop visitor face</div>
                <div style={{ fontSize: 12, color: T.textMuted }}>Drag to move · corner to resize · keep it square</div>
              </div>
              <button onClick={() => { setCapturedFrame(null); setCropDims(null); }}
                style={{ background: "none", border: "none", fontSize: 18, color: T.textFaint, cursor: "pointer", fontWeight: 700 }}>
                ✕
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={capturedFrame}
              alt="captured"
              style={{ display: "none" }}
              onLoad={e => {
                const el = e.currentTarget;
                setCropDims({ iw: el.naturalWidth, ih: el.naturalHeight });
              }}
            />

            <div
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerLeave={onCropPointerUp}
              style={{
                position: "relative", width: "100%", borderRadius: 10, overflow: "hidden",
                aspectRatio: cropDims ? `${cropDims.iw}/${cropDims.ih}` : "16/9",
                background: "var(--bg-deep)", touchAction: "none", userSelect: "none",
                cursor: "crosshair",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedFrame} alt="crop preview" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />

              {/* Dim outside crop */}
              <div style={{
                position: "absolute", inset: 0,
                background:
                  `linear-gradient(to right, rgba(0,0,0,0.6) ${cropClamped.x}%, transparent ${cropClamped.x}%, transparent ${cropClamped.x + cropClamped.s}%, rgba(0,0,0,0.6) ${cropClamped.x + cropClamped.s}%)`,
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", inset: 0,
                background:
                  `linear-gradient(to bottom, rgba(0,0,0,0.6) ${cropClamped.y}%, transparent ${cropClamped.y}%, transparent ${cropClamped.y + cropH}%, rgba(0,0,0,0.6) ${cropClamped.y + cropH}%)`,
                pointerEvents: "none",
              }} />

              {/* Crop square */}
              <div
                onPointerDown={e => onCropPointerDown(e, "move")}
                style={{
                  position: "absolute", left: `${cropClamped.x}%`, top: `${cropClamped.y}%`,
                  width: `${cropClamped.s}%`, height: `${cropH}%`,
                  border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 0 14px rgba(0,0,0,0.35)",
                  borderRadius: 4, cursor: "move", boxSizing: "border-box",
                }}
              >
                <span style={{
                  position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
                  width: 1, height: "calc(100% - 12px)", background: "rgba(255,255,255,0.5)", pointerEvents: "none",
                }} />
                <span style={{
                  position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
                  height: 1, width: "calc(100% - 12px)", background: "rgba(255,255,255,0.5)", pointerEvents: "none",
                }} />
                {/* Resize handle */}
                <span
                  onPointerDown={e => onCropPointerDown(e, "resize")}
                  style={{
                    position: "absolute", right: -6, bottom: -6, width: 16, height: 16,
                    borderRight: "3px solid #fff", borderBottom: "3px solid #fff",
                    borderTopRightRadius: 4, cursor: "nwse-resize", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setCapturedFrame(null); setCropDims(null); }} style={{ ...btnSecondary, flex: 1 }}>
                <X size={14} /> Cancel
              </button>
              <button onClick={confirmCrop} style={{ ...btnPrimary, flex: 1 }}>
                <Check size={14} /> Use this face
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
