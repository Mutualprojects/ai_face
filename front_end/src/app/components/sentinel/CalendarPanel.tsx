"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  Calendar as CalendarIcon,
  Clock,
  Users,
  UserCheck,
  Briefcase,
  PackageCheck,
  X,
  PenLine,
  ChevronDown,
  Activity,
  Fingerprint,
  CheckCircle2,
  Phone,
  Building,
  User,
  ShieldAlert,
  CreditCard,
  BarChart3,
  Radio,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Design tokens                                                      */
/*  ink        #14162B  primary text                                   */
/*  paper      #F4F5FA  app background wash                            */
/*  surface    #FFFFFF  card surface                                   */
/*  line       #E7E5F2  hairline border (violet-tinted)                */
/*  accent     #4838EB  primary / "Meeting" access-badge indigo        */
/*  teal       #0D8F82  "Active / Authorized" signal                   */
/*  amber      #B8720F  "Delivery" signal                              */
/*  rose       #C31C55  "Interview / Flagged" signal                   */
/*  slate      #5B5770  "Other / Unknown" signal                       */
/*  Display face: Space Grotesk · Body: Inter · Data/mono: JetBrains Mono */
/* ------------------------------------------------------------------ */

const TOKENS = {
  ink: "#14162B",
  paper: "#F4F5FA",
  surface: "#FFFFFF",
  line: "#E7E5F2",
  accent: "#4838EB",
  accentSoft: "#EFEDFF",
  teal: "#0D8F82",
  tealSoft: "#E7F8F6",
  amber: "#B8720F",
  amberSoft: "#FBF1DF",
  rose: "#C31C55",
  roseSoft: "#FCEAF0",
  slate: "#5B5770",
  slateSoft: "#F1F0F5",
};

