"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Hls from "hls.js";
import {
  User, Phone, Building2, CreditCard, Camera, Upload, PenLine,
  Check, ChevronLeft, ChevronRight, Search, RotateCcw, Loader2,
  LayoutGrid, List, Kanban, Table, Filter, Clock, CheckCircle2, UserX, X,
  Video, Scissors, RefreshCw, ChevronDown, Image as ImageIcon, AlertCircle
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Props {
  onSuccess: () => void;
  canCapture?: boolean;
  captureFrame?: () => string | null;
  pendingCrop?: string | null;
}

interface Employee {
  id: string;
  name: string;
  department: string;
  photo: string;
}

type Purpose = "Meeting" | "Interview" | "Delivery" | "Other";

interface VisitorPayload {
  full_name: string;
  phone: string;
  company_name: string | null;
  id_proof_number: string | null;
  purpose_of_visit: Purpose;
  meet_employee_id: string;
  photo_image: string | null;
  signature_image: string;
  badge_no: string;
}

interface VisitorRecord {
  visitor_id: string;
  full_name: string;
  phone: string;
  company_name: string | null;
  id_proof_number: string | null;
  photo_image: string | null;
  signature_image: string | null;
  meet_employee_id: string;
  purpose_of_visit: Purpose | string;
  check_in_time: string;
  check_out_time: string | null;
  is_active?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Design tokens — "Visitor Ledger" Light Theme                       */
/* ------------------------------------------------------------------ */
const T = {
  bg: "#F8FAFC",         // Page background (Slate 50)
  bgPanel: "#FFFFFF",    // Card/Panel background
  bgField: "#F1F5F9",    // Input fields background (Slate 100)
  paper: "#FFFFFF",      // Clean white paper
  paperShadow: "#E2E8F0",// Slate 200
  accent: "#4F46E5",     // Primary accent (Indigo Theme Accent)
  accentDim: "#4338CA",  // Dimmed accent
  stamp: "#EF4444",      // Error/Stamp (Rose)
  ok: "#10B981",         // Success (Emerald)
  line: "#E2E8F0",       // Borders (Slate 200)
  lineStrong: "#CBD5E1", // Stronger borders (Slate 300)
  text: "#0F172A",       // Primary text (Slate 900)
  textMuted: "#475569",  // Secondary text (Slate 600)
  textFaint: "#94A3B8",  // Tertiary text (Slate 400)
} as const;

const PURPOSES: Purpose[] = ["Meeting", "Interview", "Delivery", "Other"];

const STEPS: { n: 1 | 2 | 3; label: string; icon: typeof User }[] = [
  { n: 1, label: "Visitor", icon: User },
  { n: 2, label: "Host & purpose", icon: Building2 },
  { n: 3, label: "Verify", icon: Camera },
];

function genBadgeNo(): string {
  return "VIS-" + Math.floor(1000 + Math.random() * 9000);
}

function Barcode() {
  return (
    <div style={{ display: "flex", height: 22, gap: "1px", alignItems: "stretch", width: "100%", opacity: 0.65, marginTop: 12 }}>
      {[2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 1, 4, 3, 2, 1, 2].map((w, idx) => (
        <div key={idx} style={{ flexGrow: w, background: "var(--violet-deep)" }} />
      ))}
    </div>
  );
}

const CornerMarker = ({ position }: { position: "tl" | "tr" | "bl" | "br" }) => {
  const style: CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    borderColor: "#4F46E5",
    borderStyle: "solid",
    borderWidth: 0,
    zIndex: 10,
  };
  if (position === "tl") { style.top = 8; style.left = 8; style.borderTopWidth = 2; style.borderLeftWidth = 2; }
  if (position === "tr") { style.top = 8; style.right = 8; style.borderTopWidth = 2; style.borderRightWidth = 2; }
  if (position === "bl") { style.bottom = 8; style.left = 8; style.borderBottomWidth = 2; style.borderLeftWidth = 2; }
  if (position === "br") { style.bottom = 8; style.right = 8; style.borderBottomWidth = 2; style.borderRightWidth = 2; }
  return <div style={style} />;
};

const AVATAR_COLORS = ["#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function Avatar({ src, name, size, radius }: { src?: string | null; name: string; size: number; radius?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={{ width: size, height: size, borderRadius: radius ?? "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  const init = initialsOf(name) || "?";
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const bg = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <div style={{ width: size, height: size, borderRadius: radius ?? "50%", background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: Math.max(10, size * 0.38), flexShrink: 0 }}>
      {init}
    </div>
  );
}

