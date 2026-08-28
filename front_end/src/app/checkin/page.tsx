"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  User,
  Phone,
  Building2,
  Camera,
  Upload,
  Check,
  Search,
  RotateCcw,
  Loader2,
  ShieldCheck,
  Video,
  Scissors,
  RefreshCw,
  ChevronDown,
  CreditCard,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  department: string;
  photo: string;
}

interface CameraItem {
  id: string;
  name: string;
  place?: string;
}

type Purpose = "Meeting" | "Interview" | "Delivery" | "Other";

const PURPOSES: Purpose[] = ["Meeting", "Interview", "Delivery", "Other"];

// Light Theme Colors — now driven by CSS custom properties
const T = {
  bg: "var(--bg-deep)",
  bgPanel: "var(--bg-card)",
  bgField: "var(--bg-input)",
  border: "var(--border-light)",
  borderStrong: "var(--border-strong)",
  accent: "var(--accent-primary)",
  accentGlow: "var(--accent-glow)",
  ok: "var(--status-ok)",
  text: "var(--text-primary)",
  textMuted: "var(--text-muted)",
  textFaint: "var(--text-faint)",
} as const;

// HLS host — MediaMTX serves HLS on port 8892
const HLS_BASE = typeof window !== "undefined"
  ? `${window.location.protocol}//${window.location.hostname}:8892`
  : "";

