"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Task, Contact } from "@/types/database";
import { ChevronLeft, ChevronRight, Plus, CheckSquare, MoreHorizontal, CalendarClock } from "lucide-react";
import AshMark from "@/components/ui/AshMark";
import DatePicker from "@/components/ui/DatePicker";
import EmptyState from "@/components/ui/EmptyState";
import CalendarOptionsMenu from "./CalendarOptionsMenu";
import CalendarSourcesPanel from "./CalendarSourcesPanel";
import EventDetailPanel, { type CalendarEventLite } from "./EventDetailPanel";
import CalendarIntroModal from "@/components/tour/calendar/CalendarIntroModal";
import CalendarTooltipTour from "@/components/tour/calendar/CalendarTooltipTour";

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

/** Tasks store due_date as a YYYY-MM-DD string (date-only, no time). Parse
 *  it as local midnight so timezone offsets don't push the day forward. */
function parseTaskDueDate(due: string): Date | null {
  const d = new Date(due + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function getDueBadge(due: string): { text: string; color: string } {
  const d = parseTaskDueDate(due);
  if (!d) return { text: "", color: "var(--color-grey)" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
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

  // Mini calendar tracks the primary view: when the user pages weeks
  // forward/back in the main grid (which advances selectedDate to a new
  // month), follow it so the mini stays oriented to whatever's on
  // screen. The user can still page the mini independently — that just
  // overrides until the next selectedDate change crosses a month boundary.
  useEffect(() => {
    setMonth((prev) => {
      if (selectedDate.getFullYear() === prev.getFullYear()
       && selectedDate.getMonth()    === prev.getMonth()) return prev;
      const next = new Date(selectedDate);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      return next;
    });
  }, [selectedDate]);

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

// ── TaskPopover ────────────────────────────────────────────────────────────────

function TaskPopover({ task, x, y, onMarkComplete, onUndo, onClose }: {
  task: Task;
  x: number;
  y: number;
  onMarkComplete: () => void;
  onUndo?: () => void;
  onClose: () => void;
}) {
  const ref    = useRef<HTMLDivElement>(null);
  const parsed = task.due_date ? parseTaskDueDate(task.due_date) : null;

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

  const linkedProject = (task.project as unknown as { title: string } | null | undefined)?.title;
  const linkedContact = (() => {
    const c = task.contact as unknown as { first_name: string; last_name: string } | null | undefined;
    return c ? `${c.first_name} ${c.last_name}`.trim() : null;
  })();

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: `${y}px`,
        left: `${x}px`,
        zIndex: 60,
        width: "240px",
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: "12px",
        boxShadow: "0 6px 28px rgba(0,0,0,0.13)",
        padding: "14px",
      }}
    >
      <p className="text-[13px] font-semibold leading-snug mb-[5px]" style={{ color: "var(--color-charcoal)" }}>
        {task.title}
      </p>
      {parsed && (
        <p className="text-[11px] mb-1" style={{ color: "var(--color-grey)" }}>
          {parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </p>
      )}
      {(linkedProject || linkedContact) && (
        <p className="text-[10px] mb-3" style={{ color: "var(--color-grey)" }}>
          {[linkedProject && `📁 ${linkedProject}`, linkedContact && `👤 ${linkedContact}`].filter(Boolean).join(" · ")}
        </p>
      )}

      {task.completed ? (
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

// ── NewTaskModal ───────────────────────────────────────────────────────────────

interface NewTaskInput {
  title:      string;
  dueDate:    string | null;       // YYYY-MM-DD or null
  projectId:  string | null;
  contactId:  string | null;
}

function NewTaskModal({ projects, contacts, defaultDate, onClose, onCreate }: {
  projects: { id: string; title: string }[];
  contacts: Pick<Contact, "id" | "first_name" | "last_name">[];
  defaultDate: string;              // YYYY-MM-DD
  onClose: () => void;
  onCreate: (input: NewTaskInput) => void;
}) {
  const [title,     setTitle]     = useState("");
  const [dueDate,   setDueDate]   = useState(defaultDate);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit() {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), dueDate: dueDate || null, projectId, contactId });
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
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>New task</h3>
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
          placeholder="What needs to get done?"
          className="w-full bg-transparent focus:outline-none text-[14px] font-medium"
          style={{ color: "var(--color-charcoal)", borderBottom: "0.5px solid var(--color-border)", paddingBottom: "6px" }}
        />

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>Due date</label>
          <DatePicker
            value={dueDate ? new Date(dueDate + "T00:00:00") : null}
            onChange={(d) => {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              setDueDate(`${y}-${m}-${day}`);
            }}
            placeholder="No due date"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>Project</label>
          <ProjectPicker projectId={projectId} projects={projects} onChange={setProjectId} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>Contact</label>
          <ContactPicker contactId={contactId} contacts={contacts} onChange={setContactId} />
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
          >Add task</button>
        </div>
      </div>
    </div>
  );
}

// ── ContactPicker ─────────────────────────────────────────────────────────────

function ContactPicker({
  contactId, contacts, onChange,
}: {
  contactId: string | null;
  contacts:  Pick<Contact, "id" | "first_name" | "last_name">[];
  onChange:  (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const linked          = contacts.find(c => c.id === contactId);

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
          background: "rgba(37,99,171,0.10)", color: "#2563ab", border: "0.5px solid rgba(37,99,171,0.25)",
        } : {
          background: "transparent", color: "var(--color-grey)", border: "0.5px dashed var(--color-border)",
        }}
      >
        {linked ? `${linked.first_name} ${linked.last_name}` : "+ Link contact"}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-30"
          style={{ minWidth: "200px", maxHeight: "240px", overflowY: "auto", background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}
        >
          <button className="w-full text-left px-4 py-[8px] text-[12px] transition-colors"
            style={{ color: "var(--color-grey)" }}
            onClick={() => { onChange(null); setOpen(false); }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >No contact</button>
          {contacts.map(c => (
            <button key={c.id} className="w-full text-left px-4 py-[8px] text-[12px] transition-colors"
              style={{ color: "#6b6860", fontWeight: c.id === contactId ? 600 : 400 }}
              onClick={() => { onChange(c.id); setOpen(false); }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >{c.first_name} {c.last_name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CalendarClient ─────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  colorId: string | null;
  source?: "google" | "microsoft";
  accountName?: string | null;
}

// Google Calendar event colors (colorId → hex)
const GCAL_COLORS: Record<string, string> = {
  "1": "#7986CB", "2": "#33B679", "3": "#8E24AA", "4": "#E67C73",
  "5": "#F6BF26", "6": "#F4511E", "7": "#039BE5", "8": "#616161",
  "9": "#3F51B5", "10": "#0B8043", "11": "#D50000",
};

interface Props {
  initialTasks:    Task[];
  initialProjects: { id: string; title: string; due_date: string | null; status: string }[];
  initialContacts: Pick<Contact, "id" | "first_name" | "last_name">[];
  googleConnected?:    boolean;
  googleAccountName?:  string | null;
  outlookConnected?:   boolean;
  outlookAccountName?: string | null;
}

interface PopoverState { task: Task; x: number; y: number }

export default function CalendarClient({
  initialTasks, initialProjects, initialContacts,
  googleConnected = false, googleAccountName,
  outlookConnected = false, outlookAccountName,
}: Props) {
  const [viewDate,        setViewDate]        = useState(new Date());
  const [tasks,           setTasks]           = useState<Task[]>(initialTasks);
  const [newTaskOpen,     setNewTaskOpen]     = useState(false);
  const [popover,         setPopover]         = useState<PopoverState | null>(null);
  const [nowY,            setNowY]            = useState<number | null>(null);
  const [gcalEvents,      setGcalEvents]      = useState<CalEvent[]>([]);
  const [gcalLoading,     setGcalLoading]     = useState(false);
  const [optionsOpen,     setOptionsOpen]     = useState(false);
  const [showWeekends,    setShowWeekends]    = useState(true);
  const [showDeclined,    setShowDeclined]    = useState(true);
  const [openEvent,       setOpenEvent]       = useState<CalEvent | null>(null);
  const [createError,     setCreateError]     = useState<string | null>(null);

  // Freeze "did this user have any calendar connected at mount?" so the
  // tooltip tour can drop the connect-integration steps if so (mirrors the
  // hasPipelinesAtStart trick in OutreachTooltipTour).
  const [hadIntegrationAtMount] = useState(googleConnected || outlookConnected);
  const anyConnected = googleConnected || outlookConnected;

  const gridWrapRef  = useRef<HTMLDivElement>(null);
  const undoTimers   = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const supabase     = createClient();

  const allWeekDays = getWeekDays(viewDate);
  const weekDays    = showWeekends
    ? allWeekDays
    : allWeekDays.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);

  // ── Timers cleanup
  useEffect(() => () => { undoTimers.current.forEach(clearTimeout); }, []);

  // ── Auto-dismiss the create-task error banner after a few seconds.
  useEffect(() => {
    if (!createError) return;
    const id = setTimeout(() => setCreateError(null), 5000);
    return () => clearTimeout(id);
  }, [createError]);

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

  // ── Fetch calendar events (Google + Outlook) when week changes. The
  // aggregator route hits every connected provider in parallel and
  // returns one merged list. Also re-fires when the options-menu
  // "Refresh calendars" dispatches `calendar:refresh-events`.
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    function onRefresh() { setRefreshNonce((n) => n + 1); }
    window.addEventListener("calendar:refresh-events", onRefresh);
    return () => window.removeEventListener("calendar:refresh-events", onRefresh);
  }, []);
  useEffect(() => {
    if (!anyConnected) return;
    const days  = getWeekDays(viewDate);
    const start = days[0].toISOString().split("T")[0];
    const end   = days[6].toISOString().split("T")[0];
    setGcalLoading(true);
    let cancelled = false;
    fetch(`/api/integrations/calendar/events?startDate=${start}&endDate=${end}`)
      .then(r => r.json())
      .then((d: { events?: CalEvent[] }) => {
        if (cancelled) return;
        setGcalEvents(d.events ?? []);
        setGcalLoading(false);
      })
      .catch(() => { if (!cancelled) setGcalLoading(false); });
    return () => { cancelled = true; };
  }, [viewDate, anyConnected, refreshNonce]);

  // ── On mount: if we just returned from an OAuth callback, fire the
  // event the tour listens for, then strip the query so refreshes don't
  // re-fire it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const c = url.searchParams.get("connected");
    if (c === "gcal" || c === "google" || c === "microsoft" || c === "outlook") {
      window.dispatchEvent(new CustomEvent("calendar:integration-connected", { detail: { provider: c } }));
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // ── Navigation
  function prevWeek() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  function nextWeek() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }
  function goToday()  { setViewDate(new Date()); }

  // ── Week label uses the full Sun-Sat span even when weekends are
  // hidden — the label describes the whole week the user is paging
  // through, not just the visible columns.
  const ws = allWeekDays[0];
  const we = allWeekDays[6];
  const weekLabel =
    ws.getMonth() === we.getMonth()
      ? `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
      : `${fmtDate(ws, { month: "short", day: "numeric" })} – ${fmtDate(we, { month: "short", day: "numeric", year: "numeric" })}`;

  // ── Completion with linger + undo
  function scheduleRemoval(id: string) {
    const existing = undoTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setTasks(prev => prev.filter(r => r.id !== id));
      undoTimers.current.delete(id);
    }, 5000);
    undoTimers.current.set(id, t);
  }

  async function markComplete(id: string) {
    setTasks(prev => prev.map(r => r.id === id ? { ...r, completed: true } : r));
    await supabase.from("tasks").update({ completed: true }).eq("id", id);
    scheduleRemoval(id);
  }

  async function undoComplete(id: string) {
    const t = undoTimers.current.get(id);
    if (t) { clearTimeout(t); undoTimers.current.delete(id); }
    setTasks(prev => prev.map(r => r.id === id ? { ...r, completed: false } : r));
    await supabase.from("tasks").update({ completed: false }).eq("id", id);
  }

  // ── Popover
  const openPopover = useCallback((e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.right + 8 + 240 > window.innerWidth ? rect.left - 248 : rect.right + 8;
    const y = Math.min(rect.top, window.innerHeight - 200);
    setPopover({ task, x, y });
  }, []);

  // ── CRUD
  // Defensive throughout: before this we were happily pushing `null` into
  // the tasks array when the insert errored (RLS reject, network, schema
  // drift), and the next render crashed the whole page tree. Catch the
  // throw, log it, and surface a single transient hint instead.
  async function createTask(input: NewTaskInput) {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        console.error("[calendar.createTask] no user:", userErr);
        setCreateError("Couldn't save — you may need to sign in again.");
        return;
      }
      const payload: Record<string, unknown> = {
        user_id:    user.id,
        title:      input.title,
        completed:  false,
        due_date:   input.dueDate,
        project_id: input.projectId,
        contact_id: input.contactId,
      };
      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select("*, project:projects(id, title), contact:contacts(id, first_name, last_name)")
        .single();
      if (error || !data) {
        console.error("[calendar.createTask] insert failed:", error);
        setCreateError("Couldn't save that task. Try again — if it keeps failing, refresh the page.");
        return;
      }
      const created = data as Task;
      setTasks(prev => [created, ...prev]);
      window.dispatchEvent(new CustomEvent("calendar:task-created", {
        detail: { id: created.id, title: created.title },
      }));
    } catch (err) {
      console.error("[calendar.createTask] unexpected error:", err);
      setCreateError("Something went wrong saving that task.");
    }
  }

  function openNewTask() {
    setNewTaskOpen(true);
    window.dispatchEvent(new Event("calendar:new-task-opened"));
  }

  // ── Derived lists ────────────────────────────────────────────────────────────
  // Tasks store due_date as a date (no time) — so everything renders as
  // all-day on the week grid. Time-of-day reminders are gone with the
  // reminders table.

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const scheduledTasks   = useMemo(() => tasks.filter(t => t.due_date), [tasks]);
  const unscheduledTasks = useMemo(() => tasks.filter(t => !t.due_date), [tasks]);

  // Top rail: today + overdue tasks. The user asked for a "task section at
  // the top" — this is where it lives.
  const topRailTasks = useMemo(() => {
    return scheduledTasks
      .filter(t => {
        const d = parseTaskDueDate(t.due_date!);
        return d ? d.getTime() <= today.getTime() : false;
      })
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  }, [scheduledTasks, today]);

  // Left sidebar "Upcoming": everything with a date, sorted ascending.
  const upcomingTasks = useMemo(() => {
    return [...scheduledTasks].sort((a, b) =>
      a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0,
    );
  }, [scheduledTasks]);

  // Default date for the new-task modal: today.
  const defaultNewDate = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

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
            {upcomingTasks.length > 0 && (
              <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{upcomingTasks.length}</span>
            )}
          </div>

          {upcomingTasks.length === 0 && unscheduledTasks.length === 0 && (
            <div style={{ padding: "12px 14px 16px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 5 }}>No upcoming tasks</p>
              <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
                Tasks with a due date show up here and on the calendar grid below. Add one for any follow-up, deadline, or thing you don&apos;t want to forget.
              </p>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)", marginBottom: 6 }}>Tips</p>
              {[
                "Tasks linked to a project or contact carry that context everywhere.",
                "Ash can create tasks for you — try \"remind me to follow up with X next Thursday\".",
                "Open tasks roll up to the contact's Tasks tab and the project's Tasks tab too.",
              ].map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: 7, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-sage)", flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                  <p style={{ fontSize: 10, lineHeight: 1.55, color: "#6b6860" }}>{tip}</p>
                </div>
              ))}
            </div>
          )}

          {upcomingTasks.map(t => {
            const badge = getDueBadge(t.due_date!);
            return (
              <div
                key={t.id}
                className="flex items-start gap-2 px-3 py-[8px] transition-colors"
                style={{ borderBottom: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => { if (!t.completed) e.currentTarget.style.background = "var(--color-cream)"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Check square — direct action */}
                <div
                  onClick={() => t.completed ? undoComplete(t.id) : markComplete(t.id)}
                  className="flex items-center justify-center cursor-pointer shrink-0 mt-[1px] transition-colors"
                  style={{
                    width: "16px", height: "16px", borderRadius: 4,
                    border: t.completed ? "none" : "1.5px solid var(--color-border)",
                    background: t.completed ? "var(--color-sage)" : "transparent",
                  }}
                >
                  {t.completed && (
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Title + badge */}
                <div className="flex-1 min-w-0 mt-[-1px]" style={{ opacity: t.completed ? 0.45 : 1 }}>
                  <p
                    className="text-[12px] font-medium leading-snug truncate"
                    style={{ color: "var(--color-charcoal)", textDecoration: t.completed ? "line-through" : "none" }}
                  >
                    {t.title}
                  </p>
                  {!t.completed && <p className="text-[10px] mt-[2px]" style={{ color: badge.color }}>{badge.text}</p>}
                </div>

                {/* Undo link — only when completed/lingering */}
                {t.completed && (
                  <button
                    onClick={() => undoComplete(t.id)}
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
          {unscheduledTasks.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>No date</span>
              </div>
              {unscheduledTasks.map(t => (
                <div
                  key={t.id}
                  className="flex items-start gap-2 px-3 py-[8px] transition-colors"
                  style={{ borderBottom: "0.5px solid var(--color-border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    onClick={() => t.completed ? undoComplete(t.id) : markComplete(t.id)}
                    className="flex items-center justify-center cursor-pointer shrink-0 mt-[1px]"
                    style={{ width: "16px", height: "16px", borderRadius: 4, border: "1.5px solid var(--color-border)", background: "transparent" }}
                  />
                  <p className="text-[12px] font-medium leading-snug truncate mt-[-1px]" style={{ color: "var(--color-charcoal)" }}>
                    {t.title}
                  </p>
                </div>
              ))}
            </>
          )}

          {/* Per-account calendar visibility list — only renders when
              we have something to show; first paint of a fresh
              connection triggers a background sync server-side. */}
          {anyConnected && (
            <CalendarSourcesPanel refreshNonce={refreshNonce} />
          )}

          {/* Calendar integrations panel — covers Google + Outlook. The
              tour anchors its first step to this whole block so the user
              sees both options at once. */}
          <div data-tour-target="calendar.integrations" className="mx-3 mt-5 mb-3 flex flex-col gap-2">
            {googleConnected ? (
              <div className="p-3 rounded-lg" style={{ background: "rgba(155,163,122,0.1)", border: "0.5px solid rgba(155,163,122,0.25)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--color-sage)" }} />
                  <p className="text-[11px] font-medium" style={{ color: "var(--color-charcoal)" }}>Google Calendar</p>
                  {gcalLoading && <span className="text-[9px] ml-auto" style={{ color: "var(--color-grey)" }}>Syncing…</span>}
                </div>
                <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                  {googleAccountName ?? "Connected"} · {gcalEvents.filter(e => e.source !== "microsoft").length} event{gcalEvents.filter(e => e.source !== "microsoft").length !== 1 ? "s" : ""} this week
                </p>
                <a href="/settings?section=integrations&provider=google" className="text-[10px] mt-2 inline-block" style={{ color: "var(--color-grey)" }}>Manage</a>
              </div>
            ) : (
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
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>Read-only · events alongside tasks</p>
                </div>
              </button>
            )}

            {outlookConnected ? (
              <div className="p-3 rounded-lg" style={{ background: "rgba(0,120,212,0.08)", border: "0.5px solid rgba(0,120,212,0.22)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#0078d4" }} />
                  <p className="text-[11px] font-medium" style={{ color: "var(--color-charcoal)" }}>Outlook Calendar</p>
                </div>
                <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                  {outlookAccountName ?? "Connected"} · {gcalEvents.filter(e => e.source === "microsoft").length} event{gcalEvents.filter(e => e.source === "microsoft").length !== 1 ? "s" : ""} this week
                </p>
                <a href="/settings?section=integrations&provider=microsoft" className="text-[10px] mt-2 inline-block" style={{ color: "var(--color-grey)" }}>Manage</a>
              </div>
            ) : (
              <button
                onClick={() => window.location.href = "/api/auth/microsoft?next=/calendar"}
                className="w-full flex items-center gap-2 p-3 rounded-lg transition-colors text-left"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#0078d4"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border)"}
              >
                <svg width="14" height="14" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M15 4H4v11h11V4z" fill="#F25022"/>
                  <path d="M28 4H17v11h11V4z" fill="#7FBA00"/>
                  <path d="M15 17H4v11h11V17z" fill="#00A4EF"/>
                  <path d="M28 17H17v11h11V17z" fill="#FFB900"/>
                </svg>
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "var(--color-charcoal)" }}>Connect Outlook Calendar</p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>Read-only · events alongside tasks</p>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Add task */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button
            onClick={openNewTask}
            className="w-full text-[11px] py-[7px] rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "#6b6860"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
          >
            + New task
          </button>
        </div>
      </div>

      {/* ── Main calendar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Topbar — matches Projects/People standard: title left, date
            label after it, then nav + view toggle + Ash + 3-dot + primary
            CTA on the right. */}
        <header
          className="flex items-center justify-between px-6 shrink-0"
          style={{
            height: "52px",
            background: "var(--color-off-white)",
            borderBottom: "0.5px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-semibold" style={{ fontSize: 14, color: "var(--color-charcoal)" }}>Calendar</h1>
            <span style={{ color: "var(--color-border-strong)", fontSize: 12 }}>·</span>
            <span
              style={{
                color: "var(--color-text-secondary)",
                fontFamily: "var(--font-display)",
                fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {weekLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={goToday}
              className="text-[11px] px-3 py-[5px] rounded-md transition-colors"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >Today</button>

            <div className="flex items-center gap-1">
              <button onClick={prevWeek}
                aria-label="Previous week"
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><ChevronLeft size={13} /></button>

              <button onClick={nextWeek}
                aria-label="Next week"
                className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><ChevronRight size={13} /></button>
            </div>

            <div className="flex rounded-md overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-cream)" }}>
              {(["Week","Month"] as const).map(v => (
                <button key={v}
                  title={v === "Month" ? "Month view — coming in a follow-up" : "Week view"}
                  disabled={v === "Month"}
                  className="px-3 py-[5px] text-[11px]"
                  style={{
                    background: v === "Week" ? "var(--color-off-white)" : "transparent",
                    color: v === "Week" ? "var(--color-charcoal)" : "var(--color-grey)",
                    fontWeight: v === "Week" ? 600 : 400,
                    opacity: v === "Month" ? 0.45 : 1,
                    cursor: v === "Month" ? "not-allowed" : "pointer",
                    border: "none", fontFamily: "inherit",
                  }}
                >{v}</button>
              ))}
            </div>

            <button
              onClick={() => openAshCal("What's coming up in my calendar this week? Any tasks or deadlines I should know about?")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "transparent", color: "var(--color-ash-dark)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ash-tint)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AshMark size={9} variant="on-dark" />
              </div>
              Ask Ash
            </button>

            {/* 3-dot options menu */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setOptionsOpen(v => !v)}
                aria-label="Calendar options"
                title="Calendar options"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: optionsOpen ? "var(--color-surface-sunken)" : "transparent",
                  border: "none", cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={e => { if (!optionsOpen) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                onMouseLeave={e => { if (!optionsOpen) e.currentTarget.style.background = "transparent"; }}
              >
                <MoreHorizontal size={16} strokeWidth={2} />
              </button>
              {optionsOpen && (
                <CalendarOptionsMenu
                  showWeekends={showWeekends}
                  onToggleShowWeekends={() => setShowWeekends(v => !v)}
                  showDeclined={showDeclined}
                  onToggleShowDeclined={() => setShowDeclined(v => !v)}
                  onClose={() => setOptionsOpen(false)}
                />
              )}
            </div>

            <span data-tour-target="calendar.new-task-button">
              <button
                onClick={openNewTask}
                style={{
                  padding: "7px 16px", fontSize: 12, fontWeight: 500,
                  borderRadius: 8, border: "none", cursor: "pointer",
                  background: "var(--color-sage)", color: "white",
                  fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-sage-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-sage)")}
              >
                <Plus size={12} />
                New task
              </button>
            </span>
          </div>
        </header>

        {/* ── Cold-start empty state ─────────────────────────────────────────
            Nothing connected AND zero tasks → render the EmptyState in
            place of the grid. The very next user action (connecting a
            provider or adding a task) flips this off. */}
        {!anyConnected && tasks.length === 0 ? (
          <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <EmptyState
              icon={<CalendarClock size={26} strokeWidth={1.5} style={{ color: "var(--color-sage)" }} />}
              heading="Your week, in one place"
              body="Bring your real calendar in and add tasks for anything you don't want to forget. Perennial keeps both side-by-side, so the next thing to do is always in sight."
              action={{
                label: "Connect Google Calendar",
                onClick: () => { window.location.href = "/api/auth/google-calendar"; },
              }}
              secondaryAction={{
                label: "Connect Outlook",
                onClick: () => { window.location.href = "/api/auth/microsoft?next=/calendar"; },
              }}
              tips={[
                "Connections are read-only — events show up here but stay editable in Google or Outlook.",
                "Add a task to drop a check-box on any day; tasks live independently of your synced calendar.",
                "Ask Ash to plan your week once a few things are in — it sees tasks, deadlines, and events together.",
              ]}
            />
          </div>
        ) : (
        <>

        {/* ── Today + overdue rail ────────────────────────────────────────────
            User-facing "tasks at the top" section. Anything due today or
            already overdue surfaces here so the day starts with a clear
            punch-list, regardless of which week is in view. */}
        {topRailTasks.length > 0 && (
          <div
            data-tour-target="calendar.today-rail"
            className="flex items-center gap-2 px-4 py-[8px] shrink-0 overflow-x-auto"
            style={{
              background: "var(--color-warm-white)",
              borderBottom: "0.5px solid var(--color-border)",
            }}
          >
            <CheckSquare size={11} strokeWidth={1.75} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
            <span
              className="text-[10px] font-semibold uppercase tracking-widest shrink-0"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Today
            </span>
            <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
              {topRailTasks.map(t => {
                const d = parseTaskDueDate(t.due_date!);
                const overdue = d && d.getTime() < today.getTime();
                return (
                  <button
                    key={t.id}
                    onClick={(e) => openPopover(e, t)}
                    className="flex items-center gap-1.5 px-2.5 py-[4px] rounded-full shrink-0 transition-colors"
                    style={{
                      background: overdue ? "rgba(220,62,13,0.10)" : "rgba(155,163,122,0.14)",
                      border: `0.5px solid ${overdue ? "rgba(220,62,13,0.28)" : "rgba(155,163,122,0.28)"}`,
                      color: overdue ? "var(--color-red-orange)" : "#4a5630",
                      cursor: "pointer", fontFamily: "inherit",
                      opacity: t.completed ? 0.45 : 1,
                    }}
                  >
                    <span
                      onClick={(e) => { e.stopPropagation(); t.completed ? undoComplete(t.id) : markComplete(t.id); }}
                      className="flex items-center justify-center"
                      style={{
                        width: 12, height: 12, borderRadius: 3,
                        border: t.completed ? "none" : `1.5px solid ${overdue ? "var(--color-red-orange)" : "rgba(155,163,122,0.5)"}`,
                        background: t.completed ? "var(--color-sage)" : "transparent",
                      }}
                    >
                      {t.completed && (
                        <svg width="7" height="5" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span
                      className="text-[11px] font-medium whitespace-nowrap"
                      style={{ textDecoration: t.completed ? "line-through" : "none" }}
                    >
                      {t.title}
                    </span>
                    {overdue && !t.completed && (
                      <span className="text-[9px] uppercase tracking-wider font-semibold ml-0.5">overdue</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
              const dayTasks      = scheduledTasks.filter(t => {
                const d = parseTaskDueDate(t.due_date!);
                return d ? isSameDay(d, day) : false;
              });
              const dayProjects   = initialProjects.filter(p => p.due_date && isSameDay(new Date(p.due_date + "T00:00:00"), day));
              const dayGcalAllDay = gcalEvents.filter(e => e.allDay && isSameDay(new Date(e.start), day));
              return (
                <div
                  key={i}
                  style={{ flex: 1, borderLeft: "0.5px solid var(--color-border)", padding: "3px 3px", display: "flex", flexDirection: "column", gap: "2px" }}
                >
                  {dayGcalAllDay.map(e => {
                    const color = e.colorId ? GCAL_COLORS[e.colorId] : (e.source === "microsoft" ? "#0078d4" : "#039BE5");
                    return (
                      <button
                        key={e.id}
                        onClick={() => setOpenEvent(e)}
                        className="text-[10px] font-medium px-[6px] py-[1px] rounded truncate text-left"
                        style={{
                          background: `${color}18`, color,
                          border: `0.5px solid ${color}44`,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {e.title}
                      </button>
                    );
                  })}
                  {dayTasks.map(t => (
                    <button
                      key={t.id}
                      onClick={(e) => openPopover(e, t)}
                      className="text-[10px] font-medium px-[6px] py-[1px] rounded truncate text-left"
                      style={{
                        background: "rgba(37,99,171,0.09)", color: "#2563ab",
                        border: "0.5px solid rgba(37,99,171,0.18)",
                        cursor: "pointer", fontFamily: "inherit",
                        opacity: t.completed ? 0.45 : 1,
                        textDecoration: t.completed ? "line-through" : "none",
                      }}
                    >
                      ☐ {t.title}
                    </button>
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
                        const color = e.colorId ? GCAL_COLORS[e.colorId] : (e.source === "microsoft" ? "#0078d4" : "#039BE5");
                        if (y < 0 || y > GRID_HEIGHT) return null;
                        return (
                          <button
                            key={e.id}
                            onClick={() => setOpenEvent(e)}
                            style={{
                              position: "absolute",
                              top:    `${y}px`,
                              left:   "4px",
                              right:  "4px",
                              height: `${h}px`,
                              borderRadius: "4px",
                              borderLeft:   `2.5px solid ${color}`,
                              borderTop:    "none",
                              borderRight:  "none",
                              borderBottom: "none",
                              background:   `${color}18`,
                              padding:      "3px 6px",
                              cursor:       "pointer",
                              zIndex:       2 + ei,
                              overflow:     "hidden",
                              textAlign:    "left",
                              fontFamily:   "inherit",
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
                          </button>
                        );
                      })
                    }

                    {/* Tasks have no time-of-day — they render in the all-day
                        strip above, not in the time grid. */}
                  </div>
                );
              })}
            </div>
          </div>

        </div>{/* /scroll container */}
        </>
        )}
      </div>

      {/* Task popover */}
      {popover && (
        <TaskPopover
          task={popover.task}
          x={popover.x}
          y={popover.y}
          onMarkComplete={() => markComplete(popover.task.id)}
          onUndo={() => undoComplete(popover.task.id)}
          onClose={() => setPopover(null)}
        />
      )}

      {/* New task modal */}
      {newTaskOpen && (
        <div data-tour-target="calendar.new-task-modal">
          <NewTaskModal
            projects={initialProjects}
            contacts={initialContacts}
            defaultDate={defaultNewDate}
            onClose={() => setNewTaskOpen(false)}
            onCreate={createTask}
          />
        </div>
      )}

      {/* Read-only event detail popup (Phase D1). Write-back lands in a
          follow-up — for now the panel surfaces all the metadata and
          links out to the provider for edits. */}
      {openEvent && (
        <EventDetailPanel
          event={openEvent as unknown as CalendarEventLite}
          color={openEvent.colorId ? GCAL_COLORS[openEvent.colorId] : (openEvent.source === "microsoft" ? "#0078d4" : "#039BE5")}
          onClose={() => setOpenEvent(null)}
        />
      )}

      {/* Transient create-task error banner. The wrapped try/catch in
          createTask routes failures here instead of letting an unhandled
          throw take down the page tree. */}
      {createError && (
        <div
          role="status"
          onClick={() => setCreateError(null)}
          style={{
            position: "fixed", bottom: 18, left: "50%",
            transform: "translateX(-50%)",
            zIndex: 80,
            padding: "10px 16px",
            borderRadius: 10,
            background: "var(--color-charcoal)",
            color: "var(--color-warm-white)",
            fontSize: 12, fontWeight: 500,
            boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
            cursor: "pointer",
            maxWidth: 480,
          }}
        >
          {createError}
        </div>
      )}

      <CalendarIntroModal />
      <CalendarTooltipTour hasIntegrationAtStart={hadIntegrationAtMount} />
    </div>
  );
}
