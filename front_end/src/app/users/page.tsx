"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Edit3,
  Trash2,
  X,
  Check,
  ChevronDown,
  Filter,
  MoreVertical,
  Key,
  Clock,
  Mail,
  Phone,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Lock,
  Unlock,
  Camera,
  Activity,
  Database,
  FileText,
  BarChart3,
  Globe,
  ScanFace,
} from "lucide-react";

/* ─── Types ─── */
interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "operator" | "viewer";
  department: string;
  phone: string;
  status: "active" | "inactive" | "suspended";
  lastLogin: string;
  createdAt: string;
  avatar?: string;
  permissions: string[];
}

type Permission =
  | "dashboard.view"
  | "employees.view"
  | "employees.edit"
  | "employees.delete"
  | "departments.view"
  | "departments.edit"
  | "departments.delete"
  | "cameras.view"
  | "cameras.edit"
  | "cameras.delete"
  | "faces.view"
  | "faces.register"
  | "faces.delete"
  | "visitors.view"
  | "visitors.register"
  | "visitors.delete"
  | "logs.view"
  | "logs.delete"
  | "analytics.view"
  | "sdk.view"
  | "sdk.edit"
  | "users.view"
  | "users.manage"
  | "settings.view"
  | "settings.edit";

const ALL_PERMISSIONS: { key: Permission; label: string; category: string }[] = [
  { key: "dashboard.view", label: "View Dashboard", category: "Dashboard" },
  { key: "employees.view", label: "View Employees", category: "Employees" },
  { key: "employees.edit", label: "Edit Employees", category: "Employees" },
  { key: "employees.delete", label: "Delete Employees", category: "Employees" },
  { key: "departments.view", label: "View Departments", category: "Departments" },
  { key: "departments.edit", label: "Edit Departments", category: "Departments" },
  { key: "departments.delete", label: "Delete Departments", category: "Departments" },
  { key: "cameras.view", label: "View Cameras", category: "Cameras" },
  { key: "cameras.edit", label: "Edit Cameras", category: "Cameras" },
  { key: "cameras.delete", label: "Delete Cameras", category: "Cameras" },
  { key: "faces.view", label: "View Faces", category: "Face Recognition" },
  { key: "faces.register", label: "Register Faces", category: "Face Recognition" },
  { key: "faces.delete", label: "Delete Faces", category: "Face Recognition" },
  { key: "visitors.view", label: "View Visitors", category: "Visitors" },
  { key: "visitors.register", label: "Register Visitors", category: "Visitors" },
  { key: "visitors.delete", label: "Delete Visitors", category: "Visitors" },
  { key: "logs.view", label: "View Logs", category: "Detection Log" },
  { key: "logs.delete", label: "Delete Logs", category: "Detection Log" },
  { key: "analytics.view", label: "View Analytics", category: "Analytics" },
  { key: "sdk.view", label: "View SDK", category: "SDK" },
  { key: "sdk.edit", label: "Edit SDK Config", category: "SDK" },
  { key: "users.view", label: "View Users", category: "User Management" },
  { key: "users.manage", label: "Manage Users", category: "User Management" },
  { key: "settings.view", label: "View Settings", category: "Settings" },
  { key: "settings.edit", label: "Edit Settings", category: "Settings" },
];

const ROLE_PERMISSIONS: Record<User["role"], Permission[]> = {
  admin: ALL_PERMISSIONS.map((p) => p.key),
  manager: [
    "dashboard.view", "employees.view", "employees.edit", "departments.view",
    "cameras.view", "cameras.edit", "faces.view", "faces.register", "faces.delete",
    "visitors.view", "visitors.register", "visitors.delete",
    "logs.view", "analytics.view", "sdk.view", "users.view",
  ],
  operator: [
    "dashboard.view", "employees.view", "departments.view",
    "cameras.view", "faces.view", "faces.register",
    "visitors.view", "visitors.register", "visitors.delete",
    "logs.view", "analytics.view",
  ],
  viewer: [
    "dashboard.view", "employees.view", "departments.view",
    "cameras.view", "faces.view", "visitors.view", "logs.view", "analytics.view",
  ],
};

