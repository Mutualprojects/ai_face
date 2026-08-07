"use client";

import { usePathname, useRouter } from "next/navigation";
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
  Search,
  LifeBuoy,
  ChevronDown,
  Check,
  Globe,
  Activity,
  Cpu,
  Database,
  ExternalLink,
  Shield,
  HelpCircle,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import SupportModal from "./SupportModal";
import CommandPaletteModal from "./CommandPaletteModal";
import NotificationDrawer from "./NotificationDrawer";

interface TopBarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  sidebarCollapsed?: boolean;
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
  "/sdk": {
    title: "Manage SDK & Presence",
    subtitle: "Live physical presence API, camera telemetry & SDK explorer",
    icon: Sparkles,
    color: "#0ea5e9",
    gradient: "linear-gradient(135deg, #0ea5e9, #6366f1)",
  },
  "/settings": {
    title: "System Config",
    subtitle: "Adjust matcher scales & API endpoints",
    icon: Settings,
    color: "#64748b",
    gradient: "linear-gradient(135deg, #64748b, #475569)",
  },
};

export default function TopBar({ onToggleSidebar, isSidebarOpen = false, sidebarCollapsed = false }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const page = PAGE_DETAILS[pathname] ?? {
    title: "Sentinel Control Center",
    subtitle: "Facial Recognition Surveillance Suite",
    icon: Sparkles,
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  };

  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [pingValue, setPingValue] = useState(23);

  // Modals & Popovers state
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [supportTab, setSupportTab] = useState<"copilot" | "telemetry" | "tickets" | "kb">("copilot");
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  // Popover Popups
  const [pingPopover, setPingPopover] = useState(false);
  const [timePopover, setTimePopover] = useState(false);
  const [statusPopover, setStatusPopover] = useState(false);
  const [userDutyStatus, setUserDutyStatus] = useState<"on_duty" | "away" | "dnd">("on_duty");

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

  const openSupportModal = (tab: "copilot" | "telemetry" | "tickets" | "kb" = "copilot") => {
    setSupportTab(tab);
    setIsSupportOpen(true);
  };

  const PageIcon = mounted ? page.icon : Sparkles;
  const pageTitle = mounted ? page.title : "Sentinel Control Center";
  const pageSubtitle = mounted ? page.subtitle : "Facial Recognition Surveillance Suite";
  const pageGradient = mounted ? page.gradient : "linear-gradient(135deg, #6366f1, #8b5cf6)";
  const pageColor = mounted ? page.color : "#6366f1";

  return (
    <>
      <style>{`
        .topbar-chip {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .topbar-chip:hover {
          background: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
          transform: translateY(-1px);
        }

        .topbar-search-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 16px;
          border-radius: 11px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 280px;
        }
        .topbar-search-btn:hover {
          background: #ffffff;
          border-color: #6366f1;
          box-shadow: 0 4px 12px rgba(99,102,241,0.08);
          color: #334155;
        }
        .topbar-hamburger {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .topbar-hamburger:hover {
          background: #ffffff;
          border-color: #6366f1;
          color: #6366f1;
          box-shadow: 0 4px 12px rgba(99,102,241,0.12);
        }
        .topbar-hamburger:active {
          transform: scale(0.96);
        }
        .thb-desktop { display: none; align-items: center; }
        .thb-mobile { display: flex; align-items: center; }
        @media (min-width: 1025px) {
          .thb-desktop { display: flex; }
          .thb-mobile { display: none; }
        }
        @media (max-width: 1024px) {
          .topbar-search-btn {
            width: 180px;
          }
        }
        @media (max-width: 768px) {
          .topbar-search-btn {
            display: none !important;
          }
          .topbar-chip-date, .topbar-chip-ping {
            display: none !important;
          }
        }
        @keyframes statusBreathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>

      <header
        style={{
          margin: 0,
          padding: "12px 24px",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(16px) saturate(1.4)",
          WebkitBackdropFilter: "blur(16px) saturate(1.4)",
          borderBottom: "1px solid rgba(226, 232, 240, 0.9)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 40,
          boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
          flexShrink: 0,
        }}
      >
        {/* LEFT: Sidebar Toggle + Page Icon & Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

          {/* Sidebar toggle — collapse rail on desktop, open drawer on mobile */}
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle navigation sidebar"
            className="topbar-hamburger"
          >
            <span className="thb-desktop">
              {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </span>
            <span className="thb-mobile">
              {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </span>
          </button>

          {/* Page Icon Gradient Badge */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: pageGradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 4px 14px ${pageColor}35`,
              transition: "all 0.4s ease",
              position: "relative",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 60%)",
              }}
            />
            <PageIcon size={20} color="white" />
          </div>

          {/* Title & Subtitle */}
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 16.5,
                fontWeight: 800,
                color: "#0f172a",
                letterSpacing: "-0.025em",
                lineHeight: 1.2,
              }}
            >
              {pageTitle}
            </h1>
            <p
              style={{
                margin: "2px 0 0 0",
                fontSize: 11.5,
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              {pageSubtitle}
            </p>
          </div>
        </div>

        {/* CENTER: Interactive Command & Support Search Bar */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <button onClick={() => setIsCmdOpen(true)} className="topbar-search-btn">
            <Search size={15} color="#6366f1" />
            <span style={{ flex: 1, textAlign: "left" }}>Search pages or ask support...</span>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "#94a3b8",
                background: "#e2e8f0",
                padding: "2px 6px",
                borderRadius: 5,
                fontFamily: "monospace",
              }}
            >
              ⌘K
            </span>
          </button>
        </div>

        {/* RIGHT: Telemetry Chips, Support Hub Button, Alerts & Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Interactive Latency / Ping Chip */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setPingPopover((v) => !v)}
              className="topbar-chip topbar-chip-ping"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 9,
                padding: "6px 11px",
                cursor: "pointer",
              }}
              title="Click for System Latency Breakdown"
            >
              <Wifi size={13} style={{ color: "#6366f1" }} />
              <span
                style={{
                  fontSize: 11,
                  color: "#334155",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                }}
              >
                {pingValue}ms
              </span>
            </div>

            {/* Ping Popover */}
            {pingPopover && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setPingPopover(false)} />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    width: 240,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                    zIndex: 50,
                    padding: 16,
                    animation: "slideDown 0.15s ease",
                  }}
                >
                  <h4 style={{ margin: "0 0 10px 0", fontSize: 13, fontWeight: 800, color: "#0f172a" }}>System Telemetry</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "#475569" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Flask REST API</span>
                      <strong style={{ color: "#10b981" }}>{pingValue} ms</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Supabase Query</span>
                      <strong style={{ color: "#10b981" }}>14 ms</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>WebRTC Stream FPS</span>
                      <strong style={{ color: "#3b82f6" }}>29.8 FPS</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>InsightFace Model Cache</span>
                      <strong style={{ color: "#8b5cf6" }}>1,240 faces</strong>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPingPopover(false);
                      openSupportModal("telemetry");
                    }}
                    style={{
                      marginTop: 12,
                      width: "100%",
                      padding: "7px",
                      borderRadius: 8,
                      background: "#e0e7ff",
                      color: "#4338ca",
                      fontWeight: 700,
                      fontSize: 11.5,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    View Detailed Diagnostics
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Interactive World Clock & Date */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setTimePopover((v) => !v)}
              className="topbar-chip"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11.5,
                color: "#334155",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                background: "#f8fafc",
                padding: "6px 12px",
                borderRadius: 9,
                border: "1px solid #e2e8f0",
                cursor: "pointer",
              }}
              title="Click to view timezones"
            >
              <Clock size={13} style={{ color: "#6366f1" }} />
              <span>{time ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}</span>
            </div>

            {/* Time Popover */}
            {timePopover && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setTimePopover(false)} />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    width: 220,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                    zIndex: 50,
                    padding: 14,
                    animation: "slideDown 0.15s ease",
                  }}
                >
                  <h4 style={{ margin: "0 0 8px 0", fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>World Time Clocks</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "#475569" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Local Time</span>
                      <strong>{time ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>UTC (Greenwich)</span>
                      <strong>{time ? time.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) : ""}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>IST (New Delhi)</span>
                      <strong>{time ? time.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : ""}</strong>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Interactive Server Status Badge */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setStatusPopover((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: 9,
                padding: "6px 11px",
                cursor: "pointer",
              }}
              title="Click to view Server Uptime"
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 6px rgba(16,185,129,0.6)",
                  display: "inline-block",
                  animation: "statusBreathe 2s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  fontSize: 10.5,
                  color: "#059669",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                }}
              >
                ONLINE
              </span>
            </div>

            {/* Status Popover */}
            {statusPopover && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setStatusPopover(false)} />
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    width: 230,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                    zIndex: 50,
                    padding: 14,
                    animation: "slideDown 0.15s ease",
                  }}
                >
                  <h4 style={{ margin: "0 0 6px 0", fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Server Node Health</h4>
                  <p style={{ margin: "0 0 10px 0", fontSize: 11.5, color: "#10b981", fontWeight: 700 }}>
                    ● All Systems Operational (99.98% Uptime)
                  </p>
                  <div style={{ fontSize: 11, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div>Region: <strong>localhost / US-East</strong></div>
                    <div>Active WebRTC Feeds: <strong>2 Streams</strong></div>
                    <div>Model Execution: <strong>GPU Accelerated</strong></div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Vertical Divider */}
          <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />

          {/* INTERACTIVE SUPPORT HUB BUTTON */}
          <button
            onClick={() => openSupportModal("copilot")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 13px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 12,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(99,102,241,0.28)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(99,102,241,0.38)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.28)";
            }}
          >
            <LifeBuoy size={15} color="white" />
            <span>Support Hub</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#34d399",
                boxShadow: "0 0 6px #34d399",
              }}
            />
          </button>

          {/* Notification Bell */}
          <div
            onClick={() => setIsNotifOpen(true)}
            className="topbar-chip"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
            title="Surveillance Notifications"
          >
            <Bell size={16} style={{ color: "#475569" }} />
            <span
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #ef4444, #f97316)",
                boxShadow: "0 0 6px rgba(239,68,68,0.6)",
              }}
            />
          </div>

          {/* User Profile Avatar (SA) Dropdown */}
          <UserChip openSupport={openSupportModal} dutyStatus={userDutyStatus} setDutyStatus={setUserDutyStatus} />
        </div>
      </header>

      {/* Global Interactive Modals */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} initialTab={supportTab} />
      <CommandPaletteModal isOpen={isCmdOpen} onClose={() => setIsCmdOpen(false)} onOpenSupport={openSupportModal} />
      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
    </>
  );
}

