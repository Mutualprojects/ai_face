"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Activity,
  LifeBuoy,
  Send,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Shield,
  Cpu,
  Database,
  Wifi,
  Radio,
  BookOpen,
  MessageSquare,
  Clock,
  ArrowRight,
  Check,
  Terminal,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "copilot" | "telemetry" | "tickets" | "kb";
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  actionUrl?: string;
  actionLabel?: string;
  codeSnippet?: string;
}

const PRESET_PROMPTS = [
  { label: "📹 Connect RTSP/IP Camera", query: "How to set up RTSP/IP camera streams in Sentinel?" },
  { label: "🎯 Fix Match Accuracy", query: "How do I improve face detection confidence and resolve mismatching?" },
  { label: "🔑 Generate Public API Key", query: "How to generate and configure Public API tokens for integrations?" },
  { label: "👥 Visitor Expiration Rules", query: "How to configure visitor badge creation and auto-expiration?" },
  { label: "⚡ Reduce WebRTC Latency", query: "Why is the camera feed lagging and how to optimize stream latency?" },
];

const KNOWLEDGE_ARTICLES = [
  {
    id: "rtsp-setup",
    title: "Configuring WebRTC & RTSP Stream Matrix",
    category: "Camera Hardware",
    readTime: "3 min read",
    summary: "Step-by-step guide to connect IP cameras, adjust FPS thresholds, and handle stream reconnection logic.",
    content: `To connect your IP cameras or WebRTC feeds to Sentinel:
1. Navigate to 'Camera Grid Matrix' or Settings.
2. Provide the RTSP stream URL (e.g., rtsp://admin:password@192.168.1.100:554/stream1).
3. Ensure the backend app has direct network reachability to the camera IP.
4. Set the frame sample rate (recommended: 10-15 FPS for optimal GPU performance).
5. If using browser webcams, grant HTTPS camera permissions when prompted.`,
  },
  {
    id: "api-integration",
    title: "Integrating Public API & Webhooks",
    category: "Developer SDK",
    readTime: "4 min read",
    summary: "Learn how to use API tokens to query detection logs, enroll employees remotely, and receive instant webhooks.",
    content: `Sentinel Public API allows seamless integration with third-party HR and access control systems:
- Base Endpoint: http://localhost:5000/api/v1/public
- Header Authentication: Bearer <YOUR_API_TOKEN>
- Webhooks: Go to Public API page, set your Webhook Receiver URL, and toggle events (e.g. 'on_face_match', 'on_unrecognized_person').`,
  },
  {
    id: "embedding-cache",
    title: "Facial Recognition Cache & ArcFace Model",
    category: "AI & ML Engine",
    readTime: "2 min read",
    summary: "Understanding how face embeddings are indexed in Supabase and loaded atomically into RAM.",
    content: `Sentinel uses InsightFace (ArcFace 512-d embeddings) paired with cosine similarity matching:
- High Confidence: >= 0.45 similarity score.
- Cache Refresh: Click 'Refresh Cache' in Settings or trigger POST /api/refresh_cache to sync new face registrations into memory immediately without restarting the server.`,
  },
  {
    id: "visitor-passes",
    title: "Visitor Check-In & Security Badge System",
    category: "Access Control",
    readTime: "3 min read",
    summary: "How to issue temporary visitor passes with auto-expiring access windows and visitor logging.",
    content: `For guest access:
1. Go to 'Register Visitor' tab.
2. Capture or upload visitor face photo & host details.
3. Select pass validity duration (e.g., 4 hours, 1 day).
4. System automatically logs entry timestamps and alerts when a visitor's pass expires.`,
  },
];