function purposeColors(purpose: string) {
  switch (purpose) {
    case "Meeting":
      return { fg: TOKENS.accent, bg: TOKENS.accentSoft };
    case "Interview":
      return { fg: TOKENS.rose, bg: TOKENS.roseSoft };
    case "Delivery":
      return { fg: TOKENS.amber, bg: TOKENS.amberSoft };
    default:
      return { fg: TOKENS.slate, bg: TOKENS.slateSoft };
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ViewMode = "day" | "week" | "month";

interface RegisteredFace {
  id: string;
  name: string;
  photo_url: string;
  created_at: string;
  department?: string;
}

interface Visitor {
  visitor_id: string;
  full_name: string;
  phone: string;
  company_name: string | null;
  id_proof_number: string | null;
  photo_image: string | null;
  signature_image: string | null;
  meet_employee_id: string;
  purpose_of_visit: "Meeting" | "Interview" | "Delivery" | "Other";
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

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  startTime: string;
  endTime: string;
  color: string;
  colorBg: string;
  type: "Meeting" | "Interview" | "Delivery" | "Other";
  location?: string;
  guests: {
    name: string;
    avatar?: string;
    status: "yes" | "no" | "awaiting";
  }[];
  description?: string;
  reminderMin?: number;
  originalVisitor: Visitor;
  originalHost?: RegisteredFace;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekDates(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

function getMonthDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: Date[] = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push(new Date(year, month - 1, prevDays - i));
  for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push(new Date(year, month + 1, i));
  return cells;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function parseStartHour(ev: CalendarEvent): number {
  const checkIn = new Date(ev.originalVisitor.check_in_time);
  return checkIn.getHours() + checkIn.getMinutes() / 60;
}

function eventDurationH(ev: CalendarEvent): number {
  const start = new Date(ev.originalVisitor.check_in_time);
  const end = ev.originalVisitor.check_out_time
    ? new Date(ev.originalVisitor.check_out_time)
    : new Date(start.getTime() + 1.5 * 60 * 60 * 1000);
  return Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60), 0.75);
}

const EVENT_TYPE_ICONS: Record<string, React.ElementType> = {
  Meeting: Users,
  Interview: UserCheck,
  Delivery: PackageCheck,
  Other: Briefcase,
};

/* ------------------------------------------------------------------ */
/*  Small shared UI atoms                                               */
/* ------------------------------------------------------------------ */

function BadgeChip({ ev, dense = false }: { ev: CalendarEvent; dense?: boolean }) {
  return (
    <span
      className="relative inline-flex items-center gap-1.5 rounded-md pl-3 pr-2 py-0.5 max-w-full"
      style={{ backgroundColor: ev.colorBg, color: ev.color }}
    >
      <span
        className="absolute -left-[3px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: TOKENS.paper, boxShadow: `0 0 0 1.5px ${ev.color}55 inset` }}
      />
      <span className={`truncate font-semibold ${dense ? "text-[10px]" : "text-xs"}`}>{ev.title}</span>
    </span>
  );
}

function ScanLine() {
  return (
    <div className="absolute left-0 right-0 flex items-center z-10 pointer-events-none" style={{ top: 0 }}>
      <span
        className="w-2.5 h-2.5 rounded-full -ml-1 shrink-0"
        style={{ backgroundColor: TOKENS.accent, boxShadow: `0 0 0 4px ${TOKENS.accent}22` }}
      />
      <div
        className="flex-1 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${TOKENS.accent}, ${TOKENS.accent}00)` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function CalendarPanel() {
  const [view, setView] = useState<ViewMode>("week");
  const [viewDropdown, setViewDropdown] = useState(false);
  const [anchor, setAnchor] = useState(new Date());

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [registeredFaces, setRegisteredFaces] = useState<RegisteredFace[]>([]);
  const [faceLogs, setFaceLogs] = useState<FaceLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showAnalyticsDrawer, setShowAnalyticsDrawer] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [miniMonth, setMiniMonth] = useState({ y: anchor.getFullYear(), m: anchor.getMonth() });
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    try {
      const resFaces = await fetch("/api/registered_faces").catch(() => null);
      const resVisitors = await fetch("/api/visitors").catch(() => null);
      const resLogs = await fetch("/api/face_logs").catch(() => null);

      if (resFaces?.ok) setRegisteredFaces(await resFaces.json());
      if (resVisitors?.ok) setVisitors(await resVisitors.json());
      if (resLogs?.ok) setFaceLogs(await resLogs.json());
    } catch (err) {
      console.error("Calendar data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 8000);
    return () => clearInterval(timer);
  }, [loadData]);

  const events: CalendarEvent[] = useMemo(() => {
    return visitors.map(v => {
      const checkIn = new Date(v.check_in_time);
      const checkOut = v.check_out_time
        ? new Date(v.check_out_time)
        : new Date(checkIn.getTime() + 1.5 * 60 * 60 * 1000);

      const host = registeredFaces.find(f => f.id === v.meet_employee_id);
      const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const purpose = v.purpose_of_visit || "Meeting";
      const { fg, bg } = purposeColors(purpose);

      return {
        id: v.visitor_id,
        title: `${v.full_name}`,
        date: checkIn,
        startTime: formatTime(checkIn),
        endTime: formatTime(checkOut),
        color: fg,
        colorBg: bg,
        type: purpose,
        location: v.company_name ? `From: ${v.company_name}` : "Personal Visit",
        guests: [
          { name: v.full_name, avatar: v.photo_image || undefined, status: "yes" as const },
          ...(host ? [{ name: host.name, avatar: host.photo_url || undefined, status: "yes" as const }] : [])
        ],
        description: `Phone: ${v.phone}\nID Proof: ${v.id_proof_number || "N/A"}\nHost: ${host ? host.name : "Unknown Host"}`,
        originalVisitor: v,
        originalHost: host,
      };
    });
  }, [visitors, registeredFaces]);

  const eventsOnDay = useCallback((day: Date) => events.filter(e => isSameDay(e.date, day)), [events]);

  const navigate = (dir: 1 | -1) => {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + dir);
    else if (view === "week") next.setDate(next.getDate() + 7 * dir);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
    setSelectedDay(next);
    setMiniMonth({ y: next.getFullYear(), m: next.getMonth() });
  };

  const goToday = () => {
    const now = new Date();
    setAnchor(now);
    setSelectedDay(now);
    setMiniMonth({ y: now.getFullYear(), m: now.getMonth() });
  };

  const weekNum = useMemo(() => {
    const start = new Date(anchor.getFullYear(), 0, 1);
    const days = Math.floor((anchor.getTime() - start.getTime()) / 86400000);
    return Math.ceil((days + start.getDay() + 1) / 7);
  }, [anchor]);

  const weekDates = useMemo(() => getWeekDates(anchor), [anchor]);
  const monthDates = useMemo(() => getMonthDates(anchor.getFullYear(), anchor.getMonth()), [anchor]);
  const miniDates = useMemo(() => getMonthDates(miniMonth.y, miniMonth.m), [miniMonth]);

  const currentHourPct = () => {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    return (h / 24) * 100;
  };

  const handleCheckOut = async (visitorId: string) => {
    try {
      const res = await fetch("/api/visitors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: visitorId }),
      });
      if (res.ok) {
        await loadData();
        setSelectedEvent(null);
      } else {
        alert("Failed to checkout visitor. Try again.");
      }
    } catch (err) {
      console.error("PATCH Checkout Error:", err);
    }
  };

  const weeklyAnalytics = useMemo(() => {
    const startOfWeek = weekDates[0];
    const endOfWeek = new Date(weekDates[6]);
    endOfWeek.setHours(23, 59, 59, 999);

    const weekVisitorsList = visitors.filter(v => {
      const checkIn = new Date(v.check_in_time);
      return checkIn >= startOfWeek && checkIn <= endOfWeek;
    });

    const activeCount = weekVisitorsList.filter(v => !v.check_out_time).length;
    const completedCount = weekVisitorsList.filter(v => v.check_out_time).length;

    const daysCount = [0, 0, 0, 0, 0, 0, 0];
    weekVisitorsList.forEach(v => {
      daysCount[new Date(v.check_in_time).getDay()]++;
    });

    const purposeCount = { Meeting: 0, Interview: 0, Delivery: 0, Other: 0 };
    weekVisitorsList.forEach(v => {
      const purpose = v.purpose_of_visit || "Other";
      if (purpose in purposeCount) purposeCount[purpose as keyof typeof purposeCount]++;
      else purposeCount.Other++;
    });

    const hostVisitsMap: Record<string, { count: number; host?: RegisteredFace }> = {};
    weekVisitorsList.forEach(v => {
      const hostId = v.meet_employee_id;
      if (!hostVisitsMap[hostId]) {
        hostVisitsMap[hostId] = { count: 0, host: registeredFaces.find(f => f.id === hostId) };
      }
      hostVisitsMap[hostId].count++;
    });

    const topHosts = Object.values(hostVisitsMap).sort((a, b) => b.count - a.count).slice(0, 5);

    return { total: weekVisitorsList.length, active: activeCount, completed: completedCount, daysCount, purposeCount, topHosts };
  }, [visitors, registeredFaces, weekDates]);

  /* ---------------------------------------------------------------- */
  /*  View grids                                                      */
  /* ---------------------------------------------------------------- */

  function TimelineColumn({ day }: { day: Date }) {
    const dayEvs = eventsOnDay(day);
    const isToday = isSameDay(day, new Date());

    return (
      <div className="relative" style={{ height: `${24 * 56}px` }}>
        {HOURS.map(h => (
          <div key={h} className="absolute w-full border-t" style={{ top: `${h * 56}px`, borderColor: TOKENS.line }} />
        ))}

        {isToday && (
          <div className="absolute inset-x-0" style={{ top: `${currentHourPct()}%` }}>
            <ScanLine />
          </div>
        )}

        {dayEvs.map(ev => {
          const startH = parseStartHour(ev);
          const durH = eventDurationH(ev);
          const top = startH * 56;
          const height = Math.max(durH * 56, 30);

          return (
            <button
              key={ev.id}
              onClick={() => setSelectedEvent(ev)}
              className="absolute left-1 right-1 rounded-lg px-2.5 py-1 text-left overflow-hidden hover:brightness-[0.97] active:scale-[0.99] transition-all duration-150 shadow-sm border-l-[3px] flex flex-col justify-start"
              style={{ top, height, backgroundColor: ev.colorBg, borderColor: ev.color }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                <p className="text-xs font-semibold truncate" style={{ color: TOKENS.ink }}>{ev.title}</p>
              </div>
              {height > 40 && (
                <p className="text-[10px] mt-0.5 truncate pl-3 font-data" style={{ color: `${TOKENS.ink}80` }}>
                  {ev.startTime} – {ev.endTime}
                </p>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function DayView() {
    return (
      <div className="flex flex-col overflow-hidden">
        <div className="grid grid-cols-[48px_1fr] sm:grid-cols-[56px_1fr] border-b sticky top-0 z-10" style={{ borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}E6`, backdropFilter: "blur(10px)" }}>
          <div />
          <div className="py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${TOKENS.ink}66` }}>{DAYS[anchor.getDay()]}</p>
            <div
              className="mt-1.5 w-9 h-9 mx-auto flex items-center justify-center rounded-full text-lg font-display font-bold"
              style={isSameDay(anchor, new Date())
                ? { background: `linear-gradient(135deg, ${TOKENS.accent}, #6B5BFF)`, color: "#fff", boxShadow: `0 4px 10px ${TOKENS.accent}40` }
                : { color: TOKENS.ink }}
            >
              {anchor.getDate()}
            </div>
          </div>
        </div>
        <div className="overflow-y-auto cal-scroll flex-1" style={{ maxHeight: "560px" }}>
          <div className="grid grid-cols-[48px_1fr] sm:grid-cols-[56px_1fr]">
            <div className="relative">
              {HOURS.map(h => (
                <div key={h} className="h-14 flex items-start justify-end pr-2">
                  <span className="text-[9px] sm:text-[10px] font-data font-medium -translate-y-2" style={{ color: `${TOKENS.ink}55` }}>{formatHour(h)}</span>
                </div>
              ))}
            </div>
            <TimelineColumn day={anchor} />
          </div>
        </div>
      </div>
    );
  }

  function WeekView() {
    return (
      <div className="flex flex-col overflow-hidden">
        <div className="overflow-x-auto cal-scroll-x">
          <div className="min-w-[640px]">
            <div className="grid border-b sticky top-0 z-10" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}E6`, backdropFilter: "blur(10px)" }}>
              <div />
              {weekDates.map((day, i) => (
                <div key={i} className="py-2.5 text-center border-l first:border-l-0" style={{ borderColor: TOKENS.line }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${TOKENS.ink}66` }}>{DAYS[day.getDay()]}</p>
                  <button
                    onClick={() => { setAnchor(day); setView("day"); }}
                    className="mt-1 w-8 h-8 mx-auto flex items-center justify-center rounded-full text-xs font-display font-bold transition-all"
                    style={isSameDay(day, new Date())
                      ? { background: `linear-gradient(135deg, ${TOKENS.accent}, #6B5BFF)`, color: "#fff", boxShadow: `0 4px 10px ${TOKENS.accent}40` }
                      : { color: TOKENS.ink }}
                  >
                    {day.getDate()}
                  </button>
                  <div className="flex justify-center gap-0.5 mt-1.5 h-1">
                    {eventsOnDay(day).slice(0, 3).map((ev, j) => (
                      <div key={j} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-y-auto cal-scroll" style={{ maxHeight: "560px" }}>
              <div className="grid" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
                <div className="relative">
                  {HOURS.map(h => (
                    <div key={h} className="h-14 flex items-start justify-end pr-2">
                      <span className="text-[9px] font-data font-medium -translate-y-2" style={{ color: `${TOKENS.ink}55` }}>{formatHour(h)}</span>
                    </div>
                  ))}
                </div>
                {weekDates.map((day, i) => (
                  <div key={i} className="border-l first:border-l-0" style={{ borderColor: TOKENS.line }}>
                    <TimelineColumn day={day} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function MonthView() {
    return (
      <div className="flex flex-col">
        <div className="grid grid-cols-7 text-center border-b sticky top-0 z-10" style={{ borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}E6`, backdropFilter: "blur(10px)" }}>
          {DAYS.map(day => (
            <div key={day} className="py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest" style={{ color: `${TOKENS.ink}55` }}>
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 overflow-y-auto cal-scroll" style={{ maxHeight: "560px" }}>
          {monthDates.map((day, i) => {
            const isThisMonth = day.getMonth() === anchor.getMonth();
            const dayEvs = eventsOnDay(day);
            const isSelected = isSameDay(day, selectedDay);
            const isTod = isSameDay(day, new Date());
            return (
              <div
                key={i}
                onClick={() => { setSelectedDay(day); setAnchor(day); }}
                className="min-h-[76px] sm:min-h-[105px] border-b border-r p-1.5 sm:p-2 cursor-pointer transition-colors flex flex-col"
                style={{
                  borderColor: `${TOKENS.line}A0`,
                  backgroundColor: isSelected ? TOKENS.accentSoft : isThisMonth ? TOKENS.surface : `${TOKENS.paper}`,
                  opacity: isThisMonth ? 1 : 0.55,
                }}
              >
                <div
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-display font-bold mb-1 sm:mb-1.5"
                  style={isTod ? { background: `linear-gradient(135deg, ${TOKENS.accent}, #6B5BFF)`, color: "#fff", boxShadow: `0 2px 6px ${TOKENS.accent}40` } : { color: TOKENS.ink }}
                >
                  {day.getDate()}
                </div>
                <div className="space-y-1 overflow-hidden flex-1">
                  {dayEvs.slice(0, 2).map(ev => (
                    <button
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); setSelectedEvent(ev); }}
                      className="block w-full text-left"
                    >
                      <BadgeChip ev={ev} dense />
                    </button>
                  ))}
                  {dayEvs.length > 2 && (
                    <p className="text-[9px] pl-1 font-bold" style={{ color: `${TOKENS.ink}55` }}>+{dayEvs.length - 2} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Mini Calendar ── */
  function MiniCalendar() {
    return (
      <div className="select-none p-3.5 rounded-2xl border" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-display font-bold tracking-wide" style={{ color: TOKENS.ink }}>{MONTHS[miniMonth.m]} {miniMonth.y}</span>
          <div className="flex gap-0.5">
            <button
              onClick={() => setMiniMonth(p => { const x = new Date(p.y, p.m - 1, 1); return { y: x.getFullYear(), m: x.getMonth() }; })}
              className="p-1 rounded-lg transition-colors"
              style={{ color: `${TOKENS.ink}66` }}
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setMiniMonth(p => { const x = new Date(p.y, p.m + 1, 1); return { y: x.getFullYear(), m: x.getMonth() }; })}
              className="p-1 rounded-lg transition-colors"
              style={{ color: `${TOKENS.ink}66` }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 mb-1.5 text-center">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <div key={i} className="text-[9px] font-bold uppercase tracking-wider py-0.5" style={{ color: `${TOKENS.ink}44` }}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {miniDates.map((day, i) => {
            const isThisMonth = day.getMonth() === miniMonth.m;
            const isTod = isSameDay(day, new Date());
            const isSel = isSameDay(day, selectedDay);
            const count = eventsOnDay(day).length;
            return (
              <button
                key={i}
                onClick={() => { setSelectedDay(day); setAnchor(day); setMiniMonth({ y: day.getFullYear(), m: day.getMonth() }); }}
                className="w-7 h-7 mx-auto rounded-full text-[10px] font-bold flex flex-col items-center justify-center transition-all relative"
                style={
                  isTod
                    ? { background: `linear-gradient(135deg, ${TOKENS.accent}, #6B5BFF)`, color: "#fff", boxShadow: `0 2px 6px ${TOKENS.accent}30` }
                    : isSel
                      ? { backgroundColor: TOKENS.accentSoft, color: TOKENS.accent, fontWeight: 800 }
                      : { color: isThisMonth ? TOKENS.ink : `${TOKENS.ink}30` }
                }
              >
                <span>{day.getDate()}</span>
                {count > 0 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full absolute bottom-0.5"
                    style={{ backgroundColor: isTod ? "#fff" : TOKENS.accent }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Upcoming Events ── */
  function UpcomingEvents() {
    const upcoming = useMemo(() => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return [...events]
        .filter(e => e.date >= todayStart)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 5);
    }, [events]);

    return (
      <div>
        <p className="text-[9px] font-bold uppercase tracking-widest mb-3 pl-1" style={{ color: `${TOKENS.ink}55` }}>Today &amp; upcoming</p>
        <div className="space-y-1.5">
          {upcoming.length === 0 ? (
            <div
              className="text-center text-xs py-6 rounded-xl border border-dashed"
              style={{ color: `${TOKENS.ink}55`, borderColor: TOKENS.line, backgroundColor: TOKENS.surface }}
            >
              No upcoming check-ins
            </div>
          ) : (
            upcoming.map(ev => {
              const Icon = EVENT_TYPE_ICONS[ev.type] || Users;
              const evIsToday = isSameDay(ev.date, new Date());
              return (
                <button
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  className="w-full text-left flex items-center gap-2.5 p-2 rounded-xl border transition-all duration-150 hover:shadow-sm"
                  style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: ev.colorBg }}>
                    <Icon size={14} style={{ color: ev.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: TOKENS.ink }}>{ev.title}</p>
                    <p className="text-[9px] font-data font-medium mt-0.5" style={{ color: `${TOKENS.ink}55` }}>
                      {evIsToday ? "Today" : ev.date.toLocaleDateString([], { month: "short", day: "numeric" })} · {ev.startTime}
                    </p>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  function SidebarContent() {
    return (
      <div className="flex flex-col gap-4">
        <MiniCalendar />
        <UpcomingEvents />
      </div>
    );
  }

  /* ── Interactive Off-Canvas Visitor Drawer ── */
  function VisitorDrawer({ ev, onClose }: { ev: CalendarEvent; onClose: () => void }) {
    const visitor = ev.originalVisitor;
    const host = ev.originalHost;
    const isInside = !visitor.check_out_time;

    return (
      <>
        <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-sm z-40 transition-opacity duration-300 animate-in fade-in" onClick={onClose} />
        <div
          className="fixed inset-y-0 right-0 w-full sm:w-[420px] md:w-[480px] border-l shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-300"
          style={{ backgroundColor: `${TOKENS.paper}F5`, borderColor: TOKENS.line }}
        >
          <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}E6` }}>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider leading-none border"
              style={isInside
                ? { backgroundColor: TOKENS.tealSoft, color: TOKENS.teal, borderColor: `${TOKENS.teal}33` }
                : { backgroundColor: TOKENS.slateSoft, color: TOKENS.slate, borderColor: `${TOKENS.slate}25` }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isInside ? TOKENS.teal : TOKENS.slate }} />
              {isInside ? "Inside" : "Checked out"}
            </span>
            <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: `${TOKENS.ink}55` }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 cal-scroll">
            <div className="p-5 rounded-2xl border shadow-sm flex items-center gap-4" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-white shadow-md relative shrink-0" style={{ backgroundColor: TOKENS.slateSoft }}>
                {visitor.photo_image ? (
                  <img src={visitor.photo_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-display font-bold text-2xl" style={{ color: TOKENS.accent, backgroundColor: TOKENS.accentSoft }}>
                    {visitor.full_name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-display font-bold tracking-tight truncate" style={{ color: TOKENS.ink }}>{visitor.full_name}</h3>
                <p className="text-xs font-semibold flex items-center gap-1 mt-0.5 truncate" style={{ color: `${TOKENS.ink}66` }}>
                  <Building size={12} />
                  {visitor.company_name || "Independent / Personal"}
                </p>
                <div className="mt-2">
                  <span
                    className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                    style={{ backgroundColor: ev.colorBg, color: ev.color, borderColor: `${ev.color}22` }}
                  >
                    {ev.type}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <div className="p-4 border-b flex items-center gap-2" style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}>
                <Fingerprint size={16} style={{ color: TOKENS.accent }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: TOKENS.ink }}>Access parameters</span>
              </div>
              <div className="p-5 space-y-3.5 text-sm font-medium" style={{ color: `${TOKENS.ink}CC` }}>
                <div className="flex items-center gap-3">
                  <Phone size={14} className="shrink-0" style={{ color: `${TOKENS.ink}55` }} />
                  <a href={`tel:${visitor.phone}`} className="font-semibold hover:underline" style={{ color: TOKENS.accent }}>{visitor.phone}</a>
                </div>
                <div className="flex items-center gap-3">
                  <CreditCard size={14} className="shrink-0" style={{ color: `${TOKENS.ink}55` }} />
                  <span>ID proof: <span className="font-data font-bold" style={{ color: TOKENS.ink }}>{visitor.id_proof_number || "None"}</span></span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock size={14} className="shrink-0" style={{ color: `${TOKENS.ink}55` }} />
                  <div className="flex flex-col text-xs font-semibold font-data">
                    <span>IN &nbsp;{new Date(visitor.check_in_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                    {visitor.check_out_time && (
                      <span className="mt-0.5" style={{ color: `${TOKENS.ink}55` }}>OUT {new Date(visitor.check_out_time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <div className="p-4 border-b flex items-center gap-2" style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}>
                <UserCheck size={16} style={{ color: TOKENS.teal }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: TOKENS.ink }}>Host information</span>
              </div>
              <div className="p-5 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl overflow-hidden border shrink-0" style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}>
                  {host?.photo_url ? (
                    <img src={host.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold" style={{ color: `${TOKENS.ink}33` }}>H</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug" style={{ color: TOKENS.ink }}>{host?.name || "Unknown staff member"}</p>
                  <p className="text-xs mt-0.5" style={{ color: `${TOKENS.ink}55` }}>Host ID: <span className="font-data">{visitor.meet_employee_id || "N/A"}</span></p>
                  <p className="text-xs font-semibold mt-1" style={{ color: TOKENS.teal }}>Status: registered host member</p>
                </div>
              </div>
            </div>

            {visitor.signature_image && (
              <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
                <div className="p-4 border-b flex items-center gap-2" style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}>
                  <PenLine size={16} style={{ color: TOKENS.slate }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: TOKENS.ink }}>Acknowledge &amp; sign</span>
                </div>
                <div className="p-5 flex justify-center" style={{ backgroundColor: TOKENS.paper }}>
                  <div className="border rounded-xl p-2.5 max-w-[280px]" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
                    <img src={visitor.signature_image} alt="Visitor signature" className="h-16 object-contain" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 border-t flex justify-end gap-3" style={{ borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}F0` }}>
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold transition-colors" style={{ color: `${TOKENS.ink}66` }}>
              Cancel
            </button>
            {isInside && (
              <button
                onClick={() => handleCheckOut(visitor.visitor_id)}
                className="flex items-center gap-2 text-white px-4.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md"
                style={{ background: `linear-gradient(135deg, ${TOKENS.teal}, #14B8A6)` }}
              >
                <CheckCircle2 size={14} />
                Checkout guest
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  /* ── Interactive Off-Canvas Weekly Analytics Drawer ── */
  function AnalyticsDrawer({ onClose }: { onClose: () => void }) {
    const stats = weeklyAnalytics;

    return (
      <>
        <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-sm z-40 transition-opacity duration-300 animate-in fade-in" onClick={onClose} />
        <div
          className="fixed inset-y-0 right-0 w-full sm:w-[420px] md:w-[480px] border-l shadow-2xl z-50 flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-300"
          style={{ backgroundColor: `${TOKENS.paper}F5`, borderColor: TOKENS.line }}
        >
          <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}E6` }}>
            <div className="flex items-center gap-2" style={{ color: TOKENS.accent }}>
              <BarChart3 size={18} />
              <span className="text-sm font-display font-bold uppercase tracking-wider">Weekly briefing</span>
            </div>
            <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ color: `${TOKENS.ink}55` }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 cal-scroll">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border text-center shadow-sm" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
                <span className="text-[9px] font-bold uppercase block tracking-wider" style={{ color: `${TOKENS.ink}55` }}>Total</span>
                <span className="text-xl font-display font-extrabold block mt-1" style={{ color: TOKENS.ink }}>{stats.total}</span>
              </div>
              <div className="p-3.5 rounded-xl border text-center shadow-sm" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
                <span className="text-[9px] font-bold uppercase block tracking-wider" style={{ color: TOKENS.teal }}>Active</span>
                <span className="text-xl font-display font-extrabold block mt-1" style={{ color: TOKENS.teal }}>{stats.active}</span>
              </div>
              <div className="p-3.5 rounded-xl border text-center shadow-sm" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
                <span className="text-[9px] font-bold uppercase block tracking-wider" style={{ color: TOKENS.accent }}>Completed</span>
                <span className="text-xl font-display font-extrabold block mt-1" style={{ color: TOKENS.accent }}>{stats.completed}</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl border shadow-sm space-y-4" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: TOKENS.ink }}>Daily traffic load</span>
              <div className="space-y-2.5">
                {DAYS.map((day, i) => {
                  const count = stats.daysCount[i];
                  const maxCount = Math.max(...stats.daysCount, 1);
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-8 text-xs font-semibold" style={{ color: `${TOKENS.ink}55` }}>{day}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: TOKENS.paper }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: TOKENS.accent }} />
                      </div>
                      <span className="w-5 text-right text-xs font-bold" style={{ color: TOKENS.ink }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 rounded-2xl border shadow-sm space-y-4" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: TOKENS.ink }}>Purpose breakdown</span>
              <div className="space-y-3.5">
                {[
                  { name: "Meeting", count: stats.purposeCount.Meeting, color: TOKENS.accent },
                  { name: "Interview", count: stats.purposeCount.Interview, color: TOKENS.rose },
                  { name: "Delivery", count: stats.purposeCount.Delivery, color: TOKENS.amber },
                  { name: "Other", count: stats.purposeCount.Other, color: TOKENS.slate },
                ].map(p => {
                  const pct = stats.total > 0 ? (p.count / stats.total) * 100 : 0;
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span style={{ color: TOKENS.ink }}>{p.name}</span>
                        <span style={{ color: p.color }}>{p.count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: TOKENS.paper }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 rounded-2xl border shadow-sm space-y-4" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: TOKENS.ink }}>Top hosts met</span>
              <div className="space-y-3">
                {stats.topHosts.length === 0 ? (
                  <div className="text-center text-xs py-4" style={{ color: `${TOKENS.ink}55` }}>No meetings recorded this week</div>
                ) : (
                  stats.topHosts.map(({ count, host }, i) => (
                    <div key={i} className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-xl border overflow-hidden shrink-0" style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}>
                        {host?.photo_url ? (
                          <img src={host.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold" style={{ color: `${TOKENS.ink}33` }}>H</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-snug" style={{ color: TOKENS.ink }}>{host?.name || "Unknown staff"}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: `${TOKENS.ink}55` }}>Host ID: <span className="font-data">{host?.id || "N/A"}</span></p>
                      </div>
                      <span className="border px-2.5 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: TOKENS.accentSoft, borderColor: `${TOKENS.accent}22`, color: TOKENS.accent }}>
                        {count} visit{count !== 1 && "s"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl border shadow-sm space-y-4" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: TOKENS.ink }}>
                <Activity size={14} style={{ color: TOKENS.accent }} />
                Live camera match log
              </span>
              <div className="space-y-2">
                {faceLogs.length === 0 ? (
                  <div className="text-center text-xs py-4" style={{ color: `${TOKENS.ink}55` }}>No recent detections</div>
                ) : (
                  faceLogs.slice(0, 4).map(log => (
                    <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg border text-xs" style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}>
                      <div className="flex items-center gap-2">
                        {log.status === "Authorized" ? (
                          <CheckCircle2 size={13} style={{ color: TOKENS.teal }} />
                        ) : log.status === "Flagged" ? (
                          <ShieldAlert size={13} style={{ color: TOKENS.rose }} />
                        ) : (
                          <User size={13} style={{ color: `${TOKENS.ink}55` }} />
                        )}
                        <div>
                          <span className="font-bold" style={{ color: TOKENS.ink }}>{log.person_name}</span>
                          <span className="text-[10px] block font-data" style={{ color: `${TOKENS.ink}55` }}>{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                      <span
                        className="font-data font-bold"
                        style={{ color: log.status === "Authorized" ? TOKENS.teal : log.status === "Flagged" ? TOKENS.rose : TOKENS.amber }}
                      >
                        {log.confidence.toFixed(1)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ── Render Main Layout ── */
  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-xl border font-sans"
      style={{ background: `linear-gradient(160deg, ${TOKENS.surface} 0%, ${TOKENS.paper} 100%)`, borderColor: TOKENS.line, color: TOKENS.ink }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 sm:px-4 py-3 border-b gap-2 sm:gap-3 flex-wrap"
        style={{ borderColor: TOKENS.line, backgroundColor: `${TOKENS.surface}CC`, backdropFilter: "blur(10px)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setShowMobileNav(true)}
            className="lg:hidden p-1.5 rounded-lg border mr-0.5 shrink-0"
            style={{ borderColor: TOKENS.line, color: TOKENS.ink }}
            aria-label="Open calendar navigation"
          >
            <Menu size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-base sm:text-lg font-display font-bold truncate" style={{ color: TOKENS.ink }}>{MONTHS[anchor.getMonth()]} {anchor.getFullYear()}</p>
              {view === "week" && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: TOKENS.accentSoft, color: TOKENS.accent }}>Wk {weekNum}</span>
              )}
            </div>
            <p className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: `${TOKENS.ink}66` }}>
              <Radio size={11} style={{ color: TOKENS.teal }} />
              {anchor.toLocaleDateString([], { weekday: "long" })} · live sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setShowAnalyticsDrawer(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm"
            style={{ borderColor: TOKENS.line, backgroundColor: TOKENS.surface, color: TOKENS.accent }}
          >
            <BarChart3 size={14} />
            <span className="hidden sm:inline">Weekly stats</span>
          </button>

          <div className="flex items-center gap-0.5 border rounded-xl px-1 py-0.5 shadow-sm" style={{ borderColor: TOKENS.line, backgroundColor: TOKENS.surface }}>
            <button onClick={() => navigate(-1)} className="p-1 rounded-lg transition-colors" style={{ color: `${TOKENS.ink}80` }}><ChevronLeft size={16} /></button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-bold rounded-lg transition-colors" style={{ color: TOKENS.ink }}>Today</button>
            <button onClick={() => navigate(1)} className="p-1 rounded-lg transition-colors" style={{ color: `${TOKENS.ink}80` }}><ChevronRight size={16} /></button>
          </div>

          {/* View Mode Switcher — segmented on desktop, dropdown on mobile */}
          <div className="hidden md:flex items-center gap-0.5 border rounded-xl p-0.5 shadow-sm" style={{ borderColor: TOKENS.line, backgroundColor: TOKENS.surface }}>
            {(["day", "week", "month"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all"
                style={view === v ? { backgroundColor: TOKENS.accent, color: "#fff" } : { color: `${TOKENS.ink}80` }}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="relative md:hidden">
            <button
              onClick={() => setViewDropdown(v => !v)}
              className="flex items-center gap-1.5 border rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm"
              style={{ borderColor: TOKENS.line, backgroundColor: TOKENS.surface, color: TOKENS.ink }}
            >
              <span className="capitalize">{view}</span>
              <ChevronDown size={12} />
            </button>

            {viewDropdown && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setViewDropdown(false)} />
                <div className="absolute right-0 mt-1.5 w-40 border rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" style={{ backgroundColor: TOKENS.surface, borderColor: TOKENS.line }}>
                  {(["day", "week", "month"] as ViewMode[]).map(v => (
                    <button
                      key={v}
                      onClick={() => { setView(v); setViewDropdown(false); }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm transition-colors"
                      style={{ color: TOKENS.ink }}
                    >
                      <span className="capitalize font-medium">{v} view</span>
                      {view === v && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: TOKENS.accent }} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex">
        {/* Sidebar (desktop) */}
        <div className="hidden lg:flex flex-col w-56 shrink-0 border-r p-4 gap-4 overflow-y-auto cal-scroll" style={{ borderColor: TOKENS.line, maxHeight: "680px" }}>
          <SidebarContent />
        </div>

        {/* Dynamic Calendar Grid */}
        <div className="flex-1 min-w-0 relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-28" style={{ color: `${TOKENS.ink}55` }}>
              <span className="animate-spin rounded-full h-8 w-8 border-b-2 mb-3" style={{ borderColor: TOKENS.accent }} />
              <p className="text-xs font-semibold uppercase tracking-wider">Synchronizing roster…</p>
            </div>
          ) : (
            <>
              {view === "day" && <DayView />}
              {view === "week" && <WeekView />}
              {view === "month" && <MonthView />}
            </>
          )}

          {selectedEvent && <VisitorDrawer ev={selectedEvent} onClose={() => setSelectedEvent(null)} />}
          {showAnalyticsDrawer && <AnalyticsDrawer onClose={() => setShowAnalyticsDrawer(false)} />}

          {/* Mobile sidebar drawer */}
          {showMobileNav && (
            <>
              <div className="fixed inset-0 bg-slate-900/35 backdrop-blur-sm z-40 lg:hidden" onClick={() => setShowMobileNav(false)} />
              <div
                className="fixed inset-y-0 left-0 w-[86%] max-w-[300px] border-r shadow-2xl z-50 flex flex-col lg:hidden animate-in slide-in-from-left duration-300"
                style={{ backgroundColor: TOKENS.paper, borderColor: TOKENS.line }}
              >
                <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: TOKENS.line, backgroundColor: TOKENS.surface }}>
                  <div className="flex items-center gap-2">
                    <CalendarIcon size={16} style={{ color: TOKENS.accent }} />
                    <span className="text-sm font-display font-bold" style={{ color: TOKENS.ink }}>Navigator</span>
                  </div>
                  <button onClick={() => setShowMobileNav(false)} className="p-1.5 rounded-full" style={{ color: `${TOKENS.ink}55` }}>
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 cal-scroll">
                  <SidebarContent />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
        .font-sans { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
        .font-data { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        .cal-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
        .cal-scroll::-webkit-scrollbar-track { background: transparent; }
        .cal-scroll::-webkit-scrollbar-thumb { background: rgba(72,56,235,0.18); border-radius: 10px; }
        .cal-scroll::-webkit-scrollbar-thumb:hover { background: rgba(72,56,235,0.32); }
        .cal-scroll-x::-webkit-scrollbar { height: 5px; }
        .cal-scroll-x::-webkit-scrollbar-track { background: transparent; }
        .cal-scroll-x::-webkit-scrollbar-thumb { background: rgba(72,56,235,0.18); border-radius: 10px; }
        button { cursor: pointer; }
        button:focus-visible { outline: 2px solid ${TOKENS.accent}; outline-offset: 2px; border-radius: 6px; }
      `}</style>
    </div>
  );
}