export default function PublicCheckInPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [badgeNo, setBadgeNo] = useState("");
  const [registeredEmployees, setRegisteredEmployees] = useState<Employee[]>([]);

  // Step 1: Visitor details
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [idProof, setIdProof] = useState("");

  // Step 2: Purpose & Host selection
  const [purpose, setPurpose] = useState<Purpose>("Meeting");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  // Location (Appointments only)
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string>("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");

  // Step 3: Photo capture via Mobile / Laptop Webcam
  const [photo, setPhoto] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  // Device Camera (Webcam / Mobile Camera)
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamLoading, setWebcamLoading] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Capture & crop
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropPreviewRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);
  const cropStart = useRef({ x: 0, y: 0 });
  const cropRect = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const frameImgRef = useRef<HTMLImageElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);

  // Load host staff faces
  useEffect(() => {
    setBadgeNo("VIS-" + Math.floor(1000 + Math.random() * 9000));
    async function loadHosts() {
      try {
        const res = await fetch("/api/registered_faces");
        if (res.ok) {
          const data = await res.json();
          const mapped = data.map((item: any) => ({
            id: item.id,
            name: item.name,
            department: item.department || "Staff",
            photo: item.photo_url || "https://i.pravatar.cc/150?img=47",
          }));
          setRegisteredEmployees(mapped);
        }
      } catch (err) {
        console.error("Error loading hosts:", err);
      }
    }
    loadHosts();
  }, []);

  // Capture location if purpose is "Meeting"
  useEffect(() => {
    if (purpose === "Meeting" && !latitude && !locationLoading && !locationError && !locationAddress) {
      setLocationLoading(true);
      setLocationError("");
      
      if (!navigator.geolocation) {
        setLocationError("Geolocation is not supported by your browser.");
        setLocationLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setLatitude(lat);
          setLongitude(lon);
          
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await res.json();
            if (data && data.display_name) {
              setLocationAddress(data.display_name);
            }
          } catch (err) {
            console.error("Geocoding failed:", err);
          }
          setLocationLoading(false);
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocationError("Location permission denied or unavailable.");
          setLocationLoading(false);
        }
      );
    }
  }, [purpose, latitude, locationLoading, locationError, locationAddress]);

  const stopWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }
    if (webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = null;
    }
    setWebcamActive(false);
    setWebcamLoading(false);
  }, []);

  const startWebcam = useCallback(async (facing: "user" | "environment" = facingMode) => {
    stopWebcam();
    setWebcamLoading(true);
    setWebcamError("");
    setWebcamActive(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setWebcamError("Camera access is not supported by your browser.");
      setWebcamLoading(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await webcamVideoRef.current.play().catch(() => {});
      }
      setWebcamActive(true);
      setWebcamLoading(false);
    } catch (err: any) {
      console.error("Webcam error:", err);
      let msg = "Could not access mobile/laptop camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera permission denied. Please allow camera access in your browser settings.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No camera device found on your phone/laptop.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "Camera is currently in use by another application.";
      }
      setWebcamError(msg);
      setWebcamLoading(false);
    }
  }, [facingMode, stopWebcam]);

  // Start device camera when entering Step 3 and stop when leaving Step 3
  useEffect(() => {
    if (step === 3 && !photo) {
      startWebcam();
    } else {
      stopWebcam();
    }
    return () => stopWebcam();
  }, [step, photo, startWebcam, stopWebcam]);

  const toggleFacingMode = () => {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    if (step === 3 && !photo) {
      startWebcam(nextMode);
    }
  };

  function handleCaptureFrame() {
    if (!webcamVideoRef.current || !webcamActive) return;
    const video = webcamVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedFrame(dataUrl);
    stopWebcam();
    // Load image for crop
    const img = new Image();
    img.onload = () => {
      frameImgRef.current = img;
      renderCropCanvas(img, { x: 0, y: 0, w: 0, h: 0 });
    };
    img.src = dataUrl;
    setCropMode(true);
  }

  function renderCropCanvas(img: HTMLImageElement, rect: { x: number; y: number; w: number; h: number }) {
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    if (rect.w > 4 && rect.h > 4) {
      // Dark overlay
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Clear crop area
      ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
      // Crop border
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  function getCanvasPos(e: any, canvas: HTMLCanvasElement) {
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

  function onCropMouseDown(e: any) {
    e.preventDefault();
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const pos = getCanvasPos(e, canvas);
    cropStart.current = pos;
    cropRect.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
    isDragging.current = true;
  }

  function onCropMouseMove(e: any) {
    if (!isDragging.current || !frameImgRef.current) return;
    e.preventDefault();
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const pos = getCanvasPos(e, canvas);
    const x = Math.min(cropStart.current.x, pos.x);
    const y = Math.min(cropStart.current.y, pos.y);
    const w = Math.abs(pos.x - cropStart.current.x);
    const h = Math.abs(pos.y - cropStart.current.y);
    cropRect.current = { x, y, w, h };
    renderCropCanvas(frameImgRef.current, { x, y, w, h });
  }

  function onCropMouseUp(e: any) {
    isDragging.current = false;
    if (frameImgRef.current) {
      renderCropCanvas(frameImgRef.current, cropRect.current);
    }
  }

  function applyCrop() {
    const { x, y, w, h } = cropRect.current;
    if (w < 20 || h < 20 || !frameImgRef.current) return;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frameImgRef.current, x, y, w, h, 0, 0, w, h);
    setPhoto(out.toDataURL("image/jpeg", 0.92));
    setCropMode(false);
    setCapturedFrame(null);
  }

  function useFullFrame() {
    if (capturedFrame) {
      setPhoto(capturedFrame);
      setCropMode(false);
      setCapturedFrame(null);
    }
  }

  function retakePicture() {
    setPhoto(null);
    setCapturedFrame(null);
    setCropMode(false);
    startWebcam();
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    stopWebcam();
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhoto(reader.result as string);
      setCapturedFrame(null);
      setCropMode(false);
    };
    reader.readAsDataURL(file);
  }

  // Touchpad drawing for signature
  const isDrawing = useRef(false);
  
  function getCoordinates(e: any) {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startDrawing(e: any) {
    e.preventDefault();
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    isDrawing.current = true;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = document.documentElement.getAttribute("data-theme") === "light" ? "#1e293b" : "#f1f5f9";
  }

  function draw(e: any) {
    if (!isDrawing.current || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDrawing() {
    isDrawing.current = false;
  }

  function clearSignature() {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSignature(false);
  }

  // Handle final check-in submit
  async function handleSubmitCheckIn() {
    if (!photo || !hasSignature) return;

    setSubmitting(true);
    setError("");

    let signatureImage = "";
    if (canvasRef.current) signatureImage = canvasRef.current.toDataURL("image/png");

    const payload = {
      full_name: fullName.trim(),
      phone: phone.trim(),
      company_name: companyName.trim() || null,
      id_proof_number: idProof.trim() || null,
      purpose_of_visit: purpose,
      meet_employee_id: selectedId,
      photo_image: photo,
      signature_image: signatureImage,
      badge_no: badgeNo,
      latitude,
      longitude,
      location_address: locationAddress,
    };

    try {
      const res = await fetch("/api/visitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Check-in failed.");

      setCheckedIn(true);
      // Reset form after delay
      setTimeout(() => {
        setStep(1);
        setFullName("");
        setPhone("");
        setCompanyName("");
        setIdProof("");
        setPurpose("Meeting");
        setSelectedId("");
        setPhoto(null);
        setHasSignature(false);
        setCheckedIn(false);
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step validation
  const isStep1Valid = fullName.trim().length >= 3 && /^[0-9\s\-+()]{10,15}$/.test(phone.trim());
  const isStep2Valid = selectedId !== "";
  const isStep3Valid = photo !== null && hasSignature;

  const selectedHost = registeredEmployees.find((e) => e.id === selectedId);
  const filteredHosts = registeredEmployees.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.department.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "var(--bg-deep)",
        fontFamily: "'Inter', sans-serif",
        color: T.text,
      }}
    >
      <div
        className="snt-kiosk"
        style={{
          width: "100%",
          maxWidth: 960,
          background: T.bgPanel,
          border: `1px solid ${T.border}`,
          borderRadius: 24,
          padding: "36px 36px",
          boxShadow: "0 20px 50px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.05)",
          display: "grid",
          gridTemplateColumns: checkedIn ? "1fr" : "1.6fr 1fr",
          gap: 40,
        }}
      >
        {/* Left Side: Steps Progress & Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.accent, marginBottom: 4 }}>
                <ShieldCheck size={18} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>Kiosk Self Check-In</span>
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Visitor Entry Pass</h2>
            </div>
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: T.textMuted }}>{badgeNo}</span>
          </div>

          {checkedIn ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 16, textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(16,185,129,0.1)", border: `2px solid ${T.ok}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={32} color={T.ok} />
              </div>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px 0" }}>Check-In Complete!</h3>
                <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>
                  Welcome <strong>{fullName}</strong>. Your entry pass has been registered.<br />
                  Please proceed to the lobby.
                </p>
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 24 }}>Form resets automatically in a few seconds...</div>
            </div>
          ) : (
            <>
              {/* Stepper */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {[
                  { stepNum: 1, label: "Your Info" },
                  { stepNum: 2, label: "Host & Reason" },
                  { stepNum: 3, label: "Verification" },
                ].map((s) => (
                  <div key={s.stepNum} style={{ display: "flex", alignItems: "center", gap: 8, flex: s.stepNum < 3 ? 1 : "initial" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: step === s.stepNum ? T.accent : step > s.stepNum ? T.ok : "#eef0f6",
                          border: step === s.stepNum || step > s.stepNum ? "none" : `1px solid ${T.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          color: step === s.stepNum || step > s.stepNum ? "#fff" : T.textMuted,
                        }}
                      >
                        {step > s.stepNum ? <Check size={12} /> : s.stepNum}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: step === s.stepNum ? T.text : T.textFaint }}>{s.label}</span>
                    </div>
                    {s.stepNum < 3 && (
                      <div style={{ flex: 1, height: 1.5, background: step > s.stepNum ? T.ok : T.border }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Form Content */}
              <div style={{ minHeight: 320, display: "flex", flexDirection: "column", gap: 20 }}>
                
                {/* STEP 1: Details */}
                {step === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>
                        Full Name *
                      </label>
                      <div style={{ position: "relative" }}>
                        <User size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
                        <input
                          type="text"
                          required
                          placeholder="Enter your full name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          style={{
                            width: "100%",
                            background: T.bgField,
                            border: `1px solid ${T.border}`,
                            borderRadius: 12,
                            padding: "12px 14px 12px 40px",
                            color: T.text,
                            fontSize: 13.5,
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>
                        Mobile Number *
                      </label>
                      <div style={{ position: "relative" }}>
                        <Phone size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 9876543210"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          style={{
                            width: "100%",
                            background: T.bgField,
                            border: `1px solid ${T.border}`,
                            borderRadius: 12,
                            padding: "12px 14px 12px 40px",
                            color: T.text,
                            fontSize: 13.5,
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>
                        Company / Business (Optional)
                      </label>
                      <div style={{ position: "relative" }}>
                        <Building2 size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
                        <input
                          type="text"
                          placeholder="e.g. TechCorp"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          style={{
                            width: "100%",
                            background: T.bgField,
                            border: `1px solid ${T.border}`,
                            borderRadius: 12,
                            padding: "12px 14px 12px 40px",
                            color: T.text,
                            fontSize: 13.5,
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>
                        ID Proof / Passport Code (Optional)
                      </label>
                      <div style={{ position: "relative" }}>
                        <CreditCard size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
                        <input
                          type="text"
                          placeholder="e.g. ID-49201"
                          value={idProof}
                          onChange={(e) => setIdProof(e.target.value)}
                          style={{
                            width: "100%",
                            background: T.bgField,
                            border: `1px solid ${T.border}`,
                            borderRadius: 12,
                            padding: "12px 14px 12px 40px",
                            color: T.text,
                            fontSize: 13.5,
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: Purpose & Host */}
                {step === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 8 }}>
                        Purpose of Visit *
                      </label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {PURPOSES.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setPurpose(p)}
                            style={{
                              flex: "1 1 120px",
                              background: purpose === p ? T.accent : T.bgField,
                              border: `1px solid ${purpose === p ? T.accent : T.borderStrong}`,
                              color: purpose === p ? "#fff" : T.text,
                              borderRadius: 10,
                              padding: "10px 0",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>
                        Who are you meeting? *
                      </label>
                      <div style={{ position: "relative" }}>
                        <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
                        <input
                          type="text"
                          placeholder="Search hosts..."
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          style={{
                            width: "100%",
                            background: T.bgField,
                            border: `1px solid ${T.border}`,
                            borderRadius: 12,
                            padding: "10px 14px 10px 38px",
                            color: T.text,
                            fontSize: 13,
                            outline: "none",
                          }}
                        />
                      </div>

                      {/* Hosts selector grid */}
                      <div
                        style={{
                          maxHeight: 180,
                          overflowY: "auto",
                          marginTop: 10,
                          border: `1px solid ${T.border}`,
                          borderRadius: 12,
                          background: "var(--bg-panel)",
                        }}
                      >
                        {filteredHosts.length === 0 ? (
                          <div style={{ padding: 16, fontSize: 12, color: T.textFaint, textAlign: "center" }}>
                            No hosts found
                          </div>
                        ) : (
                          filteredHosts.map((emp) => (
                            <div
                              key={emp.id}
                              onClick={() => {
                                setSelectedId(emp.id);
                                setQuery("");
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 14px",
                                cursor: "pointer",
                                borderBottom: `1px solid ${T.border}`,
                                background: selectedId === emp.id ? "rgba(124,58,237,0.12)" : "transparent",
                              }}
                            >
                              <img src={emp.photo} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{emp.name}</div>
                                <div style={{ fontSize: 10.5, color: T.textFaint }}>{emp.department}</div>
                              </div>
                              {selectedId === emp.id && (
                                <span style={{ marginLeft: "auto", color: T.accent, fontSize: 11, fontWeight: 700 }}>Selected</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Location capture UI for Appointments */}
                    {purpose === "Meeting" && (
                      <div style={{ padding: 12, background: "rgba(16,185,129,0.05)", borderRadius: 12, border: "1px dashed rgba(16,185,129,0.3)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                          </svg>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>Secure Appointment Verification</span>
                        </div>
                        
                        {locationLoading ? (
                          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            Verifying physical location...
                          </div>
                        ) : locationError ? (
                          <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                            {locationError}
                          </div>
                        ) : locationAddress ? (
                          <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, display: "flex", flexDirection: "column", gap: 2 }}>
                            <span>✓ Verified</span>
                            <span style={{ fontSize: 10, color: "#10b981", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locationAddress}</span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3: Camera Capture & Signature */}
                {step === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                    {/* Photo section */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <label style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em" }}>
                          Visitor Photo (Mobile / Laptop Camera) *
                        </label>
                        {!photo && webcamActive && (
                          <button
                            type="button"
                            onClick={toggleFacingMode}
                            style={{
                              background: T.bgField,
                              border: `1px solid ${T.border}`,
                              borderRadius: 8,
                              padding: "4px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              color: T.accent,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <RefreshCw size={12} />
                            {facingMode === "user" ? "Switch to Back Camera" : "Switch to Front Camera"}
                          </button>
                        )}
                      </div>

                      {/* Camera view area */}
                      <div style={{
                        aspectRatio: "16/9", background: "var(--bg-deep)", borderRadius: 12, overflow: "hidden",
                        border: `1px solid ${T.border}`, position: "relative",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>

                        {/* Photo captured and accepted */}
                        {photo && (
                          <div style={{ width: "100%", height: "100%", position: "relative" }}>
                            <img src={photo} alt="visitor" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                              type="button"
                              onClick={retakePicture}
                              style={{
                                position: "absolute", top: 8, right: 8,
                                background: "rgba(0,0,0,0.65)", border: "none", borderRadius: 8,
                                color: "#fff", padding: "5px 10px", fontSize: 11, cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4,
                              }}
                            >
                              <RotateCcw size={11} /> Retake
                            </button>
                            <div style={{
                              position: "absolute", bottom: 8, left: 8,
                              background: "rgba(16,185,129,0.9)", borderRadius: 6,
                              color: "#fff", padding: "4px 8px", fontSize: 10.5, fontWeight: 700,
                              display: "flex", alignItems: "center", gap: 4,
                            }}>
                              <Check size={10} /> Photo Ready
                            </div>
                          </div>
                        )}

                        {/* Crop mode */}
                        {!photo && cropMode && capturedFrame && (
                          <div style={{ width: "100%", height: "100%", position: "relative", userSelect: "none" }}>
                            <canvas
                              ref={cropCanvasRef}
                              onMouseDown={onCropMouseDown}
                              onMouseMove={onCropMouseMove}
                              onMouseUp={onCropMouseUp}
                              onTouchStart={onCropMouseDown}
                              onTouchMove={onCropMouseMove}
                              onTouchEnd={onCropMouseUp}
                              style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "crosshair", display: "block" }}
                            />
                            {/* Crop instruction */}
                            <div style={{
                              position: "absolute", top: 8, left: 8, right: 8,
                              background: "rgba(0,0,0,0.65)", borderRadius: 8, padding: "6px 10px",
                              color: "#fff", fontSize: 11, fontWeight: 600, textAlign: "center",
                            }}>
                              <Scissors size={11} style={{ display: "inline", marginRight: 5 }} />
                              Drag to select the face area — then click Apply Crop
                            </div>
                            <div style={{
                              position: "absolute", bottom: 8, left: 8, right: 8,
                              display: "flex", gap: 8, justifyContent: "center",
                            }}>
                              <button
                                type="button"
                                onClick={applyCrop}
                                style={{
                                  background: T.accent, color: "#fff", border: "none",
                                  borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 5,
                                }}
                              >
                                <Scissors size={12} /> Apply Crop
                              </button>
                              <button
                                type="button"
                                onClick={useFullFrame}
                                style={{
                                  background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
                                  borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                }}
                              >
                                Use Full Frame
                              </button>
                              <button
                                type="button"
                                onClick={retakePicture}
                                style={{
                                  background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                }}
                              >
                                Retake
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Live Device Camera Stream */}
                        {!photo && !cropMode && (
                          <div style={{ width: "100%", height: "100%", position: "relative" }}>
                            <video
                              ref={webcamVideoRef}
                              autoPlay
                              playsInline
                              muted
                              style={{
                                width: "100%", height: "100%", objectFit: "cover",
                                display: webcamActive ? "block" : "none",
                                transform: facingMode === "user" ? "scaleX(-1)" : "none",
                              }}
                            />

                            {/* Loading overlay */}
                            {webcamLoading && (
                              <div style={{
                                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center", gap: 10, color: "#fff",
                              }}>
                                <Loader2 size={28} style={{ animation: "spin 1s linear infinite", opacity: 0.7 }} />
                                <span style={{ fontSize: 12, opacity: 0.7 }}>Starting mobile/laptop camera...</span>
                              </div>
                            )}

                            {/* Error overlay */}
                            {!webcamLoading && webcamError && (
                              <div style={{
                                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center", gap: 12, color: "#fff", padding: 20,
                              }}>
                                <Camera size={32} style={{ opacity: 0.4 }} />
                                <span style={{ fontSize: 12, opacity: 0.8, textAlign: "center", maxWidth: 320 }}>{webcamError}</span>
                                <button
                                  type="button"
                                  onClick={() => startWebcam()}
                                  style={{
                                    background: T.accent, color: "#fff", border: "none",
                                    borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                    display: "flex", alignItems: "center", gap: 6,
                                  }}
                                >
                                  <RefreshCw size={13} /> Allow / Retry Camera
                                </button>
                              </div>
                            )}

                            {/* Live indicator and Capture button */}
                            {webcamActive && (
                              <>
                                <div style={{
                                  position: "absolute", top: 8, left: 8,
                                  background: "rgba(239,68,68,0.85)", borderRadius: 6,
                                  padding: "3px 8px", color: "#fff", fontSize: 10, fontWeight: 800,
                                  letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 4,
                                }}>
                                  <span style={{ width: 6, height: 6, background: "#fff", borderRadius: "50%", display: "inline-block" }} />
                                  DEVICE CAMERA LIVE
                                </div>
                                <button
                                  type="button"
                                  onClick={handleCaptureFrame}
                                  style={{
                                    position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
                                    background: "rgba(255,255,255,0.95)", border: "none", borderRadius: 10,
                                    padding: "9px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                                    color: T.accent, display: "flex", alignItems: "center", gap: 6,
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                                  }}
                                >
                                  <Camera size={15} /> Capture & Crop
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* File upload alternative */}
                      {!photo && !cropMode && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            style={{
                              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                              background: T.bgField, border: `1px dashed ${T.borderStrong}`,
                              borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 600,
                              color: T.textMuted, cursor: "pointer",
                            }}
                          >
                            <Upload size={14} /> Upload Photo Instead
                          </button>
                        </div>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileUpload} />
                    </div>

                    {/* Signature */}
                    <div>
                      <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: T.textMuted, letterSpacing: "0.05em", marginBottom: 6 }}>
                        Sign Below *
                      </label>
                      <div
                        style={{
                          aspectRatio: "6/2",
                          border: `1px dashed ${T.borderStrong}`,
                          borderRadius: 12,
                          background: "var(--bg-card)",
                          position: "relative",
                        }}
                      >
                        <canvas
                          ref={canvasRef}
                          width={600}
                          height={200}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "block",
                            cursor: "crosshair",
                          }}
                        />
                        <button
                          type="button"
                          onClick={clearSignature}
                          style={{
                            position: "absolute",
                            bottom: 8,
                            right: 8,
                            background: "transparent",
                            border: "none",
                            color: T.textFaint,
                            fontSize: 10.5,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <RotateCcw size={10} /> Clear
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* Navigation Buttons */}
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s - 1) as any)}
                    style={{
                      flex: 1,
                      background: "var(--bg-input)",
                      border: `1px solid ${T.borderStrong}`,
                      color: T.text,
                      borderRadius: 12,
                      padding: "12px 0",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                )}
                
                {step < 3 ? (
                  <button
                    type="button"
                    disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                    onClick={() => setStep((s) => (s + 1) as any)}
                    style={{
                      flex: 2,
                      background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      padding: "12px 0",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity: (step === 1 ? !isStep1Valid : !isStep2Valid) ? 0.4 : 1,
                    }}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!isStep3Valid || submitting}
                    onClick={handleSubmitCheckIn}
                    style={{
                      flex: 2,
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      padding: "12px 0",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      opacity: !isStep3Valid || submitting ? 0.4 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Complete Check-In"
                    )}
                  </button>
                )}
              </div>

              {error && (
                <div style={{ color: "#ef4444", fontSize: 12.5, textAlign: "center", marginTop: 8 }}>{error}</div>
              )}
            </>
          )}
        </div>

        {/* Right Side: Virtual Kiosk Pass Preview Panel */}
        {!checkedIn && (
          <div
            style={{
              background: "var(--bg-panel)",
              border: `1px solid ${T.border}`,
              borderRadius: 20,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              textAlign: "center",
              boxShadow: "0 10px 30px rgba(15,23,42,0.05), inset 0 0 0 1px rgba(99,102,241,0.05)",
            }}
          >
            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: T.textFaint, textTransform: "uppercase" }}>Visitor Pass Preview</span>
              
              <div
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: "50%",
                  border: `2px solid ${T.borderStrong}`,
                  overflow: "hidden",
                  background: "#eef0f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto",
                }}
              >
                {photo ? (
                  <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <User size={38} style={{ color: T.textFaint }} />
                )}
              </div>

              <div>
                <h4 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px 0", color: fullName.trim() ? T.text : T.textFaint }}>
                  {fullName.trim() || "Your Name"}
                </h4>
                <p style={{ fontSize: 12, color: T.textMuted, margin: 0 }}>
                  {companyName.trim() || "Personal Visit"}
                </p>
              </div>

              <div style={{ width: "100%", height: 1, background: T.border }} />

              <div style={{ textAlign: "left", width: "100%", display: "flex", flexDirection: "column", gap: 8, fontSize: 11.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textFaint }}>Contact:</span>
                  <span>{phone.trim() || "N/A"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textFaint }}>Purpose:</span>
                  <span style={{ fontWeight: 700, color: T.accent }}>{purpose}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: T.textFaint }}>Host:</span>
                  <span>{selectedHost ? selectedHost.name : "Unselected"}</span>
                </div>
              </div>
            </div>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#059669", fontWeight: 700 }}>
                <Video size={12} className="animate-pulse" />
                <span>SENTINEL SCAN ACTIVE</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
