"use client";

import { useEffect, useRef, useState } from "react";
import {
  User,
  BadgeCheck,
  Building2,
  Briefcase,
  Mail,
  Phone,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  UserCheck,
} from "lucide-react";

interface Department {
  id: string;
  name: string;
  code: string;
}

const TEAL = "#1F6F5C";
const TEAL_DEEP = "#164F42";
const INK = "#101B22";
const MUTED = "#6B6558";
const BORDER = "#E4E0D6";
const RUST = "#B3432B";

const fieldClass =
  "w-full bg-[#F7F5F0] border border-[#E4E0D6] rounded-xl px-4 py-3 text-[14px] text-[#101B22] outline-none transition-all duration-150 focus:border-[#1F6F5C] focus:ring-4 focus:ring-[#1F6F5C]/10 placeholder:text-[#B0A996]";

const labelClass =
  "block text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A8375] mb-2";

export default function PublicEmployeeRegisterPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);

  // Form State
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Load Departments
  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await fetch("/api/departments");
        if (res.ok) {
          const data = await res.json();
          setDepartments(data);
        }
      } catch (err) {
        console.error("Error loading departments:", err);
      } finally {
        setLoadingDepts(false);
      }
    }
    loadDepts();

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error(err);
      setError("Unable to access camera. Please check permissions or upload a photo.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && cameraActive) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        setPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError("Image size exceeds 8MB. Please choose a smaller photo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPhoto(event.target?.result as string);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !photo) {
      setError("Full Name and Face Image are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: name.trim(),
        employee_code: employeeCode.trim() || `EMP-${Math.floor(10000 + Math.random() * 90000)}`,
        department: department || "Staff",
        designation: designation.trim() || "Team Member",
        email: email.trim() || null,
        mobile: mobile.trim() || null,
        photo_base64: photo,
      };

      const res = await fetch("/api/hrms/bulk_register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to complete biometric onboarding.");

      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during registration.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setEmployeeCode("");
    setDepartment("");
    setDesignation("");
    setEmail("");
    setMobile("");
    setPhoto(null);
    setSuccess(false);
    setError("");
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col justify-between text-[#101B22] font-sans antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        .erg-display { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; }
        .erg-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes erg-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .erg-animate { animation: erg-fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) }
      `}</style>

      {/* Top Bar Navigation */}
      <header className="w-full border-b border-[#E4E0D6] bg-white/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)` }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="erg-display font-bold text-[18px] leading-tight" style={{ color: INK }}>
                Sentinel <span style={{ color: TEAL }}>AI</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                HRMS Biometric Onboarding Portal
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[12px] font-semibold px-3.5 py-1.5 rounded-full bg-[#F7F5F0] border border-[#E4E0D6] text-[#6B6558]">
            <Sparkles size={14} style={{ color: TEAL }} />
            Self-Service Facial Registration
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12">
        {success ? (
          /* Success Screen */
          <div className="erg-animate bg-white rounded-3xl p-8 sm:p-12 border border-[#E4E0D6] shadow-xl text-center flex flex-col items-center gap-6 max-w-xl mx-auto my-8">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(31,111,92,0.1)", border: `2px solid ${TEAL}` }}
            >
              <UserCheck size={42} style={{ color: TEAL }} />
            </div>

            <div>
              <h2 className="erg-display text-2xl sm:text-3xl font-bold mb-2" style={{ color: INK }}>
                Biometric Registration Complete!
              </h2>
              <p className="text-[14px] sm:text-[15px] leading-relaxed" style={{ color: MUTED }}>
                Thank you, <strong>{name}</strong>. Your face embedding has been successfully extracted and provisioned into the security surveillance matrix.
              </p>
            </div>

            <div className="w-full bg-[#F7F5F0] rounded-2xl p-5 border border-[#E4E0D6] text-left space-y-2.5 text-[13.5px]">
              <div className="flex justify-between">
                <span style={{ color: MUTED }}>Employee Code:</span>
                <span className="erg-mono font-bold" style={{ color: TEAL_DEEP }}>{employeeCode || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: MUTED }}>Department:</span>
                <span className="font-semibold" style={{ color: INK }}>{department || "Staff"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: MUTED }}>Biometric Status:</span>
                <span className="font-bold text-[#1F6F5C]">Active & Synced</span>
              </div>
            </div>

            <button
              onClick={resetForm}
              className="w-full py-3.5 rounded-xl font-bold text-white transition-transform hover:-translate-y-[1px] active:translate-y-0 shadow-lg text-[14px]"
              style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)` }}
            >
              Register Another Employee
            </button>
          </div>
        ) : (
          /* Registration Form */
          <div className="erg-animate bg-white rounded-3xl border border-[#E4E0D6] shadow-xl overflow-hidden">
            {/* Header Banner */}
            <div className="px-6 sm:px-10 py-8 border-b border-[#E4E0D6] bg-gradient-to-r from-[#F7F5F0] to-[#FFFFFF]">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: TEAL }}>
                <BadgeCheck size={16} />
                HRMS Self-Onboarding
              </div>
              <h1 className="erg-display text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: INK }}>
                Employee Biometric Enrollment
              </h1>
              <p className="text-[13.5px] sm:text-[14.5px] mt-1.5 leading-relaxed" style={{ color: MUTED }}>
                Complete your details and capture a clear face photo to enable automated camera access.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 sm:p-10 space-y-8">
              
              {/* Photo Section */}
              <div>
                <label className={labelClass}>Facial Recognition Photo *</label>
                <div
                  className="w-full rounded-2xl border-2 border-dashed border-[#E4E0D6] bg-[#F7F5F0] overflow-hidden relative flex flex-col items-center justify-center"
                  style={{ minHeight: 280 }}
                >
                  {cameraActive ? (
                    <div className="w-full h-full min-h-[300px] relative">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover min-h-[300px]" />
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl px-6 py-2.5 text-[13px] font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                        style={{ background: TEAL }}
                      >
                        Capture Frame
                      </button>
                    </div>
                  ) : photo ? (
                    <div className="w-full h-full min-h-[280px] relative">
                      <img src={photo} alt="Enrolled Preview" className="w-full h-full object-cover min-h-[280px]" />
                      <button
                        type="button"
                        onClick={() => {
                          setPhoto(null);
                          startCamera();
                        }}
                        className="absolute top-3 right-3 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white shadow-md transition-transform hover:scale-105"
                        style={{ background: RUST }}
                      >
                        Retake Photo
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 p-8 text-center">
                      <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm border border-[#E4E0D6]">
                        <Camera size={28} style={{ color: TEAL }} />
                      </div>
                      <div>
                        <h4 className="erg-display font-bold text-[16px]" style={{ color: INK }}>
                          Take or Upload Face Photo
                        </h4>
                        <p className="text-[12.5px] max-w-sm mt-1" style={{ color: MUTED }}>
                          Ensure full facial visibility, neutral background, and proper lighting for high accuracy.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 justify-center">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all hover:bg-[rgba(31,111,92,0.12)]"
                          style={{ background: "rgba(31,111,92,0.08)", border: `1px solid rgba(31,111,92,0.25)`, color: TEAL }}
                        >
                          <Camera size={16} />
                          Use Webcam
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold bg-white transition-all hover:bg-[#F1EEE6]"
                          style={{ border: `1px solid ${BORDER}`, color: INK }}
                        >
                          <Upload size={16} />
                          Upload Photo File
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Personal & Employee Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#A9A192" }} />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`${fieldClass} pl-11`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Employee Code (HRMS ID)</label>
                  <div className="relative">
                    <BadgeCheck size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#A9A192" }} />
                    <input
                      type="text"
                      placeholder="e.g. EMP-9042"
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      className={`${fieldClass} pl-11 erg-mono`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Department *</label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 z-10" style={{ color: "#A9A192" }} />
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className={`${fieldClass} pl-11 appearance-none cursor-pointer`}
                    >
                      <option value="">Select Department</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Designation / Role</label>
                  <div className="relative">
                    <Briefcase size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#A9A192" }} />
                    <input
                      type="text"
                      placeholder="e.g. Senior Software Engineer"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className={`${fieldClass} pl-11`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Email Address</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#A9A192" }} />
                    <input
                      type="email"
                      placeholder="e.g. eleanor@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${fieldClass} pl-11`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Mobile Number</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#A9A192" }} />
                    <input
                      type="tel"
                      placeholder="e.g. +1 555-0198"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      className={`${fieldClass} pl-11`}
                    />
                  </div>
                </div>
              </div>

              {/* Alerts */}
              {error && (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl text-[13px] font-semibold"
                  style={{ background: "rgba(179,67,43,0.08)", border: "1px solid rgba(179,67,43,0.22)", color: RUST }}
                >
                  <AlertTriangle size={18} className="flex-shrink-0" />
                  <div>{error}</div>
                </div>
              )}

              {/* Submit Action */}
              <button
                type="submit"
                disabled={submitting || !name.trim() || !photo}
                className="w-full py-4 rounded-xl text-[15px] font-bold text-white transition-all shadow-lg hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
                  boxShadow: "0 8px 20px rgba(31,111,92,0.25)",
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Extracting Face Embedding & Provisioning…
                  </>
                ) : (
                  <>
                    Complete Biometric Registration
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-[#E4E0D6] bg-white py-4 px-6 text-center text-[12px]" style={{ color: MUTED }}>
        Sentinel AI Security Platform · HRMS Integration Portal
      </footer>
    </div>
  );
}
