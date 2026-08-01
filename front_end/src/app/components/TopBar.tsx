"use client";

import { usePathname } from "next/navigation";
import {
  ShieldCheck,
  Camera,
  LayoutGrid,
  FileText,
  Settings,
  Calendar,
  Briefcase,
  Users,
  Clock,
  Sparkles,
  Bell,
  Wifi,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

interface TopBarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

const PAGE_DETAILS: Record<
  string,
  { title: string; subtitle: string; icon: React.ComponentType<{ size?: number; color?: string }>; color: string; gradient: string }
> = {
  "/": {
    title: "Dashboard Overview",
    subtitle: "Security analytics & event timeline",
    icon: ShieldCheck,
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  },
  "/dashboard": {
    title: "Dashboard Overview",
    subtitle: "Security analytics & event timeline",
    icon: ShieldCheck,
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  },
  "/cameras": {
    title: "CCTV Video Matrix",
    subtitle: "Live WebRTC streams & match layers",
    icon: Camera,
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6, #06b6d4)",
  },
  "/employees": {
    title: "Employee Directory",
    subtitle: "Staff profile database & enrollment",
    icon: Users,
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #8b5cf6, #a855f7)",
  },
  "/visitors": {
    title: "Visitor Check-In",
    subtitle: "Enroll guest passes & track presence",
    icon: Briefcase,
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #f59e0b, #ef4444)",
  },
  "/gallery": {
    title: "Face Database",
    subtitle: "Browse extracted facial embeddings",
    icon: LayoutGrid,
    color: "#ec4899",
    gradient: "linear-gradient(135deg, #ec4899, #a855f7)",
  },
  "/logs": {
    title: "Security Ledger",
    subtitle: "Facial detection events & alerts",
    icon: FileText,
    color: "#f43f5e",
    gradient: "linear-gradient(135deg, #f43f5e, #ef4444)",
  },
  "/settings": {
    title: "System Config",
    subtitle: "Adjust matcher scales & API endpoints",
    icon: Settings,
    color: "#64748b",
    gradient: "linear-gradient(135deg, #64748b, #475569)",
  },
};

export default function TopBar({ onToggleSidebar, isSidebarOpen = false }: TopBarProps) {
  const pathname = usePathname();
  const page = PAGE_DETAILS[pathname] ?? {
    title: "Sentinel Control Center",
    subtitle: "Facial Recognition Surveillance Suite",
    icon: Sparkles,
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  };

  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [notifCount] = useState(3);
  const [pingValue, setPingValue] = useState(23);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const pingTimer = setInterval(() => {
      setPingValue(Math.floor(18 + Math.random() * 14));
    }, 3000);

    const anim = requestAnimationFrame(() => {
      setMounted(true);
      setTime(new Date());
    });

    return () => {
      clearInterval(timer);
      clearInterval(pingTimer);
      cancelAnimationFrame(anim);
    };
  }, []);

  const PageIcon = mounted ? page.icon : Sparkles;
  const pageTitle = mounted ? page.title : "Sentinel Control Center";
  const pageSubtitle = mounted ? page.subtitle : "Facial Recognition Surveillance Suite";
  const pageGradient = mounted ? page.gradient : "linear-gradient(135deg, #6366f1, #8b5cf6)";
  const pageColor = mounted ? page.color : "#6366f1";

  return (
    <>
      <style>{`
        .topbar-chip {
          transition: all 0.18s ease;
        }
        .topbar-chip:hover {
          background: #f3f4f6 !important;
          border-color: #d1d5db !important;
        }
        .topbar-hamburger {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          color: #374151;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .topbar-hamburger:hover {
          background: #f3f4f6;
          color: #6366f1;
          border-color: #cbd5e1;
        }
        @media (min-width: 1025px) {
          .topbar-hamburger {
            display: none !important;
          }
        }
        @media (max-width: 640px) {
          .topbar-chip-date, .topbar-chip-ping {
            display: none !important;
          }
        }
      `}</style>

      <header style={{
        margin: "0 0 0 0",
        padding: "14px 20px",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 40,
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        animation: "slideDown 0.25s ease forwards",
        flexShrink: 0,
      }}>

        {/* Left: Hamburger + Icon + Page info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

          {/* Mobile / Tablet Hamburger Toggle */}
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle Navigation Menu"
            className="topbar-hamburger"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Page icon pill */}
          <div style={{
            width: 38, height: 38,
            borderRadius: 11,
            background: pageGradient,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 3px 12px ${pageColor}30`,
            transition: "all 0.4s ease",
            position: "relative",
            overflow: "hidden",
            flexShrink: 0,
          }}>
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)",
            }} />
            <PageIcon size={18} color="white" />
          </div>

          {/* Vertical divider */}
          <div style={{
            width: 1, height: 28,
            background: "#e5e7eb",
          }} />

          <div>
            <h1 style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 800,
              color: "#111827",
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
            }}>
              {pageTitle}
            </h1>
            <p style={{
              margin: "2px 0 0 0",
              fontSize: 11,
              color: "#6b7280",
              fontWeight: 500,
              letterSpacing: "0.01em",
            }}>
              {pageSubtitle}
            </p>
          </div>
        </div>

        {/* Right: chips & controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* Ping indicator */}
          <div className="topbar-chip topbar-chip-ping" style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "5px 10px",
            cursor: "default",
          }}>
            <Wifi size={12} style={{ color: "#6366f1" }} />
            <span style={{
              fontSize: 10.5,
              color: "#4b5563",
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
            }}>{pingValue}ms</span>
          </div>

          {/* Clock */}
          <div className="topbar-chip" style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11,
            color: "#4b5563",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            background: "#f9fafb",
            padding: "5px 11px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            letterSpacing: "0.03em",
          }}>
            <Clock size={12} style={{ color: "#9ca3af" }} />
            <span>{time ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</span>
          </div>

          {/* Date */}
          <div className="topbar-chip topbar-chip-date" style={{
            fontSize: 11,
            color: "#4b5563",
            fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "5px 11px",
          }}>
            <Calendar size={12} style={{ color: "#9ca3af" }} />
            <span>{time ? time.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "--- --, ----"}</span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

          {/* Online badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.15)",
            borderRadius: 8,
            padding: "5px 11px",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 6px rgba(16,185,129,0.5)",
              display: "inline-block",
              animation: "statusBreathe 2s ease-in-out infinite",
            }} />
            <span style={{
              fontSize: 10, color: "#059669",
              fontWeight: 700, letterSpacing: "0.08em",
            }}>ONLINE</span>
          </div>

          {/* Notification bell */}
          <div className="topbar-chip" style={{
            width: 36, height: 36,
            borderRadius: 9,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            position: "relative",
          }}>
            <Bell size={15} style={{ color: "#6b7280" }} />
            {notifCount > 0 && (
              <span style={{
                position: "absolute", top: 5, right: 5,
                width: 8, height: 8, borderRadius: "50%",
                background: "linear-gradient(135deg, #ef4444, #f97316)",
                boxShadow: "0 0 6px rgba(239,68,68,0.5)",
                animation: "notifBounce 3s ease-in-out infinite",
              }} />
            )}
          </div>

          {/* User avatar + role + logout */}
          <UserChip />
        </div>
      </header>
    </>
  );
}

function UserChip() {
  const { session, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const initials = session?.full_name
    ? session.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "SA";

  const roleLabel = session?.role === "super_admin" ? "Super Admin"
    : session?.role === "admin" ? "Admin" : "Viewer";

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          width: 36, height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 900, color: "#fff",
          cursor: "pointer",
          flexShrink: 0,
          boxShadow: "0 3px 12px rgba(99,102,241,0.3)",
          position: "relative",
          overflow: "hidden",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)" }} />
        {initials}
      </div>

      {open && (
        <>
          {/* backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => setOpen(false)}
          />
          {/* dropdown */}
          <div style={{
            position: "absolute", top: "calc(100% + 10px)", right: 0,
            width: 220,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
            zIndex: 50,
            overflow: "hidden",
            animation: "slideDown 0.15s ease",
          }}>
            {/* user info */}
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>
                {session?.full_name || "Super Admin"}
              </p>
              <p style={{ margin: "2px 0 6px", fontSize: 11.5, color: "#6b7280" }}>
                {session?.email || "superadmin@sentinel.local"}
              </p>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 99, padding: "2px 10px",
                fontSize: 10, fontWeight: 700, color: "#6366f1", letterSpacing: 0.5,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#6366f1" }} />
                {roleLabel}
              </span>
            </div>

            {/* logout */}
            <button
              onClick={() => { setOpen(false); logout(); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "11px 16px",
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "#ef4444",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
