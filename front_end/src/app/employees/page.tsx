"use client";

import { useEffect, useState, useRef } from "react";
import {
  User,
  Phone,
  Building,
  Briefcase,
  Mail,
  Trash2,
  Search,
  Plus,
  X,
  Camera,
  Upload,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  UserX,
  Pencil,
  Filter,
  Fingerprint,
  BadgeCheck,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  photo_url: string;
  employee_code: string | null;
  department: string | null;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

// ---- Design tokens (kept local to this file, no functional impact) ----
const INK = "var(--text-primary)";
const MUTED = "var(--text-secondary)";
const PAPER = "var(--bg-card)";
const BORDER = "var(--border-strong)";
const TEAL = "#1F6F5C";
const TEAL_DEEP = "#164F42";
const AMBER = "#C9762C";
const RUST = "#B3432B";

const fieldClass =
  "w-full bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 text-[13.5px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[#1F6F5C] focus:ring-4 focus:ring-[#1F6F5C]/10 placeholder:text-[var(--text-muted)]";

const labelClass =
  "block text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--text-muted)] mb-2";

function Stat({
  label,
  value,
  color = INK,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="erg-font-display text-[19px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editEmployeeId, setEditEmployeeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [image, setImage] = useState<string | null>(null);

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [dynamicDepts, setDynamicDepts] = useState<{ id: string; name: string; code: string }[]>([]);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptCode, setNewDeptCode] = useState("");
  const [creatingDept, setCreatingDept] = useState(false);
  const [deptModalError, setDeptModalError] = useState("");

  // Bulk HRMS Import State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInputText, setBulkInputText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [bulkError, setBulkError] = useState("");

  // Fetch dynamic departments
  const fetchDepartments = async () => {
    try {
      const res = await fetch("/api/departments");
      if (res.ok) {
        const data = await res.json();
        setDynamicDepts(data);
      }
    } catch (err) {
      console.error("Error fetching dynamic departments:", err);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim() || !newDeptCode.trim()) return;
    setCreatingDept(true);
    setDeptModalError("");
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newDeptCode, name: newDeptName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create department");
      setDepartment(newDeptName);
      setNewDeptName("");
      setNewDeptCode("");
      setShowDeptModal(false);
      await fetchDepartments();
    } catch (err: any) {
      setDeptModalError(err.message || "Error creating department");
    } finally {
      setCreatingDept(false);
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInputText.trim()) return;

    setBulkSubmitting(true);
    setBulkError("");
    setBulkResult(null);

    try {
      let parsedData;
      try {
        parsedData = JSON.parse(bulkInputText);
      } catch (jsonErr) {
        throw new Error("Invalid JSON format. Please check syntax (array of employee objects required).");
      }

      const res = await fetch("/api/hrms/bulk_register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk upload failed.");

      setBulkResult(data.results || data);
      fetchEmployees();
      fetchDepartments();
    } catch (err: any) {
      console.error("Bulk upload error:", err);
      setBulkError(err.message || "Failed to process bulk dataset.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Fetch employees & departments
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/registered_faces");
      if (!res.ok) throw new Error("Failed to load employee list.");
      const data = await res.json();
      setEmployees(data);
      setError("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not retrieve employee registry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
    return () => {
      stopCamera();
    };
  }, []);

  // Camera helpers
  const startCamera = async () => {
    try {
      setFormError("");
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
      setFormError("Webcam access denied or unavailable. You can upload a photo file instead.");
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
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setFormError("Image size must be less than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  const handleEditClick = (emp: Employee) => {
    setEditEmployeeId(emp.id);
    setName(emp.name || "");
    setEmployeeCode(emp.employee_code || "");
    setDepartment(emp.department || "");
    setDesignation(emp.designation || "");
    setEmail(emp.email || "");
    setMobile(emp.mobile || "");
    setIsActive(emp.is_active ?? true);
    setImage(emp.photo_url || null);
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  };

  const handleDelete = async (id: string, empName: string) => {
    if (!confirm(`Are you sure you want to remove employee "${empName}"?`)) return;

    try {
      const res = await fetch(`/api/registered_faces/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete employee profile.");

      setEmployees((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to delete.");
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    const nextStatus = !emp.is_active;
    try {
      const res = await fetch(`/api/registered_faces/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextStatus }),
      });
      if (res.ok) {
        setEmployees((prev) =>
          prev.map((item) => (item.id === emp.id ? { ...item, is_active: nextStatus } : item))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const closeForm = () => {
    stopCamera();
    setShowForm(false);
    setEditEmployeeId(null);
    setName("");
    setEmployeeCode("");
    setDepartment("");
    setDesignation("");
    setEmail("");
    setMobile("");
    setIsActive(true);
    setImage(null);
    setFormError("");
    setFormSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setFormError("Name is required.");
    if (!image) return setFormError("A face photo is required.");

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");

    try {
      const isEdit = !!editEmployeeId;
      const url = isEdit ? `/api/registered_faces/${editEmployeeId}` : "/api/register";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          image: image.startsWith("data:image/") ? image : null,
          employee_code: employeeCode.trim() || null,
          department: department.trim() || null,
          designation: designation.trim() || null,
          email: email.trim() || null,
          mobile: mobile.trim() || null,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${isEdit ? "update" : "register"} profile.`);

      setFormSuccess(`Employee "${name}" has been successfully ${isEdit ? "updated" : "registered"}!`);
      fetchEmployees();

      setTimeout(() => {
        closeForm();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || "Network error. Operation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.employee_code && emp.employee_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (emp.department && emp.department.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDept = deptFilter === "All" || emp.department === deptFilter;

    return matchesSearch && matchesDept;
  });

  const departmentsList = Array.from(
    new Set([
      ...dynamicDepts.map((d) => d.name),
      ...employees.map((emp) => emp.department).filter(Boolean),
    ])
  ) as string[];

  const activeCount = employees.filter((e) => e.is_active).length;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-0 py-2 pb-10 erg-font-body" style={{ color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        .erg-font-display { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; }
        .erg-font-body { font-family: 'Inter', ui-sans-serif, sans-serif; }
        .erg-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes erg-drawer-in { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes erg-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes erg-pulse-dot { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .erg-drawer { animation: erg-drawer-in .22s cubic-bezier(.16,1,.3,1) }
        .erg-backdrop { animation: erg-fade-in .18s ease-out }
        .erg-card { animation: erg-fade-in .25s ease-out }
        .erg-live-dot { animation: erg-pulse-dot 1.8s ease-in-out infinite }
      `}</style>

      {/* ---------------- Header / hero ---------------- */}
      <div className="flex flex-wrap items-end justify-between gap-5 mb-7">
        <div>
          <div
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] mb-2"
            style={{ color: TEAL }}
          >
            <Fingerprint size={14} strokeWidth={2.4} />
            Biometric Access Registry
          </div>
          <h1 className="erg-font-display text-[27px] leading-none font-bold tracking-tight" style={{ color: INK }}>
            Employee Directory
          </h1>
          <p className="text-[13px] mt-2" style={{ color: MUTED }}>
            Enroll faces, manage roles, and control who has access.
          </p>
        </div>

        <div
          className="flex items-center gap-5 rounded-2xl px-6 py-3.5 bg-[var(--bg-panel)]"
          style={{ border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(16,27,34,0.04)" }}
        >
          <Stat label="Enrolled" value={employees.length} />
          <div className="h-8 w-px" style={{ background: BORDER }} />
          <Stat label="Active" value={activeCount} color={TEAL} />
          <div className="h-8 w-px" style={{ background: BORDER }} />
          <Stat label="Inactive" value={employees.length - activeCount} color={RUST} />
        </div>
      </div>

      {/* ---------------- Toolbar ---------------- */}
      <div
        className="bg-[var(--bg-panel)] rounded-2xl p-4 flex flex-wrap gap-4 items-center mb-6"
        style={{ border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(16,27,34,0.03)" }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setFormError("");
              setFormSuccess("");
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white transition-transform duration-150 hover:-translate-y-[1px] active:translate-y-0 focus:outline-none focus-visible:ring-4"
            style={{
              background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
              boxShadow: "0 6px 16px rgba(31,111,92,0.28)",
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            Register Employee
          </button>

          <button
            onClick={() => {
              setBulkError("");
              setBulkResult(null);
              setShowBulkModal(true);
            }}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition-all hover:bg-[var(--bg-hover)]"
            style={{ border: `1px solid ${BORDER}`, color: INK }}
          >
            <Upload size={15} style={{ color: TEAL }} />
            Bulk HRMS Import
          </button>

          <a
            href="/employee-register"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all hover:underline"
            style={{ color: TEAL }}
          >
            Public Onboarding Portal ↗
          </a>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[260px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search by name, employee code, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${fieldClass} pl-10`}
          />
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-2.5">
          <Filter size={14} style={{ color: "var(--text-muted)" }} />
          <span className="text-[13px] font-semibold" style={{ color: MUTED }}>
            Department
          </span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="bg-[var(--bg-input)] rounded-xl px-3.5 py-2.5 text-[13.5px] outline-none cursor-pointer transition-colors focus:border-[#1F6F5C] focus:ring-4 focus:ring-[#1F6F5C]/10"
            style={{ border: `1px solid ${BORDER}`, color: INK }}
          >
            <option value="All">All Departments</option>
            {departmentsList.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Reload */}
        <button
          onClick={fetchEmployees}
          title="Reload registry"
          className="rounded-xl w-10 h-10 flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-4"
          style={{ border: `1px solid ${BORDER}`, color: MUTED }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ---------------- Main content ---------------- */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16" style={{ color: MUTED }}>
          <RefreshCw className="animate-spin" size={22} style={{ opacity: 0.6 }} />
          <div className="text-[13.5px] font-medium">Retrieving registered employees…</div>
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center gap-3 py-14 px-5 rounded-2xl bg-[var(--bg-panel)]"
          style={{ color: RUST, border: `1px solid ${BORDER}` }}
        >
          <AlertTriangle size={30} />
          <div className="text-[13.5px] font-semibold text-center">{error}</div>
          <button
            onClick={fetchEmployees}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-bold transition-colors hover:brightness-95"
            style={{ background: "rgba(179,67,43,0.08)", border: "1px solid rgba(179,67,43,0.25)", color: RUST }}
          >
            Retry Fetch
          </button>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div
          className="text-center py-20 px-6 bg-[var(--bg-panel)] rounded-2xl"
          style={{ border: `1px solid ${BORDER}`, color: MUTED, boxShadow: "0 1px 3px rgba(16,27,34,0.03)" }}
        >
          <User size={44} className="mx-auto mb-4" style={{ opacity: 0.22 }} />
          <h3 className="erg-font-display text-[16px] font-bold mb-1" style={{ color: INK }}>
            No employees found
          </h3>
          <p className="text-[13px]">
            {searchQuery || deptFilter !== "All"
              ? "No enrolled profiles match your search. Try a different name, code, or department."
              : "Register your first employee to enroll their face and start tracking access."}
          </p>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(310px, 100%), 1fr))" }}>
          {filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="erg-card group bg-[var(--bg-panel)] rounded-2xl overflow-hidden flex flex-col relative transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(16,27,34,0.09)]"
              style={{ border: `1px solid ${BORDER}` }}
            >
              {/* accent strip */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: emp.is_active ? TEAL : "#C9C2B2" }}
              />

              {/* Status badge */}
              <button
                onClick={() => handleToggleStatus(emp)}
                title="Click to toggle status"
                className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-transform hover:scale-105 active:scale-95"
                style={{
                  background: emp.is_active ? "rgba(31,111,92,0.1)" : "rgba(107,101,88,0.1)",
                  color: emp.is_active ? TEAL : MUTED,
                  border: emp.is_active ? "1px solid rgba(31,111,92,0.22)" : "1px solid rgba(107,101,88,0.2)",
                }}
              >
                {emp.is_active ? (
                  <span className="erg-live-dot h-1.5 w-1.5 rounded-full" style={{ background: TEAL }} />
                ) : (
                  <UserX size={11} />
                )}
                {emp.is_active ? "Active" : "Inactive"}
              </button>

              {/* Card top */}
              <div className="p-5 pl-6 flex items-center gap-4" style={{ borderBottom: `1px solid var(--border)` }}>
                <div
                  className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--bg-input)]"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center font-bold text-[18px] erg-font-display"
                      style={{ background: "rgba(31,111,92,0.08)", color: TEAL }}
                    >
                      {emp.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <h3
                    className="text-[15px] font-bold mb-1 whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ color: INK }}
                  >
                    {emp.name}
                  </h3>
                  {emp.employee_code && (
                    <div
                      className="erg-font-mono inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-md tracking-wide"
                      style={{ background: "rgba(31,111,92,0.08)", color: TEAL_DEEP }}
                    >
                      <BadgeCheck size={11} />
                      {emp.employee_code}
                    </div>
                  )}
                </div>
              </div>

              {/* Card body */}
              <div className="p-5 pl-6 flex-1 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  <Building size={14} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
                  <span className="font-semibold">{emp.department || "No department"}</span>
                  <span style={{ color: "var(--text-muted)" }}>•</span>
                  <Briefcase size={14} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
                  <span>{emp.designation || "No designation"}</span>
                </div>

                <div className="flex items-center gap-2.5 text-[12.5px] min-w-0" style={{ color: MUTED }}>
                  <Mail size={14} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
                  <span className="text-ellipsis overflow-hidden whitespace-nowrap">{emp.email || "N/A"}</span>
                </div>

                <div className="flex items-center gap-2.5 text-[12.5px]" style={{ color: MUTED }}>
                  <Phone size={14} style={{ color: "var(--text-muted)" }} className="flex-shrink-0" />
                  <span>{emp.mobile || "N/A"}</span>
                </div>
              </div>

              {/* Card footer */}
              <div
                className="px-5 pl-6 py-3 flex justify-between items-center"
                style={{ borderTop: "1px solid var(--border)", background: "var(--bg-input)" }}
              >
                <span className="text-[10.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Registered {emp.created_at ? new Date(emp.created_at).toLocaleDateString("en-IN") : "N/A"}
                </span>

                <div className="flex gap-1">
                  <button
                    onClick={() => handleEditClick(emp)}
                    title="Edit employee profile"
                    className="p-1.5 rounded-md transition-colors hover:bg-[rgba(31,111,92,0.1)]"
                    style={{ color: TEAL }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(emp.id, emp.name)}
                    title="Remove employee profile"
                    className="p-1.5 rounded-md transition-colors hover:bg-[rgba(179,67,43,0.1)]"
                    style={{ color: RUST }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- Registration / Edit drawer ---------------- */}
      {showForm && (
        <>
          <div
            className="erg-backdrop fixed inset-0 z-[99]"
            style={{ background: "rgba(16,27,34,0.35)" }}
            onClick={closeForm}
          />
          <div
            className="erg-drawer fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-[var(--bg-panel)] z-[100] flex flex-col"
            style={{ boxShadow: "-10px 0 40px rgba(16,27,34,0.14)", borderLeft: `1px solid ${BORDER}` }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 flex justify-between items-center"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              <div>
                <h2 className="erg-font-display text-[17px] font-bold mb-0.5" style={{ color: INK }}>
                  {editEmployeeId ? "Edit Profile" : "Register Profile"}
                </h2>
                <p className="text-[12px]" style={{ color: MUTED }}>
                  {editEmployeeId ? "Update employee details and face data." : "Enrolls a face and basic details."}
                </p>
              </div>
              <button
                onClick={closeForm}
                className="rounded-full w-8 h-8 flex items-center justify-center transition-colors hover:bg-[var(--border)]"
                style={{ background: "var(--bg-input)", color: MUTED }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Photo capture */}
                <div>
                  <label className={labelClass}>Face Image Capture *</label>

                  <div
                    className="w-full rounded-2xl overflow-hidden relative flex items-center justify-center bg-[var(--bg-input)]"
                    style={{ aspectRatio: "4/3", border: `1px dashed ${BORDER}` }}
                  >
                    {cameraActive ? (
                      <div className="w-full h-full relative">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-[12px] font-bold text-white transition-transform hover:-translate-y-[1px]"
                          style={{ background: TEAL, boxShadow: "0 4px 12px rgba(31,111,92,0.35)" }}
                        >
                          Capture Frame
                        </button>
                      </div>
                    ) : image ? (
                      <div className="w-full h-full relative">
                        <img src={image} alt="Enrolled preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            setImage(null);
                            startCamera();
                          }}
                          className="absolute top-2.5 right-2.5 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white transition-transform hover:-translate-y-[1px]"
                          style={{ background: RUST }}
                        >
                          Retake / Change
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 p-5 text-center">
                        <Camera size={30} style={{ color: "var(--text-muted)" }} />
                        <div>
                          <p className="text-[12px] font-semibold mb-0.5" style={{ color: INK }}>
                            Take a face image
                          </p>
                          <p className="text-[11px]" style={{ color: MUTED }}>
                            Use a clear, front-facing photo for accurate matching.
                          </p>
                        </div>
                        <div className="flex gap-2.5 mt-1">
                          <button
                            type="button"
                            onClick={startCamera}
                            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-[rgba(31,111,92,0.14)]"
                            style={{ background: "rgba(31,111,92,0.08)", border: "1px solid rgba(31,111,92,0.22)", color: TEAL }}
                          >
                            <Camera size={13} />
                            Webcam
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-[var(--border)]"
                            style={{ background: "var(--bg-input)", border: `1px solid ${BORDER}`, color: INK }}
                          >
                            <Upload size={13} />
                            Upload File
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </div>

                {/* Full Name */}
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                {/* Employee Code */}
                <div>
                  <label className={labelClass}>Employee Code</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-1092"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className={`${fieldClass} erg-font-mono`}
                  />
                </div>

                {/* Department & Designation */}
                <div className="flex gap-3.5">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelClass}>Department</label>
                      <button
                        type="button"
                        onClick={() => setShowDeptModal(true)}
                        className="text-[10px] font-bold tracking-wide uppercase transition-colors hover:underline"
                        style={{ color: TEAL }}
                      >
                        + New Dept
                      </button>
                    </div>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select Department</option>
                      {departmentsList.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelClass}>Designation</label>
                    <input
                      type="text"
                      placeholder="e.g. Lead Dev"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className={labelClass}>Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. john.doe@sentinel.ai"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                {/* Mobile */}
                <div>
                  <label className={labelClass}>Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                {/* Status Toggle */}
                <label
                  htmlFor="isActiveToggle"
                  className="flex items-center gap-3 mt-1 rounded-xl px-3.5 py-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  <input
                    type="checkbox"
                    id="isActiveToggle"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: TEAL }}
                  />
                  <span className="text-[13.5px] font-semibold" style={{ color: INK }}>
                    Set profile as active
                  </span>
                </label>

                {/* Error & Success Messages */}
                {formError && (
                  <div
                    className="flex gap-2.5 rounded-xl p-3 text-[12.5px] font-semibold items-center"
                    style={{ background: "rgba(179,67,43,0.08)", border: "1px solid rgba(179,67,43,0.22)", color: RUST }}
                  >
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <div>{formError}</div>
                  </div>
                )}

                {formSuccess && (
                  <div
                    className="flex gap-2.5 rounded-xl p-3 text-[12.5px] font-semibold items-center"
                    style={{ background: "rgba(31,111,92,0.08)", border: "1px solid rgba(31,111,92,0.22)", color: TEAL_DEEP }}
                  >
                    <CheckCircle size={16} className="flex-shrink-0" />
                    <div>{formSuccess}</div>
                  </div>
                )}

                {/* Submit buttons */}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex-1 rounded-xl py-3 text-[13.5px] font-bold transition-colors hover:bg-[var(--border)]"
                    style={{ background: "var(--bg-input)", border: `1px solid ${BORDER}`, color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !name.trim() || !image}
                    className="flex-[2] rounded-xl py-3 text-[13.5px] font-bold text-white transition-transform duration-150 hover:-translate-y-[1px] disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    style={{
                      background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
                      opacity: submitting || !name.trim() || !image ? 0.5 : 1,
                      boxShadow: "0 6px 16px rgba(31,111,92,0.28)",
                    }}
                  >
                    {submitting
                      ? editEmployeeId
                        ? "Saving…"
                        : "Registering…"
                      : editEmployeeId
                        ? "Save Changes"
                        : "Register Profile"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ---------------- Create Dynamic Department Modal ---------------- */}
      {showDeptModal && (
        <div className="erg-backdrop fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-[var(--bg-panel)] rounded-2xl p-6 w-full max-w-md shadow-2xl" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="erg-font-display text-[17px] font-bold" style={{ color: INK }}>
                Add Dynamic Department
              </h3>
              <button
                type="button"
                onClick={() => setShowDeptModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDepartment} className="space-y-4">
              <div>
                <label className={labelClass}>Department Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ENG, HR, MKTG"
                  value={newDeptCode}
                  onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                  className={`${fieldClass} erg-font-mono`}
                />
              </div>

              <div>
                <label className={labelClass}>Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Artificial Intelligence"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className={fieldClass}
                />
              </div>

              {deptModalError && (
                <div className="text-[12px] font-semibold" style={{ color: RUST }}>
                  {deptModalError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="flex-1 py-2.5 rounded-xl border text-[13px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingDept || !newDeptName.trim() || !newDeptCode.trim()}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
                  style={{ background: TEAL }}
                >
                  {creatingDept ? "Saving..." : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- Bulk HRMS Import Modal ---------------- */}
      {showBulkModal && (
        <div className="erg-backdrop fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/45">
          <div className="bg-[var(--bg-panel)] rounded-3xl p-7 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-strong)] mb-4">
              <div>
                <h3 className="erg-font-display text-[18px] font-bold" style={{ color: INK }}>
                  HRMS Bulk Employee Integration
                </h3>
                <p className="text-[12px]" style={{ color: MUTED }}>
                  Import multiple employee profiles and face data via JSON dataset or REST API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] rounded-full p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-5">
              {/* Endpoint Documentation Box */}
              <div className="rounded-2xl p-4 bg-[var(--bg-input)] border border-[var(--border-strong)] space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] uppercase tracking-wide" style={{ color: TEAL }}>
                    HRMS Direct Integration Endpoint
                  </span>
                  <span className="erg-font-mono text-[10.5px] px-2 py-0.5 rounded bg-[var(--bg-panel)] border border-[var(--border-strong)]" style={{ color: TEAL_DEEP }}>
                    POST /api/hrms/bulk_register
                  </span>
                </div>
                <p style={{ color: MUTED }}>
                  Your HRMS (Workday, BambooHR, SAP, custom systems) can push employee records directly using JSON payloads containing <code>photo_base64</code> or <code>photo_url</code>.
                </p>
              </div>

              <form onSubmit={handleBulkUpload} className="space-y-4">
                <div>
                  <label className={labelClass}>Paste HRMS JSON Dataset (Array of Employee Objects) *</label>
                  <textarea
                    rows={8}
                    required
                    placeholder={`[\n  {\n    "name": "Sarah Connor",\n    "employee_code": "EMP-9001",\n    "department": "Engineering",\n    "designation": "AI Lead",\n    "email": "sarah.connor@company.com",\n    "photo_base64": "data:image/jpeg;base64,..."\n  }\n]`}
                    value={bulkInputText}
                    onChange={(e) => setBulkInputText(e.target.value)}
                    className={`${fieldClass} erg-font-mono text-[12px] leading-relaxed`}
                  />
                </div>

                {bulkError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl text-[12.5px] font-semibold" style={{ background: "rgba(179,67,43,0.08)", border: "1px solid rgba(179,67,43,0.22)", color: RUST }}>
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <div>{bulkError}</div>
                  </div>
                )}

                {bulkResult && (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2 text-[13px]">
                    <div className="font-bold flex items-center gap-2 text-emerald-700">
                      <CheckCircle size={18} />
                      Bulk Sync Finished: {bulkResult.succeeded} Succeeded, {bulkResult.failed} Failed
                    </div>
                    {bulkResult.errors && bulkResult.errors.length > 0 && (
                      <div className="text-[12px] text-red-600 mt-2 space-y-1">
                        {bulkResult.errors.map((err: any, idx: number) => (
                          <div key={idx}>• {err.name || err.employee_code}: {err.error}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkModal(false)}
                    className="flex-1 py-3 rounded-xl border text-[13.5px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={bulkSubmitting || !bulkInputText.trim()}
                    className="flex-[2] py-3 rounded-xl text-[13.5px] font-bold text-white transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)` }}
                  >
                    {bulkSubmitting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Processing HRMS Import…
                      </>
                    ) : (
                      "Start Bulk Registration Sync"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}