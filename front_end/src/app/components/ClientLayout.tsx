"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { AuthProvider, useAuth } from "./AuthProvider";

/* ── Inner layout (reads auth context) ──────────────────────────────────── */
function InnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("snt-sidebar-collapsed") === "1"; } catch { return false; }
  });

  const collapsedRef = useRef(sidebarCollapsed);
  useEffect(() => { collapsedRef.current = sidebarCollapsed; }, [sidebarCollapsed]);

  // Auto-adaptive sidebar:
  //  <1024px  → off-canvas drawer (hamburger toggle)
  //  1024–1400 → auto-collapse to icon rail
  //  ≥1400px  → full sidebar (respects persisted preference)
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      if (w < 1024) return;
      if (w < 1400 && !collapsedRef.current) {
        setSidebarCollapsed(true);
        try { localStorage.setItem("snt-sidebar-collapsed", "1"); } catch {}
      }
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const PUBLIC_ROUTES = ["/checkin", "/login", "/employee-register"];
  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  // Smart toggle: collapse rail on desktop (≥1024px), open the drawer on mobile
  const toggleSidebar = () => {
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    if (isDesktop) {
      setSidebarCollapsed(prev => {
        const next = !prev;
        try { localStorage.setItem("snt-sidebar-collapsed", next ? "1" : "0"); } catch {}
        return next;
      });
    } else {
      setSidebarOpen((prev: boolean) => !prev);
    }
  };
  const closeSidebar = () => setSidebarOpen(false);

  // Full-screen loading state while checking session
  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f6f7fb",
        backgroundImage: "radial-gradient(52rem 36rem at 15% -10%, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0) 55%), radial-gradient(46rem 34rem at 95% 10%, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0) 55%)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", border: "3px solid rgba(99,102,241,0.18)", borderTopColor: "#6366f1", borderRightColor: "#8b5cf6", animation: "spin 0.7s linear infinite", boxShadow: "0 0 24px rgba(99,102,241,0.18)" }} />
          <p style={{ color: "#64708c", fontSize: 13, margin: 0, letterSpacing: "0.02em" }}>Loading Sentinel AI…</p>
        </div>
      </div>
    );
  }

  if (isPublicRoute) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", margin: 0, padding: 0 }}>
        {children}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", position: "relative", width: "100%", background: "var(--bg-deep)", overflowX: "hidden" }}>

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: "fixed", inset: 0, zIndex: 45,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            transition: "opacity 0.25s ease",
          }}
        />
      )}

      {/* Left Sidebar */}
      <Suspense fallback={
        <div style={{
          width: 260, height: "100vh",
          position: "fixed", top: 0, left: 0,
          background: "#ffffff",
          borderRight: "1px solid rgba(0,0,0,0.06)",
        }} />
      }>
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      </Suspense>

      {/* Right Content Panel */}
      <div
        className={`main-content-panel ${sidebarCollapsed ? "snt-collapsed" : ""}`}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          background: "transparent",
          padding: 0,
          zIndex: 1,
          transition: "margin-left 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <TopBar onToggleSidebar={toggleSidebar} isSidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} />
        <main
          className="main-content-body"
          style={{
            flex: 1,
            background: "transparent",
            padding: "18px 28px 24px 28px",
            overflowY: "auto",
          }}
        >
          {children}
        </main>
      </div>

      <style>{`
        .main-content-panel {
          margin-left: 260px;
        }
        .main-content-panel.snt-collapsed {
          margin-left: 76px;
        }
        @media (max-width: 1024px) {
          .main-content-panel,
          .main-content-panel.snt-collapsed {
            margin-left: 0 !important;
          }
          .main-content-body {
            padding: 0px 16px 20px 16px !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Exported wrapper (provides auth context to entire app) ──────────────── */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <InnerLayout>{children}</InnerLayout>
    </AuthProvider>
  );
}
