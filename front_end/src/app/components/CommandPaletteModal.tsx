"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ShieldCheck,
  Camera,
  Users,
  Briefcase,
  LayoutGrid,
  FileText,
  Settings,
  Code,
  Sparkles,
  RefreshCw,
  Download,
  LifeBuoy,
  PlusCircle,
  Video,
  ArrowRight,
  Command,
  X,
  Lock,
} from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSupport?: (tab?: "copilot" | "telemetry" | "tickets" | "kb") => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: "page" | "action" | "camera" | "support";
  shortcut?: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  description: string;
  onSelect: () => void;
}

export default function CommandPaletteModal({ isOpen, onClose, onOpenSupport }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const navigate = (path: string) => {
    onClose();
    router.push(path);
  };

  const COMMAND_ITEMS: CommandItem[] = [
    // Pages
    {
      id: "nav-dash",
      title: "Dashboard Overview",
      category: "page",
      shortcut: "D",
      icon: ShieldCheck,
      description: "Live surveillance timeline, security score & analytics",
      onSelect: () => navigate("/dashboard"),
    },
    {
      id: "nav-cameras",
      title: "CCTV Camera Grid Matrix",
      category: "page",
      shortcut: "C",
      icon: Camera,
      description: "Multi-stream WebRTC live video feed layer",
      onSelect: () => navigate("/?grid=true"),
    },
    {
      id: "nav-employees",
      title: "Employee Directory",
      category: "page",
      shortcut: "E",
      icon: Users,
      description: "Manage enrolled staff profiles & face vectors",
      onSelect: () => navigate("/employees"),
    },
    {
      id: "nav-visitors",
      title: "Visitor Check-In & Badges",
      category: "page",
      shortcut: "V",
      icon: Briefcase,
      description: "Issue temporary guest passes & track visitors",
      onSelect: () => navigate("/visitors"),
    },
    {
      id: "nav-gallery",
      title: "Face Vector Gallery",
      category: "page",
      shortcut: "G",
      icon: LayoutGrid,
      description: "Browse 512-d ArcFace embeddings database",
      onSelect: () => navigate("/?tab=gallery"),
    },
    {
      id: "nav-logs",
      title: "Detection Ledger & Alerts",
      category: "page",
      shortcut: "L",
      icon: FileText,
      description: "Real-time face detection timestamps & history",
      onSelect: () => navigate("/?tab=log"),
    },
    {
      id: "nav-api",
      title: "Public API & Webhook Portal",
      category: "page",
      shortcut: "A",
      icon: Code,
      description: "Manage API tokens, SDK docs & webhook hooks",
      onSelect: () => navigate("/public-api"),
    },
    {
      id: "nav-settings",
      title: "System Config & Thresholds",
      category: "page",
      shortcut: "S",
      icon: Settings,
      description: "Adjust similarity metrics, camera URLs & server config",
      onSelect: () => navigate("/settings"),
    },

    // Actions
    {
      id: "act-register-staff",
      title: "Register New Staff Face",
      category: "action",
      icon: PlusCircle,
      description: "Upload photo or capture webcam to enroll new employee",
      onSelect: () => navigate("/?tab=register"),
    },
    {
      id: "act-refresh-cache",
      title: "Refresh Embedding RAM Cache",
      category: "action",
      icon: RefreshCw,
      description: "Atomic sync face vectors from DB into memory",
      onSelect: async () => {
        onClose();
        try {
          await fetch("/api/refresh_cache", { method: "POST" });
          alert("Embedding cache refreshed successfully!");
        } catch {
          alert("Triggered cache refresh");
        }
      },
    },
    {
      id: "act-diagnostics",
      title: "Run System Self-Diagnostics",
      category: "action",
      icon: Sparkles,
      description: "Inspect REST API, Supabase connection & WebRTC pipeline",
      onSelect: () => {
        onClose();
        if (onOpenSupport) onOpenSupport("telemetry");
      },
    },

    // Cameras
    {
      id: "cam-1",
      title: "Main Entrance Cam 01",
      category: "camera",
      icon: Video,
      description: "Live WebRTC stream • 1080p 30fps",
      onSelect: () => navigate("/cameras"),
    },
    {
      id: "cam-2",
      title: "Executive Lobby Cam 02",
      category: "camera",
      icon: Video,
      description: "Live WebRTC stream • 1080p 30fps",
      onSelect: () => navigate("/cameras"),
    },

    // Support
    {
      id: "sup-copilot",
      title: "Ask Sentinel AI Copilot",
      category: "support",
      icon: Sparkles,
      description: "Instant AI help on camera feeds, API keys & error fixes",
      onSelect: () => {
        onClose();
        if (onOpenSupport) onOpenSupport("copilot");
      },
    },
    {
      id: "sup-ticket",
      title: "Submit Technical Support Ticket",
      category: "support",
      icon: LifeBuoy,
      description: "Escalate issues directly to surveillance engineers",
      onSelect: () => {
        onClose();
        if (onOpenSupport) onOpenSupport("tickets");
      },
    },
    {
      id: "sup-kb",
      title: "Browse Knowledge Base & RTSP Guides",
      category: "support",
      icon: FileText,
      description: "Read documentation on camera setup & SDK integration",
      onSelect: () => {
        onClose();
        if (onOpenSupport) onOpenSupport("kb");
      },
    },
  ];

  // Global Cmd+K Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open handled by parent or state toggle
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredItems = COMMAND_ITEMS.filter((item) => {
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesQuery =
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        animation: "fadeIn 0.15s ease",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 680,
          background: "var(--bg-panel)",
          borderRadius: 18,
          boxShadow: "0 25px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(226,232,240,0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Command Search Header Input */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-strong)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--bg-input)",
          }}
        >
          <Search size={20} color="#6366f1" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command, page name, camera, or ask support..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-muted)",
                background: "var(--border-strong)",
                padding: "3px 7px",
                borderRadius: 6,
                fontFamily: "monospace",
              }}
            >
              ESC
            </span>
          </div>
        </div>

        {/* Category Pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 16px",
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--bg-hover)",
            gap: 6,
          }}
        >
          {[
            { id: "all", label: "All" },
            { id: "page", label: "Pages" },
            { id: "action", label: "Quick Actions" },
            { id: "camera", label: "Cameras" },
            { id: "support", label: "Support & Help" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedIndex(0);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                background: selectedCategory === cat.id ? "#6366f1" : "var(--bg-hover)",
                color: selectedCategory === cat.id ? "#ffffff" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Command Items List */}
        <div style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>No commands or pages found for &quot;{query}&quot;</p>
              <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--text-muted)" }}>Try searching for &quot;Dashboard&quot;, &quot;Camera&quot;, or &quot;API&quot;</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const IconComp = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    background: isSelected ? "var(--bg-hover)" : "transparent",
                    transition: "background 0.12s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: isSelected ? "#6366f1" : "var(--bg-input)",
                        color: isSelected ? "#ffffff" : "#6366f1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: isSelected ? "none" : "1px solid var(--border-strong)",
                        transition: "all 0.15s",
                      }}
                    >
                      <IconComp size={16} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>{item.title}</h4>
                      <p style={{ margin: "2px 0 0 0", fontSize: 11.5, color: "var(--text-muted)" }}>{item.description}</p>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {item.shortcut && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          background: "var(--border-strong)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontFamily: "monospace",
                        }}
                      >
                        {item.shortcut}
                      </span>
                    )}
                    <ArrowRight size={14} color={isSelected ? "#6366f1" : "var(--text-muted)"} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Command Palette Footer */}
        <div
          style={{
            padding: "10px 16px",
            background: "var(--bg-input)",
            borderTop: "1px solid var(--border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11.5,
            color: "var(--text-muted)",
          }}
        >
          <span>Use <strong>↑ ↓</strong> to navigate, <strong>Enter</strong> to select</span>
          <span style={{ fontWeight: 700, color: "#6366f1" }}>Sentinel Control Center v3.4</span>
        </div>
      </div>
    </div>
  );
}