export default function VisitorsPanel({ onSuccess, canCapture = false, captureFrame, pendingCrop = null }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [badgeNo, setBadgeNo] = useState<string>("");
  const [registeredEmployees, setRegisteredEmployees] = useState<Employee[]>([]);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const handleCheckout = async (visitorId: string) => {
    setCheckingOutId(visitorId);
    try {
      const res = await fetch("/api/visitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: visitorId }),
      });
      if (res.ok) {
        await loadVisitors();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to check out visitor.");
      }
    } catch (err) {
      console.error("Error during checkout:", err);
      alert("Network error — check your connection and try again.");
    } finally {
      setCheckingOutId(null);
    }
  };

  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);

  const handleToggleActive = async (v: VisitorRecord) => {
    const target = !v.is_active;
    setTogglingActiveId(v.visitor_id);
    try {
      const res = await fetch(`/api/visitors/${v.visitor_id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: target }),
      });
      if (res.ok) {
        await loadVisitors();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update visitor status.");
      }
    } catch (err) {
      console.error("Error toggling visitor status:", err);
      alert("Network error while updating visitor status.");
    } finally {
      setTogglingActiveId(null);
    }
  };

  // Step 1
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [idProof, setIdProof] = useState("");

  // Step 2
  const [purpose, setPurpose] = useState<Purpose>("Meeting");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  // Step 3 Photo & Camera State
  const [photo, setPhoto] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  // Camera Source & Crop States
  type CameraMode = "webcam" | "rtsp" | "upload";
  const [cameraMode, setCameraMode] = useState<CameraMode>("rtsp");
  const [rtspCameras, setRtspCameras] = useState<{ id: string; name: string; place?: string }[]>([]);
  const [selectedRtspCam, setSelectedRtspCam] = useState<{ id: string; name: string; place?: string } | null>(null);
  const [readySet, setReadySet] = useState<Set<string>>(new Set());
  const [isRtspLoading, setIsRtspLoading] = useState(false);
  const [rtspError, setRtspError] = useState("");
  const [ipCamOpen, setIpCamOpen] = useState(false);
  const [ipCamPreview, setIpCamPreview] = useState<string | null>(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const livePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [capturedRawFrame, setCapturedRawFrame] = useState<string | null>(null);
  const [isCropMode, setIsCropMode] = useState(false);

  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cropRectRef = useRef<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  const isDraggingCropRef = useRef<boolean>(false);
  const frameImgRef = useRef<HTMLImageElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);

  // --- Logs Section State ---
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "kanban" | "grid" | "list">("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "checked-in" | "checked-out" | "active" | "inactive">("all");
  const [purposeFilter, setPurposeFilter] = useState<"all" | Purpose | string>("all");
  const [isFetchingLogs, setIsFetchingLogs] = useState(true);

  // Edit / Delete State
  const [editingVisitor, setEditingVisitor] = useState<VisitorRecord | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDeleteVisitor = async (visitorId: string) => {
    if (!confirm("Are you sure you want to completely delete this visitor record? This action cannot be undone.")) return;

    setIsDeleting(visitorId);
    try {
      const res = await fetch(`/api/visitors?visitor_id=${visitorId}`, { method: "DELETE" });
      if (res.ok) {
        await loadVisitors();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete visitor.");
      }
    } catch (err) {
      console.error("Error deleting visitor:", err);
      alert("Network error while deleting visitor.");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVisitor) return;

    setIsSavingEdit(true);
    try {
      const res = await fetch("/api/visitors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingVisitor)
      });
      if (res.ok) {
        setEditingVisitor(null);
        await loadVisitors();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update visitor.");
      }
    } catch (err) {
      console.error("Error saving visitor edit:", err);
      alert("Network error while updating visitor.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const loadVisitors = async () => {
    setIsFetchingLogs(true);
    try {
      const res = await fetch("/api/visitors");
      if (res.ok) {
        const data = await res.json();
        setVisitors(data);
      }
    } catch (err) {
      console.error("Error loading visitors:", err);
    } finally {
      setIsFetchingLogs(false);
    }
  };

  useEffect(() => {
    loadVisitors();
  }, []);

  // Fetch registered known faces from database
  useEffect(() => {
    setBadgeNo(genBadgeNo());
    async function loadFaces() {
      try {
        const res = await fetch("/api/registered_faces");
        if (!res.ok) throw new Error(`Failed to load employees (${res.status})`);
        const data = await res.json();
        const mapped: Employee[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          department: item.department || "Staff",
          photo: item.photo_url || "",
        }));
        setRegisteredEmployees(mapped);
      } catch (err) {
        console.error("Error loading registered faces:", err);
        setRegisteredEmployees([]);
      }
    }
    loadFaces();
  }, []);

  const selectedEmployee: Employee | null =
    registeredEmployees.find((e) => e.id === selectedId) || null;
  const filteredEmployees = registeredEmployees.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.department.toLowerCase().includes(query.toLowerCase())
  );

  /* ---------------- validation ---------------- */
  const isStep1Valid = (): boolean => {
    const phoneRegex = /^[0-9\s\-+()]{10,15}$/;
    return fullName.trim().length >= 3 && phoneRegex.test(phone.trim());
  };
  const isStep2Valid = (): boolean => selectedId !== "";
  const isStep3Valid = (): boolean => photo !== null && hasSignature;

  /* ---------------- camera & streaming ---------------- */

  const fetchRtspCameras = async () => {
    try {
      const res = await fetch("/api/cameras");
      if (res.ok) {
        const data = await res.json();
        setRtspCameras(data || []);
      }
    } catch (err) {
      console.error("Error loading RTSP cameras:", err);
    }
  };

  // Poll MediaMTX to know which cameras are actually streaming right now,
  // then auto-select the first ONLINE camera (avoids the "404 / not opening"
  // issue you get when the first camera in the list is offline).
  useEffect(() => {
    let mounted = true;
    const checkReady = async () => {
      try {
        const r = await fetch(`http://${window.location.hostname}:9997/v3/paths/list`);
        if (r.ok) {
          const d = await r.json();
          const ready = new Set<string>(
            (d.items || []).filter((p: any) => p.ready === true).map((p: any) => p.name as string)
          );
          if (mounted) setReadySet(ready);
        }
      } catch { }
    };
    checkReady();
    const iv = setInterval(checkReady, 10000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // Prefer an online camera when picking the default.
  useEffect(() => {
    if (!rtspCameras.length || selectedRtspCam) return;
    if (readySet.size) {
      const online = rtspCameras.find(c => readySet.has(c.id));
      setSelectedRtspCam(online || rtspCameras[0]);
    } else {
      setSelectedRtspCam(rtspCameras[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtspCameras, readySet, selectedRtspCam]);

  function stopHlsStream() {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.src && videoRef.current.src.includes("blob:")) {
      videoRef.current.pause();
    }
  }

  function stopWebcam() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      setCameraActive(false);
    }
  }

  function stopAllStreams() {
    stopWebcam();
    stopHlsStream();
  }

  async function startWebcam() {
    stopAllStreams();
    setCameraError(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
      }
      setCameraActive(true);
    } catch (err) {
      console.warn("Webcam access denied or unavailable:", err);
      setCameraActive(false);
      setCameraError(true);
    }
  }

  function startRtspHlsStream(camId: string) {
    stopAllStreams();
    setIsRtspLoading(true);
    setRtspError("");
    const video = videoRef.current;
    if (!video) return;

    const hlsUrl = `${window.location.protocol}//${window.location.hostname}:8892/${camId}/index.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        maxBufferLength: 4,
        liveSyncDurationCount: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => { });
        setIsRtspLoading(false);
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setRtspError("Camera stream unavailable. Verify camera is online.");
          setIsRtspLoading(false);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.play().catch(() => { });
      setIsRtspLoading(false);
    } else {
      setRtspError("HLS playback is not supported in this browser.");
      setIsRtspLoading(false);
    }
  }

  // Manage streams on step 3 lifecycle
  useEffect(() => {
    // Stop any running live polling first
    if (livePollingRef.current) {
      clearInterval(livePollingRef.current);
      livePollingRef.current = null;
    }
    setIsLiveStreaming(false);

    if (step === 3 && !photo && !isCropMode) {
      fetchRtspCameras();
      if (cameraMode === "webcam") {
        startWebcam();
      }
      // IP camera (rtsp) is opened manually via "Open Live Feed" button
    } else {
      stopAllStreams();
    }
    // Reset IP cam state when mode or camera changes
    setIpCamOpen(false);
    setIpCamPreview(null);
    setRtspError("");
    return () => {
      stopAllStreams();
      if (livePollingRef.current) {
        clearInterval(livePollingRef.current);
        livePollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, photo, isCropMode, cameraMode, selectedRtspCam?.id]);



  // Auto-fill from external pending crop if provided
  useEffect(() => {
    if (pendingCrop && step === 3) {
      setPhoto(pendingCrop);
      setError("");
    }
  }, [pendingCrop, step]);

  // Webcam auto-capture (kiosk mode): once the webcam is actually streaming,
  // snap a centred headshot automatically so the visitor doesn't have to press
  // a button. Falls back to the manual "Capture Live Feed" button if the
  // camera can't produce frames.
  useEffect(() => {
    if (cameraMode !== "webcam" || !cameraActive || photo || isCropMode || step !== 3) return;
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
          setPhoto(c.toDataURL("image/jpeg", 0.92));
          stopWebcam();
        }
      }, 1000);
    }, 200);
    return () => { clearInterval(iv); if (settleTimer) clearTimeout(settleTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, cameraActive, photo, isCropMode, step]);

  /* ---------------- capture & crop ---------------- */

  function captureVideoSnapshot() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 10) {
      setError("Camera video stream is not ready.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    stopAllStreams();
    setCapturedRawFrame(dataUrl);
    setIsCropMode(true);
    setError("");

    const img = new Image();
    img.onload = () => {
      frameImgRef.current = img;
      const side = Math.min(img.naturalWidth, img.naturalHeight) * 0.6;
      const cx = (img.naturalWidth - side) / 2;
      const cy = (img.naturalHeight - side) / 2;
      const initialRect = { x: cx, y: cy, w: side, h: side };
      cropRectRef.current = initialRect;
      renderCropCanvas(img, initialRect);
    };
    img.src = dataUrl;
  }

  async function captureDirectRtspSnapshot() {
    if (!selectedRtspCam) return;
    try {
      setIsRtspLoading(true);
      setError("");
      setRtspError("");
      const res = await fetch(`/api/cameras/${selectedRtspCam.id}/snapshot_direct`);
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to capture snapshot");
      }
      stopAllStreams();
      setCapturedRawFrame(data.image);
      setIsCropMode(true);

      const img = new Image();
      img.onload = () => {
        frameImgRef.current = img;
        const side = Math.min(img.naturalWidth, img.naturalHeight) * 0.6;
        const cx = (img.naturalWidth - side) / 2;
        const cy = (img.naturalHeight - side) / 2;
        const initialRect = { x: cx, y: cy, w: side, h: side };
        cropRectRef.current = initialRect;
        renderCropCanvas(img, initialRect);
      };
      img.src = data.image;
    } catch (err: any) {
      setRtspError(err.message || "Could not fetch snapshot from IP Camera.");
    } finally {
      setIsRtspLoading(false);
    }
  }

  function handleFileChangeCrop(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    stopAllStreams();
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setCapturedRawFrame(dataUrl);
      setIsCropMode(true);
      setError("");

      const img = new Image();
      img.onload = () => {
        frameImgRef.current = img;
        const side = Math.min(img.naturalWidth, img.naturalHeight) * 0.6;
        const cx = (img.naturalWidth - side) / 2;
        const cy = (img.naturalHeight - side) / 2;
        const initialRect = { x: cx, y: cy, w: side, h: side };
        cropRectRef.current = initialRect;
        renderCropCanvas(img, initialRect);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function renderCropCanvas(img: HTMLImageElement, rect: { x: number; y: number; w: number; h: number }) {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw base raw image
    ctx.drawImage(img, 0, 0);

    if (rect.w > 4 && rect.h > 4) {
      // Dark overlay outside rectangle
      ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear inside rectangle & redraw crisp section
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);

      // Draw indigo border
      ctx.strokeStyle = "#4F46E5";
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      // Corner handles
      const dotSize = 10;
      ctx.fillStyle = "#4F46E5";
      ctx.fillRect(rect.x - dotSize / 2, rect.y - dotSize / 2, dotSize, dotSize);
      ctx.fillRect(rect.x + rect.w - dotSize / 2, rect.y - dotSize / 2, dotSize, dotSize);
      ctx.fillRect(rect.x - dotSize / 2, rect.y + rect.h - dotSize / 2, dotSize, dotSize);
      ctx.fillRect(rect.x + rect.w - dotSize / 2, rect.y + rect.h - dotSize / 2, dotSize, dotSize);
    }
  }

  function getCropPointerPos(e: any, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function handleCropPointerDown(e: any) {
    const canvas = cropCanvasRef.current;
    if (!canvas || !frameImgRef.current) return;
    const pos = getCropPointerPos(e, canvas);
    cropStartRef.current = pos;
    cropRectRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
    isDraggingCropRef.current = true;
  }

  function handleCropPointerMove(e: any) {
    if (!isDraggingCropRef.current || !cropCanvasRef.current || !frameImgRef.current) return;
    const canvas = cropCanvasRef.current;
    const pos = getCropPointerPos(e, canvas);
    const x = Math.min(cropStartRef.current.x, pos.x);
    const y = Math.min(cropStartRef.current.y, pos.y);
    const w = Math.abs(pos.x - cropStartRef.current.x);
    const h = Math.abs(pos.y - cropStartRef.current.y);
    cropRectRef.current = { x, y, w, h };
    renderCropCanvas(frameImgRef.current, { x, y, w, h });
  }

  function handleCropPointerUp() {
    isDraggingCropRef.current = false;
    if (frameImgRef.current) {
      renderCropCanvas(frameImgRef.current, cropRectRef.current);
    }
  }

  function applyCropSelection() {
    const { x, y, w, h } = cropRectRef.current;
    if (w < 15 || h < 15 || !frameImgRef.current) {
      if (capturedRawFrame) setPhoto(capturedRawFrame);
      setIsCropMode(false);
      return;
    }
    const outCanvas = document.createElement("canvas");
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frameImgRef.current, x, y, w, h, 0, 0, w, h);
    setPhoto(outCanvas.toDataURL("image/jpeg", 0.92));
    setIsCropMode(false);
  }

  function useFullFrame() {
    if (capturedRawFrame) {
      setPhoto(capturedRawFrame);
      setIsCropMode(false);
    }
  }

  function resetPhotoSelection() {
    setPhoto(null);
    setCapturedRawFrame(null);
    setIsCropMode(false);
    if (cameraMode === "webcam") {
      startWebcam();
    } else if (cameraMode === "rtsp" && selectedRtspCam) {
      startRtspHlsStream(selectedRtspCam.id);
    }
  }

  /* ---------------- signature pad ---------------- */
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      const wrap = canvasWrapRef.current;
      if (!canvas || !wrap) return;
      canvas.width = wrap.clientWidth;
      canvas.height = 130;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.strokeStyle = T.text; // Dark stroke for light paper
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
    if (step === 3) {
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
  }, [step]);

  function pointerPos(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      if (e.cancelable) e.preventDefault();
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!isDrawingRef.current || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDrawing() {
    isDrawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  /* ---------------- submit ---------------- */
  async function handleSubmit() {
    if (!isStep1Valid() || !isStep2Valid() || !isStep3Valid()) {
      setError("Complete every required field before checking in.");
      return;
    }
    setLoading(true);
    setError("");

    let signatureImage = "";
    if (canvasRef.current) signatureImage = canvasRef.current.toDataURL("image/png");

    const payload: VisitorPayload = {
      full_name: fullName.trim(),
      phone: phone.trim(),
      company_name: companyName.trim() || null,
      id_proof_number: idProof.trim() || null,
      purpose_of_visit: purpose,
      meet_employee_id: selectedId,
      photo_image: photo,
      signature_image: signatureImage,
      badge_no: badgeNo,
    };

    try {
      const res = await fetch("/api/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Failed to check in visitor.");
      }

      setCheckedIn(true);
      loadVisitors(); // Refresh the logs!
      setTimeout(() => onSuccess?.(), 1800);
    } catch (err: any) {
      console.error("Visitor check-in failed:", err);
      setError(err.message || "Network error — check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setStep(1);
    setFullName("");
    setPhone("");
    setCompanyName("");
    setIdProof("");
    setPurpose("Meeting");
    setSelectedId("");
    setQuery("");
    setPhoto(null);
    setHasSignature(false);
    setCheckedIn(false);
    setError("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onloadend = () => setPhoto(reader.result as string);
    reader.readAsDataURL(f);
  }

  /* ---------------- filtering logs ---------------- */
  const filteredVisitors = visitors.filter((v) => {
    const searchLower = searchQuery.toLowerCase();
    const hostName = registeredEmployees.find(e => e.id === v.meet_employee_id)?.name || "";
    const matchSearch =
      v.full_name?.toLowerCase().includes(searchLower) ||
      v.company_name?.toLowerCase().includes(searchLower) ||
      hostName.toLowerCase().includes(searchLower);

    let matchStatus = true;
    if (statusFilter === "checked-in") matchStatus = !v.check_out_time;
    if (statusFilter === "checked-out") matchStatus = !!v.check_out_time;
    if (statusFilter === "active") matchStatus = v.is_active !== false;
    if (statusFilter === "inactive") matchStatus = v.is_active === false;

    let matchPurpose = true;
    if (purposeFilter !== "all") matchPurpose = v.purpose_of_visit === purposeFilter;

    return matchSearch && matchStatus && matchPurpose;
  });

  const getHostName = (id: string) => registeredEmployees.find(e => e.id === id)?.name || "Unknown Host";
  const getHost = (id: string) => registeredEmployees.find(e => e.id === id);

  /* ================================================================== */
  /*  Log View Renderers                                                */
  /* ================================================================== */

  const renderToolbar = () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 12, flex: 1, minWidth: 220, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <Search size={14} color={T.textMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            placeholder="Search visitors, hosts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...input, paddingLeft: 34 }}
            className="vr-input"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{ ...select, width: 150 }}
          className="vr-select"
        >
          <option value="all">All Status</option>
          <option value="checked-in">Checked In</option>
          <option value="checked-out">Checked Out</option>
          <option value="active">Recognition Active</option>
          <option value="inactive">Recognition Off</option>
        </select>
        <select
          value={purposeFilter}
          onChange={(e) => setPurposeFilter(e.target.value as any)}
          style={{ ...select, width: 140 }}
          className="vr-select"
        >
          <option value="all">All Purposes</option>
          {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", background: T.bgField, padding: 4, borderRadius: 10, border: `1px solid ${T.line}` }}>
        {[
          { id: "table", icon: Table },
          { id: "kanban", icon: Kanban },
          { id: "grid", icon: LayoutGrid },
          { id: "list", icon: List },
        ].map(mode => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id as any)}
            style={{
              padding: "6px 10px", borderRadius: 6, cursor: "pointer", border: "none",
              background: viewMode === mode.id ? T.bgPanel : "transparent",
              color: viewMode === mode.id ? T.accent : T.textMuted,
              boxShadow: viewMode === mode.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.2s"
            }}
            title={`Switch to ${mode.id} view`}
          >
            <mode.icon size={16} />
          </button>
        ))}
      </div>
    </div>
  );

  const renderStatusBadge = (v: VisitorRecord) => {
    if (v.check_out_time) return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#F3F4F6", color: T.textMuted, fontSize: 11, borderRadius: 20, fontWeight: 600 }}><CheckCircle2 size={12} /> Checked out</span>;
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(5, 150, 105, 0.1)", color: T.ok, fontSize: 11, borderRadius: 20, fontWeight: 600 }}><Clock size={12} /> Active now</span>;
  };

  const renderActionButtons = (v: VisitorRecord) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        onClick={() => handleToggleActive(v)}
        disabled={togglingActiveId === v.visitor_id}
        title={v.is_active !== false ? "Click to stop recognition" : "Click to enable recognition"}
        className="vr-btn"
        style={{
          padding: "4px 10px",
          background: v.is_active !== false ? "rgba(5, 150, 105, 0.1)" : "rgba(239, 68, 68, 0.08)",
          border: `1px solid ${v.is_active !== false ? "rgba(5,150,105,0.25)" : "rgba(239,68,68,0.25)"}`,
          borderRadius: 6,
          color: v.is_active !== false ? "#059669" : "#ef4444",
          fontSize: 11, fontWeight: 700, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}
      >
        {togglingActiveId === v.visitor_id ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : null}
        {v.is_active !== false ? "Active" : "Inactive"}
      </button>
      {!v.check_out_time ? (
        <button
          onClick={() => handleCheckout(v.visitor_id)}
          disabled={checkingOutId === v.visitor_id}
          className="vr-btn"
          style={{
            padding: "4px 10px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 6, color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 4
          }}
        >
          {checkingOutId === v.visitor_id ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : null}
          Check Out
        </button>
      ) : (
        <span style={{ fontSize: 11, color: T.textFaint, padding: "4px 0" }}>
          Out: {new Date(v.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <button
        onClick={() => setEditingVisitor(v)}
        className="vr-btn"
        title="Edit Visitor"
        style={{ padding: "4px 8px", background: "rgba(79, 70, 229, 0.08)", border: "1px solid rgba(79, 70, 229, 0.2)", borderRadius: 6, color: T.accent, cursor: "pointer", display: "inline-flex", alignItems: "center" }}
      >
        <PenLine size={13} />
      </button>
      <button
        onClick={() => handleDeleteVisitor(v.visitor_id)}
        disabled={isDeleting === v.visitor_id}
        className="vr-btn"
        title="Delete Visitor"
        style={{ padding: "4px 8px", background: "rgba(100, 116, 139, 0.08)", border: "1px solid rgba(100, 116, 139, 0.2)", borderRadius: 6, color: T.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center" }}
      >
        {isDeleting === v.visitor_id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <UserX size={13} />}
      </button>
    </div>
  );

  const renderTableView = () => (
    <div style={{ overflowX: "auto", background: T.bgPanel, border: `1px solid ${T.line}`, borderRadius: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
        <thead>
          <tr style={{ background: T.bgField, color: T.textMuted, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" }}>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Visitor</th>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Company</th>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Host</th>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Purpose</th>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Status</th>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Time In</th>
            <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: `1px solid ${T.line}` }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredVisitors.map((v) => (
            <tr key={v.visitor_id} style={{ borderBottom: `1px solid ${T.line}`, transition: "background 0.2s" }} className="hover-row">
              <td style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar src={v.photo_image} name={v.full_name} size={32} />
                <div>
                  <div style={{ fontWeight: 600, color: T.text }}>{v.full_name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{v.phone}</div>
                </div>
              </td>
              <td style={{ padding: "12px 16px", color: T.textMuted }}>{v.company_name || "—"}</td>
              <td style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(() => { const h = getHost(v.meet_employee_id); return <Avatar src={h?.photo} name={h?.name || "Unknown Host"} size={20} />; })()}
                  <span style={{ fontWeight: 500, color: T.text }}>{getHostName(v.meet_employee_id)}</span>
                </div>
              </td>
              <td style={{ padding: "12px 16px", color: T.textMuted }}>{v.purpose_of_visit}</td>
              <td style={{ padding: "12px 16px" }}>{renderStatusBadge(v)}</td>
              <td style={{ padding: "12px 16px", color: T.textMuted, fontSize: 12 }}>
                {new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td style={{ padding: "12px 16px" }}>
                {renderActionButtons(v)}
              </td>
            </tr>
          ))}
          {filteredVisitors.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: T.textMuted }}>No visitors found matching your criteria.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderKanbanView = () => {
    const active = filteredVisitors.filter(v => !v.check_out_time);
    const completed = filteredVisitors.filter(v => !!v.check_out_time);

    const KanbanCard = ({ v }: { v: VisitorRecord }) => (
      <div style={{ background: T.bgPanel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 10, marginBottom: 10, boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Avatar src={v.photo_image} name={v.full_name} size={44} radius={10} />
          <div>
            <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: T.text }}>{v.full_name}</h4>
            <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>{v.company_name || v.phone}</p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px dashed ${T.line}`, paddingTop: 10, marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textMuted }}>
            {(() => { const h = getHost(v.meet_employee_id); return <Avatar src={h?.photo} name={h?.name || "Unknown Host"} size={16} />; })()}
            {getHostName(v.meet_employee_id)}
          </div>
          <span style={{ fontSize: 11, background: T.bgField, padding: "2px 6px", borderRadius: 4, color: T.textMuted }}>
            {new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          {renderActionButtons(v)}
        </div>
      </div>
    );

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Clock size={16} color={T.accent} /> Active Visitors</h3>
            <span style={{ background: T.accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>{active.length}</span>
          </div>
          <div style={{ background: T.bgField, borderRadius: 16, padding: 10, minHeight: 400 }}>
            {active.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontSize: 13 }}>No active visitors.</div> : active.map(v => <KanbanCard key={v.visitor_id} v={v} />)}
          </div>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={16} color={T.textMuted} /> Checked Out</h3>
            <span style={{ background: T.lineStrong, color: T.text, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>{completed.length}</span>
          </div>
          <div style={{ background: T.bgField, borderRadius: 16, padding: 10, minHeight: 400, opacity: 0.8 }}>
            {completed.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: T.textMuted, fontSize: 13 }}>No checked out visitors.</div> : completed.map(v => <KanbanCard key={v.visitor_id} v={v} />)}
          </div>
        </div>
      </div>
    );
  };

  const renderGridView = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
      {filteredVisitors.map(v => (
        <div key={v.visitor_id} style={{ background: T.bgPanel, border: `1px solid ${T.line}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column" }}>
          <div style={{ height: 160, background: T.bgField, position: "relative" }}>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <Avatar src={v.photo_image} name={v.full_name} size={160} radius={0} />
            </div>
            <div style={{ position: "absolute", top: 10, right: 10 }}>{renderStatusBadge(v)}</div>
          </div>
          <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <h4 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: T.text }}>{v.full_name}</h4>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: T.textMuted }}>{v.company_name || v.phone}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.bgField, borderRadius: 8, marginBottom: 10 }}>
                {(() => { const h = getHost(v.meet_employee_id); return <Avatar src={h?.photo} name={h?.name || "Unknown Host"} size={24} />; })()}
                <div style={{ fontSize: 11 }}>
                  <span style={{ display: "block", color: T.textMuted, fontWeight: 500 }}>Host</span>
                  <span style={{ display: "block", color: T.text, fontWeight: 600 }}>{getHostName(v.meet_employee_id)}</span>
                </div>
              </div>
            </div>
            <div style={{ paddingTop: 4 }}>
              {renderActionButtons(v)}
            </div>
          </div>
        </div>
      ))}
      {filteredVisitors.length === 0 && (
        <div style={{ gridColumn: "1/-1", padding: 60, textAlign: "center", color: T.textMuted }}>No visitors found.</div>
      )}
    </div>
  );

  const renderListView = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {filteredVisitors.map(v => (
        <div key={v.visitor_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: T.bgPanel, border: `1px solid ${T.line}`, borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar src={v.photo_image} name={v.full_name} size={40} />
            <div>
              <div style={{ fontWeight: 600, color: T.text, fontSize: 14 }}>{v.full_name}</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{v.company_name ? `${v.company_name} • ` : ""}{v.purpose_of_visit} • Meeting {getHostName(v.meet_employee_id)}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 13, color: T.textMuted }}>{new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ fontSize: 11, color: T.textFaint }}>{new Date(v.check_in_time).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
            </div>
            {renderStatusBadge(v)}
            {renderActionButtons(v)}
          </div>
        </div>
      ))}
      {filteredVisitors.length === 0 && (
        <div style={{ padding: 60, textAlign: "center", color: T.textMuted }}>No visitors found.</div>
      )}
    </div>
  );

  /* ================================================================== */


  return (
    <div style={{ background: "transparent", padding: 0, margin: 0, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .vr-shell { display: grid; grid-template-columns: 1fr 350px; gap: 20px; width: calc(100% - 20px); margin: 10px auto; align-items: start; }
        @media (max-width: 960px) { .vr-shell { grid-template-columns: 1fr; } .vr-badge-col { order: -1; } }
        .vr-fade { animation: vrFade .28s ease; }
        @keyframes vrFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .vr-stamp { animation: vrStamp .5s cubic-bezier(.2,1.4,.4,1) forwards; }
        @keyframes vrStamp { 0% { opacity: 0; transform: rotate(-12deg) scale(2.2); } 60% { opacity: 1; } 100% { opacity: 1; transform: rotate(-8deg) scale(1); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes scan-laser {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        
        /* Modern, Interactive Inputs and Selects */
        .vr-input, .vr-select {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .vr-input:hover, .vr-select:hover {
          border-color: ${T.lineStrong} !important;
          background: #FAFBFD !important;
        }
        .vr-input:focus, .vr-select:focus {
          border-color: ${T.accent} !important;
          background: #FFFFFF !important;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15) !important;
          outline: none !important;
        }
        
        /* Modern, Interactive Buttons */
        .vr-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .vr-btn:hover:not(:disabled) {
          filter: brightness(0.95);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
        }
        .vr-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .vr-btn:focus-visible {
          outline: 2px solid ${T.accent};
          outline-offset: 2px;
        }
        .hover-row:hover {
          background-color: #F8FAFC !important;
        }
      `}</style>

      <div className="vr-shell">
        {/* ---------------- LEFT: form ---------------- */}
        <div style={{ background: T.bgPanel, border: `1px solid ${T.line}`, borderRadius: 18, padding: "28px 28px 24px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.accent, textTransform: "uppercase" }}>
              Visitor Registration Kiosk
            </span>
            <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, background: T.paper, padding: "4px 10px", borderRadius: 20, border: `1px solid ${T.line}` }}>
              Step {step} of 3
            </div>
          </div>

          {/* stepper */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "0 0 auto" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 34, height: 34, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: done ? T.accent : active ? T.bgField : "transparent",
                        border: `1.5px solid ${done || active ? T.accent : T.lineStrong}`,
                        color: done ? "#fff" : active ? T.accent : T.textFaint,
                        transition: "all .2s",
                      }}
                    >
                      {done ? <Check size={15} /> : <Icon size={15} />}
                    </div>
                    <span style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: active ? T.text : T.textFaint, fontWeight: 600 }}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 1.5, margin: "0 8px 10px", background: step > s.n ? T.accent : T.line, transition: "background .2s" }} />
                  )}
                </div>
              );
            })}
          </div>

          {checkedIn ? (
            <div className="vr-fade" style={{ textAlign: "center", padding: "36px 12px" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(5,150,105,0.1)", border: `1.5px solid ${T.ok}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                <Check size={26} color={T.ok} />
              </div>
              <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 20, color: T.text, margin: "0 0 6px" }}>
                {fullName.trim()} is checked in
              </h2>
              <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>
                Badge {badgeNo} · meeting {selectedEmployee?.name}
              </p>
              <button className="vr-btn" onClick={resetForm} style={btnSecondary}>
                <RotateCcw size={14} /> Register next visitor
              </button>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="vr-fade" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="Full name" required icon={User}>
                    <input className="vr-input" style={input} placeholder="e.g. Liam Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </Field>
                  <Field label="Phone number" required icon={Phone}>
                    <input className="vr-input" style={input} placeholder="e.g. 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                  <Field label="Company" icon={Building2}>
                    <input className="vr-input" style={input} placeholder="e.g. Acme Corp" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </Field>
                  <Field label="ID proof number" icon={CreditCard}>
                    <input className="vr-input" style={input} placeholder="e.g. passport or licence no." value={idProof} onChange={(e) => setIdProof(e.target.value)} />
                  </Field>
                  <button className="vr-btn" disabled={!isStep1Valid()} onClick={() => setStep(2)} style={{ ...btnPrimary, opacity: isStep1Valid() ? 1 : 0.4, marginTop: 6 }}>
                    Continue <ChevronRight size={15} />
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="vr-fade" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="Purpose of visit">
                    <select className="vr-select" style={select} value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
                      {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>

                  <Field label="Who are they meeting" required>
                    <div style={{ position: "relative", marginBottom: 10 }}>
                      <Search size={14} color={T.textMuted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                      <input
                        className="vr-input"
                        style={{ ...input, paddingLeft: 34 }}
                        placeholder="Search name or department"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                      {filteredEmployees.length === 0 && (
                        <p style={{ gridColumn: "1/-1", fontSize: 12.5, color: T.textMuted }}>No one matches that search.</p>
                      )}
                      {filteredEmployees.map((emp) => {
                        const sel = selectedId === emp.id;
                        return (
                          <button
                            key={emp.id}
                            className="vr-emp"
                            onClick={() => setSelectedId(emp.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                              padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                              background: sel ? "rgba(217,119,6,0.08)" : T.bgField,
                              border: `1px solid ${sel ? T.accent : T.line}`,
                              transition: "all .15s",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={emp.photo} alt="" width={30} height={30} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                            <span style={{ overflow: "hidden" }}>
                              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{emp.name}</span>
                              <span style={{ display: "block", fontSize: 11, color: T.textMuted }}>{emp.department}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button className="vr-btn" onClick={() => setStep(1)} style={{ ...btnSecondary, flex: 1, margin: 0 }}>
                      <ChevronLeft size={15} /> Back
                    </button>
                    <button className="vr-btn" disabled={!isStep2Valid()} onClick={() => setStep(3)} style={{ ...btnPrimary, flex: 1, opacity: isStep2Valid() ? 1 : 0.4 }}>
                      Continue <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="vr-fade" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field label="Photo" required>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
                      {photo ? (
                        <>
                          <div style={{
                            width: 180, height: 180, borderRadius: "50%", overflow: "hidden",
                            background: T.bgField, border: `3px solid ${T.ok}`,
                            boxShadow: "0 12px 28px rgba(16,185,129,0.2)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            position: "relative"
                          }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo} alt="Visitor" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.ok, display: "flex", alignItems: "center", gap: 4 }}>
                            <CheckCircle2 size={13} /> Photo Captured & Verified
                          </span>
                          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                            <button className="vr-btn" onClick={resetPhotoSelection} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                              <RotateCcw size={13} /> Change Photo / Retake
                            </button>
                            <button className="vr-btn" onClick={() => fileRef.current?.click()} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                              <Upload size={13} /> Upload File
                            </button>
                          </div>
                        </>
                      ) : isCropMode && capturedRawFrame ? (
                        /* ── Interactive Face Crop Mode ── */
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <div style={{
                            position: "relative", width: "100%", maxWidth: 440, height: 260,
                            borderRadius: 12, overflow: "hidden", border: `2px solid ${T.accent}`,
                            background: "var(--bg-sidebar)", display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 8px 20px rgba(0,0,0,0.15)"
                          }}>
                            <canvas
                              ref={cropCanvasRef}
                              onMouseDown={handleCropPointerDown}
                              onMouseMove={handleCropPointerMove}
                              onMouseUp={handleCropPointerUp}
                              onTouchStart={handleCropPointerDown}
                              onTouchMove={handleCropPointerMove}
                              onTouchEnd={handleCropPointerUp}
                              style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "crosshair", display: "block" }}
                            />
                          </div>
                          <p style={{ fontSize: 11.5, color: T.textMuted, margin: 0, textAlign: "center", fontWeight: 500 }}>
                            <Scissors size={12} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                            Drag box on canvas to crop visitor face area
                          </p>
                          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
                            <button className="vr-btn" onClick={applyCropSelection} style={{ ...btnPrimary, width: "auto", padding: "8px 18px", margin: 0 }}>
                              <Scissors size={13} /> Apply Crop
                            </button>
                            <button className="vr-btn" onClick={useFullFrame} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                              <ImageIcon size={13} /> Use Full Frame
                            </button>
                            <button className="vr-btn" onClick={resetPhotoSelection} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                              <RotateCcw size={13} /> Retake
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── Camera Mode Selection & Live Stream View ── */
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                          {/* Mode Switcher Tabs */}
                          <div style={{ display: "flex", gap: 6, width: "100%", maxWidth: 440, background: T.bgField, padding: 4, borderRadius: 10, marginBottom: 12, border: `1px solid ${T.line}` }}>
                            <button
                              type="button"
                              onClick={() => { setCameraMode("webcam"); setError(""); }}
                              style={{
                                flex: 1, padding: "7px 10px", borderRadius: 8, border: "none",
                                background: cameraMode === "webcam" ? T.bgPanel : "transparent",
                                color: cameraMode === "webcam" ? T.accent : T.textMuted,
                                fontWeight: cameraMode === "webcam" ? 700 : 500, fontSize: 12, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                boxShadow: cameraMode === "webcam" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                transition: "all 0.15s ease"
                              }}
                            >
                              <Camera size={13} /> Web Camera
                            </button>
                            <button
                              type="button"
                              onClick={() => { setCameraMode("rtsp"); setError(""); }}
                              style={{
                                flex: 1, padding: "7px 10px", borderRadius: 8, border: "none",
                                background: cameraMode === "rtsp" ? T.bgPanel : "transparent",
                                color: cameraMode === "rtsp" ? T.accent : T.textMuted,
                                fontWeight: cameraMode === "rtsp" ? 700 : 500, fontSize: 12, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                boxShadow: cameraMode === "rtsp" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                transition: "all 0.15s ease"
                              }}
                            >
                              <Video size={13} /> IP Camera
                            </button>
                            <button
                              type="button"
                              onClick={() => { setCameraMode("upload"); setError(""); fileRef.current?.click(); }}
                              style={{
                                flex: 1, padding: "7px 10px", borderRadius: 8, border: "none",
                                background: cameraMode === "upload" ? T.bgPanel : "transparent",
                                color: cameraMode === "upload" ? T.accent : T.textMuted,
                                fontWeight: cameraMode === "upload" ? 700 : 500, fontSize: 12, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                boxShadow: cameraMode === "upload" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                                transition: "all 0.15s ease"
                              }}
                            >
                              <Upload size={13} /> Upload File
                            </button>
                          </div>

                          {/* ── Web Camera View ── */}
                          {cameraMode === "webcam" && (
                            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                              <div style={{
                                width: "100%", maxWidth: 440, height: 250, borderRadius: 12, overflow: "hidden",
                                background: "var(--bg-deep)", border: `1.5px solid ${cameraActive ? T.accent : T.lineStrong}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
                              }}>
                                <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: cameraActive ? "block" : "none" }} />
                                {!cameraActive && (
                                  <div style={{ textAlign: "center", padding: 16 }}>
                                    <Camera size={32} color={T.textFaint} style={{ marginBottom: 8, margin: "0 auto", opacity: 0.5 }} />
                                    <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
                                      {cameraError ? "Webcam permission denied or unavailable." : "Opening web camera…"}
                                    </p>
                                  </div>
                                )}
                                {cameraActive && (
                                  <span style={{
                                    position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 700, color: "#10B981",
                                    background: "rgba(0,0,0,0.65)", padding: "3px 8px", borderRadius: 6,
                                    letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
                                    WEBCAM LIVE
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                {cameraActive && (
                                  <button className="vr-btn" onClick={captureVideoSnapshot} style={{ ...btnPrimary, width: "auto", padding: "8px 18px", margin: 0 }}>
                                    <Camera size={14} /> Capture Snapshot
                                  </button>
                                )}
                                <button className="vr-btn" onClick={() => fileRef.current?.click()} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                                  <Upload size={13} /> Upload Photo
                                </button>
                                {cameraError && (
                                  <button className="vr-btn" onClick={startWebcam} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                                    <RefreshCw size={13} /> Retry Webcam
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ── Streaming IP Camera View ── */}
                          {cameraMode === "rtsp" && (
                            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                              <div style={{ width: "100%", maxWidth: 440, display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, whiteSpace: "nowrap" }}>Camera:</label>
                                <select
                                  value={selectedRtspCam?.id || ""}
                                  onChange={(e) => {
                                    const cam = rtspCameras.find(c => c.id === e.target.value);
                                    if (cam) {
                                      setSelectedRtspCam(cam);
                                      startRtspHlsStream(cam.id);
                                    }
                                  }}
                                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, background: T.bgField, color: T.text, fontSize: 12.5, outline: "none" }}
                                >
                                  {rtspCameras.map(cam => (
                                    <option key={cam.id} value={cam.id}>
                                      {cam.name}{cam.place ? ` (${cam.place})` : ""}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div style={{
                                width: "100%", maxWidth: 440, height: 250, borderRadius: 12, overflow: "hidden",
                                background: "var(--bg-deep)", border: `1.5px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center",
                                position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
                              }}>
                                <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                {isRtspLoading && (
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,15,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff" }}>
                                    <Loader2 size={24} color={T.accent} style={{ animation: "spin 1s linear infinite" }} />
                                    <span style={{ fontSize: 12, opacity: 0.7 }}>Connecting to RTSP Stream…</span>
                                  </div>
                                )}
                                {rtspError && !isRtspLoading && (
                                  <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,15,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#EF4444", padding: 16, textAlign: "center" }}>
                                    <AlertCircle size={24} />
                                    <span style={{ fontSize: 12 }}>{rtspError}</span>
                                  </div>
                                )}
                                {!isRtspLoading && !rtspError && (
                                  <span style={{
                                    position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 700, color: "#EF4444",
                                    background: "rgba(0,0,0,0.65)", padding: "3px 8px", borderRadius: 6,
                                    letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
                                    RTSP LIVE
                                  </span>
                                )}
                              </div>

                              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                <button className="vr-btn" onClick={captureVideoSnapshot} style={{ ...btnPrimary, width: "auto", padding: "8px 18px", margin: 0 }}>
                                  <Camera size={14} /> Capture Snapshot
                                </button>
                                <button className="vr-btn" onClick={() => fileRef.current?.click()} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                                  <Upload size={13} /> Upload Photo
                                </button>
                                {selectedRtspCam && (
                                  <button className="vr-btn" onClick={() => startRtspHlsStream(selectedRtspCam.id)} style={{ ...btnSecondary, width: "auto", padding: "8px 16px", margin: 0 }}>
                                    <RefreshCw size={13} /> Refresh Stream
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* ── Manual File Upload View ── */}
                          {cameraMode === "upload" && (
                            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                              <div
                                onClick={() => fileRef.current?.click()}
                                style={{
                                  width: "100%", maxWidth: 440, height: 180, borderRadius: 12,
                                  border: `2px dashed ${T.lineStrong}`, background: T.bgField,
                                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                  cursor: "pointer", gap: 10, transition: "all 0.2s ease"
                                }}
                              >
                                <Upload size={32} color={T.accent} style={{ opacity: 0.8 }} />
                                <div style={{ textAlign: "center" }}>
                                  <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: "0 0 2px" }}>Click or drag a photo file here</p>
                                  <p style={{ fontSize: 11, color: T.textMuted, margin: 0 }}>Supports JPG, PNG, WEBP</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
                  </Field>

                  {/* signature: rendered as a paper slip inside the panel */}
                  <Field
                    label="Signature"
                    required
                    icon={PenLine}
                    action={hasSignature ? <button onClick={clearSignature} style={linkBtn}>Clear</button> : undefined}
                  >
                    <div ref={canvasWrapRef} style={{
                      background: T.paper, borderRadius: 8, padding: "6px 8px 0", boxShadow: "0 6px 14px rgba(0,0,0,0.08)",
                      transform: "rotate(-0.4deg)", border: `1px solid ${T.line}`
                    }}>
                      <canvas
                        ref={canvasRef} height={130}
                        style={{ width: "100%", height: 130, display: "block", cursor: "crosshair", touchAction: "none" }}
                        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                      />
                      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: T.accentDim, margin: "0 0 6px", letterSpacing: "0.05em" }}>
                        SIGN ABOVE
                      </p>
                    </div>
                  </Field>

                  {error && <p style={{ fontSize: 12.5, color: T.stamp, margin: 0 }}>{error}</p>}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="vr-btn" onClick={() => { stopAllStreams(); setStep(2); }} disabled={loading} style={{ ...btnSecondary, flex: 1, margin: 0 }}>
                      <ChevronLeft size={15} /> Back
                    </button>
                    <button className="vr-btn" onClick={handleSubmit} disabled={loading || !isStep3Valid()} style={{ ...btnPrimary, flex: 1, opacity: (loading || !isStep3Valid()) ? 0.4 : 1 }}>
                      {loading ? (
                        <>
                          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Checking in…
                        </>
                      ) : (
                        <>Check in <Check size={15} /></>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------------- RIGHT: live badge preview ---------------- */}
        <div className="vr-badge-col" style={{ position: "sticky", top: 24 }}>
          <div style={{
            background: "linear-gradient(135deg, #FAFDFD 0%, #EFF6FF 100%)", borderRadius: 20, padding: 22, position: "relative", overflow: "hidden",
            boxShadow: "0 20px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(79,70,229,0.04)",
            border: `1.5px solid ${T.line}`,
            transition: "all 0.3s ease"
          }}>
            {/* Hologram/NFC Chip effect */}
            <div style={{ position: "absolute", top: 20, right: 20, width: 28, height: 22, borderRadius: 4, background: "linear-gradient(135deg, #FFE082 0%, #FFB300 100%)", border: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: 2, padding: 3, justifyContent: "center" }}>
              <div style={{ height: 1, background: "rgba(0,0,0,0.15)", width: "60%" }} />
              <div style={{ height: 1, background: "rgba(0,0,0,0.15)", width: "80%" }} />
              <div style={{ height: 1, background: "rgba(0,0,0,0.15)", width: "40%" }} />
            </div>

            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, letterSpacing: "0.18em", color: T.accent, margin: "0 0 2px", textTransform: "uppercase", fontWeight: 700 }}>
              Sentinel Visitor
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: T.text, margin: "0 0 14px", fontWeight: 600, letterSpacing: "0.05em" }}>{badgeNo}</p>

            <div style={{
              width: "100%", aspectRatio: "1/1", borderRadius: 12, background: T.paperShadow,
              border: `2px solid ${T.accent}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
              position: "relative",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.05)"
            }}>
              <CornerMarker position="tl" />
              <CornerMarker position="tr" />
              <CornerMarker position="bl" />
              <CornerMarker position="br" />

              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {/* Scanning Laser Line */}
                  <div style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: "2px",
                    background: "linear-gradient(90deg, rgba(79,70,229,0) 0%, rgba(79,70,229,1) 50%, rgba(79,70,229,0) 100%)",
                    boxShadow: "0 0 8px rgba(79,70,229,0.8)",
                    animation: "scan-laser 2.5s ease-in-out infinite",
                    zIndex: 5,
                  }} />
                </>
              ) : (
                <User size={48} color={T.accent} strokeWidth={1.3} />
              )}
            </div>

            <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 2px", minHeight: 26, letterSpacing: "-0.01em" }}>
              {fullName.trim() || "Guest Name"}
            </h3>
            <p style={{ fontSize: 13, color: T.textMuted, margin: "0 0 14px", fontWeight: 500 }}>{companyName.trim() || "Visitor"}</p>

            <div style={{ borderTop: `1.5px dashed ${T.lineStrong}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <BadgeRow label="Host" value={selectedEmployee?.name || "—"} />
              <BadgeRow label="Dept" value={selectedEmployee?.department || "—"} />
              <BadgeRow label="Purpose" value={purpose} />
            </div>

            <Barcode />

            {checkedIn && (
              <div className="vr-stamp" style={{
                position: "absolute", bottom: 20, right: 10, fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: 800, fontSize: 13, color: T.stamp, border: `2.5px solid ${T.stamp}`,
                borderRadius: 6, padding: "4px 8px", transform: "rotate(-8deg)", letterSpacing: "0.08em",
                background: "rgba(239,68,68,0.06)",
                boxShadow: "0 0 10px rgba(239,68,68,0.1)",
              }}>
                CHECKED IN
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- NEW VISITOR LOGS SECTION --- */}
      <div style={{ width: "calc(100% - 20px)", margin: "24px 10px 10px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${T.line}` }}>
          <div>
            <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Visitor Logs</h2>
            <p style={{ fontSize: 13, color: T.textMuted, margin: "4px 0 0" }}>Manage and view historical visitor records.</p>
          </div>
        </div>

        {renderToolbar()}

        {isFetchingLogs ? (
          <div style={{ padding: 60, textAlign: "center", color: T.textMuted, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: T.accent }} />
            <span style={{ fontSize: 13 }}>Loading records...</span>
          </div>
        ) : (
          <div className="vr-fade">
            {viewMode === "table" && renderTableView()}
            {viewMode === "kanban" && renderKanbanView()}
            {viewMode === "grid" && renderGridView()}
            {viewMode === "list" && renderListView()}
          </div>
        )}
      </div>

      {/* Crop Modal */}
      {isCropMode && capturedRawFrame && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(15,23,42,0.7)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          backdropFilter: "blur(6px)",
        }}>
          <div style={{
            background: T.bgPanel, borderRadius: 18, width: "100%", maxWidth: 620,
            overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Crop visitor face</div>
                <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>
                  Drag on the photo to draw a square around the face
                </div>
              </div>
              <button onClick={resetPhotoSelection} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{
                position: "relative", borderRadius: 12, overflow: "hidden",
                background: "var(--bg-deep)", touchAction: "none", userSelect: "none",
                cursor: "crosshair", maxHeight: 420,
              }}>
                <canvas
                  ref={cropCanvasRef}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerLeave={handleCropPointerUp}
                  style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={resetPhotoSelection} style={{ ...btnSecondary, flex: 1, margin: 0 }}>
                  <RotateCcw size={14} /> Retake
                </button>
                <button onClick={useFullFrame} style={{ ...btnSecondary, flex: 1, margin: 0 }}>
                  <ImageIcon size={14} /> Use Full Frame
                </button>
                <button onClick={applyCropSelection} style={{ ...btnPrimary, flex: 1, margin: 0 }}>
                  <Scissors size={14} /> Use Crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingVisitor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: T.bgPanel, borderRadius: 16, width: "100%", maxWidth: 500, overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: T.text }}>Edit Visitor</h3>
              <button onClick={() => setEditingVisitor(null)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ padding: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Full Name</label>
                  <input required type="text" value={editingVisitor.full_name} onChange={e => setEditingVisitor({ ...editingVisitor, full_name: e.target.value })} style={input} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Phone Number</label>
                  <input required type="text" value={editingVisitor.phone} onChange={e => setEditingVisitor({ ...editingVisitor, phone: e.target.value })} style={input} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Company Name</label>
                  <input type="text" value={editingVisitor.company_name || ""} onChange={e => setEditingVisitor({ ...editingVisitor, company_name: e.target.value })} style={input} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Purpose of Visit</label>
                  <input required type="text" value={editingVisitor.purpose_of_visit} onChange={e => setEditingVisitor({ ...editingVisitor, purpose_of_visit: e.target.value })} style={input} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>Host Employee ID</label>
                  <input required type="text" value={editingVisitor.meet_employee_id} onChange={e => setEditingVisitor({ ...editingVisitor, meet_employee_id: e.target.value })} style={input} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button type="button" onClick={() => setEditingVisitor(null)} style={{ ...btnSecondary, margin: 0, flex: 1 }}>Cancel</button>
                <button type="submit" disabled={isSavingEdit} style={{ ...btnPrimary, flex: 1 }}>
                  {isSavingEdit ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  small pieces                                                       */
/* ------------------------------------------------------------------ */
interface FieldProps {
  label: string;
  required?: boolean;
  icon?: typeof User;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function Field({ label, required, icon: Icon, action, children }: FieldProps) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: T.textMuted }}>
          {Icon && <Icon size={12} />} {label} {required && <span style={{ color: T.accent }}>*</span>}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function BadgeRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
      <span style={{ color: T.textMuted }}>{label}</span>
      <span style={{ color: T.text, fontWeight: 600, textAlign: "right", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

const input: CSSProperties = {
  width: "100%", background: T.bgField, border: `1px solid ${T.line}`, borderRadius: 9,
  padding: "5px 10px", color: T.text, fontSize: 13.5, outline: "none", boxSizing: "border-box",
};
const select: CSSProperties = { ...input, cursor: "pointer" };
const btnPrimary: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: T.accent, color: "#fff", border: "none", borderRadius: 9,
  padding: "8px 0", fontSize: 13.5, fontWeight: 700, cursor: "pointer", width: "100%",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
};
const btnSecondary: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  background: "transparent", color: T.text, border: `1px solid ${T.lineStrong}`, borderRadius: 9,
  padding: "8px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer", width: "100%", margin: "10px auto 0",
};
const linkBtn: CSSProperties = { background: "none", border: "none", color: T.accent, fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" };