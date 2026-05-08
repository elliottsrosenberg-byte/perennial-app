"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Reminder } from "@/types/database";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import AshMark from "@/components/ui/AshMark";

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
function openAshCal(message: string) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PX_PER_HOUR  = 64;
const GRID_START   = 6;
const GRID_END     = 23;
const GRID_HOURS   = GRID_END - GRID_START;
const GRID_HEIGHT  = GRID_HOURS * PX_PER_HOUR;
const DAY_HDR_H    = 64;   // fixed height used for sticky top offsets

const DOW_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Date helpers ───────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(anchor: Date): Date[] {
  const start = getWeekStart(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isToday(date: Date): boolean {
  const t = new Date();
  return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function timeToY(hours: number, minutes: number): number {
  return (hours - GRID_START) * PX_PER_HOUR + (minutes / 60) * PX_PER_HOUR;
}

function fmtDate(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-US", opts);
}

function parseReminderDate(due: string): { date: Date; hasTime: boolean } | null {
  const d = new Date(due);
  if (isNaN(d.getTime())) return null;
  return { date: d, hasTime: d.getHours() !== 0 || d.getMinutes() !== 0 };
}

function getDueBadge(due: string): { text: string; color: string } {
  const d    = new Date(due);
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (diff < 0)   return { text: "Overdue",   color: "var(--color-red-orange)" };
  if (diff === 0) return { text: "Today",     color: "#a07800"                 };
  if (diff === 1) return { text: "Tomorrow",  color: "#6b6860"                 };
  return { text: fmtDate(d, { month: "short", day: "numeric" }), color: "var(--color-grey)" };
}

// ── ProjectPicker ──────────────────────────────────────────────────────────────

function ProjectPicker({
  projectId, projects, onChange,
}: {
  projectId: string | null;
  projects: { id: string; title: string }[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const linked          = projects.find(p => p.id === projectId);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[11px] font-medium rounded-full px-[9px] py-[3px] transition-colors"
        style={linked ? {
          background: "rgba(155,163,122,0.14)", color: "#5a7040", border: "0.5px solid rgba(155,163,122,0.25)",
        } : {
          background: "transparent", color: "var(--color-grey)", border: "0.5px dashed var(--color-border)",
        }}
      >
        {linked ? linked.title : "+ Link project"}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-30"
          style={{ minWidth: "180px", background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}
        >
          <button className="w-full text-left px-4 py-[8px] text-[12px] transition-colors"
            style={{ color: "var(--color-grey)" }}
            onClick={() => { onChange(null); setOpen(false); }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >No project</button>
          {projects.map(p => (
            <button key={p.id} className="w-full text-left px-4 py-[8px] text-[12px] transition-colors"
              style={{ color: "#6b6860", fontWeight: p.id === projectId ? 600 : 400 }}
              onClick={() => { onChange(p.id); setOpen(false); }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >{p.title}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MiniCalendar ───────────────────────────────────────────────────────────────

function MiniCalendar({ selectedDate, onSelect }: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(selectedDate); d.setDate(1); d.setHours(0,0,0,0); return d;
  });

  const weekDays    = getWeekDays(selectedDate);
  const today       = new Date(); today.setHours(0,0,0,0);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDow    = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  const cells: (Date | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(month.getFullYear(), month.getMonth(), i + 1)
    ),
  ];

  return (
    <div className="px-3 py-3 shrink-0">
      <div className="flex items-center mb-2">
        <span className="flex-1" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 500 }}>
          {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </span>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <ChevronLeft size={10} />
        </button>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="w-5 h-5 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <ChevronRight size={10} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-[2px]">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold py-[2px]" style={{ color: "var(--color-grey)" }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const isT  = isSameDay(date, today);
          const inWk = weekDays.some(wd => isSameDay(wd, date));
          return (
            <button key={i} onClick={() => onSelect(date)}
              className="w-[26px] h-[26px] mx-auto flex items-center justify-center rounded-full text-[10px] transition-colors"
              style={{
                background: isT ? "var(--color-charcoal)" : inWk ? "var(--color-cream)" : "transparent",
                color: isT ? "var(--color-warm-white)" : inWk ? "var(--color-charcoal)" : "var(--color-grey)",
                fontWeight: isT || inWk ? 600 : 400,
              }}
            >{date.getDate()}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── ReminderPopover ────────────────────────────────────────────────────────────

function ReminderPopover({ reminder, x, y, onMarkComplete, onUndo, onClose }: {
  reminder: Reminder;
  x: number;
  y: number;
  onMarkComplete: () => void;
  onUndo?: () => void;
  onClose: () => void;
}) {
  const ref    = useRef<HTMLDivElement>(null);
  const parsed = reminder.due_date ? parseReminderDate(reminder.due_date) : null;

  useEffect(() => {
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: `${y}px`,
        left: `${x}px`,
        zIndex: 60,
        width: "224px",
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: "12px",
        boxShadow: "0 6px 28px rgba(0,0,0,0.13)",
        padding: "14px",
      }}
    >
      <p className="text-[13px] font-semibold leading-snug mb-[5px]" style={{ color: "var(--color-charcoal)" }}>
        {reminder.title}
      </p>
      {parsed && (
        <p className="text-[11px] mb-3" style={{ color: "var(--color-grey)" }}>
          {parsed.hasTime
            ? parsed.date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : parsed.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </p>
      )}

      {reminder.completed ? (
        <div className="flex gap-2">
          <button
            onClick={() => { onUndo?.(); onClose(); }}
            className="flex-1 text-[12px] font-medium py-[6px] rounded-lg transition-opacity hover:opacity-80"
            style={{ background: "var(--color-cream)", color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)" }}
          >
            Undo complete
          </button>
          <button onClick={onClose}
            className="text-[12px] py-[6px] px-3 rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >Dismiss</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => { onMarkComplete(); onClose(); }}
            className="flex-1 text-[12px] font-medium py-[6px] rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-sage)" }}
          >
            ✓ Mark complete
          </button>
          <button onClick={onClose}
            className="text-[12px] py-[6px] px-3 rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >Dismiss</button>
        </div>
      )}
    </div>
  );
}

// ── NewReminderModal ───────────────────────────────────────────────────────────

function NewReminderModal({ projects, defaultDate, onClose, onCreate }: {
  projects: { id: string; title: string }[];
  defaultDate: string;
  onClose: () => void;
  onCreate: (title: string, dueDate: string | null, projectId: string | null) => void;
}) {
  const [title,     setTitle]     = useState("");
  const [dueDate,   setDueDate]   = useState(defaultDate);
  const [projectId, setProjectId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit() {
    if (!title.trim()) return;
    onCreate(title.trim(), dueDate || null, projectId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(31,33,26,0.35)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl p-6 flex flex-col gap-4"
        style={{ width: "380px", background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 40px rgba(0,0,0,0.15)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>New Reminder</h3>
          <button onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-[18px] leading-none transition-colors"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >×</button>
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          placeholder="Reminder title…"
          className="w-full bg-transparent focus:outline-none text-[14px] font-medium"
          style={{ color: "var(--color-charcoal)", borderBottom: "0.5px solid var(--color-border)", paddingBottom: "6px" }}
        />

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>Date & Time</label>
          <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="text-[12px] bg-transparent focus:outline-none"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)", borderRadius: "6px", padding: "5px 9px" }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>Project</label>
          <ProjectPicker projectId={projectId} projects={projects} onChange={setProjectId} />
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onClose}
            className="px-3 py-[6px] text-[12px] rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >Cancel</button>
          <button onClick={submit} disabled={!title.trim()}
            className="px-4 py-[6px] text-[12px] font-medium rounded-lg text-white transition-opacity"
            style={{ background: "var(--color-sage)", opacity: title.trim() ? 1 : 0.5 }}
          >Add Reminder</button>
        </div>
      </div>
    </div>
  );
}

// ── CalendarClient ─────────────────────────────────────────────────────────────

interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  colorId: string | null;
}

// Google Calendar event colors (colorId → hex)
const GCAL_COLORS: Record<string, string> = {
  "1": "#7986CB", "2": "#33B679", "3": "#8E24AA", "4": "#E67C73",
  "5": "#F6BF26", "6": "#F4511E", "7": "#039BE5", "8": "#616161",
  "9": "#3F51B5", "10": "#0B8043", "11": "#D50000",
};

interface Props {
  initialReminders: Reminder[];
  initialProjects: { id: string; title: string; due_date: string | null; status: string }[];
  gcalConnected?: boolean;
  gcalAccountName?: string | null;
}

interface PopoverState { reminder: Reminder; x: number; y: number }

export default function CalendarClient({ initialReminders, initialProjects, gcalConnected = false, gcalAccountName }: Props) {
  const [viewDate,        setViewDate]        = useState(new Date());
  const [reminders,       setReminders]       = useState(initialReminders);
  const [newReminderOpen, setNewReminderOpen] = useState(false);
  const [popover,         setPopover]         = useState<PopoverState | null>(null);
  const [nowY,            setNowY]            = useState<number | null>(null);
  const [gcalEvents,      setGcalEvents]      = useState<GCalEvent[]>([]);
  const [gcalLoading,     setGcalLoading]     = useState(false);

  const gridWrapRef  = useRef<HTMLDivElement>(null);
  const undoTimers   = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const supabase     = createClient();

  const weekDays = getWeekDays(viewDate);

  // ── Timers cleanup
  useEffect(() => () => { undoTimers.current.forEach(clearTimeout); }, []);

  // ── Current-time line
  useEffect(() => {
    function tick() {
      const now = new Date();
      const y   = timeToY(now.getHours(), now.getMinutes());
      setNowY(y >= 0 && y <= GRID_HEIGHT ? y : null);
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Scroll to current time on mount — offset accounts for sticky headers
  useEffect(() => {
    const now = new Date();
    const y   = timeToY(now.getHours(), now.getMinutes());
    gridWrapRef.current?.scrollTo({ top: Math.max(0, y - 160) });
  }, []);

  // ── Fetch Google Calendar events when week changes
  useEffect(() => {
    if (!gcalConnected) return;
    const days  = getWeekDays(viewDate);
    const start = days[0].toISOString().split("T")[0];
    const end   = days[6].toISOString().split("T")[0];
    setGcalLoading(true);
    fetch(`/api/integrations/google-calendar/events?startDate=${start}&endDate=${end}`)
      .then(r => r.json())
      .then((d: { events?: GCalEvent[] }) => { setGcalEvents(d.events ?? []); setGcalLoading(false); })
      .catch(() => setGcalLoading(false));
  }, [viewDate, gcalConnected]);

  // ── Navigation
  function prevWeek() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  function nextWeek() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }
  function goToday()  { setViewDate(new Date()); }

  // ── Week label
  const ws = weekDays[0];
  const we = weekDays[6];
  const weekLabel =
    ws.getMonth() === we.getMonth()
      ? `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
      : `${fmtDate(ws, { month: "short", day: "numeric" })} – ${fmtDate(we, { month: "short", day: "numeric", year: "numeric" })}`;

  // ── Completion with linger + undo
  function scheduleRemoval(id: string) {
    const existing = undoTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setReminders(prev => prev.filter(r => r.id !== id));
      undoTimers.current.delete(id);
    }, 5000);
    undoTimers.current.set(id, t);
  }

  async function markComplete(id: string) {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completed: true } : r));
    await supabase.from("reminders").update({ completed: true }).eq("id", id);
    scheduleRemoval(id);
  }

  async function undoComplete(id: string) {
    const t = undoTimers.current.get(id);
    if (t) { clearTimeout(t); undoTimers.current.delete(id); }
    setReminders(prev => prev.map(r => r.id === id ? { ...r, completed: false } : r));
    await supabase.from("reminders").update({ completed: false }).eq("id", id);
  }

  // ── Popover
  const openPopover = useCallback((e: React.MouseEvent, reminder: Reminder) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.right + 8 + 224 > window.innerWidth ? rect.left - 232 : rect.right + 8;
    const y = Math.min(rect.top, window.innerHeight - 180);
    setPopover({ reminder, x, y });
  }, []);

  // ── CRUD
  async function createReminder(title: string, dueDate: string | null, projectId: string | null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload: Record<string, unknown> = { user_id: user.id, title };
    if (dueDate)   payload.due_date   = dueDate;
    if (projectId) payload.project_id = projectId;
    const { data } = await supabase.from("reminders").insert(payload).select().single();
    if (data) setReminders(prev => [...prev, data as Reminder]);
  }

  // ── Derived lists (include completed so they linger in view)
  const timedReminders  = reminders.filter(r => r.due_date && parseReminderDate(r.due_date)?.hasTime);
  const allDayReminders = reminders.filter(r => r.due_date && !parseReminderDate(r.due_date)?.hasTime);

  const upcomingReminders = [...reminders]
    .filter(r => r.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  const unscheduledReminders = reminders.filter(r => !r.due_date);

  // ── Default date for new reminder (next round half-hour)
  const defaultNewDate = (() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
    return d.toISOString().slice(0, 16);
  })();

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--color-off-white)" }}>

      {/* ── Left panel ────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col shrink-0 overflow-hidden"
        style={{ width: "216px", borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}
      >
        <MiniCalendar selectedDate={viewDate} onSelect={setViewDate} />
        <div style={{ height: "0.5px", background: "var(--color-border)", flexShrink: 0 }} />

        <div className="flex-1 overflow-y-auto">

          {/* Upcoming (with due date) */}
          <div className="px-3 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>Upcoming</span>
            {upcomingReminders.length > 0 && (
              <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{upcomingReminders.length}</span>
            )}
          </div>

          {upcomingReminders.length === 0 && unscheduledReminders.length === 0 && reminders.length === 0 && (
            <div style={{ padding: "12px 14px 16px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 5 }}>No reminders yet</p>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
                Reminders keep you on top of deadlines, follow-ups, and anything time-sensitive. They also appear in your Home dashboard.
              </p>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)", marginBottom: 6 }}>Tips</p>
              {["Set reminders with a due date to pin them to the calendar grid.", "Reminders linked to projects carry context — you'll see which project they belong to.", "Ash can create reminders for you — just ask it to \"remind me to follow up with X next Thursday\"."].map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: 7, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-sage)", flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                  <p style={{ fontSize: 10, lineHeight: 1.55, color: "#6b6860" }}>{tip}</p>
                </div>
              ))}
            </div>
          )}
          {upcomingReminders.length === 0 && unscheduledReminders.length === 0 && reminders.length > 0 && (
            <p className="px-3 pb-3 text-[11px]" style={{ color: "var(--color-grey)" }}>All caught up.</p>
          )}

          {upcomingReminders.map(r => {
            const badge = getDueBadge(r.due_date!);
            return (
              <div
                key={r.id}
                className="flex items-start gap-2 px-3 py-[8px] transition-colors"
                style={{ borderBottom: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => { if (!r.completed) e.currentTarget.style.background = "var(--color-cream)"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Check circle — direct action */}
                <div
                  onClick={() => r.completed ? undoComplete(r.id) : markComplete(r.id)}
                  className="flex items-center justify-center cursor-pointer rounded-full shrink-0 mt-[1px] transition-colors"
                  style={{
                    width: "16px", height: "16px",
                    border: r.completed ? "none" : "1.5px solid var(--color-border)",
                    background: r.completed ? "var(--color-sage)" : "transparent",
                  }}
                >
                  {r.completed && (
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Title + badge */}
                <div className="flex-1 min-w-0 mt-[-1px]" style={{ opacity: r.completed ? 0.45 : 1 }}>
                  <p
                    className="text-[12px] font-medium leading-snug truncate"
                    style={{ color: "var(--color-charcoal)", textDecoration: r.completed ? "line-through" : "none" }}
                  >
                    {r.title}
                  </p>
                  {!r.completed && <p className="text-[10px] mt-[2px]" style={{ color: badge.color }}>{badge.text}</p>}
                </div>

                {/* Undo link — only when completed/lingering */}
                {r.completed && (
                  <button
                    onClick={() => undoComplete(r.id)}
                    className="text-[10px] font-medium shrink-0 transition-opacity hover:opacity-70"
                    style={{ color: "var(--color-sage)" }}
                  >
                    Undo
                  </button>
                )}
              </div>
            );
          })}

          {/* No date */}
          {unscheduledReminders.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>No date</span>
              </div>
              {unscheduledReminders.map(r => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 px-3 py-[8px] transition-colors"
                  style={{ borderBottom: "0.5px solid var(--color-border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    onClick={() => r.completed ? undoComplete(r.id) : markComplete(r.id)}
                    className="flex items-center justify-center cursor-pointer rounded-full shrink-0 mt-[1px]"
                    style={{ width: "16px", height: "16px", border: "1.5px solid var(--color-border)", background: "transparent" }}
                  />
                  <p className="text-[12px] font-medium leading-snug truncate mt-[-1px]" style={{ color: "var(--color-charcoal)" }}>
                    {r.title}
                  </p>
                </div>
              ))}
            </>
          )}

          {/* Google Calendar connection */}
          {gcalConnected ? (
            <div className="mx-3 mt-5 mb-3 p-3 rounded-lg" style={{ background: "rgba(155,163,122,0.1)", border: "0.5px solid rgba(155,163,122,0.25)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--color-sage)" }} />
                <p className="text-[11px] font-medium" style={{ color: "var(--color-charcoal)" }}>Google Calendar</p>
                {gcalLoading && <span className="text-[9px] ml-auto" style={{ color: "var(--color-grey)" }}>Syncing…</span>}
              </div>
              <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                {gcalAccountName ?? "Connected"} · {gcalEvents.length} event{gcalEvents.length !== 1 ? "s" : ""} this week
              </p>
              <button
                onClick={async () => { await fetch("/api/integrations/google-calendar/events", { method: "DELETE" }); window.location.reload(); }}
                className="text-[10px] mt-2"
                style={{ color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >Disconnect</button>
            </div>
          ) : (
            <div className="mx-3 mt-5 mb-3">
              <button
                onClick={() => window.location.href = "/api/auth/google-calendar"}
                className="w-full flex items-center gap-2 p-3 rounded-lg transition-colors text-left"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-sage)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}
              >
                <svg width="14" height="14" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M43.6 20H24v8.4h11.2C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l6-6C34.5 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.2 19-20 0-1.3-.1-2.7-.4-4z" fill="#4285F4"/>
                </svg>
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "var(--color-charcoal)" }}>Connect Google Calendar</p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>See your events alongside reminders</p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Add reminder */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button
            onClick={() => setNewReminderOpen(true)}
            className="w-full text-[11px] py-[7px] rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "#6b6860"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
          >
            + New reminder
          </button>
        </div>
      </div>

      {/* ── Main calendar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Topbar — outside scroll, always visible */}
        <div
          className="flex items-center gap-2 px-4 shrink-0"
          style={{ height: "48px", background: "var(--color-off-white)", borderBottom: "0.5px solid var(--color-border)" }}
        >
          <span
            className="flex-1"
            style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)", fontSize: "17px", fontWeight: 500, letterSpacing: "-0.015em" }}
          >
            {weekLabel}
          </span>

          <button onClick={goToday}
            className="text-[11px] px-3 py-[5px] rounded-md transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >Today</button>

          <button onClick={prevWeek}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          ><ChevronLeft size={13} /></button>

          <button onClick={nextWeek}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          ><ChevronRight size={13} /></button>

          <div className="flex rounded-md overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-cream)" }}>
            {(["Week","Month"] as const).map(v => (
              <button key={v} className="px-3 py-[5px] text-[11px]"
                style={{
                  background: v === "Week" ? "var(--color-off-white)" : "transparent",
                  color: v === "Week" ? "var(--color-charcoal)" : "var(--color-grey)",
                  fontWeight: v === "Week" ? 600 : 400,
                  opacity: v === "Month" ? 0.45 : 1,
                }}
              >{v}</button>
            ))}
          </div>

          <button
            onClick={() => openAshCal("What's coming up in my calendar this week? Any deadlines or reminders I should know about?")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "transparent", color: "var(--color-ash-dark)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ash-tint)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AshMark size={9} variant="on-dark" />
            </div>
            Ask Ash
          </button>

          <button
            onClick={() => setNewReminderOpen(true)}
            className="flex items-center gap-1.5 px-3 py-[5px] text-[11px] font-medium rounded-md text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-sage)" }}
          >
            <Plus size={11} />
            Reminder
          </button>
        </div>

        {/* ── Single scroll container: day headers + all-day + time grid all share same width ── */}
        <div
          ref={gridWrapRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ position: "relative", background: "var(--color-off-white)" }}
        >

          {/* Day headers — sticky at top of scroll container */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              display: "flex",
              background: "var(--color-off-white)",
              borderBottom: "0.5px solid var(--color-border)",
              height: `${DAY_HDR_H}px`,
            }}
          >
            <div
              style={{
                width: "52px", flexShrink: 0,
                display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
                paddingRight: "8px", paddingBottom: "8px",
                fontSize: "9px", color: "var(--color-grey)", userSelect: "none",
              }}
            >
              {Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? ""}
            </div>
            {weekDays.map((day, i) => {
              const today = isToday(day);
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-center cursor-pointer"
                  style={{
                    borderLeft: "0.5px solid var(--color-border)",
                    background: today ? "rgba(155,163,122,0.07)" : "transparent",
                  }}
                  onClick={() => setViewDate(day)}
                  onMouseEnter={e => { if (!today) e.currentTarget.style.background = "var(--color-warm-white)"; }}
                  onMouseLeave={e => { if (!today) e.currentTarget.style.background = today ? "rgba(155,163,122,0.07)" : "transparent"; }}
                >
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider mb-[3px]"
                    style={{ color: today ? "var(--color-charcoal)" : "var(--color-grey)" }}
                  >
                    {DOW_SHORT[day.getDay()]}
                  </span>
                  <span
                    className="w-8 h-8 flex items-center justify-center rounded-full"
                    style={{
                      background: today ? "var(--color-charcoal)" : "transparent",
                      color: today ? "var(--color-warm-white)" : "var(--color-charcoal)",
                      fontSize: today ? "15px" : "19px",
                      fontWeight: today ? 600 : 300,
                    }}
                  >
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* All-day row — sticky just below day headers */}
          <div
            style={{
              position: "sticky",
              top: `${DAY_HDR_H}px`,
              zIndex: 19,
              display: "flex",
              background: "var(--color-off-white)",
              borderBottom: "0.5px solid var(--color-border)",
              minHeight: "30px",
            }}
          >
            <div
              style={{
                width: "52px", flexShrink: 0,
                display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                paddingRight: "8px", paddingTop: "6px",
                fontSize: "9px", color: "var(--color-grey)",
              }}
            >
              All day
            </div>
            {weekDays.map((day, i) => {
              const dayReminders  = allDayReminders.filter(r => isSameDay(new Date(r.due_date!), day));
              const dayProjects   = initialProjects.filter(p => p.due_date && isSameDay(new Date(p.due_date), day));
              const dayGcalAllDay = gcalEvents.filter(e => e.allDay && isSameDay(new Date(e.start), day));
              return (
                <div
                  key={i}
                  style={{ flex: 1, borderLeft: "0.5px solid var(--color-border)", padding: "3px 3px", display: "flex", flexDirection: "column", gap: "2px" }}
                >
                  {dayGcalAllDay.map(e => {
                    const color = e.colorId ? GCAL_COLORS[e.colorId] : "#039BE5";
                    return (
                      <a key={e.id} href={e.htmlLink ?? "#"} target="_blank" rel="noreferrer"
                        className="text-[10px] font-medium px-[6px] py-[1px] rounded truncate"
                        style={{ background: `${color}18`, color, border: `0.5px solid ${color}44`, textDecoration: "none" }}>
                        {e.title}
                      </a>
                    );
                  })}
                  {dayReminders.map(r => (
                    <div key={r.id} className="text-[10px] font-medium px-[6px] py-[1px] rounded truncate"
                      style={{ background: "rgba(37,99,171,0.09)", color: "#2563ab", border: "0.5px solid rgba(37,99,171,0.18)" }}
                    >↑ {r.title}</div>
                  ))}
                  {dayProjects.map(p => (
                    <div key={p.id} className="text-[10px] font-medium px-[6px] py-[1px] rounded truncate"
                      style={{ background: "rgba(155,163,122,0.14)", color: "#5a7040", border: "0.5px solid rgba(155,163,122,0.25)" }}
                    >{p.title} due</div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Time grid — not sticky, scrolls with the container */}
          <div style={{ display: "flex", height: `${GRID_HEIGHT}px`, position: "relative" }}>

            {/* Time gutter */}
            <div style={{ width: "52px", flexShrink: 0, position: "relative", height: `${GRID_HEIGHT}px` }}>
              {Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
                const h = GRID_START + i;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: `${i * PX_PER_HOUR}px`,
                      right: "8px",
                      transform: "translateY(-50%)",
                      fontSize: "9px",
                      color: "var(--color-grey)",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    {h === 0 ? "" : h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
                  </div>
                );
              })}
            </div>

            {/* Day columns */}
            <div style={{ flex: 1, display: "flex", position: "relative" }}>
              {weekDays.map((day, colIdx) => {
                const today = isToday(day);
                const dayTimedReminders = timedReminders.filter(r => {
                  const parsed = parseReminderDate(r.due_date!);
                  return parsed && isSameDay(parsed.date, day);
                });

                return (
                  <div
                    key={colIdx}
                    style={{
                      flex: 1,
                      borderLeft: "0.5px solid var(--color-border)",
                      position: "relative",
                      height: `${GRID_HEIGHT}px`,
                      background: today ? "rgba(155,163,122,0.05)" : "transparent",
                    }}
                  >
                    {/* Hour lines */}
                    {Array.from({ length: GRID_HOURS }, (_, i) => (
                      <div key={`h${i}`} style={{ position: "absolute", top: `${(i + 1) * PX_PER_HOUR}px`, left: 0, right: 0, height: "0.5px", background: "var(--color-border)" }} />
                    ))}

                    {/* Half-hour lines */}
                    {Array.from({ length: GRID_HOURS }, (_, i) => (
                      <div key={`hh${i}`} style={{ position: "absolute", top: `${i * PX_PER_HOUR + PX_PER_HOUR / 2}px`, left: 0, right: 0, height: "0.5px", background: "var(--color-border)", opacity: 0.4 }} />
                    ))}

                    {/* Current time indicator */}
                    {today && nowY !== null && (
                      <div style={{ position: "absolute", top: `${nowY}px`, left: 0, right: 0, zIndex: 5, pointerEvents: "none" }}>
                        <div style={{ position: "absolute", left: "-4px", top: "-3.5px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-orange)" }} />
                        <div style={{ height: "1.5px", background: "var(--color-orange)" }} />
                      </div>
                    )}

                    {/* Google Calendar events */}
                    {gcalEvents
                      .filter(e => {
                        if (e.allDay) return false;
                        const start = new Date(e.start);
                        return isSameDay(start, day);
                      })
                      .map((e, ei) => {
                        const start = new Date(e.start);
                        const end   = new Date(e.end);
                        const y     = timeToY(start.getHours(), start.getMinutes());
                        const endY  = timeToY(end.getHours(), end.getMinutes());
                        const h     = Math.max(24, endY - y);
                        const color = e.colorId ? GCAL_COLORS[e.colorId] : "#039BE5";
                        if (y < 0 || y > GRID_HEIGHT) return null;
                        return (
                          <a
                            key={e.id}
                            href={e.htmlLink ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              position: "absolute",
                              top:    `${y}px`,
                              left:   "4px",
                              right:  "4px",
                              height: `${h}px`,
                              borderRadius: "4px",
                              borderLeft:   `2.5px solid ${color}`,
                              background:   `${color}18`,
                              padding:      "3px 6px",
                              cursor:       "pointer",
                              zIndex:       2 + ei,
                              overflow:     "hidden",
                              textDecoration: "none",
                            }}
                            title={`${e.title}${e.location ? ` · ${e.location}` : ""}`}
                          >
                            <p className="text-[11px] font-medium truncate" style={{ color, lineHeight: "1.25" }}>
                              {e.title}
                            </p>
                            <p className="text-[9px]" style={{ color, opacity: 0.8 }}>
                              {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              {e.location ? ` · ${e.location}` : ""}
                            </p>
                          </a>
                        );
                      })
                    }

                    {/* Reminder events — click opens popover */}
                    {dayTimedReminders.map((r, ri) => {
                      const parsed = parseReminderDate(r.due_date!);
                      if (!parsed) return null;
                      const { date } = parsed;
                      const y = timeToY(date.getHours(), date.getMinutes());
                      if (y < 0 || y > GRID_HEIGHT) return null;

                      return (
                        <div
                          key={r.id}
                          onClick={e => openPopover(e, r)}
                          style={{
                            position: "absolute",
                            top: `${y}px`,
                            left: "4px",
                            right: "4px",
                            height: "34px",
                            borderRadius: "4px",
                            borderLeft: "2.5px solid #2563ab",
                            background: "rgba(37,99,171,0.09)",
                            padding: "3px 6px",
                            cursor: "pointer",
                            zIndex: 2 + ri,
                            overflow: "hidden",
                            opacity: r.completed ? 0.4 : 1,
                            transition: "opacity 0.2s",
                          }}
                          title={r.title}
                        >
                          <p
                            className="text-[11px] font-medium truncate"
                            style={{
                              color: "#2563ab",
                              lineHeight: "1.25",
                              textDecoration: r.completed ? "line-through" : "none",
                            }}
                          >
                            ↑ {r.title}
                          </p>
                          <p className="text-[9px]" style={{ color: "#2563ab", opacity: 0.7 }}>
                            {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

        </div>{/* /scroll container */}
      </div>

      {/* Reminder popover */}
      {popover && (
        <ReminderPopover
          reminder={popover.reminder}
          x={popover.x}
          y={popover.y}
          onMarkComplete={() => markComplete(popover.reminder.id)}
          onUndo={() => undoComplete(popover.reminder.id)}
          onClose={() => setPopover(null)}
        />
      )}

      {/* New reminder modal */}
      {newReminderOpen && (
        <NewReminderModal
          projects={initialProjects}
          defaultDate={defaultNewDate}
          onClose={() => setNewReminderOpen(false)}
          onCreate={createReminder}
        />
      )}
    </div>
  );
}
