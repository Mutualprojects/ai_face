"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Shield, ShieldCheck, ShieldAlert, Plus, Users, Search, Pencil, Trash2,
  Copy, Check, Eye, Settings, Lock, Unlock, Database, FileText, BarChart3,
  Globe, ScanFace, Camera, Briefcase, X, UserPlus, RefreshCw, AlertTriangle,
} from "lucide-react";

/* ─── Domain types ─────────────────────────────────────────────────────────── */

type AccessLevel = "full" | "edit" | "view" | "none";

type RoleId = "admin" | "manager" | "operator" | "viewer" | string;

interface RoleDef {
  id: RoleId;
  name: string;
  description: string;
  color: string;
  builtin: boolean;
  modules: Record<string, AccessLevel>;
}

interface MUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  phone: string;
  status: "active" | "inactive" | "suspended";
  lastLogin: string;
  createdAt: string;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const MODULES: { id: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", desc: "Overview & presence", icon: <BarChart3 size={14} /> },
  { id: "employees", label: "Employees", desc: "Directory & records", icon: <Users size={14} /> },
  { id: "departments", label: "Departments", desc: "Org structure", icon: <Briefcase size={14} /> },
  { id: "cameras", label: "Cameras", desc: "Surveillance feeds & streams", icon: <Camera size={14} /> },
  { id: "faces", label: "Face Recognition", desc: "Identify & match individuals", icon: <ScanFace size={14} /> },
  { id: "visitors", label: "Visitors", desc: "Visitor registration & tracking", icon: <Globe size={14} /> },
  { id: "logs", label: "Detection Log", desc: "Encounter history", icon: <FileText size={14} /> },
  { id: "analytics", label: "Analytics", desc: "Trends & insights", icon: <BarChart3 size={14} /> },
  { id: "sdk", label: "Manage SDK", desc: "API keys & integration", icon: <Database size={14} /> },
  { id: "users", label: "User Management", desc: "Users & access", icon: <Shield size={14} /> },
  { id: "settings", label: "Settings", desc: "System configuration", icon: <Settings size={14} /> },
];

const ACCESS_META: Record<AccessLevel, { label: string; color: string; bg: string; rank: number }> = {
  full: { label: "Full", color: "#059669", bg: "rgba(5,150,105,0.14)", rank: 3 },
  edit: { label: "Edit", color: "#6366f1", bg: "rgba(99,102,241,0.14)", rank: 2 },
  view: { label: "View", color: "#f59e0b", bg: "rgba(245,158,11,0.14)", rank: 1 },
  none: { label: "—", color: "#94a3b8", bg: "rgba(148,163,184,0.08)", rank: 0 },
};

