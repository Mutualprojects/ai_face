"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import LoadingScreen from "./LoadingScreen";
import { AuthProvider, useAuth } from "./AuthProvider";
import { ThemeProvider } from "./ThemeProvider";

/* ── Inner layout (reads auth context) ──────────────────────────────────── */
function InnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const collapsedRef = useRef(sidebarCollapsed);

  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem("snt-sidebar-collapsed") === "1"); } catch {}
  }, []);

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
    return <LoadingScreen />;
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
            background: "var(--bg-deep)",
            opacity: 0.45,
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
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
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
            padding: "18px 24px 24px 24px",
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
            padding: 12px 16px 20px 16px !important;
          }
        }
        @media (max-width: 480px) {
          .main-content-body {
            padding: 8px 12px 16px 12px !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Exported wrapper (provides auth context to entire app) ──────────────── */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InnerLayout>{children}</InnerLayout>
      </AuthProvider>
    </ThemeProvider>
  );
}
