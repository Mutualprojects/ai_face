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

  // Fetch employees
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
    new Set(employees.map((emp) => emp.department).filter(Boolean))
  ) as string[];

  return (
    <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto", padding: "8px 0 32px 0" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: "#111827", margin: "0 0 4px 0" }}>
            Employee Registry
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0, fontWeight: 500 }}>
            Manage registered profiles, facial embeddings, and employee details.
          </p>
        </div>
        <button
          onClick={() => {
            setFormError("");
            setFormSuccess("");
            setShowForm(true);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "#ffffff",
            border: "none",
            borderRadius: 12,
            padding: "10px 18px",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
          }}
        >
          <Plus size={16} />
          Register Employee
        </button>
      </div>

      {/* Directory Filter / Actions Bar */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#9ca3af",
            }}
          />
          <input
            type="text"
            placeholder="Search by name, employee code or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              background: "#f9fafb",
              border: "1px solid #d1d5db",
              borderRadius: 10,
              padding: "10px 14px 10px 38px",
              color: "#111827",
              fontSize: 13.5,
              outline: "none",
            }}
          />
        </div>

        {/* Department Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#4b5563" }}>Department:</span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            style={{
              background: "#f9fafb",
              border: "1px solid #d1d5db",
              borderRadius: 10,
              padding: "9px 14px",
              color: "#111827",
              fontSize: 13.5,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="All" style={{ background: "#fff", color: "#111827" }}>All Departments</option>
            {departmentsList.map((d) => (
              <option key={d} value={d} style={{ background: "#fff", color: "#111827" }}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Reload */}
        <button
          onClick={fetchEmployees}
          style={{
            background: "#f9fafb",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#6b7280",
          }}
          title="Reload registry"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Main Grid View of Registered Employees */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#6b7280" }}>
          <RefreshCw className="animate-spin" style={{ margin: "0 auto 12px", opacity: 0.6 }} />
          <div>Retrieving registered employees...</div>
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "50px 20px", color: "#ef4444" }}>
          <AlertTriangle size={32} />
          <div>{error}</div>
          <button
            onClick={fetchEmployees}
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444",
              borderRadius: 8,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Retry Fetch
          </button>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 20px",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            color: "#6b7280",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <User size={48} style={{ margin: "0 auto 16px", opacity: 0.25 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 4px 0" }}>
            No Employees Found
          </h3>
          <p style={{ fontSize: 13, margin: 0 }}>
            {searchQuery || deptFilter !== "All"
              ? "No registered profiles match your search criteria."
              : "Start by registering your first employee."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 20 }}>
          {filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
            >
              {/* Status Badge */}
              <div
                onClick={() => handleToggleStatus(emp)}
                style={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 8px",
                  borderRadius: 20,
                  fontSize: 10.5,
                  fontWeight: 700,
                  background: emp.is_active ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                  color: emp.is_active ? "#059669" : "#6b7280",
                  border: emp.is_active ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(107,114,128,0.2)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                title="Click to toggle status"
              >
                {emp.is_active ? <UserCheck size={11} /> : <UserX size={11} />}
                {emp.is_active ? "Active" : "Inactive"}
              </div>

              {/* Profile Card Top */}
              <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #f3f4f6" }}>
                {/* Photo */}
                <div style={{ width: 64, height: 64, borderRadius: 14, background: "#f3f4f6", border: "1px solid #e5e7eb", overflow: "hidden", flexShrink: 0 }}>
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(99,102,241,0.08)", color: "#6366f1", fontWeight: 700, fontSize: 18 }}>
                      {emp.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {emp.name}
                  </h3>
                  {emp.employee_code && (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#4f46e5", fontWeight: 600 }}>
                      Code: {emp.employee_code}
                    </div>
                  )}
                </div>
              </div>

              {/* Profile Card Body */}
              <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Department & Designation */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#374151" }}>
                  <Building size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{emp.department || "No Department"}</span>
                  <span style={{ color: "#d1d5db" }}>•</span>
                  <Briefcase size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                  <span>{emp.designation || "No Designation"}</span>
                </div>

                {/* Contact Email */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "#6b7280", minWidth: 0 }}>
                  <Mail size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                  <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {emp.email || "N/A"}
                  </span>
                </div>

                {/* Contact Phone */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "#6b7280" }}>
                  <Phone size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                  <span>{emp.mobile || "N/A"}</span>
                </div>
              </div>

              {/* Profile Card Footer */}
              <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f3f4f6", background: "#f9fafb" }}>
                <span style={{ fontSize: 10.5, color: "#9ca3af", fontWeight: 500 }}>
                  Registered {emp.created_at ? new Date(emp.created_at).toLocaleDateString("en-IN") : "N/A"}
                </span>

                <div style={{ display: "flex", gap: 6 }}>
                  {/* Edit Button */}
                  <button
                    onClick={() => handleEditClick(emp)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 4,
                      color: "#6366f1",
                      cursor: "pointer",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title="Edit Employee Profile"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(emp.id, emp.name)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 4,
                      color: "#ef4444",
                      cursor: "pointer",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    title="Remove Employee Profile"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Registration / Edit Form Off-Canvas Drawer */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            background: "#ffffff",
            boxShadow: "-10px 0 40px rgba(0,0,0,0.12)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid #e5e7eb",
            animation: "fadeInUp 0.2s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 2px 0", color: "#111827" }}>
                {editEmployeeId ? "Edit Profile" : "Register Profile"}
              </h2>
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                {editEmployeeId ? "Update employee details and embeddings" : "Enrolls face embeddings and basic information"}
              </p>
            </div>
            <button
              onClick={closeForm}
              style={{
                background: "#f3f4f6",
                border: "none",
                borderRadius: "50%",
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px" }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              
              {/* Photo Capture Section */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Face Image Capture *
                </label>
                
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    borderRadius: 14,
                    border: "1px dashed #d1d5db",
                    background: "#f9fafb",
                    overflow: "hidden",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {cameraActive ? (
                    <div style={{ width: "100%", height: "100%", position: "relative" }}>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <button
                        type="button"
                        onClick={capturePhoto}
                        style={{
                          position: "absolute",
                          bottom: 12,
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "#6366f1",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                        }}
                      >
                        Capture Frame
                      </button>
                    </div>
                  ) : image ? (
                    <div style={{ width: "100%", height: "100%", position: "relative" }}>
                      <img src={image} alt="Enrolled Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        type="button"
                        onClick={() => {
                          setImage(null);
                          startCamera();
                        }}
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          background: "#ef4444",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "4px 8px",
                          fontSize: 11,
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        Retake / Change
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 20, textAlign: "center" }}>
                      <Camera size={32} style={{ color: "#9ca3af" }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: "0 0 2px 0" }}>Take Face Image</p>
                        <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Provide a clear face view for matching</p>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={startCamera}
                          style={{
                            background: "rgba(99,102,241,0.08)",
                            border: "1px solid rgba(99,102,241,0.2)",
                            color: "#6366f1",
                            borderRadius: 8,
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Camera size={13} />
                          Webcam
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            background: "#f3f4f6",
                            border: "1px solid #d1d5db",
                            color: "#111827",
                            borderRadius: 8,
                            padding: "6px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Upload size={13} />
                          Upload File
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
                  style={{ display: "none" }}
                />
              </div>

              {/* Full Name */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#f9fafb",
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#111827",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
              </div>

              {/* Employee Code */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Employee Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. EMP-1092"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#f9fafb",
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#111827",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
              </div>

              {/* Department & Designation in two columns */}
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Engineering"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#f9fafb",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "10px 14px",
                      color: "#111827",
                      fontSize: 13.5,
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
                    Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lead Dev"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    style={{
                      width: "100%",
                      background: "#f9fafb",
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      padding: "10px 14px",
                      color: "#111827",
                      fontSize: 13.5,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. john.doe@sentinel.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#f9fafb",
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#111827",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
              </div>

              {/* Mobile */}
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Mobile Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#f9fafb",
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#111827",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
              </div>

              {/* Status Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: "#6366f1",
                    cursor: "pointer",
                  }}
                />
                <label htmlFor="isActiveToggle" style={{ fontSize: 13.5, fontWeight: 600, color: "#111827", cursor: "pointer" }}>
                  Set Profile as Active
                </label>
              </div>

              {/* Error & Success Messages */}
              {formError && (
                <div style={{ display: "flex", gap: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: 12, color: "#ef4444", fontSize: 12.5, alignItems: "center", fontWeight: 600 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <div>{formError}</div>
                </div>
              )}

              {formSuccess && (
                <div style={{ display: "flex", gap: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: 12, color: "#10b981", fontSize: 12.5, alignItems: "center", fontWeight: 600 }}>
                  <CheckCircle size={16} style={{ flexShrink: 0 }} />
                  <div>{formSuccess}</div>
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={closeForm}
                  style={{
                    flex: 1,
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    padding: "12px 0",
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "#374151",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !name.trim() || !image}
                  style={{
                    flex: 2,
                    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 0",
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: submitting || !name.trim() || !image ? 0.5 : 1,
                    boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
                  }}
                >
                  {submitting ? (editEmployeeId ? "Saving..." : "Registering...") : (editEmployeeId ? "Save Changes" : "Register Profile")}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