const ROLE_PALETTES: { color: string; bg: string; icon: React.ReactNode }[] = [
  { color: "#dc2626", bg: "rgba(220,38,38,0.1)", icon: <ShieldAlert size={15} /> },
  { color: "#6366f1", bg: "rgba(99,102,241,0.1)", icon: <ShieldCheck size={15} /> },
  { color: "#059669", bg: "rgba(5,150,105,0.1)", icon: <Check size={15} /> },
  { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: <Eye size={15} /> },
  { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", icon: <Shield size={15} /> },
  { color: "#0ea5e9", bg: "rgba(14,165,233,0.1)", icon: <Users size={15} /> },
];

function defaultModules(role: string): Record<string, AccessLevel> {
  if (role === "admin") {
    const m: Record<string, AccessLevel> = {};
    MODULES.forEach((x) => (m[x.id] = "full"));
    m.analytics = "view";
    return m;
  }
  if (role === "manager") {
    return {
      dashboard: "view", employees: "edit", departments: "edit", cameras: "edit",
      faces: "edit", visitors: "full", logs: "view", analytics: "view",
      sdk: "edit", users: "view", settings: "view",
    };
  }
  if (role === "operator") {
    return {
      dashboard: "view", employees: "view", departments: "view", cameras: "view",
      faces: "edit", visitors: "edit", logs: "view", analytics: "view",
      sdk: "none", users: "none", settings: "none",
    };
  }
  return {
    dashboard: "view", employees: "view", departments: "view", cameras: "view",
    faces: "view", visitors: "view", logs: "view", analytics: "view",
    sdk: "none", users: "none", settings: "none",
  };
}

const DEFAULT_ROLES: RoleDef[] = [
  { id: "admin", name: "Admin", description: "Full system access — manage users, roles, cameras & SDK.", color: "#dc2626", builtin: true, modules: defaultModules("admin") },
  { id: "manager", name: "Manager", description: "Department oversight — edit records, monitor operations.", color: "#6366f1", builtin: true, modules: defaultModules("manager") },
  { id: "operator", name: "Operator", description: "Day-to-day operations — register faces & visitors.", color: "#059669", builtin: true, modules: defaultModules("operator") },
  { id: "viewer", name: "Viewer", description: "Read-only access to dashboards, cameras & directories.", color: "#64748b", builtin: true, modules: defaultModules("viewer") },
];

const STORAGE_KEY = "sentinel.roles.v1";

function scoreModules(mods: Record<string, AccessLevel>) {
  let sum = 0;
  MODULES.forEach((m) => (sum += (ACCESS_META[mods[m.id] || "none"]?.rank || 0) * 4));
  const enabled = MODULES.filter((m) => (mods[m.id] || "none") !== "none").length;
  return { sum, enabled };
}

const MOCK_USERS: MUser[] = [
  { id: "u1", name: "Rajesh Kumar", email: "rajesh@brihaspathi.com", role: "admin", department: "IT", phone: "+91 98765 43210", status: "active", lastLogin: "2026-08-27T04:30:00Z", createdAt: "2026-01-15T00:00:00Z" },
  { id: "u2", name: "Priya Sharma", email: "priya@brihaspathi.com", role: "manager", department: "Security", phone: "+91 98765 43211", status: "active", lastLogin: "2026-08-27T03:15:00Z", createdAt: "2026-02-20T00:00:00Z" },
  { id: "u3", name: "Suresh Reddy", email: "suresh@brihaspathi.com", role: "operator", department: "Operations", phone: "+91 98765 43212", status: "active", lastLogin: "2026-08-26T18:45:00Z", createdAt: "2026-03-10T00:00:00Z" },
  { id: "u4", name: "Anitha Nair", email: "anitha@brihaspathi.com", role: "viewer", department: "Reception", phone: "+91 98765 43213", status: "active", lastLogin: "2026-08-25T12:00:00Z", createdAt: "2026-04-05T00:00:00Z" },
  { id: "u5", name: "Vikram Patel", email: "vikram@brihaspathi.com", role: "manager", department: "HR", phone: "+91 98765 43214", status: "inactive", lastLogin: "2026-08-20T09:30:00Z", createdAt: "2026-02-28T00:00:00Z" },
];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function timeAgo(d: string) {
  const mins = Math.min(9999, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function genId(prefix: string) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

const STATUS_META = {
  active: { label: "Active", color: "#059669", dot: "#10b981" },
  inactive: { label: "Inactive", color: "#64748b", dot: "#94a3b8" },
  suspended: { label: "Suspended", color: "#dc2626", dot: "#ef4444" },
} as const;

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function RoleManagementPage() {
  const [tab, setTab] = useState<"roles" | "users">("roles");
  const [roles, setRoles] = useState<RoleDef[]>(DEFAULT_ROLES);
  const [users, setUsers] = useState<MUser[]>(MOCK_USERS);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  /* Editor state */
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<RoleDef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftModules, setDraftModules] = useState<Record<string, AccessLevel>>({});
  const [draftColor, setDraftColor] = useState("#6366f1");

  /* User tab state */
  const [uSearch, setUSearch] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uRole, setURole] = useState("viewer");
  const [uDept, setUDept] = useState("IT");
  const [uPass, setUPass] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRoles((JSON.parse(raw) as RoleDef[]) || DEFAULT_ROLES);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
    } catch {
      /* ignore */
    }
  }, [roles]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => (counts[u.role] = (counts[u.role] || 0) + 1));
    const active = users.filter((u) => u.status === "active").length;
    return { roles: roles.length, users: users.length, active, admins: counts["admin"] || 0 };
  }, [users, roles]);

  const filteredRoles = useMemo(
    () => roles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [roles, search]
  );
  const filteredUsers = useMemo(
    () => users.filter((u) =>
      u.name.toLowerCase().includes(uSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(uSearch.toLowerCase())
    ),
    [users, uSearch]
  );

  function openCreate() {
    setEditing(null);
    setDraftName("");
    setDraftDesc("");
    setDraftModules(defaultModules("viewer"));
    setDraftColor("#6366f1");
    setShowEditor(true);
  }
  function openEdit(r: RoleDef) {
    setEditing(r);
    setDraftName(r.name);
    setDraftDesc(r.description);
    setDraftModules({ ...r.modules });
    setDraftColor(r.color);
    setShowEditor(true);
  }
  function closeEditor() {
    setShowEditor(false);
    setEditing(null);
  }
  function saveRole() {
    if (!draftName.trim()) {
      setToast("Role name is required");
      return;
    }
    if (editing) {
      setRoles((prev) => prev.map((r) =>
        r.id === editing.id ? { ...r, name: draftName.trim(), description: draftDesc.trim(), modules: draftModules, color: draftColor } : r
      ));
      setToast("Role updated");
    } else {
      const id = genId("custom-");
      setRoles((prev) => [...prev, {
        id, name: draftName.trim(), description: draftDesc.trim(),
        color: draftColor, builtin: false, modules: draftModules,
      }]);
      setToast("Role created");
    }
    closeEditor();
  }
  function duplicateRole(r: RoleDef) {
    const id = genId("custom-");
    setRoles((prev) => [...prev, { ...r, id, name: `${r.name} (copy)`, builtin: false }]);
    setToast("Role duplicated");
  }
  function deleteRole(id: string) {
    setRoles((prev) => prev.filter((r) => r.id !== id));
    setConfirmDelete(null);
    setToast("Role deleted");
  }
  function resetRoles() {
    setRoles(DEFAULT_ROLES);
    setToast("Roles reset to defaults");
  }

  function addUser() {
    if (!uName.trim() || !uEmail.trim()) {
      setToast("Name and email are required");
      return;
    }
    setUsers((prev) => [{
      id: genId("u"),
      name: uName.trim(),
      email: uEmail.trim().toLowerCase(),
      role: uRole,
      department: uDept,
      phone: "",
      status: "active",
      lastLogin: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setShowUserModal(false);
    setUName(""); setUEmail(""); setUPass("");
    setToast("User created");
  }
  function toggleStatus(id: string) {
    setUsers((prev) => prev.map((u) =>
      u.id === id ? { ...u, status: u.status === "active" ? "suspended" : "active" } : u
    ));
  }

  const roleColor = (id: string) => roles.find((r) => r.id === id)?.color || "#64748b";

  return (
    <div className="rp">
      <style>{rpCss}</style>

      {/* ── Header ── */}
      <div className="rp-header">
        <div className="rp-title-wrap">
          <div className="rp-title-icon"><Shield size={20} /></div>
          <div>
            <div className="rp-kicker">Access Control</div>
            <h1 className="rp-title">Role & User Management</h1>
            <p className="rp-sub">Define roles, assign feature access, and manage who can use what.</p>
          </div>
        </div>
        <div className="rp-header-actions">
          {tab === "roles" ? (
            <>
              <button className="rp-btn ghost" onClick={resetRoles}><RefreshCw size={14} /> Reset</button>
              <button className="rp-btn primary" onClick={openCreate}><Plus size={16} /> New Role</button>
            </>
          ) : (
            <button className="rp-btn primary" onClick={() => setShowUserModal(true)}><UserPlus size={16} /> Add User</button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="rp-tabs">
        <button className={tab === "roles" ? "rp-tab active" : "rp-tab"} onClick={() => setTab("roles")}>
          <ShieldCheck size={15} /> Roles <span className="rp-tab-count">{roles.length}</span>
        </button>
        <button className={tab === "users" ? "rp-tab active" : "rp-tab"} onClick={() => setTab("users")}>
          <Users size={15} /> Users <span className="rp-tab-count">{users.length}</span>
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div className="rp-stats">
        <div className="rp-stat"><Shield size={18} style={{ color: "#f59e0b" }} /><div><b>{stats.roles}</b><span>Roles</span></div></div>
        <div className="rp-stat"><Users size={18} style={{ color: "#6366f1" }} /><div><b>{stats.users}</b><span>Total Users</span></div></div>
        <div className="rp-stat"><Check size={18} style={{ color: "#059669" }} /><div><b>{stats.active}</b><span>Active</span></div></div>
        <div className="rp-stat"><ShieldAlert size={18} style={{ color: "#dc2626" }} /><div><b>{stats.admins}</b><span>Admins</span></div></div>
      </div>

      {/* ══════════════ ROLES TAB ══════════════ */}
      {tab === "roles" && (
        <>
          <div className="rp-section-row">
            <div className="rp-section-title">
              <h2>Role Registry</h2>
              <span>Click a role to edit its module & feature access.</span>
            </div>
            <div className="rp-search">
              <Search size={14} />
              <input placeholder="Search roles…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="rp-role-grid">
            {filteredRoles.map((r) => {
              const s = scoreModules(r.modules);
              const used = users.filter((u) => u.role === r.id).length;
              return (
                <div key={r.id} className="rp-role-card" style={{ borderTopColor: r.color }} onClick={() => openEdit(r)}>
                  <div className="rp-role-card-top">
                    <div className="rp-role-icon" style={{ background: `${r.color}1a`, color: r.color }}>
                      {roles.find((x) => x.id === r.id)?.color === r.color ? <ShieldCheck size={18} /> : <Settings size={18} />}
                    </div>
                    <div className="rp-role-actions">
                      {!r.builtin && <button className="rp-icon-btn" title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateRole(r); }}><Copy size={14} /></button>}
                      <button className="rp-icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil size={14} /></button>
                      {!r.builtin && <button className="rp-icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmDelete(r.id); }}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                  <div className="rp-role-name" style={{ color: r.color }}>{r.name}</div>
                  <div className="rp-role-desc">{r.description}</div>
                  <div className="rp-role-meta">
                    <span className="rp-chip">{used} user{used !== 1 ? "s" : ""}</span>
                    <span className="rp-chip">{s.enabled} modules</span>
                    {r.builtin && <span className="rp-chip muted">System</span>}
                  </div>
                  <div className="rp-role-access">
                    {MODULES.slice(0, 6).map((m) => {
                      const lvl = r.modules[m.id] || "none";
                      if (lvl === "none") return null;
                      const meta = ACCESS_META[lvl];
                      return <span key={m.id} title={`${m.label} — ${meta.label}`} style={{ background: meta.bg, color: meta.color }}>{meta.label[0]}</span>;
                    })}
                    <span className="rp-more">+{Math.max(0, s.enabled - 6)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Role Access Matrix */}
          <div className="rp-matrix-card">
            <div className="rp-matrix-head">
              <div>
                <h2>Role Access Matrix</h2>
                <span>Effective access level per module across every role.</span>
              </div>
              <div className="rp-legend">
                {(["full", "edit", "view", "none"] as AccessLevel[]).map((l) => (
                  <span key={l}><i style={{ background: ACCESS_META[l].color }} />{ACCESS_META[l].label}</span>
                ))}
              </div>
            </div>
            <div className="rp-matrix">
              <table>
                <thead>
                  <tr>
                    <th>Module</th>
                    {roles.map((r) => <th key={r.id} style={{ color: r.color }}>{r.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="rp-module-name"><span>{m.icon}</span>{m.label}</div>
                      </td>
                      {roles.map((r) => {
                        const lvl = r.modules[m.id] || "none";
                        const meta = ACCESS_META[lvl];
                        return (
                          <td key={r.id}>
                            <span className="rp-access-badge" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ USERS TAB ══════════════ */}
      {tab === "users" && (
        <div className="rp-table-card">
          <div className="rp-table-toolbar">
            <div className="rp-search">
              <Search size={14} />
              <input placeholder="Search users…" value={uSearch} onChange={(e) => setUSearch(e.target.value)} />
            </div>
            <button className="rp-btn primary" onClick={() => setShowUserModal(true)}><UserPlus size={15} /> Add User</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>User</th><th>Role</th><th>Department</th><th>Status</th><th>Last Login</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const sm = STATUS_META[u.status];
                const rc = roleColor(u.role);
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="rp-user-cell">
                        <span className="rp-avatar">{initials(u.name)}</span>
                        <span><b>{u.name}</b><small>{u.email}</small></span>
                      </div>
                    </td>
                    <td><span className="rp-rolebadge" style={{ background: `${rc}1a`, color: rc }}>{u.role}</span></td>
                    <td className="rp-muted">{u.department}</td>
                    <td><span className="rp-status"><i style={{ background: sm.dot }} />{sm.label}</span></td>
                    <td className="rp-muted">{timeAgo(u.lastLogin)}</td>
                    <td className="rp-td-actions">
                      <button className="rp-icon-btn" onClick={() => toggleStatus(u.id)} title={u.status === "active" ? "Suspend" : "Activate"}>
                        {u.status === "active" ? <Lock size={14} /> : <Unlock size={14} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={6} className="rp-empty">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <div className="rp-toast"><Check size={15} /> {toast}</div>}

      {/* ── Role editor modal ── */}
      {showEditor && (
        <div className="rp-overlay" onClick={closeEditor}>
          <div className="rp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-head">
              <h3>{editing ? "Edit Role" : "Create Role"}</h3>
              <button className="rp-close" onClick={closeEditor}><X size={16} /></button>
            </div>
            <div className="rp-modal-body">
              <div className="rp-field-row">
                <div className="rp-field">
                  <label>Role Name *</label>
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Security Analyst" />
                </div>
                <div className="rp-field">
                  <label>Accent Colour</label>
                  <div className="rp-swatches">
                    {ROLE_PALETTES.map((p) => (
                      <button key={p.color} onClick={() => setDraftColor(p.color)} className={draftColor === p.color ? "sw active" : "sw"}
                        style={{ background: p.color === draftColor ? p.color : `${p.color}2a`, color: p.color === draftColor ? "#fff" : p.color }}>
                        {draftColor === p.color ? <Check size={13} /> : p.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rp-field">
                <label>Description</label>
                <textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} placeholder="What can this role do?" rows={2} />
              </div>

              <div className="rp-module-editor">
                <div className="rp-module-editor-head">
                  <span>Feature / Module Access</span>
                  <small>Set what this role can open and do in each module.</small>
                </div>
                {MODULES.map((m) => {
                  const lvl = draftModules[m.id] || "none";
                  return (
                    <div key={m.id} className="rp-module-row">
                      <div className="rp-module-name"><span>{m.icon}</span>
                        <div><b>{m.label}</b><small>{m.desc}</small></div>
                      </div>
                      <div className="rp-levels">
                        {(["none", "view", "edit", "full"] as AccessLevel[]).map((l) => (
                          <button key={l} onClick={() => setDraftModules((p) => ({ ...p, [m.id]: l }))}
                            className={lvl === l ? "lvl active" : "lvl"}
                            style={lvl === l ? { background: ACCESS_META[l].bg, color: ACCESS_META[l].color, borderColor: ACCESS_META[l].color } : {}}>
                            {ACCESS_META[l].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rp-modal-foot">
              <button className="rp-btn ghost" onClick={closeEditor}>Cancel</button>
              <button className="rp-btn primary" onClick={saveRole}><Check size={15} /> {editing ? "Save Changes" : "Create Role"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add user modal ── */}
      {showUserModal && (
        <div className="rp-overlay" onClick={() => setShowUserModal(false)}>
          <div className="rp-modal small" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-head">
              <h3>Add User</h3>
              <button className="rp-close" onClick={() => setShowUserModal(false)}><X size={16} /></button>
            </div>
            <div className="rp-modal-body">
              <div className="rp-field-row">
                <div className="rp-field"><label>Full Name *</label><input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="e.g. Rajesh Kumar" /></div>
                <div className="rp-field"><label>Email *</label><input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="user@company.com" /></div>
              </div>
              <div className="rp-field-row">
                <div className="rp-field">
                  <label>Role</label>
                  <select value={uRole} onChange={(e) => setURole(e.target.value)}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="rp-field">
                  <label>Department</label>
                  <select value={uDept} onChange={(e) => setUDept(e.target.value)}>
                    {["IT", "Security", "HR", "Operations", "Management", "Reception", "Facilities"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rp-field">
                <label>Password <span style={{ textTransform: "none", fontWeight: 400, color: "var(--text-muted)" }}>(they log in with this)</span></label>
                <input type="text" value={uPass} onChange={(e) => setUPass(e.target.value)} placeholder="Set login password" />
              </div>
            </div>
            <div className="rp-modal-foot">
              <button className="rp-btn ghost" onClick={() => setShowUserModal(false)}>Cancel</button>
              <button className="rp-btn primary" onClick={addUser}><UserPlus size={15} /> Add User</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirmDelete && (
        <div className="rp-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="rp-modal tiny" onClick={(e) => e.stopPropagation()}>
            <div className="rp-modal-head">
              <h3 style={{ color: "#dc2626" }}>Delete Role</h3>
            </div>
            <div className="rp-modal-body" style={{ textAlign: "center", padding: "20px 24px" }}>
              <div className="rp-warn-icon"><AlertTriangle size={28} /></div>
              <p className="rp-warn-text">Delete this role? Users assigned to it will lose its access. This cannot be undone.</p>
            </div>
            <div className="rp-modal-foot">
              <button className="rp-btn ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="rp-btn danger" onClick={() => deleteRole(confirmDelete)}><Trash2 size={15} /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Styles ───────────────────────────────────────────────────────────────── */

const rpCss = `
.rp { padding: 4px 4px 48px; }
.rp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.rp-title-wrap { display: flex; gap: 14px; align-items: flex-start; }
.rp-title-icon { width: 46px; height: 46px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15)); color: #f59e0b; flex-shrink: 0;
  border: 1px solid rgba(245,158,11,0.25); }
.rp-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.rp-title { font-size: 21px; font-weight: 800; color: var(--text-primary); margin: 2px 0 2px; letter-spacing: -0.02em; }
.rp-sub { font-size: 12.5px; color: var(--text-muted); }
.rp-header-actions { display: flex; gap: 9px; }

.rp-btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 10px; padding: 9px 15px; font-size: 12.5px; font-weight: 700;
  cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
.rp-btn.primary { background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff; box-shadow: 0 4px 12px rgba(245,158,11,0.28); }
.rp-btn.primary:hover { filter: brightness(1.06); }
.rp-btn.ghost { background: var(--bg-input); border-color: var(--border); color: var(--text-secondary); }
.rp-btn.ghost:hover { border-color: var(--border-strong); color: var(--text-primary); }
.rp-btn.danger { background: rgba(220,38,38,0.1); color: #dc2626; border-color: rgba(220,38,38,0.2); }
.rp-btn.danger:hover { background: #dc2626; color: #fff; }

.rp-tabs { display: inline-flex; gap: 4px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 4px; margin-bottom: 20px; }
.rp-tab { display: inline-flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: 9px; font-size: 13px; font-weight: 700;
  color: var(--text-muted); cursor: pointer; background: transparent; border: none; transition: all 0.15s; }
.rp-tab:hover { color: var(--text-primary); }
.rp-tab.active { background: linear-gradient(135deg, rgba(245,158,11,0.14), rgba(239,68,68,0.14)); color: #f59e0b; box-shadow: inset 0 0 0 1px rgba(245,158,11,0.3); }
.rp-tab-count { background: var(--bg-input); border: 1px solid var(--border); border-radius: 999px; font-size: 10px; padding: 1px 7px; font-weight: 800; }

.rp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 26px; }
.rp-stat { background: var(--bg-card); border: 1px solid var(--border); border-radius: 15px; padding: 16px; display: flex; align-items: center; gap: 12px; }
.rp-stat b { display: block; font-size: 21px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
.rp-stat span { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }
.rp-stat > svg { opacity: 0.9; }

.rp-section-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.rp-section-title h2 { font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 0 0 3px; }
.rp-section-title span { font-size: 11.5px; color: var(--text-muted); }

.rp-search { display: flex; align-items: center; gap: 8px; background: var(--bg-input); border: 1px solid var(--border);
  border-radius: 10px; padding: 8px 12px; min-width: 220px; color: var(--text-muted); }
.rp-search input { background: transparent; border: none; outline: none; font-size: 12.5px; color: var(--text-primary); width: 100%; }
.rp-search input::placeholder { color: var(--text-muted); }

.rp-role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; margin-bottom: 26px; }
.rp-role-card { background: var(--bg-card); border: 1px solid var(--border); border-top: 3px solid; border-radius: 16px; padding: 16px; transition: all 0.2s; cursor: pointer; }
.rp-role-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--border-strong); }
.rp-role-card-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
.rp-role-icon { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.rp-role-actions { display: flex; gap: 5px; }
.rp-icon-btn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input);
  color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; }
.rp-icon-btn:hover { color: var(--text-primary); border-color: var(--border-strong); background: var(--bg-hover); }
.rp-icon-btn.danger:hover { color: #dc2626; border-color: rgba(220,38,38,0.3); background: rgba(220,38,38,0.06); }
.rp-role-name { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
.rp-role-desc { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; margin: 5px 0 10px; min-height: 34px; }
.rp-role-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.rp-chip { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: var(--bg-input); border: 1px solid var(--border); color: var(--text-secondary); }
.rp-chip.muted { opacity: 0.6; }
.rp-role-access { display: flex; gap: 4px; align-items: center; }
.rp-role-access > span:not(.rp-more) { width: 20px; height: 20px; border-radius: 6px; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.rp-more { font-size: 10.5px; color: var(--text-muted); font-weight: 700; }

.rp-matrix-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
.rp-matrix-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.rp-matrix-head h2 { font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 0 0 3px; }
.rp-matrix-head span { font-size: 11.5px; color: var(--text-muted); }
.rp-legend { display: flex; gap: 12px; align-items: center; }
.rp-legend span { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; color: var(--text-secondary); }
.rp-legend i { width: 8px; height: 8px; border-radius: 3px; display: inline-block; }
.rp-matrix { overflow-x: auto; }
.rp-matrix table { width: 100%; border-collapse: collapse; min-width: 640px; }
.rp-matrix th { text-align: left; padding: 11px 16px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); background: var(--bg-input); border-bottom: 1px solid var(--border); }
.rp-matrix td { padding: 11px 16px; border-bottom: 1px solid var(--border-light); font-size: 12.5px; }
.rp-matrix tr:last-child td { border-bottom: none; }
.rp-module-name { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-primary); }
.rp-module-name > span { display: flex; background: var(--bg-input); border: 1px solid var(--border); border-radius: 7px; width: 26px; height: 26px; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0; }
.rp-access-badge { display: inline-block; min-width: 44px; text-align: center; padding: 4px 9px; border-radius: 8px; font-size: 11px; font-weight: 700; }

.rp-table-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
.rp-table-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.rp-table-card table { width: 100%; border-collapse: collapse; min-width: 640px; }
.rp-table-card th { text-align: left; padding: 12px 16px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); background: var(--bg-input); border-bottom: 1px solid var(--border); }
.rp-table-card td { padding: 13px 16px; font-size: 13px; border-bottom: 1px solid var(--border-light); vertical-align: middle; }
.rp-table-card tr:hover td { background: var(--bg-hover); }
.rp-table-card tr:last-child td { border-bottom: none; }
.rp-user-cell { display: flex; align-items: center; gap: 10px; }
.rp-avatar { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff;
  font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rp-user-cell b { display: block; font-size: 13px; color: var(--text-primary); line-height: 1.2; }
.rp-user-cell small { color: var(--text-muted); font-size: 11px; }
.rp-rolebadge { display: inline-flex; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
.rp-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--text-primary); font-size: 12px; }
.rp-status i { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.rp-muted { color: var(--text-muted); }
.rp-td-actions { text-align: right; }
.rp-empty { text-align: center; color: var(--text-muted); padding: 30px !important; }

.rp-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.rp-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.rp-field label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.rp-field input, .rp-field select, .rp-field textarea { background: var(--bg-input); border: 1px solid var(--border-strong); border-radius: 10px;
  padding: 9px 12px; font-size: 13px; color: var(--text-primary); outline: none; font-family: inherit; transition: border-color 0.15s; }
.rp-field input:focus, .rp-field select:focus, .rp-field textarea:focus { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.12); }
.rp-field textarea { resize: vertical; }
.rp-swatches { display: flex; gap: 8px; }
.rp-swatches .sw { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.rp-swatches .sw.active { transform: scale(1.08); box-shadow: 0 3px 10px rgba(0,0,0,0.2); }

.rp-module-editor { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
.rp-module-editor-head { padding: 12px 14px; background: var(--bg-input); border-bottom: 1px solid var(--border); }
.rp-module-editor-head span { font-size: 13px; font-weight: 800; color: var(--text-primary); display: block; }
.rp-module-editor-head small { font-size: 11px; color: var(--text-muted); }
.rp-module-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border-light); flex-wrap: wrap; }
.rp-module-row:last-child { border-bottom: none; }
.rp-module-row .rp-module-name > div { display: flex; flex-direction: column; }
.rp-module-row .rp-module-name b { font-size: 12.5px; color: var(--text-primary); }
.rp-module-row .rp-module-name small { font-size: 10.5px; color: var(--text-muted); }
.rp-levels { display: flex; gap: 5px; }
.rp-levels .lvl { border: 1px solid var(--border); background: var(--bg-input); color: var(--text-muted); border-radius: 8px;
  padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; transition: all 0.12s; }
.rp-levels .lvl:hover { color: var(--text-primary); border-color: var(--border-strong); }

.rp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; animation: fadeIn 0.15s ease; }
.rp-modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; width: 680px; max-width: 94vw; max-height: 90vh; overflow: auto; box-shadow: var(--shadow-lg); }
.rp-modal.small { width: 520px; }
.rp-modal.tiny { width: 400px; }
.rp-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--border); }
.rp-modal-head h3 { font-size: 16px; font-weight: 800; color: var(--text-primary); margin: 0; }
.rp-close { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.rp-close:hover { color: var(--text-primary); }
.rp-modal-body { padding: 20px 22px; }
.rp-modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--border); }
.rp-warn-icon { width: 54px; height: 54px; margin: 0 auto 12px; border-radius: 50%; background: rgba(220,38,38,0.1); color: #dc2626; display: flex; align-items: center; justify-content: center; }
.rp-warn-text { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.rp-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--text-primary); color: var(--bg-card);
  padding: 11px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; z-index: 200; box-shadow: var(--shadow-lg); animation: fadeInUp 0.2s ease; }
.rp-toast svg { color: #10b981; }

@media (max-width: 720px) {
  .rp-stats { grid-template-columns: repeat(2, 1fr); }
  .rp-field-row { grid-template-columns: 1fr; }
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;
