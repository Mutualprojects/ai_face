"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  UserCheck,
  Eye,
  Activity,
  Search,
  LogOut,
  CheckCircle,
  Clock,
  Calendar,
  ShieldCheck,
  X,
  ChevronRight,
  ArrowUpRight,
  Filter,
  MoreHorizontal,
  AlertCircle,
  LayoutGrid,
  List,
  Kanban,
  Camera,
  ShieldAlert,
  Video,
  ArrowRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

interface RegisteredFace {
  id: string;
  name: string;
  photo_url: string;
  department: string;
  created_at: string;
}

type VisitPurpose = "Meeting" | "Interview" | "Delivery" | "Other";

interface Visitor {
  visitor_id: string;
  full_name: string;
  phone: string;
  company_name: string | null;
  id_proof_number: string | null;
  photo_image: string | null;
  meet_employee_id: string;
  purpose_of_visit: VisitPurpose;
  check_in_time: string;
  check_out_time: string | null;
}

interface FaceLog {
  id: string;
  person_name: string;
  confidence: number;
  snapshot_url: string;
  timestamp: string;
  status: "Authorized" | "Unknown" | "Flagged";
}

const BG_IMAGE = "/3932198_1036.jpg";

const COLORS = {
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#64748b",
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SentinelDashboard() {
  // State
  const [faces, setFaces] = useState<RegisteredFace[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [logs, setLogs] = useState<FaceLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Interaction State
  const [activeDrawer, setActiveDrawer] = useState<"kpi-enrolled" | "kpi-active" | "kpi-total" | "kpi-logs" | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  // View Modes: list, grid, kanban
  const [viewMode, setViewMode] = useState<"list" | "grid" | "kanban">("list");

  // Fetch all dashboard data from Next.js routes
  const loadData = async () => {
    try {
      const resFaces = await fetch("/api/registered_faces").catch(() => null);
      const resVisitors = await fetch("/api/visitors").catch(() => null);
      const resLogs = await fetch("/api/face_logs").catch(() => null);

      if (resFaces?.ok) setFaces(await resFaces.json());
      else setFaces([]);

      if (resVisitors?.ok) setVisitors(await resVisitors.json());
      else setVisitors([]);

      if (resLogs?.ok) setLogs(await resLogs.json());
      else setLogs([]);
    } catch (err) {
      console.error("Dashboard data load error:", err);
      setFaces([]);
      setVisitors([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Live Clock & Real-time camera recognition data polling (every 1.5 seconds)
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    const dataTimer = setInterval(() => loadData(), 1500);

    return () => {
      clearInterval(clockTimer);
      clearInterval(dataTimer);
    };
  }, []);

  // Derived Metrics
  const metrics = useMemo(() => ({
    enrolled: faces.length,
    active: visitors.filter(v => !v.check_out_time).length,
    total: visitors.length,
    logs: logs.length,
  }), [faces, visitors, logs]);

  // Visitor check-out function
  const handleCheckOut = async (visitorId: string) => {
    try {
      const res = await fetch("/api/visitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: visitorId }),
      });
      if (!res.ok) throw new Error("Failed to check out.");
      loadData(); // reload dashboard data
    } catch (err: any) {
      alert(err.message || "Checkout failed.");
    }
  };

  // Search filter for visitors
  const filteredVisitors = useMemo(() => {
    return visitors.filter((v) => {
      const term = searchTerm.toLowerCase();
      return (
        v.full_name.toLowerCase().includes(term) ||
        (v.company_name && v.company_name.toLowerCase().includes(term)) ||
        v.purpose_of_visit.toLowerCase().includes(term)
      );
    });
  }, [visitors, searchTerm]);

  // Split visitors for Kanban View
  const kanbanColumns = useMemo(() => {
    return {
      active: filteredVisitors.filter((v) => !v.check_out_time),
      completed: filteredVisitors.filter((v) => !!v.check_out_time),
    };
  }, [filteredVisitors]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-panel)] text-[var(--text-primary)]">Loading Sentinel Core...</div>;

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden font-sans text-[var(--text-primary)] selection:bg-indigo-500/20"
      style={{
        backgroundImage: `url('${BG_IMAGE}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Premium Ambient Glass Overlay */}
      <div className="absolute inset-0 bg-[var(--bg-deep)]/60 backdrop-blur-[6px] z-0"></div>
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-deep)]/70 via-[var(--bg-deep)]/30 to-[var(--bg-deep)]/10 z-0"></div>

      <div className="relative z-10 w-full p-[5px] space-y-6">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>


          </div>

          <div className="flex items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-xl px-4 py-2 shadow-sm">
            <div className="text-right">
              <div className="text-2xl font-mono font-semibold leading-none text-[var(--text-primary)]">
                {currentTime.toLocaleTimeString([], { hour12: false })}
              </div>
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
                {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div className="h-8 w-[1px] bg-[var(--border-strong)] mx-2" />
            <div className="flex flex-col items-center">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] text-emerald-600 font-bold mt-1">LIVE</span>
            </div>
          </div>
        </header>

        {/* KPI Grid - Premium Gradients */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Enrolled Hosts"
            value={metrics.enrolled}
            icon={Users}
            gradient="linear-gradient(135deg, #20002c 0%, #583d72 50%, #cbb4d4 100%)"
            trend="+12%"
            onClick={() => setActiveDrawer("kpi-enrolled")}
          />
          <KpiCard
            title="Active Guests"
            value={metrics.active}
            icon={UserCheck}
            gradient="linear-gradient(135deg, #063e26 0%, #059669 100%)"
            subLabel="Inside Building"
            onClick={() => setActiveDrawer("kpi-active")}
          />
          <KpiCard
            title="Total Visits"
            value={metrics.total}
            icon={Calendar}
            gradient="linear-gradient(135deg, #3c1e03 0%, #d97706 100%)"
            trend="+5%"
            onClick={() => setActiveDrawer("kpi-total")}
          />
          <KpiCard
            title="Face Detections"
            value={metrics.logs}
            icon={Eye}
            gradient="linear-gradient(135deg, #3b0712 0%, #dc2626 100%)"
            subLabel="Last 24 hours"
            onClick={() => setActiveDrawer("kpi-logs")}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Traffic Chart */}
          <div className="lg:col-span-2 glass-panel p-6 rounded-2xl min-h-[350px]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Activity size={18} className="text-indigo-600" />
                Visitor Traffic Trend
              </h3>
              <select className="bg-[var(--bg-input)] border border-[var(--border-strong)] text-xs rounded-lg px-2 py-1 outline-none text-[var(--text-secondary)] focus:border-indigo-500">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
              </select>
            </div>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={generateMockChartData()}>
                  <defs>
                    <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-strong)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                  <Area type="monotone" dataKey="visits" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorTraffic)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Traffic breakdown */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Visit Purpose</h3>
            <div className="h-[180px] w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Meeting', value: 45, color: COLORS.indigo },
                      { name: 'Interview', value: 25, color: COLORS.emerald },
                      { name: 'Delivery', value: 20, color: COLORS.amber },
                      { name: 'Other', value: 10, color: COLORS.rose },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {[
                      { name: 'Meeting', value: 45, color: COLORS.indigo },
                      { name: 'Interview', value: 25, color: COLORS.emerald },
                      { name: 'Delivery', value: 20, color: COLORS.amber },
                      { name: 'Other', value: 10, color: COLORS.rose },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="var(--bg-card)" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-strong)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-[var(--text-primary)]">{metrics.total}</span>
                <span className="text-xs text-[var(--text-muted)] uppercase">Total</span>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {['Meeting', 'Interview', 'Delivery', 'Other'].map((item, i) => (
                <div key={item} className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: [COLORS.indigo, COLORS.emerald, COLORS.amber, COLORS.rose][i] }} />
                    <span className="text-[var(--text-secondary)]">{item}</span>
                  </div>
                  <span className="font-mono text-[var(--text-muted)]">{[45, 25, 20, 10][i]}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Activity Log Section */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
            <Activity size={18} className="text-indigo-600" />
            Recent Activity
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
            {logs.slice(0, 20).map((log, idx) => (
              <div key={log.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full ${log.status === 'Authorized' ? 'bg-emerald-500' : log.status === 'Flagged' ? 'bg-amber-500' : 'bg-red-500'}`} />
                  {idx < Math.min(logs.length, 20) - 1 && (
                    <div className="w-[1px] h-6 bg-[var(--border)] mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{log.person_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${log.status === 'Authorized' ? 'bg-emerald-500/10 text-emerald-600' : log.status === 'Flagged' ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600'}`}>
                      {log.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                    {log.confidence.toFixed(1)}% confidence
                  </div>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap flex-shrink-0">
                  {timeAgo(log.timestamp)}
                </span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                <Activity className="mx-auto opacity-20 mb-2" size={24} />
                <p>No face detection events yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Visitor Directory Section - Kanban, Grid, List views */}
        <div className="glass-panel rounded-2xl overflow-hidden shadow-md">
          {/* Header & View Mode Selectors */}
          <div className="p-6 border-b border-[var(--border)] flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[var(--bg-hover)]/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-600">
                <Camera size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">Visitor Directory</h3>
                <p className="text-xs text-[var(--text-muted)]">Live presence monitor & activity ledger</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={15} />
                <input
                  type="text"
                  placeholder="Search visitors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-lg pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* View Selector Buttons */}
              <div className="flex items-center bg-[var(--bg-hover)]/80 p-1 rounded-lg border border-[var(--border-strong)]">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all ${viewMode === "list"
                    ? "bg-[var(--bg-card)] text-indigo-600 shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  title="List View"
                >
                  <List size={14} />
                  <span>List</span>
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all ${viewMode === "grid"
                    ? "bg-[var(--bg-card)] text-indigo-600 shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  title="Grid View"
                >
                  <LayoutGrid size={14} />
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`p-1.5 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all ${viewMode === "kanban"
                    ? "bg-[var(--bg-card)] text-indigo-600 shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  title="Kanban View"
                >
                  <Kanban size={14} />
                  <span>Kanban</span>
                </button>
              </div>
            </div>
          </div>

          {/* VIEW: List View (Table) */}
          {viewMode === "list" && (
            <div className="overflow-x-auto w-full">
              {filteredVisitors.length === 0 ? (
                <div className="text-center py-16 text-[var(--text-muted)]">
                  <UserCheck className="mx-auto opacity-30 mb-2" size={32} />
                  <p className="text-sm font-medium">No check-ins found matching query.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--bg-hover)]/80 text-[var(--text-muted)] uppercase text-[11px] font-bold tracking-wider border-b border-[var(--border)]">
                    <tr>
                      <th className="px-6 py-4">Visitor</th>
                      <th className="px-6 py-4">Purpose</th>
                      <th className="px-6 py-4">Contact</th>
                      <th className="px-6 py-4">Check-in Time</th>
                      <th className="px-6 py-4">Status & Presence</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredVisitors.map((visitor) => (
                      <tr key={visitor.visitor_id} className="hover:bg-[var(--bg-hover)]/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] overflow-hidden border border-[var(--border-strong)] flex-shrink-0 relative">
                              {visitor.photo_image ? (
                                <>
                                  <img src={visitor.photo_image} alt="" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Video size={14} className="text-white drop-shadow-md" />
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-bold bg-[var(--bg-hover)]">
                                  {visitor.full_name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-[var(--text-primary)]">{visitor.full_name}</div>
                              <div className="text-xs text-[var(--text-muted)]">{visitor.company_name || "Personal Visit"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${visitor.purpose_of_visit === 'Meeting' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                            visitor.purpose_of_visit === 'Interview' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                              visitor.purpose_of_visit === 'Delivery' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                'bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border)]'
                            }`}>
                            {visitor.purpose_of_visit}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[var(--text-secondary)] text-xs">
                          <div>{visitor.phone}</div>
                          {visitor.id_proof_number && (
                            <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">ID: {visitor.id_proof_number}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[var(--text-muted)] font-mono text-xs">
                          {new Date(visitor.check_in_time).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-6 py-4">
                          {!visitor.check_out_time ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full text-xs font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active Inside
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--text-muted)] bg-[var(--bg-hover)] border border-[var(--border)] px-2 py-0.5 rounded-full text-xs">
                              Out: {new Date(visitor.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!visitor.check_out_time ? (
                            <button
                              onClick={() => handleCheckOut(visitor.visitor_id)}
                              className="text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-3 py-1.5 rounded-xl font-bold transition-all shadow-sm flex items-center gap-1 ml-auto"
                            >
                              <LogOut size={13} />
                              Check Out
                            </button>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)] font-medium pr-2">Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* VIEW: Grid View */}
          {viewMode === "grid" && (
            <div className="p-6">
              {filteredVisitors.length === 0 ? (
                <div className="text-center py-16 text-[var(--text-muted)]">
                  <UserCheck className="mx-auto opacity-30 mb-2" size={32} />
                  <p className="text-sm font-medium">No check-ins found matching query.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredVisitors.map((visitor) => (
                    <div
                      key={visitor.visitor_id}
                      className="glass border border-[var(--border)]/60 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                    >
                      {/* Photo Header */}
                      <div className="aspect-video relative bg-[var(--bg-hover)] overflow-hidden border-b border-[var(--border)] flex-shrink-0">
                        {visitor.photo_image ? (
                          <>
                            <img src={visitor.photo_image} alt="" className="w-full h-full object-cover" />
                            {/* Scanning overlay for active presence */}
                            {!visitor.check_out_time && (
                              <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none">
                                <div className="absolute inset-x-0 top-0 h-[2px] bg-emerald-400 opacity-60 animate-bounce" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-bold bg-[var(--bg-hover)] text-2xl">
                            {visitor.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}

                        {/* Purpose badge overlay */}
                        <div className="absolute bottom-2 left-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold shadow-sm ${visitor.purpose_of_visit === 'Meeting' ? 'bg-indigo-600 text-white' :
                            visitor.purpose_of_visit === 'Interview' ? 'bg-emerald-600 text-white' :
                              visitor.purpose_of_visit === 'Delivery' ? 'bg-amber-600 text-white' :
                                'bg-slate-600 text-white'
                            }`}>
                            {visitor.purpose_of_visit}
                          </span>
                        </div>

                        {/* Status/Presence indicator */}
                        <div className="absolute top-2 right-2">
                          {!visitor.check_out_time ? (
                            <span className="flex items-center gap-1 bg-emerald-600/90 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm backdrop-blur-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                              Inside
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 bg-slate-800/80 text-slate-200 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm">
                              Departed
                            </span>
                          )}
                        </div>
                      </div>

                        {/* Card Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-[var(--text-primary)] text-sm leading-snug line-clamp-1">{visitor.full_name}</h4>
                          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5 font-medium line-clamp-1">{visitor.company_name || "Personal Visit"}</p>

                          <div className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                              <span className="font-mono">In: {new Date(visitor.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {visitor.check_out_time && (
                              <div className="flex items-center gap-2">
                                <LogOut size={12} className="text-[var(--text-muted)] flex-shrink-0" />
                                <span className="font-mono">Out: {new Date(visitor.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">ID: {visitor.id_proof_number || "None"}</span>
                          {!visitor.check_out_time ? (
                            <button
                              onClick={() => handleCheckOut(visitor.visitor_id)}
                              className="text-[11px] bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-2.5 py-1.5 rounded-lg font-bold transition-all shadow-sm flex items-center gap-1"
                            >
                              <LogOut size={11} />
                              Checkout
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-0.5">
                              <CheckCircle size={11} /> Verified
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW: Kanban View */}
          {viewMode === "kanban" && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px]">

              {/* Column 1: Active Presence Column */}
              <div className="bg-[var(--bg-hover)]/50 border border-[var(--border)]/50 rounded-2xl p-4 flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-[var(--border-strong)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                    <h4 className="font-bold text-[var(--text-primary)] text-sm">Active Inside</h4>
                  </div>
                  <span className="text-[10px] bg-emerald-100/80 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md font-bold">
                    {kanbanColumns.active.length} Guests
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scrollbar pr-1">
                  {kanbanColumns.active.length === 0 ? (
                    <div className="text-center py-16 text-[var(--text-muted)] text-xs">
                      <UserCheck className="mx-auto opacity-20 mb-2" size={24} />
                      <p>No active visitors in the building.</p>
                    </div>
                  ) : (
                    kanbanColumns.active.map((visitor) => (
                      <div
                        key={visitor.visitor_id}
                        className="glass border border-[var(--border-strong)]/80 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow relative"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-lg bg-[var(--bg-hover)] overflow-hidden border border-[var(--border-strong)] flex-shrink-0">
                            {visitor.photo_image ? (
                              <img src={visitor.photo_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-bold bg-[var(--bg-hover)]">
                                {visitor.full_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-2">
                              <h5 className="font-bold text-[var(--text-primary)] text-xs leading-snug line-clamp-1">{visitor.full_name}</h5>
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 text-[9px] font-bold whitespace-nowrap">
                                {visitor.purpose_of_visit}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 leading-none line-clamp-1">{visitor.company_name || "Personal"}</p>

                            <div className="mt-2.5 flex items-center justify-between">
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">In: {new Date(visitor.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <button
                                onClick={() => handleCheckOut(visitor.visitor_id)}
                                className="text-[10px] bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-2 py-1 rounded-md font-bold transition-all shadow-sm flex items-center gap-0.5"
                              >
                                <LogOut size={10} />
                                Checkout
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Column 2: Completed Visits Column */}
              <div className="bg-[var(--bg-hover)]/50 border border-[var(--border)]/50 rounded-2xl p-4 flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-[var(--border-strong)]">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <CheckCircle size={15} />
                    <h4 className="font-bold text-[var(--text-primary)] text-sm">Completed Visits</h4>
                  </div>
                  <span className="text-[10px] bg-[var(--bg-hover)]/80 border border-[var(--border-strong)] text-[var(--text-secondary)] px-2 py-0.5 rounded-md font-bold">
                    {kanbanColumns.completed.length} History
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scrollbar pr-1">
                  {kanbanColumns.completed.length === 0 ? (
                    <div className="text-center py-16 text-[var(--text-muted)] text-xs">
                      <LogOut className="mx-auto opacity-20 mb-2" size={24} />
                      <p>No completed visits logged today.</p>
                    </div>
                  ) : (
                    kanbanColumns.completed.map((visitor) => (
                      <div
                        key={visitor.visitor_id}
                        className="glass border border-[var(--border-strong)]/40 rounded-xl p-3.5 shadow-sm opacity-85"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-lg bg-[var(--bg-hover)] overflow-hidden border border-[var(--border)]/60 flex-shrink-0 filter grayscale-[40%]">
                            {visitor.photo_image ? (
                              <img src={visitor.photo_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-bold bg-[var(--bg-hover)]">
                                {visitor.full_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between items-start gap-2">
                              <h5 className="font-semibold text-[var(--text-secondary)] text-xs leading-snug line-clamp-1">{visitor.full_name}</h5>
                              <span className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-strong)] text-[9px] font-semibold whitespace-nowrap">
                                {visitor.purpose_of_visit}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5 leading-none line-clamp-1">{visitor.company_name || "Personal"}</p>

                            <div className="mt-2.5 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                              <span>In: {new Date(visitor.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span className="text-emerald-600 font-bold flex items-center gap-0.5 bg-emerald-50 px-1 py-0.5 rounded">
                                <CheckCircle size={10} /> Out
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* Off-Canvas Drawers */}
      <DetailDrawer
        isOpen={!!activeDrawer}
        onClose={() => setActiveDrawer(null)}
        type={activeDrawer}
        data={{ visitors, faces, logs }}
      />
      {styleTag}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function KpiCard({ title, value, icon: Icon, gradient, trend, subLabel, onClick }: any) {
  return (
    <div
      onClick={onClick}
      style={{ background: gradient }}
      className="p-5 rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-white/10 group relative overflow-hidden"
    >
      {/* Glossy inner reflex background overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="p-2.5 rounded-xl bg-white/15 text-white border border-white/10 shadow-sm flex items-center justify-center">
          <Icon size={22} />
        </div>
        {trend && (
          <span className="flex items-center text-xs font-bold text-white bg-white/15 px-2 py-0.5 rounded-full border border-white/10">
            {trend} <ArrowUpRight size={12} className="ml-1" />
          </span>
        )}
      </div>
      <div className="relative z-10">
        <h4 className="text-white/70 text-xs font-bold uppercase tracking-wider mb-1">{title}</h4>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-white tracking-tight leading-none">{value}</span>
          {subLabel && <span className="text-xs text-white/60 font-semibold">{subLabel}</span>}
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center text-xs text-white/70 group-hover:text-white transition-colors relative z-10">
        View Database Registry <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );
}

function DetailDrawer({ isOpen, onClose, type, data }: any) {
  if (!isOpen) return null;

  const getTitle = () => {
    switch (type) {
      case 'kpi-enrolled': return "Enrolled Personnel Database";
      case 'kpi-active': return "Currently Active Visitors";
      case 'kpi-total': return "Historical Visitor Ledger";
      case 'kpi-logs': return "Security Detection Logs";
      default: return "Details";
    }
  };

  const renderContent = () => {
    if (type === 'kpi-enrolled') {
      return (
        <div className="space-y-3">
          {data.faces.map((face: RegisteredFace) => (
            <div key={face.id} className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)] hover:bg-[var(--bg-hover)]/70 transition-colors">
              <img src={face.photo_url} alt="" className="w-12 h-12 rounded-full object-cover border border-[var(--border-strong)]" />
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{face.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{face.department}</div>
              </div>
              <div className="ml-auto text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 font-bold">Verified</div>
            </div>
          ))}
        </div>
      );
    }
    if (type === 'kpi-active') {
      const active = data.visitors.filter((v: Visitor) => !v.check_out_time);
      if (active.length === 0) return <div className="text-[var(--text-muted)] text-center py-10">No active visitors currently.</div>;
      return (
        <div className="space-y-3">
          {active.map((v: Visitor) => (
            <div key={v.visitor_id} className="p-4 rounded-lg bg-[var(--bg-hover)] border border-[var(--border)]">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-hover)] overflow-hidden border border-[var(--border-strong)] flex-shrink-0">
                    {v.photo_image && <img src={v.photo_image} className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <div className="text-[var(--text-primary)] font-semibold">{v.full_name}</div>
                    <div className="text-xs text-[var(--text-muted)] font-medium">{v.company_name || "Personal"}</div>
                  </div>
                </div>
                <span className="text-xs text-emerald-600 font-bold font-mono">IN: {new Date(v.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (type === 'kpi-logs') {
      return (
        <div className="space-y-2">
          {data.logs.map((log: FaceLog) => (
            <div key={log.id} className="flex items-center justify-between p-3 rounded bg-[var(--bg-hover)] border border-[var(--border)] border-l-2 border-l-indigo-500">
              <div>
                <div className="text-sm text-[var(--text-primary)] font-semibold">{log.person_name}</div>
                <div className="text-xs text-[var(--text-muted)]">{new Date(log.timestamp).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className={`text-xs font-extrabold ${log.confidence > 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {log.confidence.toFixed(1)}% Match
                </div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold mt-0.5">{log.status}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    return <div className="text-[var(--text-muted)]">Data visualization not available for this view.</div>;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-[var(--bg-panel)] border-l border-[var(--border-strong)] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
        <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-hover)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{getTitle()}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Real-time data stream</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-hover)] rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {renderContent()}
        </div>

        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-hover)] text-center text-xs text-[var(--text-muted)]">
          End of records
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateMockChartData() {
  return [
    { name: 'Mon', visits: 40 },
    { name: 'Tue', visits: 30 },
    { name: 'Wed', visits: 65 },
    { name: 'Thu', visits: 45 },
    { name: 'Fri', visits: 80 },
    { name: 'Sat', visits: 20 },
    { name: 'Sun', visits: 15 },
  ];
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

/* 
   Note: Ensure your tailwind.config.js includes these extensions or use standard classes.
   For this component, I've used standard Tailwind utility classes combined with a custom .glass-panel class below.
*/

const styleTag = (
  <style>{`
    .glass-panel {
      background: var(--bg-card);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
      transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    }
    
    /* Custom Scrollbar for the drawer */
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: var(--bg-input);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: 99px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: var(--text-muted);
    }
  `}</style>
);