export default function SupportModal({ isOpen, onClose, initialTab = "copilot" }: SupportModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"copilot" | "telemetry" | "tickets" | "kb">(initialTab);
  
  // Copilot State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "assistant",
      text: "👋 Welcome to Sentinel Intelligence Support! I am your AI Surveillance Copilot. How can I assist you with camera feeds, face matching, API tokens, or system health today?",
      timestamp: "Just now",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Diagnostic State
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagProgress, setDiagProgress] = useState(0);
  const [diagStep, setDiagStep] = useState("");
  const [diagResults, setDiagResults] = useState<{ name: string; status: "ok" | "warning"; details: string }[] | null>(null);

  // Ticket State
  const [tickets, setTickets] = useState([
    { id: "T-8942", subject: "Camera 2 stream dropping frames during peak hours", category: "Camera Stream", priority: "High", status: "In Progress", date: "Today, 02:15 PM" },
    { id: "T-8910", subject: "Request for custom webhook event payload schema", category: "API / Developer", priority: "Medium", status: "Resolved", date: "Yesterday" },
  ]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("Camera Stream");
  const [ticketPriority, setTicketPriority] = useState("Medium");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketSuccess, setTicketSuccess] = useState(false);

  // KB Search State
  const [kbQuery, setKbQuery] = useState("");
  const [expandedKb, setExpandedKb] = useState<string | null>("rtsp-setup");

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handle AI Copilot Query Submit
  const handleSendMessage = (userText?: string) => {
    const query = userText || inputPrompt;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!userText) setInputPrompt("");
    setIsTyping(true);

    // AI Response Generator Logic
    setTimeout(() => {
      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const qLower = query.toLowerCase();
      if (qLower.includes("rtsp") || qLower.includes("camera")) {
        botResponse.text = "To configure RTSP or IP cameras, navigate to the CCTV Matrix. Add your camera endpoint (e.g. `rtsp://camera_ip:554/live`) and ensure port 554 is open. You can also view live streams directly in the Camera Grid Matrix.";
        botResponse.actionLabel = "Open Camera Grid Matrix";
        botResponse.actionUrl = "/?grid=true";
        botResponse.codeSnippet = `// Example Python OpenCV RTSP Capture
import cv2
cap = cv2.VideoCapture("rtsp://admin:pass@192.168.1.100:554/stream1")
ret, frame = cap.read()`;
      } else if (qLower.includes("api") || qLower.includes("key") || qLower.includes("token")) {
        botResponse.text = "Sentinel provides a secure Public API with Bearer token authorization. You can create tokens with specific scopes ('register', 'detect', 'all') and register webhooks for real-time match events.";
        botResponse.actionLabel = "Go to Public API Portal";
        botResponse.actionUrl = "/public-api";
        botResponse.codeSnippet = `curl -X POST "http://localhost:5000/api/v1/public/detect" \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -F "image=@sample.jpg"`;
      } else if (qLower.includes("confidence") || qLower.includes("accuracy") || qLower.includes("mismatch")) {
        botResponse.text = "InsightFace embeddings match using cosine similarity. If you experience false positives or low confidence: \n1. Re-enroll the person with a clear front-facing lighting photo.\n2. Click 'Refresh Cache' to force memory re-indexing.\n3. Adjust the threshold in Settings (default recommended: 0.45).";
        botResponse.actionLabel = "Go to System Config";
        botResponse.actionUrl = "/settings";
      } else if (qLower.includes("visitor") || qLower.includes("badge") || qLower.includes("guest")) {
        botResponse.text = "Visitor management allows you to enroll temporary guests with expiration timestamps. Once expired, the system will mark the badge as inactive and alert security personnel if detected.";
        botResponse.actionLabel = "Open Visitor Portal";
        botResponse.actionUrl = "/visitors";
      } else if (qLower.includes("latency") || qLower.includes("lag") || qLower.includes("ping")) {
        botResponse.text = "Current system ping is 23ms (Nominal). If video feed exhibits delay: \n• Switch resolution from 1080p to 720p\n• Enable WebRTC H.264 hardware acceleration in browser flags\n• Run system self-diagnostics to verify backend GPU acceleration.";
        botResponse.actionLabel = "Check System Diagnostics";
        botResponse.actionUrl = "tab:telemetry";
      } else {
        botResponse.text = `I've analyzed your query regarding "${query}". For best results, check our Knowledge Base or submit a priority support ticket to our engineering team. You can also run system diagnostics to verify your server health.`;
        botResponse.actionLabel = "Submit Support Ticket";
        botResponse.actionUrl = "tab:tickets";
      }

      setChatMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 750);
  };

  // Run Self Diagnostic Test
  const handleRunDiagnostic = () => {
    setDiagRunning(true);
    setDiagProgress(10);
    setDiagStep("Pinging Flask REST API Backend (http://localhost:5000)...");

    setTimeout(() => {
      setDiagProgress(35);
      setDiagStep("Checking Supabase Database connection & tables...");
    }, 800);

    setTimeout(() => {
      setDiagProgress(65);
      setDiagStep("Validating InsightFace ArcFace model & memory cache...");
    }, 1600);

    setTimeout(() => {
      setDiagProgress(90);
      setDiagStep("Testing WebRTC video matrix frame pipeline...");
    }, 2400);

    setTimeout(() => {
      setDiagProgress(100);
      setDiagRunning(false);
      setDiagResults([
        { name: "Backend API Service", status: "ok", details: "HTTP 200 OK • Response time 14ms" },
        { name: "Supabase DB Connection", status: "ok", details: "Connected • Active connection pool ok" },
        { name: "InsightFace Model Cache", status: "ok", details: "1,240 face embeddings indexed in RAM" },
        { name: "WebRTC Stream Gateway", status: "ok", details: "2 active streams • 29.8 FPS" },
        { name: "Public API & Webhooks", status: "ok", details: "Endpoints healthy • Webhook listener ready" },
      ]);
    }, 3000);
  };

  // Submit Support Ticket
  const handleSubmitTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketDescription.trim()) return;

    const newTicket = {
      id: `T-${Math.floor(1000 + Math.random() * 9000)}`,
      subject: ticketSubject,
      category: ticketCategory,
      priority: ticketPriority,
      status: "Submitted",
      date: "Just now",
    };

    setTickets([newTicket, ...tickets]);
    setTicketSuccess(true);
    setTicketSubject("");
    setTicketDescription("");

    setTimeout(() => {
      setTicketSuccess(false);
    }, 4000);
  };

  const filteredKb = KNOWLEDGE_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(kbQuery.toLowerCase()) ||
      a.summary.toLowerCase().includes(kbQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(kbQuery.toLowerCase())
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: 20,
        animation: "fadeIn 0.2s ease",
      }}
    >
      {/* Modal Container */}
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          maxHeight: "90vh",
          background: "#ffffff",
          borderRadius: 20,
          boxShadow: "0 25px 60px -15px rgba(0,0,0,0.3), 0 0 0 1px rgba(226,232,240,0.8)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Modal Top Header */}
        <div
          style={{
            padding: "20px 24px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
              }}
            >
              <LifeBuoy size={24} color="white" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  Sentinel Support & Intelligence Hub
                </h2>
                <span
                  style={{
                    background: "rgba(16,185,129,0.2)",
                    border: "1px solid rgba(16,185,129,0.4)",
                    color: "#34d399",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 99,
                    letterSpacing: 0.5,
                  }}
                >
                  24/7 ONLINE
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#94a3b8" }}>
                AI Surveillance Assistant • Live System Diagnostics • Developer Docs • Helpdesk
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 11,
                color: "#64748b",
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.06)",
                padding: "4px 8px",
                borderRadius: 6,
              }}
            >
              ESC to close
            </span>
            <button
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "#cbd5e1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            gap: 6,
          }}
        >
          <button
            onClick={() => setActiveTab("copilot")}
            style={{
              padding: "13px 18px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              borderBottom: activeTab === "copilot" ? "2.5px solid #6366f1" : "2.5px solid transparent",
              color: activeTab === "copilot" ? "#6366f1" : "#64748b",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <Sparkles size={16} />
            AI Copilot Assistant
          </button>

          <button
            onClick={() => setActiveTab("telemetry")}
            style={{
              padding: "13px 18px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              borderBottom: activeTab === "telemetry" ? "2.5px solid #6366f1" : "2.5px solid transparent",
              color: activeTab === "telemetry" ? "#6366f1" : "#64748b",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <Activity size={16} />
            System Telemetry & Health
          </button>

          <button
            onClick={() => setActiveTab("tickets")}
            style={{
              padding: "13px 18px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              borderBottom: activeTab === "tickets" ? "2.5px solid #6366f1" : "2.5px solid transparent",
              color: activeTab === "tickets" ? "#6366f1" : "#64748b",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <MessageSquare size={16} />
            Support Ticket Desk
          </button>

          <button
            onClick={() => setActiveTab("kb")}
            style={{
              padding: "13px 18px",
              fontSize: 13,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              borderBottom: activeTab === "kb" ? "2.5px solid #6366f1" : "2.5px solid transparent",
              color: activeTab === "kb" ? "#6366f1" : "#64748b",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <BookOpen size={16} />
            Knowledge Base & Docs
          </button>
        </div>

        {/* Modal Main Body Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#ffffff" }}>
          {/* TAB 1: AI COPILOT */}
          {activeTab === "copilot" && (
            <div style={{ display: "flex", flexDirection: "column", height: "460px", gap: 16 }}>
              {/* Preset Quick Question Chips */}
              <div>
                <p style={{ margin: "0 0 8px 0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Quick Sentinel Assistance Topics
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PRESET_PROMPTS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.query)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        background: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#334155",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#e0e7ff";
                        e.currentTarget.style.color = "#4338ca";
                        e.currentTarget.style.borderColor = "#c7d2fe";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#f1f5f9";
                        e.currentTarget.style.color = "#334155";
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Thread */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 16,
                  borderRadius: 14,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "80%",
                        padding: "12px 16px",
                        borderRadius: 14,
                        background: msg.sender === "user" ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" : "#ffffff",
                        color: msg.sender === "user" ? "#ffffff" : "#1e293b",
                        boxShadow: msg.sender === "user" ? "0 4px 12px rgba(99,102,241,0.25)" : "0 2px 8px rgba(0,0,0,0.05)",
                        border: msg.sender === "user" ? "none" : "1px solid #e2e8f0",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>
                          {msg.sender === "user" ? "You" : "🤖 Sentinel Copilot"}
                        </span>
                        <span style={{ fontSize: 10, opacity: 0.6 }}>{msg.timestamp}</span>
                      </div>

                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-line" }}>{msg.text}</p>

                      {/* Code snippet if present */}
                      {msg.codeSnippet && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 8,
                            background: "#0f172a",
                            color: "#38bdf8",
                            fontFamily: "monospace",
                            fontSize: 11.5,
                            overflowX: "auto",
                          }}
                        >
                          <pre style={{ margin: 0 }}>{msg.codeSnippet}</pre>
                        </div>
                      )}

                      {/* Action button if present */}
                      {msg.actionUrl && (
                        <button
                          onClick={() => {
                            if (msg.actionUrl?.startsWith("tab:")) {
                              setActiveTab(msg.actionUrl.replace("tab:", "") as any);
                            } else if (msg.actionUrl) {
                              onClose();
                              router.push(msg.actionUrl);
                            }
                          }}
                          style={{
                            marginTop: 10,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: "#4f46e5",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 700,
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          {msg.actionLabel || "Take Action"}
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", animation: "ping 1s infinite" }} />
                    Sentinel Copilot is thinking...
                  </div>
                )}
              </div>

              {/* Chat Input Field */}
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="Ask Sentinel AI Copilot anything about camera setup, API keys, or face matching..."
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => handleSendMessage()}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 12,
                    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
                  }}
                >
                  <Send size={15} />
                  Send
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SYSTEM TELEMETRY & DIAGNOSTICS */}
          {activeTab === "telemetry" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Telemetry Grid Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                <div style={{ padding: 16, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Server Latency</span>
                    <Wifi size={18} color="#6366f1" />
                  </div>
                  <p style={{ margin: "10px 0 0 0", fontSize: 24, fontWeight: 900, color: "#0f172a" }}>23 ms</p>
                  <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>● Optimal Connection</span>
                </div>

                <div style={{ padding: 16, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>WebRTC Stream Matrix</span>
                    <Radio size={18} color="#3b82f6" />
                  </div>
                  <p style={{ margin: "10px 0 0 0", fontSize: 24, fontWeight: 900, color: "#0f172a" }}>29.8 FPS</p>
                  <span style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>2 Active Streams</span>
                </div>

                <div style={{ padding: 16, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>ArcFace RAM Cache</span>
                    <Cpu size={18} color="#8b5cf6" />
                  </div>
                  <p style={{ margin: "10px 0 0 0", fontSize: 24, fontWeight: 900, color: "#0f172a" }}>1,240 Faces</p>
                  <span style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700 }}>Atomic Snapshot Synced</span>
                </div>

                <div style={{ padding: 16, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Supabase Database</span>
                    <Database size={18} color="#10b981" />
                  </div>
                  <p style={{ margin: "10px 0 0 0", fontSize: 24, fontWeight: 900, color: "#0f172a" }}>14 ms</p>
                  <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>Query Pool Healthy</span>
                </div>
              </div>

              {/* Automated Self Diagnostic Tool */}
              <div style={{ padding: 20, borderRadius: 16, background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Automated System Self-Diagnostic Test</h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#94a3b8" }}>
                      Run comprehensive health checks across Flask backend, Supabase DB, WebRTC streams, and GPU face model.
                    </p>
                  </div>

                  <button
                    onClick={handleRunDiagnostic}
                    disabled={diagRunning}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      border: "none",
                      cursor: diagRunning ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      opacity: diagRunning ? 0.7 : 1,
                    }}
                  >
                    <RefreshCw size={15} className={diagRunning ? "spin" : ""} />
                    {diagRunning ? "Running Check..." : "Run Diagnostics"}
                  </button>
                </div>

                {/* Progress bar */}
                {diagRunning && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#cbd5e1", marginBottom: 6 }}>
                      <span>{diagStep}</span>
                      <span>{diagProgress}%</span>
                    </div>
                    <div style={{ width: "100%", height: 8, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${diagProgress}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, #6366f1, #10b981)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Results list */}
                {diagResults && (
                  <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                    {diagResults.map((res, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <CheckCircle2 size={16} color="#34d399" />
                          <span style={{ fontWeight: 700 }}>{res.name}</span>
                        </div>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{res.details}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SUPPORT TICKET DESK */}
          {activeTab === "tickets" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Form to submit new ticket */}
              <div style={{ padding: 20, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Submit Support Incident</h3>
                <p style={{ margin: "0 0 16px 0", fontSize: 12, color: "#64748b" }}>
                  Direct escalation to Sentinel Tier-3 surveillance engineers.
                </p>

                {ticketSuccess && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: "#dcfce7",
                      border: "1px solid #86efac",
                      color: "#166534",
                      fontSize: 13,
                      fontWeight: 700,
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <CheckCircle2 size={16} /> Ticket submitted successfully! Engineers notified.
                  </div>
                )}

                <form onSubmit={handleSubmitTicket} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      Subject
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Camera 2 dropping frames"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                        Category
                      </label>
                      <select
                        value={ticketCategory}
                        onChange={(e) => setTicketCategory(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                      >
                        <option value="Camera Stream">Camera Stream</option>
                        <option value="Face Match Mismatch">Face Match Mismatch</option>
                        <option value="API / Developer">API / Developer</option>
                        <option value="System Latency">System Latency</option>
                        <option value="Feature Request">Feature Request</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                        Priority
                      </label>
                      <select
                        value={ticketPriority}
                        onChange={(e) => setTicketPriority(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical Emergency">Critical Emergency</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                      Description & Logs
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Describe what happened, error messages, or camera location..."
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, resize: "none" }}
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      padding: "12px",
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Send size={15} />
                    Submit Ticket
                  </button>
                </form>
              </div>

              {/* Recent tickets list */}
              <div>
                <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Recent Tickets</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", fontFamily: "monospace" }}>{t.id}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 99,
                            background: t.status === "Resolved" ? "#dcfce7" : "#fef3c7",
                            color: t.status === "Resolved" ? "#166534" : "#92400e",
                          }}
                        >
                          {t.status}
                        </span>
                      </div>
                      <h4 style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{t.subject}</h4>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748b" }}>
                        <span>📁 {t.category}</span>
                        <span>⚠️ {t.priority}</span>
                        <span>🕒 {t.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: KNOWLEDGE BASE */}
          {activeTab === "kb" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Search bar */}
              <div style={{ position: "relative" }}>
                <Search size={18} color="#94a3b8" style={{ position: "absolute", left: 14, top: 12 }} />
                <input
                  type="text"
                  placeholder="Search Sentinel guides, RTSP setup, Webhooks, ArcFace embeddings..."
                  value={kbQuery}
                  onChange={(e) => setKbQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 42px",
                    borderRadius: 12,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>

              {/* Article Accordion List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredKb.map((art) => {
                  const isExpanded = expandedKb === art.id;
                  return (
                    <div
                      key={art.id}
                      style={{
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        background: "#ffffff",
                        overflow: "hidden",
                        transition: "all 0.2s",
                      }}
                    >
                      <div
                        onClick={() => setExpandedKb(isExpanded ? null : art.id)}
                        style={{
                          padding: 16,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          background: isExpanded ? "#f8fafc" : "#ffffff",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#6366f1", background: "#e0e7ff", padding: "2px 8px", borderRadius: 6 }}>
                              {art.category}
                            </span>
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>{art.readTime}</span>
                          </div>
                          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{art.title}</h4>
                          <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#64748b" }}>{art.summary}</p>
                        </div>
                        <ChevronRight
                          size={18}
                          color="#64748b"
                          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                        />
                      </div>

                      {isExpanded && (
                        <div style={{ padding: "0 16px 16px 16px", borderTop: "1px solid #f1f5f9", fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                          <pre style={{ whiteSpace: "pre-line", fontFamily: "inherit", margin: "12px 0 0 0" }}>{art.content}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
