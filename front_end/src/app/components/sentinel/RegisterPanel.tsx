"use client";
import { useRef, useState } from "react";
import {
  UserPlus,
  Camera,
  Upload,
  User,
  Building2,
  BadgeCheck,
  Briefcase,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Mail
} from "lucide-react";

interface Props {
  onSuccess: () => void;
  canCapture: boolean;
  captureFrame: () => string | null;
}

export default function RegisterPanel({ onSuccess, canCapture, captureFrame }: Props) {
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const capture = () => {
    const f = captureFrame();
    if (f) {
      setImage(f);
      setError("");
      setSuccess("");
    } else {
      setError("Camera stream not ready — please wait for live feed.");
    }
  };

  const reset = () => {
    setImage(null);
    setError("");
    setSuccess("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter full name.");
    if (!image) return setError("Please capture or upload a face photo first.");
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          image,
          employee_code: employeeCode.trim() || undefined,
          department: department.trim() || undefined,
          designation: designation.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`✓ ${name.trim()} successfully registered in database!`);
        setName("");
        setEmployeeCode("");
        setDepartment("");
        setDesignation("");
        setEmail("");
        setImage(null);
        onSuccess();
      } else {
        setError(data.error || "Registration failed. Try again.");
      }
    } catch {
      setError("Network error — check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, color: "#0f172a", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(79,70,229,0.25))",
            display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(99,102,241,0.3)"
          }}>
            <UserPlus size={16} color="#6366f1" />
          </div>
          <div>
            <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", display: "block" }}>Register New Face</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>Extracts 512D InsightFace AI embedding</span>
          </div>
        </div>

        <span style={{
          fontSize: 9.5, color: "#4f46e5", fontWeight: 700, background: "rgba(99,102,241,0.08)",
          padding: "2px 8px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)",
          display: "inline-flex", alignItems: "center", gap: 4
        }}>
          <Sparkles size={10} color="#4f46e5" />
          AI Ready
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onloadend = () => setImage(r.result as string);
          r.readAsDataURL(f);
        }}
      />

      {/* Responsive Columns Layout */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch", width: "100%" }}>
        
        {/* Left Column: Image Preview & Capture */}
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
            <Camera size={11} color="#6366f1" />
            Enrolled Photo Frame
          </div>

          <div style={{
            aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#f8fafc",
            border: `2px dashed ${image ? "#10b981" : "#cbd5e1"}`, position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
            minHeight: 180
          }}>
            {image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={reset}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(15,23,42,0.75)", border: "1px solid rgba(255,255,255,0.2)",
                    color: "#ffffff", borderRadius: 8, padding: "4px 10px", fontSize: 10.5,
                    cursor: "pointer", fontWeight: 700, backdropFilter: "blur(6px)",
                    display: "flex", alignItems: "center", gap: 4
                  }}
                >
                  <Trash2 size={12} color="#ffffff" />
                  Clear Image
                </button>
                <div style={{
                  position: "absolute", bottom: 8, left: 8, background: "rgba(16,185,129,0.9)",
                  color: "#ffffff", borderRadius: 6, padding: "2px 8px", fontSize: 9.5, fontWeight: 800,
                  backdropFilter: "blur(4px)", display: "flex", alignItems: "center", gap: 4
                }}>
                  <CheckCircle2 size={11} color="#ffffff" />
                  Face Crop Ready
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 16, textAlign: "center" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", background: "#ffffff",
                  border: "1.5px dashed #94a3b8", display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.04)"
                }}>
                  <User size={20} color="#64748b" />
                </div>
                <p style={{ fontSize: 11, color: "#64748b", margin: 0, maxWidth: 220 }}>
                  Snap face from live stream feed or upload a clear portrait image
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={capture}
                    disabled={!canCapture}
                    style={{
                      padding: "6px 12px", borderRadius: 8, border: `1px solid ${canCapture ? "#10b981" : "#cbd5e1"}`,
                      background: canCapture ? "rgba(16,185,129,0.08)" : "#f1f5f9",
                      color: canCapture ? "#059669" : "#94a3b8", fontSize: 11, fontWeight: 700,
                      cursor: canCapture ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 5,
                      transition: "all 0.2s"
                    }}
                  >
                    <Camera size={13} color={canCapture ? "#059669" : "#94a3b8"} />
                    Capture Feed
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    style={{
                      padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1",
                      background: "#ffffff", color: "#334155", fontSize: 11, fontWeight: 700,
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                    }}
                  >
                    <Upload size={13} color="#475569" />
                    Upload Photo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Registration Form Inputs */}
        <div style={{ flex: "1.2 1 300px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
            <Building2 size={11} color="#6366f1" />
            Employee Details
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Full Name */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                <User size={11} color="#6366f1" />
                Full Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. John Smith"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{
                  width: "100%", background: "#ffffff", border: "1.5px solid #cbd5e1",
                  borderRadius: 8, padding: "8px 12px", color: "#0f172a", fontSize: 12, outline: "none",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.02)", transition: "all 0.2s"
                }}
              />
            </div>

            {/* Row: Employee Code + Department */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <BadgeCheck size={11} color="#64748b" />
                  Employee ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. EMP-104"
                  value={employeeCode}
                  onChange={e => setEmployeeCode(e.target.value)}
                  style={{
                    width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
                    borderRadius: 8, padding: "7px 10px", color: "#0f172a", fontSize: 11.5, outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <Building2 size={11} color="#64748b" />
                  Department
                </label>
                <input
                  type="text"
                  placeholder="e.g. Security / HR"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  style={{
                    width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
                    borderRadius: 8, padding: "7px 10px", color: "#0f172a", fontSize: 11.5, outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Row: Designation + Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <Briefcase size={11} color="#64748b" />
                  Role / Designation
                </label>
                <input
                  type="text"
                  placeholder="e.g. Engineer"
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                  style={{
                    width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
                    borderRadius: 8, padding: "7px 10px", color: "#0f172a", fontSize: 11.5, outline: "none"
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <Mail size={11} color="#64748b" />
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. john@co.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
                    borderRadius: 8, padding: "7px 10px", color: "#0f172a", fontSize: 11.5, outline: "none"
                  }}
                />
              </div>
            </div>

            {/* Alert banners */}
            {error && (
              <div style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.08)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                <AlertCircle size={14} color="#ef4444" />
                {error}
              </div>
            )}
            {success && (
              <div style={{ fontSize: 11, color: "#059669", background: "rgba(16,185,129,0.08)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                <CheckCircle2 size={14} color="#059669" />
                {success}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !name.trim() || !image}
              style={{
                background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#ffffff", border: "none",
                borderRadius: 10, padding: "11px 0", fontSize: 12.5, fontWeight: 700, cursor: (loading || !name.trim() || !image) ? "not-allowed" : "pointer",
                width: "100%", boxShadow: "0 4px 12px rgba(99,102,241,0.25)", transition: "all 0.2s",
                opacity: (loading || !name.trim() || !image) ? 0.5 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}
            >
              <UserPlus size={15} color="#ffffff" />
              {loading ? "Extracting Face & Registering…" : "Save Enrolled Profile"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