/* ─── Module-level Role Access Matrix (best-of-best) ───
   Each module shows the effective access each role gets:
   - "view"  → can read
   - "edit"  → can view + edit (mutate non-destructive)
   - "full"  → can view + edit + delete
   "—"       → no access
*/
type AccessLevel = "full" | "edit" | "view" | "none";

type ModuleAccess = {
  id: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  byRole: Record<User["role"], AccessLevel>;
};

const MODULE_ACCESS: ModuleAccess[] = [
  { id: "dashboard", label: "Dashboard", desc: "Live face recognition overview & presence", icon: <BarChart3 size={14} />,
    byRole: { admin: "full", manager: "view", operator: "view", viewer: "view" } },
  { id: "employees", label: "Employees", desc: "Employee directory & records", icon: <Users size={14} />,
    byRole: { admin: "full", manager: "edit", operator: "view", viewer: "view" } },
  { id: "departments", label: "Departments", desc: "Department structure & org mapping", icon: <Briefcase size={14} />,
    byRole: { admin: "full", manager: "edit", operator: "view", viewer: "view" } },
  { id: "cameras", label: "Cameras", desc: "Surveillance feeds, RTSP & stream status", icon: <Camera size={14} />,
    byRole: { admin: "full", manager: "edit", operator: "view", viewer: "view" } },
  { id: "faces", label: "Face Recognition", desc: "Identify, register & match individuals", icon: <ScanFace size={14} />,
    byRole: { admin: "full", manager: "edit", operator: "edit", viewer: "view" } },
  { id: "visitors", label: "Visitors", desc: "Visitor registration & tracking", icon: <Globe size={14} />,
    byRole: { admin: "full", manager: "full", operator: "edit", viewer: "view" } },
  { id: "logs", label: "Detection Log", desc: "Person / unknown encounter history", icon: <FileText size={14} />,
    byRole: { admin: "full", manager: "view", operator: "view", viewer: "view" } },
  { id: "analytics", label: "Analytics", desc: "Trends, charts & insights", icon: <BarChart3 size={14} />,
    byRole: { admin: "view", manager: "view", operator: "view", viewer: "view" } },
  { id: "sdk", label: "Manage SDK", desc: "API keys & integration config", icon: <Database size={14} />,
    byRole: { admin: "full", manager: "edit", operator: "none", viewer: "none" } },
  { id: "users", label: "User Management", desc: "Users, roles & access permissions", icon: <Shield size={14} />,
    byRole: { admin: "full", manager: "view", operator: "none", viewer: "none" } },
  { id: "settings", label: "Settings", desc: "System-wide configuration", icon: <Settings size={14} />,
    byRole: { admin: "full", manager: "view", operator: "none", viewer: "none" } },
];

