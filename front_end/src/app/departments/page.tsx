"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  Users,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  MapPin,
  Check,
  UserX,
  ArrowUpRight,
  Filter,
} from "lucide-react";

interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  floor_location: string | null;
  is_active: boolean;
  employee_count?: number;
  active_employee_count?: number;
  created_at?: string;
}

const INK = "var(--text-primary)";
const MUTED = "var(--text-secondary)";
const BORDER = "var(--border-strong)";
const TEAL = "#1F6F5C";
const TEAL_DEEP = "#164F42";
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

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Drawer / Form State
  const [showDrawer, setShowDrawer] = useState(false);
  const [editDeptId, setEditDeptId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [floorLocation, setFloorLocation] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) throw new Error("Failed to load departments.");
      const data = await res.json();
      setDepartments(data);
      setError("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error retrieving department list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const openCreateDrawer = () => {
    setEditDeptId(null);
    setCode("");
    setName("");
    setDescription("");
    setFloorLocation("");
    setIsActive(true);
    setFormError("");
    setFormSuccess("");
    setShowDrawer(true);
  };

  const openEditDrawer = (dept: Department) => {
    setEditDeptId(dept.id);
    setCode(dept.code);
    setName(dept.name);
    setDescription(dept.description || "");
    setFloorLocation(dept.floor_location || "");
    setIsActive(dept.is_active);
    setFormError("");
    setFormSuccess("");
    setShowDrawer(true);
  };

  const handleToggleStatus = async (dept: Department) => {
    try {
      const newStatus = !dept.is_active;
      const res = await fetch(`/api/departments/${dept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status.");
      setDepartments((prev) =>
        prev.map((d) => (d.id === dept.id ? { ...d, is_active: newStatus } : d))
      );
    } catch (err: any) {
      alert(err.message || "Status update failed.");
    }
  };

  const handleDelete = async (id: string, deptName: string) => {
    if (!confirm(`Are you sure you want to delete department "${deptName}"?`)) return;
    try {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete department.");
      setDepartments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(err.message || "Delete failed.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setFormError("Department Name and Code are required.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");

    try {
      const isEdit = Boolean(editDeptId);
      const url = isEdit ? `/api/departments/${editDeptId}` : "/api/departments";
      const method = isEdit ? "PATCH" : "POST";

      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        floor_location: floorLocation.trim() || null,
        is_active: isActive,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Operation failed.");

      setFormSuccess(`Department "${name}" successfully ${isEdit ? "updated" : "created"}!`);
      fetchDepartments();

      setTimeout(() => {
        setShowDrawer(false);
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDepts = departments.filter((d) => {
    const query = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(query) ||
      d.code.toLowerCase().includes(query) ||
      (d.floor_location && d.floor_location.toLowerCase().includes(query))
    );
  });

  const totalEmployees = departments.reduce((acc, d) => acc + (d.employee_count || 0), 0);
  const activeDeptsCount = departments.filter((d) => d.is_active).length;

  return (
    <div className="w-full max-w-[1400px] mx-auto px-0 py-2 pb-10 erg-font-body" style={{ color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        .erg-font-display { font-family: 'Space Grotesk', ui-sans-serif, sans-serif; }
        .erg-font-body { font-family: 'Inter', ui-sans-serif, sans-serif; }
        .erg-font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        @keyframes erg-drawer-in { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes erg-fade-in { from { opacity: 0 } to { opacity: 1 } }
        .erg-drawer { animation: erg-drawer-in .22s cubic-bezier(.16,1,.3,1) }
        .erg-backdrop { animation: erg-fade-in .18s ease-out }
        .erg-card { animation: erg-fade-in .25s ease-out }
      `}</style>

      {/* Header / Hero */}
      <div className="flex flex-wrap items-end justify-between gap-5 mb-7">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: TEAL }}>
            <Building2 size={15} strokeWidth={2.4} />
            Organizational Structure Module
          </div>
          <h1 className="erg-font-display text-[27px] leading-none font-bold tracking-tight" style={{ color: INK }}>
            Department Directory
          </h1>
          <p className="text-[13px] mt-2" style={{ color: MUTED }}>
            Manage organizational divisions, physical zones, and employee assignments.
          </p>
        </div>

        <div
          className="flex items-center gap-5 rounded-2xl px-6 py-3.5 bg-[var(--bg-panel)]"
          style={{ border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(16,27,34,0.04)" }}
        >
          <Stat label="Departments" value={departments.length} />
          <div className="h-8 w-px" style={{ background: BORDER }} />
          <Stat label="Active" value={activeDeptsCount} color={TEAL} />
          <div className="h-8 w-px" style={{ background: BORDER }} />
          <Stat label="Total Staff" value={totalEmployees} color={TEAL_DEEP} />
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="bg-[var(--bg-panel)] rounded-2xl p-4 flex flex-wrap gap-4 items-center mb-6"
        style={{ border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px rgba(16,27,34,0.03)" }}
      >
        <button
          onClick={openCreateDrawer}
          className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold text-white transition-transform duration-150 hover:-translate-y-[1px] active:translate-y-0"
          style={{
            background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
            boxShadow: "0 6px 16px rgba(31,111,92,0.28)",
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Department
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-[260px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Search departments by name, code, or floor location…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${fieldClass} pl-10`}
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchDepartments}
          title="Reload department list"
          className="rounded-xl w-10 h-10 flex items-center justify-center transition-colors hover:bg-[var(--bg-hover)]"
          style={{ border: `1px solid ${BORDER}`, color: MUTED }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Department Cards Grid */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16" style={{ color: MUTED }}>
          <RefreshCw className="animate-spin" size={22} style={{ opacity: 0.6 }} />
          <div className="text-[13.5px] font-medium">Loading department directory…</div>
        </div>
      ) : error ? (
        <div
          className="flex flex-col items-center gap-3 py-14 px-5 rounded-2xl bg-[var(--bg-panel)]"
          style={{ color: RUST, border: `1px solid ${BORDER}` }}
        >
          <AlertTriangle size={30} />
          <div className="text-[13.5px] font-semibold text-center">{error}</div>
          <button
            onClick={fetchDepartments}
            className="rounded-lg px-4 py-1.5 text-[12.5px] font-bold"
            style={{ background: "rgba(179,67,43,0.08)", border: "1px solid rgba(179,67,43,0.25)", color: RUST }}
          >
            Retry Fetch
          </button>
        </div>
      ) : filteredDepts.length === 0 ? (
        <div
          className="text-center py-20 px-6 bg-[var(--bg-panel)] rounded-2xl"
          style={{ border: `1px solid ${BORDER}`, color: MUTED }}
        >
          <Building2 size={44} className="mx-auto mb-4" style={{ opacity: 0.22 }} />
          <h3 className="erg-font-display text-[16px] font-bold mb-1" style={{ color: INK }}>
            No Departments Found
          </h3>
          <p className="text-[13px]">
            {searchQuery
              ? "No departments match your search term. Try another keyword."
              : "Click 'Add Department' to create your first organizational department."}
          </p>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(330px, 100%), 1fr))" }}>
          {filteredDepts.map((dept) => (
            <div
              key={dept.id}
              className="erg-card bg-[var(--bg-panel)] rounded-2xl overflow-hidden flex flex-col relative transition-all duration-200 hover:shadow-[0_10px_28px_rgba(16,27,34,0.08)]"
              style={{ border: `1px solid ${BORDER}` }}
            >
              {/* Status accent strip */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: dept.is_active ? TEAL : "#C9C2B2" }}
              />

              {/* Status Badge */}
              <button
                onClick={() => handleToggleStatus(dept)}
                title="Click to toggle status"
                className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: dept.is_active ? "rgba(31,111,92,0.1)" : "rgba(107,101,88,0.1)",
                  color: dept.is_active ? TEAL : MUTED,
                  border: dept.is_active ? "1px solid rgba(31,111,92,0.22)" : "1px solid rgba(107,101,88,0.2)",
                }}
              >
                {dept.is_active ? "Active" : "Inactive"}
              </button>

              {/* Card Header */}
              <div className="p-5 pl-6 flex items-start gap-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-[14px] erg-font-mono flex-shrink-0"
                  style={{ background: "rgba(31,111,92,0.08)", color: TEAL_DEEP, border: `1px solid ${BORDER}` }}
                >
                  {dept.code}
                </div>
                <div className="min-w-0 flex-1 pr-14">
                  <h3 className="text-[16px] font-bold truncate" style={{ color: INK }}>
                    {dept.name}
                  </h3>
                  {dept.floor_location && (
                    <div className="flex items-center gap-1 text-[11.5px] mt-0.5" style={{ color: MUTED }}>
                      <MapPin size={12} style={{ color: TEAL }} />
                      <span className="truncate">{dept.floor_location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 pl-6 flex-1 flex flex-col justify-between gap-4">
                <p className="text-[12.5px] leading-relaxed line-clamp-2" style={{ color: MUTED }}>
                  {dept.description || "No detailed description provided for this department."}
                </p>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-input)]" style={{ border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-2">
                    <Users size={16} style={{ color: TEAL }} />
                    <span className="text-[12px] font-semibold" style={{ color: INK }}>
                      Enrolled Staff
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="erg-font-display text-[15px] font-bold" style={{ color: TEAL_DEEP }}>
                      {dept.employee_count || 0}
                    </span>
                    <span className="text-[11px]" style={{ color: MUTED }}>
                      ({dept.active_employee_count || 0} active)
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div
                className="px-5 pl-6 py-3 flex justify-between items-center"
                style={{ borderTop: "1px solid var(--border)", background: "var(--bg-input)" }}
              >
                <Link
                  href={`/employees?dept=${encodeURIComponent(dept.name)}`}
                  className="flex items-center gap-1 text-[11.5px] font-bold hover:underline"
                  style={{ color: TEAL }}
                >
                  View Staff <ArrowUpRight size={13} />
                </Link>

                <div className="flex gap-1">
                  <button
                    onClick={() => openEditDrawer(dept)}
                    title="Edit Department"
                    className="p-1.5 rounded-md transition-colors hover:bg-[rgba(31,111,92,0.1)]"
                    style={{ color: TEAL }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(dept.id, dept.name)}
                    title="Delete Department"
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

      {/* Add / Edit Drawer */}
      {showDrawer && (
        <>
          <div
            className="erg-backdrop fixed inset-0 z-[99]"
            style={{ background: "rgba(16,27,34,0.35)" }}
            onClick={() => setShowDrawer(false)}
          />
          <div
            className="erg-drawer fixed top-0 right-0 bottom-0 w-full sm:w-[460px] bg-[var(--bg-panel)] z-[100] flex flex-col"
            style={{ boxShadow: "-10px 0 40px rgba(16,27,34,0.14)", borderLeft: `1px solid ${BORDER}` }}
          >
            <div className="px-6 py-5 flex justify-between items-center" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div>
                <h2 className="erg-font-display text-[17px] font-bold mb-0.5" style={{ color: INK }}>
                  {editDeptId ? "Edit Department" : "Create Department"}
                </h2>
                <p className="text-[12px]" style={{ color: MUTED }}>
                  {editDeptId ? "Update organizational details." : "Add a new organizational division."}
                </p>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                className="rounded-full w-8 h-8 flex items-center justify-center transition-colors hover:bg-[var(--border)]"
                style={{ background: "var(--bg-input)", color: MUTED }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div>
                  <label className={labelClass}>Department Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ENG, HR, FIN"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className={`${fieldClass} erg-font-mono`}
                  />
                </div>

                <div>
                  <label className={labelClass}>Department Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Engineering & AI"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Physical Floor / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Building A - 3rd Floor"
                    value={floorLocation}
                    onChange={(e) => setFloorLocation(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    rows={3}
                    placeholder="Brief description of responsibilities and scope..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <label
                  htmlFor="isActiveDeptToggle"
                  className="flex items-center gap-3 mt-1 rounded-xl px-3.5 py-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ border: `1px solid ${BORDER}` }}
                >
                  <input
                    type="checkbox"
                    id="isActiveDeptToggle"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: TEAL }}
                  />
                  <span className="text-[13.5px] font-semibold" style={{ color: INK }}>
                    Set department as active
                  </span>
                </label>

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

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowDrawer(false)}
                    className="flex-1 rounded-xl py-3 text-[13.5px] font-bold hover:bg-[var(--border)]"
                    style={{ background: "var(--bg-input)", border: `1px solid ${BORDER}`, color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !name.trim() || !code.trim()}
                    className="flex-[2] rounded-xl py-3 text-[13.5px] font-bold text-white transition-transform hover:-translate-y-[1px]"
                    style={{
                      background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DEEP} 100%)`,
                      opacity: submitting || !name.trim() || !code.trim() ? 0.5 : 1,
                      boxShadow: "0 6px 16px rgba(31,111,92,0.28)",
                    }}
                  >
                    {submitting ? "Saving…" : editDeptId ? "Save Changes" : "Create Department"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
