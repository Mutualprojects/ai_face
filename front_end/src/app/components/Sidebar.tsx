"use client";

import { useState } from "react";
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
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  let activeId = "dashboard";
  if (pathname === "/dashboard") activeId = "dashboard";
  else if (pathname === "/visitors") activeId = "visitors";
  else if (pathname === "/employees") activeId = "employees";
  else if (pathname === "/") activeId = searchParams.get("tab") || "register";

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
          background: #f3f4f6 !important;
          transform: translateX(2px);
        }
        .sidebar-search:focus-within {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.08) !important;
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
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
          box-shadow: 1px 0 8px rgba(0,0,0,0.03);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (max-width: 1024px) {
          .responsive-sidebar {
            transform: ${isOpen ? "translateX(0)" : "translateX(-100%)"};
            box-shadow: ${isOpen ? "4px 0 25px rgba(0,0,0,0.15)" : "none"};
          }
        }
      `}</style>

      <aside className="responsive-sidebar">

        {/* ── Logo + Close Button ── */}
        <div style={{ padding: "22px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
              {/* Shield icon */}
              <div style={{
                width: 40, height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
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

              <div>
                <div style={{
                  fontWeight: 800,
                  fontSize: 17,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  color: "#111827",
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
                  color: "#9ca3af",
                  fontWeight: 600,
                }}>
                  Facial Intelligence
                </div>
              </div>
            </div>

            {/* Mobile close button */}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close menu"
                className="mobile-close-btn"
                style={{
                  background: "#f3f4f6", border: "none",
                  borderRadius: 8, padding: 6,
                  color: "#6b7280", cursor: "pointer",
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
          <div style={{
            marginTop: 18,
            height: 1,
            background: "#e5e7eb",
          }} />
        </div>

        {/* ── Search ── */}
        <div style={{ padding: "0 14px 14px" }}>
          <div className="sidebar-search" style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "9px 12px",
            transition: "all 0.2s ease",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#9ca3af" strokeWidth="2.5"
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
                color: "#111827", fontSize: 12.5,
                width: "100%", fontFamily: "inherit",
                caretColor: "#6366f1",
              }}
            />
            <span style={{
              fontSize: 9, color: "#9ca3af",
              border: "1px solid #e5e7eb",
              borderRadius: 5, padding: "2px 6px", flexShrink: 0,
              fontFamily: "'JetBrains Mono', monospace",
              background: "#f3f4f6",
            }}>⌘K</span>
          </div>
        </div>

        {/* ── Section label ── */}
        <div style={{
          padding: "0 20px 8px",
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase" as const,
          color: "#9ca3af",
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  borderRadius: 10,
                  marginBottom: 2,
                  color: active ? item.activeColor : "#374151",
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
                className="sidebar-nav-item"
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
                  background: active ? item.gradient : hovered ? "#f3f4f6" : "#f9fafb",
                  color: active ? "#fff" : "#6b7280",
                  boxShadow: active ? `0 3px 10px ${item.activeColor}33` : "none",
                  transition: "all 0.2s ease",
                  border: active ? "none" : "1px solid #f3f4f6",
                }}>
                  {item.icon}
                </span>

                {/* Label */}
                <span style={{ flex: 1 }}>{item.label}</span>

                {/* Live badge */}
                {item.badge && (
                  <span style={{
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
                  <span style={{
                    fontSize: 9, color: "#9ca3af",
                    border: "1px solid #e5e7eb",
                    borderRadius: 4, padding: "1px 5px",
                    fontFamily: "'JetBrains Mono', monospace",
                    background: "#f9fafb",
                  }}>{item.shortcut}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── System Stats ── */}
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}>
            {[
              { label: "CPU", value: "12%", color: "#10b981" },
              { label: "Latency", value: "23ms", color: "#6366f1" },
            ].map(stat => (
              <div key={stat.label} style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 10, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.1em", textTransform: "uppercase" as const, fontWeight: 600 }}>{stat.label}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: stat.color, marginTop: 2, letterSpacing: "-0.03em" }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "14px 14px 18px",
          borderTop: "1px solid #f3f4f6",
          marginTop: 12,
        }}>
          {/* User row */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            borderRadius: 12,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
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
                fontSize: 12.5, fontWeight: 700, color: "#111827",
                lineHeight: 1.2, letterSpacing: "-0.02em",
              }}>
                Admin
              </div>
              <div style={{
                fontSize: 10, color: "#6b7280",
                marginTop: 2,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 4px #10b981",
                  flexShrink: 0, display: "inline-block",
                  animation: "statusBreathe 2s ease-in-out infinite",
                }} />
                System Online
              </div>
            </div>

            {/* Settings dots */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </div>

          {/* Version tag */}
          <div style={{
            marginTop: 10, textAlign: "center" as const,
            fontSize: 9, color: "#d1d5db",
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
