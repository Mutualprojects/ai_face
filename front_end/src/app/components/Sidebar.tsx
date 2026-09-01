"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    id: "dashboard",
    href: "/dashboard",
    shortcut: "D",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="2"/>
        <rect x="14" y="3" width="7" height="7" rx="2"/>
        <rect x="3" y="14" width="7" height="7" rx="2"/>
        <rect x="14" y="14" width="7" height="7" rx="2"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    activeColor: "#6366f1",
    activeBg: "rgba(99,102,241,0.08)",
  },
  {
    label: "Employees",
    id: "employees",
    href: "/employees",
    shortcut: "E",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #3b82f6, #06b6d4)",
    activeColor: "#3b82f6",
    activeBg: "rgba(59,130,246,0.08)",
  },
  {
    label: "Departments",
    id: "departments",
    href: "/departments",
    shortcut: "D",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
        <path d="M6 12H4a2 2 0 0 0-2 2v8h4"/>
        <path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/>
        <path d="M10 6h4"/>
        <path d="M10 10h4"/>
        <path d="M10 14h4"/>
        <path d="M10 18h4"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #10b981, #059669)",
    activeColor: "#10b981",
    activeBg: "rgba(16,185,129,0.08)",
  },
  {
    label: "Cameras",
    id: "cameras",
    href: "/cameras",
    shortcut: "M",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
    gradient: "linear-gradient(135deg, #14b8a6, #0f766e)",
    activeColor: "#14b8a6",
    activeBg: "rgba(20,184,166,0.08)",
  },
  {
    label: "Register Face",
    id: "register",
    href: "/?tab=register",
    shortcut: "R",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
        <line x1="12" y1="14" x2="12" y2="20"/>
        <line x1="9" y1="17" x2="15" y2="17"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #10b981, #059669)",
    activeColor: "#10b981",
    activeBg: "rgba(16,185,129,0.08)",
  },
  {
    label: "Recognition Control",
    id: "faces",
    href: "/faces",
    shortcut: "F",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #059669, #10b981)",
    activeColor: "#059669",
    activeBg: "rgba(5,150,105,0.08)",
  },
  {
    label: "Register Visitor",
    id: "visitors",
    href: "/visitors",
    shortcut: "V",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #f59e0b, #ef4444)",
    activeColor: "#f59e0b",
    activeBg: "rgba(245,158,11,0.08)",
  },
  {
    label: "Face Gallery",
    id: "gallery",
    href: "/?tab=gallery",
    shortcut: "G",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #ec4899, #a855f7)",
    activeColor: "#ec4899",
    activeBg: "rgba(236,72,153,0.08)",
  },
  {
    label: "Detection Log",
    id: "log",
    href: "/?tab=log",
    shortcut: "L",
    badge: "Live",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #ef4444, #f97316)",
    activeColor: "#ef4444",
    activeBg: "rgba(239,68,68,0.08)",
  },
  {
    label: "Camera Grid Matrix",
    id: "cameras-grid",
    href: "/?grid=true",
    shortcut: "C",
    badge: "Multi",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="9" height="9" rx="2"/>
        <rect x="13" y="2" width="9" height="9" rx="2"/>
        <rect x="2" y="13" width="9" height="9" rx="2"/>
        <rect x="13" y="13" width="9" height="9" rx="2"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #06b6d4, #3b82f6)",
    activeColor: "#06b6d4",
    activeBg: "rgba(6,182,212,0.08)",
  },
  {
    label: "Manage SDK",
    id: "manage-sdk",
    href: "/sdk",
    shortcut: "S",
    badge: "SDK",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #0ea5e9, #6366f1)",
    activeColor: "#0ea5e9",
    activeBg: "rgba(14,165,233,0.08)",
  },
  {
    label: "Analytics",
    id: "analytics",
    href: "/analytics",
    shortcut: "A",
    badge: "New",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
        <line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #8b5cf6, #ec4899)",
    activeColor: "#8b5cf6",
    activeBg: "rgba(139,92,246,0.08)",
  },
  {
    label: "User Mgmt",
    id: "users",
    href: "/users",
    shortcut: "U",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    gradient: "linear-gradient(135deg, #f43f5e, #e11d48)",
    activeColor: "#f43f5e",
    activeBg: "rgba(244,63,94,0.08)",
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isOpen = false, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  let activeId = "dashboard";
  if (pathname === "/dashboard") activeId = "dashboard";
  else if (pathname === "/visitors") activeId = "visitors";
  else if (pathname === "/faces") activeId = "faces";
  else if (pathname === "/employees") activeId = "employees";
  else if (pathname === "/departments") activeId = "departments";
  else if (pathname === "/cameras") activeId = "cameras";
  else if (pathname === "/analytics") activeId = "analytics";
  else if (pathname === "/sdk") activeId = "manage-sdk";
  else if (pathname === "/users") activeId = "users";
  else if (pathname === "/public-api") activeId = "public-api";
  else if (pathname === "/") activeId = searchParams.get("tab") || "register";

  // ── DB size stats ──────────────────────────────────────
  const [dbStats, setDbStats] = useState<{ faces: number; logs: number; cameras: number; sizeMB: number } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [fRes, lRes, cRes] = await Promise.allSettled([
          fetch("/flask/api/registered_faces", { headers: { Authorization: "Bearer ph0-secr3t-k3y-v1-992" } }),
          fetch("/flask/api/face_logs?limit=1", { headers: { Authorization: "Bearer ph0-secr3t-k3y-v1-992" } }),
          fetch("/flask/api/cameras", { headers: { Authorization: "Bearer ph0-secr3t-k3y-v1-992" } }),
        ]);
        const faces = fRes.status === "fulfilled" && fRes.value.ok ? (await fRes.value.json()).length || 0 : 0;
        const cams = cRes.status === "fulfilled" && cRes.value.ok ? (await cRes.value.json()).length || 0 : 0;
        // Get total log count from a separate query
        const lCountRes = await fetch("/flask/api/face_logs?limit=9999", { headers: { Authorization: "Bearer ph0-secr3t-k3y-v1-992" } });
        const lData = lCountRes.ok ? await lCountRes.json() : [];
        const logs = Array.isArray(lData) ? lData.length : (lData.logs?.length || 0);
        const sizeMB = (faces * 2 + logs * 30) / 1024 + 0.5;
        setDbStats({ faces, logs, cameras: cams, sizeMB });
      } catch {}
    };
    fetchStats();
    const iv = setInterval(fetchStats, 30000);
    return () => clearInterval(iv);
  }, []);

  const filtered = NAV_ITEMS.filter(i =>
    i.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <style>{`
        .sidebar-nav-item {
          transition: all 0.18s ease;
        }
        .sidebar-nav-item:hover {
          background: var(--bg-hover) !important;
          transform: translateX(2px);
        }
        .sidebar-search:focus-within {
          border-color: var(--violet) !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important;
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes statusBreathe {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }

        .responsive-sidebar {
          width: 260px;
          height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 50;
          display: flex;
          flex-direction: column;
          background: var(--bg-sidebar);
          border-right: 1px solid var(--border);
          box-shadow: var(--shadow-md);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* ── Collapsed rail (desktop only) ── */
        .responsive-sidebar.snt-rail {
          width: 76px;
        }
        .snt-rail .snt-hide-rail { display: none !important; }
        .snt-rail .snt-navlabel { display: none !important; }
        .snt-rail .snt-navlink { justify-content: center; padding: 10px 0; }
        .snt-rail nav { padding: 0 8px; }

        @media (max-width: 1024px) {
          .responsive-sidebar {
            transform: ${isOpen ? "translateX(0)" : "translateX(-100%)"};
            box-shadow: ${isOpen ? "var(--shadow-lg)" : "none"};
          }
          .responsive-sidebar,
          .responsive-sidebar.snt-rail {
            width: 260px;
          }
          .snt-rail .snt-hide-rail { display: revert !important; }
          .snt-rail .snt-navlabel { display: block !important; }
          .snt-rail .snt-navlink { justify-content: flex-start; padding: 10px 12px; }
          .snt-rail nav { padding: 0 10px; }
          .snt-collapse-btn { display: none !important; }
        }
      `}</style>

      <aside className={`responsive-sidebar ${collapsed ? "snt-rail" : ""}`}>

        {/* ── Logo + Close Button ── */}
        <div style={{ padding: collapsed ? "22px 10px 18px" : "22px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexDirection: collapsed ? "column" : "row" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, justifyContent: collapsed ? "center" : "flex-start" }}>
              {/* Shield icon */}
              <div style={{
                width: 40, height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 14px rgba(99,102,241,0.35), inset 0 0 0 1px rgba(255,255,255,0.15)",
                flexShrink: 0,
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 60%)",
                }} />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="M9 12l2 2 4-4" strokeWidth="2.2"/>
                </svg>
              </div>

              <div className="snt-hide-rail">
                <div style={{
                  fontWeight: 800,
                  fontSize: 17,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  color: "var(--text-primary)",
                }}>
                  Sentinel <span style={{
                    background: "linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4, #6366f1)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    animation: "shimmer 3s linear infinite",
                  }}>AI</span>
                </div>
                <div style={{
                  fontSize: 9.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase" as const,
                  marginTop: 3,
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}>
                  Facial Intelligence
                </div>
              </div>
            </div>

            {/* Collapse Toggle Button (visible on desktop) */}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="snt-collapse-btn"
                style={{
                  background: "var(--bg-hover)", border: "none",
                  borderRadius: 8, padding: 6,
                  color: "var(--text-muted)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease"
                }}
              >
                {collapsed ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                )}
              </button>
            )}

            {/* Mobile close button */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="mobile-close-btn"
                style={{
                  background: "var(--bg-hover)", border: "none",
                  borderRadius: 8, padding: 6,
                  color: "var(--text-muted)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="snt-hide-rail" style={{
            marginTop: 18,
            height: 1,
            background: "var(--border)",
          }} />
        </div>

        {/* ── Search ── */}
        <div className="snt-hide-rail" style={{ padding: "0 14px 14px" }}>
          <div className="sidebar-search" style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--bg-input)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: "9px 12px",
            transition: "all 0.2s ease",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Quick search..."
              style={{
                background: "none", border: "none", outline: "none",
                color: "var(--text-primary)", fontSize: 12.5,
                width: "100%", fontFamily: "inherit",
                caretColor: "var(--violet)",
              }}
            />
            <span style={{
              fontSize: 9, color: "var(--text-muted)",
              border: "1px solid var(--border-strong)",
              borderRadius: 5, padding: "2px 6px", flexShrink: 0,
              fontFamily: "'JetBrains Mono', monospace",
              background: "var(--bg-hover)",
            }}>⌘K</span>
          </div>
        </div>

        {/* ── Section label ── */}
        <div className="snt-hide-rail" style={{
          padding: "0 20px 8px",
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "var(--text-muted)",
          fontWeight: 700,
        }}>
          Navigation
        </div>

        {/* ── Nav ── */}
        <nav style={{ flex: 1, padding: "0 10px", overflowY: "auto" as const }}>
          {filtered.map((item) => {
            const active = activeId === item.id;
            const hovered = hoveredId === item.id;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                title={collapsed ? item.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  borderRadius: 10,
                  marginBottom: 2,
                  color: active ? item.activeColor : "var(--text-secondary)",
                  background: active ? item.activeBg : "transparent",
                  textDecoration: "none",
                  fontSize: 13.5,
                  fontWeight: active ? 650 : 500,
                  position: "relative" as const,
                  letterSpacing: "-0.01em",
                  border: active
                    ? `1px solid ${item.activeColor}18`
                    : "1px solid transparent",
                  transform: "translateX(0)",
                }}
                className="sidebar-nav-item snt-navlink"
              >
                {/* Active left accent bar */}
                {active && (
                  <span style={{
                    position: "absolute" as const,
                    left: 0, top: "50%",
                    transform: "translateY(-50%)",
                    width: 3, height: "60%",
                    borderRadius: "0 4px 4px 0",
                    background: item.gradient,
                  }} />
                )}

                {/* Icon container */}
                <span style={{
                  width: 32, height: 32,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: active ? item.gradient : hovered ? "var(--bg-hover)" : "var(--bg-input)",
                  color: active ? "#fff" : "var(--text-muted)",
                  boxShadow: active ? `0 3px 10px ${item.activeColor}33` : "none",
                  transition: "all 0.2s ease",
                  border: active ? "none" : "1px solid var(--border-light)",
                }}>
                  {item.icon}
                </span>

                {/* Label */}
                <span className="snt-navlabel" style={{ flex: 1 }}>{item.label}</span>

                {/* Live badge */}
                {item.badge && (
                  <span className="snt-hide-rail" style={{
                    background: "linear-gradient(135deg, #ef4444, #f97316)",
                    color: "#fff",
                    fontSize: 8.5,
                    fontWeight: 800,
                    borderRadius: 999,
                    padding: "2px 7px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase" as const,
                    boxShadow: "0 2px 6px rgba(239,68,68,0.3)",
                  }}>
                    {item.badge}
                  </span>
                )}

                {/* Shortcut key hint (on hover) */}
                {hovered && !active && (
                  <span className="snt-hide-rail" style={{
                    fontSize: 9, color: "var(--text-muted)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 4, padding: "1px 5px",
                    fontFamily: "'JetBrains Mono', monospace",
                    background: "var(--bg-input)",
                  }}>{item.shortcut}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── DB Size Widget ── */}
        <div className="snt-hide-rail" style={{ padding: "10px 14px 0" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 12, padding: "10px 12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#818cf8", letterSpacing: "0.12em", textTransform: "uppercase" as const, fontWeight: 700 }}>Database</div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            {dbStats ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#a5b4fc", letterSpacing: "-0.04em", lineHeight: 1 }}>
                  {dbStats.sizeMB < 1024 ? `${dbStats.sizeMB.toFixed(1)} MB` : `${(dbStats.sizeMB / 1024).toFixed(2)} GB`}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginTop: 8 }}>
                  {[
                    { label: "Faces", value: dbStats.faces, color: "#818cf8" },
                    { label: "Logs", value: dbStats.logs, color: "#6366f1" },
                    { label: "Cams", value: dbStats.cameras, color: "#38bdf8" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7, padding: "5px 6px", textAlign: "center" as const }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 8.5, color: "#818cf8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "#818cf8", opacity: 0.6 }}>Loading...</div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="snt-hide-rail" style={{
          padding: "14px 14px 18px",
          borderTop: "1px solid var(--border)",
          marginTop: 12,
        }}>
          {/* User row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}>
            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: "#fff", flexShrink: 0,
              boxShadow: "0 3px 10px rgba(99,102,241,0.3)",
            }}>SA</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)",
                lineHeight: 1.2, letterSpacing: "-0.02em",
              }}>
                Admin
              </div>
              <div style={{
                fontSize: 10, color: "var(--text-muted)",
                marginTop: 2,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "var(--green)",
                  boxShadow: "0 0 6px var(--green)",
                  flexShrink: 0, display: "inline-block",
                  animation: "statusBreathe 2s ease-in-out infinite",
                }} />
                System Online
              </div>
            </div>

            {/* Settings dots */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </div>

          {/* Version tag */}
          <div style={{
            marginTop: 10, textAlign: "center" as const,
            fontSize: 9, color: "var(--text-faint)",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.08em",
          }}>
            SENTINEL AI v2.4.1 · SECURE MODE
          </div>
        </div>
      </aside>
    </>
  );
}