function UserChip({
  openSupport,
  dutyStatus,
  setDutyStatus,
}: {
  openSupport: (tab: any) => void;
  dutyStatus: string;
  setDutyStatus: (s: any) => void;
}) {
  const { session, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const initials = session?.full_name
    ? session.full_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "SA";

  const roleLabel =
    session?.role === "super_admin" ? "Super Admin" : session?.role === "admin" ? "Admin" : "Viewer";

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11.5,
          fontWeight: 900,
          color: "#fff",
          cursor: "pointer",
          flexShrink: 0,
          boxShadow: "0 3px 12px rgba(99,102,241,0.3)",
          position: "relative",
          overflow: "hidden",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%)" }} />
        {initials}
      </div>

      {open && (
        <>
          {/* backdrop */}
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />

          {/* dropdown menu */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: 240,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.14)",
              zIndex: 50,
              overflow: "hidden",
              animation: "slideDown 0.15s ease",
            }}
          >
            {/* user info */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>
                {session?.full_name || "Super Admin"}
              </p>
              <p style={{ margin: "2px 0 8px", fontSize: 11.5, color: "#64748b" }}>
                {session?.email || "superadmin@sentinel.local"}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.2)",
                    borderRadius: 99,
                    padding: "2px 9px",
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#6366f1",
                  }}
                >
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Duty status toggle */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase" }}>Duty Status</span>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                {[
                  { id: "on_duty", label: "🟢 On Duty" },
                  { id: "away", label: "🟡 Away" },
                  { id: "dnd", label: "🔴 DND" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setDutyStatus(s.id as any)}
                    style={{
                      flex: 1,
                      padding: "4px 2px",
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      border: "none",
                      background: dutyStatus === s.id ? "#ffffff" : "transparent",
                      boxShadow: dutyStatus === s.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions list */}
            <div style={{ padding: 6 }}>
              <button
                onClick={() => {
                  setOpen(false);
                  openSupport("copilot");
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: "none",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#334155",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <LifeBuoy size={15} color="#6366f1" />
                Support & Intelligence Hub
              </button>

              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/public-api");
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: "none",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#334155",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <Sparkles size={15} color="#0ea5e9" />
                Public API & SDK Keys
              </button>

              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/settings");
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: "none",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#334155",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <Settings size={15} color="#64748b" />
                System Settings
              </button>

              <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0" }} />

              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: "none",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#ef4444",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
