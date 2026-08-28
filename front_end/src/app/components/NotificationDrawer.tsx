"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  Camera,
  UserCheck,
  ShieldAlert,
  Clock,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: "critical" | "warning" | "info" | "success";
  category: "Security" | "Camera" | "Access Control" | "System";
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "critical" | "unread">("all");

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "n-1",
      title: "Unrecognized Face Detected",
      message: "An unauthorized visitor was detected at Parking Gate Cam 03. Similarity score 0.31.",
      timestamp: "3 minutes ago",
      type: "critical",
      category: "Security",
      read: false,
      actionUrl: "/cameras",
      actionLabel: "Inspect Stream",
    },
    {
      id: "n-2",
      title: "Visitor Badge Expired",
      message: "Guest Pass #V-402 (Robert Smith) expired 10 minutes ago.",
      timestamp: "12 minutes ago",
      type: "warning",
      category: "Access Control",
      read: false,
      actionUrl: "/visitors",
      actionLabel: "View Visitors",
    },
    {
      id: "n-3",
      title: "RAM Embedding Cache Synced",
      message: "Successfully synchronized 1,240 face vectors into memory snapshot.",
      timestamp: "1 hour ago",
      type: "success",
      category: "System",
      read: true,
    },
    {
      id: "n-4",
      title: "CCTV Camera 02 Frame Rate Normal",
      message: "WebRTC pipeline recovered to nominal 29.8 FPS.",
      timestamp: "2 hours ago",
      type: "info",
      category: "Camera",
      read: true,
      actionUrl: "/cameras",
      actionLabel: "View Matrix",
    },
  ]);

  if (!isOpen) return null;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filter === "critical") return n.type === "critical" || n.type === "warning";
    if (filter === "unread") return !n.read;
    return true;
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(4px)",
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Slide-over Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 420,
          zIndex: 9999,
          background: "var(--bg-panel)",
          boxShadow: "-10px 0 40px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          animation: "slideLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, var(--bg-sidebar) 0%, var(--bg-card) 100%)",
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={20} color="#6366f1" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Surveillance Alerts</h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: "#6366f1",
                color: "#fff",
                padding: "2px 8px",
                borderRadius: 99,
              }}
            >
              {notifications.filter((n) => !n.read).length}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Controls & Filters */}
        <div
          style={{
            padding: "12px 20px",
            background: "var(--bg-input)",
            borderBottom: "1px solid var(--border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "all", label: "All" },
              { id: "critical", label: "Critical" },
              { id: "unread", label: "Unread" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 700,
                  border: "none",
                  background: filter === f.id ? "#6366f1" : "var(--border-strong)",
                  color: filter === f.id ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={markAllRead}
              title="Mark all as read"
              style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
            >
              <CheckCheck size={14} /> Read All
            </button>
            <button
              onClick={clearAll}
              title="Clear notifications"
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredNotifs.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              <Bell size={36} color="var(--border-strong)" style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>All clear! No alerts</p>
            </div>
          ) : (
            filteredNotifs.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid var(--border-strong)",
                  background: n.read ? "var(--bg-panel)" : "rgba(99,102,241,0.03)",
                  borderLeft: `4px solid ${
                    n.type === "critical" ? "#ef4444" : n.type === "warning" ? "#f59e0b" : n.type === "success" ? "#10b981" : "#3b82f6"
                  }`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: n.type === "critical" ? "#ef4444" : "#6366f1",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {n.category}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{n.timestamp}</span>
                </div>

                <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{n.title}</h4>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{n.message}</p>

                {n.actionUrl && (
                  <button
                    onClick={() => {
                      onClose();
                      router.push(n.actionUrl!);
                    }}
                    style={{
                      alignSelf: "flex-start",
                      marginTop: 4,
                      padding: "5px 10px",
                      borderRadius: 6,
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border-strong)",
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {n.actionLabel || "Inspect"}
                    <ChevronRight size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