const ACCESS_LEVEL_META: Record<AccessLevel, { label: string; color: string; bg: string }> = {
  full: { label: "Full", color: "#059669", bg: "rgba(5,150,105,0.12)" },
  edit: { label: "Edit", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  view: { label: "View", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  none: { label: "—", color: "#94a3b8", bg: "rgba(148,163,184,0.08)" },
};

const ROLE_CONFIG: Record<User["role"], { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  admin: { label: "Admin", color: "#dc2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)", icon: <ShieldAlert size={13} /> },
  manager: { label: "Manager", color: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)", icon: <ShieldCheck size={13} /> },
  operator: { label: "Operator", color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.2)", icon: <Settings size={13} /> },
  viewer: { label: "Viewer", color: "#64748b", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.2)", icon: <Eye size={13} /> },
};

const STATUS_CONFIG: Record<User["status"], { label: string; color: string; dot: string }> = {
  active: { label: "Active", color: "#059669", dot: "#10b981" },
  inactive: { label: "Inactive", color: "#64748b", dot: "#94a3b8" },
  suspended: { label: "Suspended", color: "#dc2626", dot: "#ef4444" },
};

const DEPARTMENTS = ["Security", "IT", "HR", "Operations", "Management", "Reception", "Facilities"];

const MOCK_USERS: User[] = [
  { id: "u1", name: "Rajesh Kumar", email: "rajesh@brihaspathi.com", role: "admin", department: "IT", phone: "+91 98765 43210", status: "active", lastLogin: "2026-08-27T04:30:00Z", createdAt: "2026-01-15T00:00:00Z", permissions: ROLE_PERMISSIONS.admin },
  { id: "u2", name: "Priya Sharma", email: "priya@brihaspathi.com", role: "manager", department: "Security", phone: "+91 98765 43211", status: "active", lastLogin: "2026-08-27T03:15:00Z", createdAt: "2026-02-20T00:00:00Z", permissions: ROLE_PERMISSIONS.manager },
  { id: "u3", name: "Suresh Reddy", email: "suresh@brihaspathi.com", role: "operator", department: "Operations", phone: "+91 98765 43212", status: "active", lastLogin: "2026-08-26T18:45:00Z", createdAt: "2026-03-10T00:00:00Z", permissions: ROLE_PERMISSIONS.operator },
  { id: "u4", name: "Anitha Nair", email: "anitha@brihaspathi.com", role: "viewer", department: "Reception", phone: "+91 98765 43213", status: "active", lastLogin: "2026-08-25T12:00:00Z", createdAt: "2026-04-05T00:00:00Z", permissions: ROLE_PERMISSIONS.viewer },
  { id: "u5", name: "Vikram Patel", email: "vikram@brihaspathi.com", role: "manager", department: "HR", phone: "+91 98765 43214", status: "inactive", lastLogin: "2026-08-20T09:30:00Z", createdAt: "2026-02-28T00:00:00Z", permissions: ROLE_PERMISSIONS.manager },
  { id: "u6", name: "Deepa Menon", email: "deepa@brihaspathi.com", role: "operator", department: "Security", phone: "+91 98765 43215", status: "active", lastLogin: "2026-08-27T02:00:00Z", createdAt: "2026-05-12T00:00:00Z", permissions: ROLE_PERMISSIONS.operator },
  { id: "u7", name: "Karthik Iyer", email: "karthik@brihaspathi.com", role: "viewer", department: "Facilities", phone: "+91 98765 43216", status: "suspended", lastLogin: "2026-08-15T14:20:00Z", createdAt: "2026-06-01T00:00:00Z", permissions: ROLE_PERMISSIONS.viewer },
];

/* ─── Utility ─── */
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function genId() {
  return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ─── Main ─── */
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showPerms, setShowPerms] = useState<string | null>(null);
  const [editPermsUser, setEditPermsUser] = useState<string | null>(null);
  const [draftPerms, setDraftPerms] = useState<Permission[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  // Fetch users from Supabase API
  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/sentinel_users");
      if (res.ok) {
        const data = await res.json();
        // Map DB rows to User type (add permissions from role)
        const mapped: User[] = data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          department: u.department || "",
          phone: u.phone || "",
          status: u.status,
          lastLogin: u.last_login || "Never",
          createdAt: u.created_at || new Date().toISOString(),
          permissions: ROLE_PERMISSIONS[u.role as User["role"]] || ROLE_PERMISSIONS.viewer,
        }));
        setUsers(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()) || u.department.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus = statusFilter === "all" || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    inactive: users.filter((u) => u.status === "inactive").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    admins: users.filter((u) => u.role === "admin").length,
  }), [users]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(data: Partial<User>) {
    try {
      if (editUser) {
        const res = await fetch(`/api/sentinel_users/${editUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          await fetchUsers();
          showToast("User updated successfully");
        } else {
          const err = await res.json();
          showToast(err.error || "Failed to update user");
        }
      } else {
        const res = await fetch("/api/sentinel_users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          await fetchUsers();
          showToast("User created successfully");
        } else {
          const err = await res.json();
          showToast(err.error || "Failed to create user");
        }
      }
    } catch (err) {
      showToast("Network error");
    }
    setShowModal(false);
    setEditUser(null);
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/sentinel_users/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchUsers();
        showToast("User deleted");
      } else {
        showToast("Failed to delete user");
      }
    } catch (err) {
      showToast("Network error");
    }
    setConfirmDelete(null);
  }

  async function handleSavePerms(id: string) {
    try {
      const res = await fetch(`/api/sentinel_users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: draftPerms }),
      });
      if (res.ok) {
        await fetchUsers();
        showToast("Permissions updated successfully");
      } else {
        showToast("Failed to update permissions");
      }
    } catch {
      showToast("Network error");
    }
    setEditPermsUser(null);
    setShowPerms(null);
  }

  async function handleToggleStatus(id: string) {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const nextStatus = user.status === "active" ? "suspended" : "active";
    try {
      const res = await fetch(`/api/sentinel_users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchUsers();
        showToast("User status updated");
      }
    } catch (err) {
      showToast("Network error");
    }
  }

  return (
    <>
      <style>{`
        .users-page { padding: 0 0 40px 0; }
        .users-page .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px;
          transition: all 0.2s ease;
        }
        .users-page .stat-card:hover {
          border-color: var(--border-strong);
          box-shadow: var(--shadow-sm);
        }
        .users-page .table-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow-x: auto;
        }
        .users-page table {
          width: 100%;
          min-width: 720px;
          border-collapse: collapse;
        }
        .users-page th {
          text-align: left;
          padding: 14px 16px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          background: var(--bg-input);
          border-bottom: 1px solid var(--border);
        }
        .users-page td {
          padding: 14px 16px;
          font-size: 13.5px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-light);
          vertical-align: middle;
        }
        .users-page tr:last-child td { border-bottom: none; }
        .users-page tr:hover td { background: var(--bg-hover); }
        .users-page .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
        }
        .users-page .status-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        }
        .users-page .action-btn {
          width: 32px; height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg-input);
          color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .users-page .action-btn:hover {
          border-color: var(--border-strong);
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .users-page .action-btn.danger:hover {
          border-color: rgba(220,38,38,0.3);
          color: #dc2626;
          background: rgba(220,38,38,0.06);
        }
        .users-page .overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          z-index: 100;
          display: flex; align-items: center; justify-content: center;
          animation: fadeIn 0.15s ease;
        }
        .users-page .modal {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          width: 90%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow-xl);
          animation: slideUp 0.2s ease;
        }
        .users-page .modal-lg { max-width: 720px; }
        .users-page .field {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid var(--border-strong);
          background: var(--bg-input);
          color: var(--text-primary);
          font-size: 13.5px;
          outline: none;
          transition: border-color 0.15s;
        }
        .users-page .field:focus { border-color: var(--violet); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        .users-page .field-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .users-page .perm-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 8px;
        }
        .users-page .perm-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg-input);
          font-size: 12.5px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .users-page .perm-item.active {
          border-color: rgba(99,102,241,0.3);
          background: rgba(99,102,241,0.06);
          color: var(--text-primary);
        }
        .users-page .perm-item:hover { border-color: var(--border-strong); }
        .users-page .perm-cat {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          padding: 8px 0 4px 0;
        }
        .users-page .toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          padding: 12px 20px;
          border-radius: 12px;
          background: #059669;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          box-shadow: 0 8px 24px rgba(5,150,105,0.3);
          z-index: 200;
          animation: slideUp 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .users-page .perm-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="users-page">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>User Management</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Manage users, roles & access permissions</p>
          </div>
          <button
            onClick={() => { setEditUser(null); setShowModal(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 12,
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff", fontSize: 13, fontWeight: 700,
              border: "none", cursor: "pointer",
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
              transition: "all 0.2s",
            }}
          >
            <UserPlus size={16} /> Add User
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Users", value: stats.total, color: "var(--violet)", icon: <Users size={18} /> },
            { label: "Active", value: stats.active, color: "#059669", icon: <CheckCircle size={18} /> },
            { label: "Inactive", value: stats.inactive, color: "#64748b", icon: <XCircle size={18} /> },
            { label: "Suspended", value: stats.suspended, color: "#dc2626", icon: <ShieldAlert size={18} /> },
            { label: "Admins", value: stats.admins, color: "#dc2626", icon: <ShieldAlert size={18} /> },
          ].map((s) => (
            <div className="stat-card" key={s.label}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{s.label}</div>
                </div>
                <div style={{ color: s.color, opacity: 0.6 }}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="field"
              placeholder="Search by name, email, or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
          <select
            className="field"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: "auto", minWidth: 130, cursor: "pointer" }}
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
          <select
            className="field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "auto", minWidth: 130, cursor: "pointer" }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        {/* Role Access Matrix Toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
              <Shield size={16} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>Role-Based Access Control</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>See exactly what each role can access across modules</div>
            </div>
          </div>
          <button
            onClick={() => setShowMatrix(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10,
              border: showMatrix ? "1px solid rgba(99,102,241,0.4)" : "1px solid var(--border-strong)",
              background: showMatrix ? "rgba(99,102,241,0.08)" : "var(--bg-input)",
              color: showMatrix ? "#6366f1" : "var(--text-secondary)", fontSize: 12.5, fontWeight: 700,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <ShieldCheck size={15} />
            {showMatrix ? "Hide Access Matrix" : "View Access Matrix"}
            <ChevronDown size={14} style={{ transform: showMatrix ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
        </div>

        {/* Role Access Matrix Panel */}
        {showMatrix && (
          <div className="table-card" style={{ marginBottom: 20, overflowX: "auto" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} style={{ color: "#059669" }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>Module Access by Role</span>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(["full", "edit", "view", "none"] as AccessLevel[]).map(lvl => (
                  <div key={lvl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: ACCESS_LEVEL_META[lvl].bg, border: `1px solid ${ACCESS_LEVEL_META[lvl].color}55`, display: "inline-block" }} />
                    {ACCESS_LEVEL_META[lvl].label === "—" ? "No access" : ACCESS_LEVEL_META[lvl].label}
                  </div>
                ))}
              </div>
            </div>
            <table style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Module</th>
                  {(["admin", "manager", "operator", "viewer"] as User["role"][]).map(r => {
                    const cfg = ROLE_CONFIG[r];
                    return (
                      <th key={r} style={{ textAlign: "center" }}>
                        <span className="role-badge" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {MODULE_ACCESS.map(mod => (
                  <tr key={mod.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", width: 18 }}>{mod.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{mod.label}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{mod.desc}</div>
                        </div>
                      </div>
                    </td>
                    {(["admin", "manager", "operator", "viewer"] as User["role"][]).map(r => {
                      const lvl = mod.byRole[r];
                      const meta = ACCESS_LEVEL_META[lvl];
                      const isNone = lvl === "none";
                      return (
                        <td key={r} style={{ textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", minWidth: 64, padding: "5px 12px", borderRadius: 7,
                            background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700,
                            border: `1px solid ${meta.color}33`, opacity: isNone ? 0.7 : 1,
                          }}>
                            {meta.label}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Users Table */}
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Last Login</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                    <div style={{ width: 32, height: 32, border: "3px solid var(--border-strong)", borderTopColor: "var(--violet)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Loading users from Supabase...</div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                    <Users size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No users found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your search or filters</div>
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const role = ROLE_CONFIG[u.role];
                const status = STATUS_CONFIG[u.status];
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 12,
                          background: `linear-gradient(135deg, ${role.color}22, ${role.color}44)`,
                          border: `1px solid ${role.color}33`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 800, color: role.color,
                          flexShrink: 0,
                        }}>
                          {getInitials(u.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="role-badge" style={{ background: role.bg, color: role.color, border: `1px solid ${role.border}` }}>
                        {role.icon} {role.label}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>{u.department}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div className="status-dot" style={{ background: status.dot }} />
                        <span style={{ color: status.color, fontSize: 12.5, fontWeight: 600 }}>{status.label}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} />
                        {u.lastLogin === "Never" ? "Never" : timeAgo(u.lastLogin)}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="action-btn" title="View Permissions" onClick={() => setShowPerms(u.id)}>
                          <Key size={14} />
                        </button>
                        <button className="action-btn" title="Edit" onClick={() => { setEditUser(u); setShowModal(true); }}>
                          <Edit3 size={14} />
                        </button>
                        <button className="action-btn" title={u.status === "active" ? "Suspend" : "Activate"} onClick={() => handleToggleStatus(u.id)}>
                          {u.status === "active" ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                        <button className="action-btn danger" title="Delete" onClick={() => setConfirmDelete(u.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Role Legend */}
        <div style={{ marginTop: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Role Access Levels:</span>
          {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-secondary)" }}>
              {cfg.icon}
              <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
              <span style={{ color: "var(--text-muted)" }}>({ROLE_PERMISSIONS[key as User["role"]].length} perms)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="overlay" onClick={() => { setShowModal(false); setEditUser(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{editUser ? "Edit User" : "Add New User"}</h2>
              <button onClick={() => { setShowModal(false); setEditUser(null); }} style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={16} />
              </button>
            </div>
            <UserForm
              user={editUser}
              onSave={handleSave}
              onCancel={() => { setShowModal(false); setEditUser(null); }}
            />
          </div>
        </div>
      )}

      {/* Permissions Modal (editable — per-user permission editor) */}
      {showPerms && (
        <div className="overlay" onClick={() => { setShowPerms(null); setEditPermsUser(null); }}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>User Permissions</h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {users.find((u) => u.id === showPerms)?.name} &mdash; {ROLE_CONFIG[users.find((u) => u.id === showPerms)?.role || "viewer"].label}
                </p>
              </div>
              <button onClick={() => { setShowPerms(null); setEditPermsUser(null); }} style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-secondary)" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottom: "1px solid var(--border)", background: "var(--bg-input)" }}>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", fontWeight: 700 }}>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Role grants {ROLE_PERMISSIONS[users.find((u) => u.id === showPerms)?.role || "viewer"].length} permissions.</span>{" "}
                Tap any box to grant / revoke a permission for this user.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const u = users.find(x => x.id === showPerms);
                    setDraftPerms(u ? [...ROLE_PERMISSIONS[u.role]] as Permission[] : [...ROLE_PERMISSIONS.viewer] as Permission[]);
                  }}
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#6366f1", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
                >Reset to role default</button>
                <button
                  onClick={() => setDraftPerms(ALL_PERMISSIONS.map(p => p.key) as Permission[])}
                  style={{ fontSize: 11.5, fontWeight: 700, color: "#059669", background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.3)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
                >Grant all</button>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              {(() => {
                const user = users.find((u) => u.id === showPerms);
                if (!user) return null;
                const full: Permission[] = (user.permissions || []) as Permission[];
                if (editPermsUser === user.id) {
                  const perms = draftPerms;
                  const categories = [...new Set(ALL_PERMISSIONS.map((p) => p.category))];
                  const toggle = (key: Permission) => {
                    setDraftPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
                  };
                  return (
                    <>
                      <div>
                        {categories.map((cat) => (
                          <div key={cat}>
                            <div className="perm-cat">{cat}</div>
                            <div className="perm-grid" style={{ marginBottom: 8 }}>
                              {ALL_PERMISSIONS.filter((p) => p.category === cat).map((p) => {
                                const has = perms.includes(p.key);
                                return (
                                  <div key={p.key} onClick={() => toggle(p.key)} className={`perm-item ${has ? "active" : ""}`} role="button" aria-pressed={has}>
                                    {has ? <Check size={13} style={{ color: "#059669", flexShrink: 0 }} /> : <X size={13} style={{ color: "var(--text-muted)", opacity: 0.4, flexShrink: 0 }} />}
                                    <span style={{ flex: 1 }}>{p.label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, borderTop: "1px solid var(--border)", marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
                          {perms.length} / {ALL_PERMISSIONS.length} permissions granted
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <button onClick={() => { setEditPermsUser(null); setDraftPerms(full); }} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                          <button onClick={() => handleSavePerms(user.id)} style={{ padding: "9px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.3)" }}>Save Permissions</button>
                        </div>
                      </div>
                    </>
                  );
                }
                const perms = full;
                const categories = [...new Set(ALL_PERMISSIONS.map((p) => p.category))];
                return (
                  <div>
                    {categories.map((cat) => (
                      <div key={cat}>
                        <div className="perm-cat">{cat}</div>
                        <div className="perm-grid" style={{ marginBottom: 8 }}>
                          {ALL_PERMISSIONS.filter((p) => p.category === cat).map((p) => {
                            const has = perms.includes(p.key);
                            return (
                              <div key={p.key} className={`perm-item ${has ? "active" : ""}`}>
                                {has ? <Check size={13} style={{ color: "#059669", flexShrink: 0 }} /> : <X size={13} style={{ color: "var(--text-muted)", opacity: 0.4, flexShrink: 0 }} />}
                                <span>{p.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div style={{ textAlign: "right", paddingTop: 16, borderTop: "1px solid var(--border)", marginTop: 8 }}>
                      <button
                        onClick={() => { setEditPermsUser(user.id); setDraftPerms(full); }}
                        style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.3)" }}
                      >
                        <Edit3 size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} /> Edit Permissions
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, padding: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--text-primary)", marginBottom: 6 }}>Delete User?</h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
                This will permanently remove <strong>{users.find((u) => u.id === confirmDelete)?.name}</strong> and revoke all their access.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setConfirmDelete(null)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--bg-input)",
                    color: "var(--text-secondary)", fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 10,
                    border: "none", background: "#dc2626",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", boxShadow: "0 4px 12px rgba(220,38,38,0.3)",
                  }}
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ─── User Form ─── */
function UserForm({ user, onSave, onCancel }: { user: User | null; onSave: (data: Partial<User>) => void; onCancel: () => void }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [role, setRole] = useState<User["role"]>(user?.role || "viewer");
  const [department, setDepartment] = useState(user?.department || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email";
    if (!department) errs.department = "Department is required";
    if (!user && !password.trim()) errs.password = "Password is required for new users";
    else if (password && password.length < 6) errs.password = "Password must be at least 6 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (validate()) {
      const payload: Partial<User> & { password?: string } = {
        name: name.trim(), email: email.trim(), role, department, phone: phone.trim(),
      };
      if (password.trim()) payload.password = password.trim();
      onSave(payload);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label className="field-label">Full Name *</label>
          <input className="field" placeholder="e.g. Rajesh Kumar" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <span style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{errors.name}</span>}
        </div>
        <div>
          <label className="field-label">Email *</label>
          <input className="field" type="email" placeholder="e.g. rajesh@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <span style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{errors.email}</span>}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="field-label">Role *</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {(["admin", "manager", "operator", "viewer"] as User["role"][]).map(r => {
            const cfg = ROLE_CONFIG[r];
            const perms = ROLE_PERMISSIONS[r];
            const access = MODULE_ACCESS.reduce((acc, m) => {
              const lvl = m.byRole[r];
              if (lvl === "full") acc.full++;
              else if (lvl === "edit") acc.edit++;
              else if (lvl === "view") acc.view++;
              return acc;
            }, { full: 0, edit: 0, view: 0 });
            const selected = role === r;
            return (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                style={{
                  textAlign: "left", padding: "11px 12px", borderRadius: 10, cursor: "pointer",
                  border: selected ? `1.5px solid ${cfg.color}` : "1px solid var(--border-strong)",
                  background: selected ? cfg.bg : "var(--bg-input)",
                  transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: cfg.color, fontWeight: 800, fontSize: 12.5 }}>
                  {cfg.icon} {cfg.label}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, lineHeight: 1.4 }}>
                  {perms.length} perms · {access.edit + access.full} modules editable
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label className="field-label">Department *</label>
          <select className="field" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Select department</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {errors.department && <span style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{errors.department}</span>}
        </div>
        <div>
          <label className="field-label">Phone</label>
          <input className="field" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="field-label">Password {user && "(leave blank to keep current)"}</label>
        <input
          className="field"
          type="text"
          autoComplete="new-password"
          placeholder={user ? "Enter new password (optional)" : "Set a login password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
          Users sign in with this password on the login page (along with their email and role).
        </span>
        {errors.password && <span style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{errors.password}</span>}
      </div>

      {/* Role Module Access Preview */}
      <div style={{ marginBottom: 20 }}>
        <label className="field-label" style={{ marginBottom: 8 }}>
          Access Preview — {ROLE_CONFIG[role].label} ({ROLE_PERMISSIONS[role].length} permissions)
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MODULE_ACCESS.map(m => {
            const lvl = m.byRole[role];
            const meta = ACCESS_LEVEL_META[lvl];
            if (lvl === "none") return null;
            return (
              <span key={m.id} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 9px", borderRadius: 7,
                background: meta.bg, color: meta.color,
                border: `1px solid ${meta.color}33`,
                fontSize: 10.5, fontWeight: 700,
              }}>
                {m.icon} {m.label} · {meta.label}
              </span>
            );
          })}
          {MODULE_ACCESS.every(m => m.byRole[role] === "none") && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No module access</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "10px 20px", borderRadius: 10,
            border: "1px solid var(--border)", background: "var(--bg-input)",
            color: "var(--text-secondary)", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: "10px 24px", borderRadius: 10,
            border: "none", background: "linear-gradient(135deg, #4f46e5, #6366f1)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
          }}
        >
          {user ? "Save Changes" : "Create User"}
        </button>
      </div>
    </div>
  );
}
