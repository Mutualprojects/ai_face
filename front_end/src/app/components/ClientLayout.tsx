"use client";

import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { AuthProvider, useAuth } from "./AuthProvider";

/* ── Inner layout (reads auth context) ──────────────────────────────────── */
function InnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const PUBLIC_ROUTES = ["/checkin", "/login"];
  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  const toggleSidebar = () => setSidebarOpen((prev: boolean) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  // Full-screen loading state while checking session
  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(ellipse at 20% 50%, #0f0c29 0%, #0a0a1a 40%, #050510 100%)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            border: "2px solid rgba(99,102,241,0.3)",
            borderTopColor: "#6366f1",
            animation: "spin 0.8s linear infinite",
          }} />
          <p style={{ color: "rgba(148,163,184,0.6)", fontSize: 13, margin: 0 }}>Loading Sentinel AI…</p>
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
    <div style={{ display: "flex", minHeight: "100vh", position: "relative", width: "100%", background: "var(--bg-deep)" }}>

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
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      </Suspense>

      {/* Right Content Panel */}
      <div
        className="main-content-panel"
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
        <TopBar onToggleSidebar={toggleSidebar} isSidebarOpen={sidebarOpen} />
        <main
          className="main-content-body"
          style={{
            flex: 1,
            background: "transparent",
            padding: "0px 28px 24px 28px",
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
        @media (max-width: 1024px) {
          .main-content-panel {
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
