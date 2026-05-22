"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Task, Contact } from "@/types/database";
import { ChevronLeft, ChevronRight, Plus, CheckSquare, MoreHorizontal, CalendarClock, Eye, EyeOff } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import EmptyState from "@/components/ui/EmptyState";
import CalendarOptionsMenu from "./CalendarOptionsMenu";
import CalendarSourcesPanel from "./CalendarSourcesPanel";
import EventDetailPanel, { type CalendarEventLite } from "./EventDetailPanel";
import NewEventModal from "./NewEventModal";
import TaskQuickEditPopover from "./TaskQuickEditPopover";
import QuickTaskCard, { type QuickTaskInput } from "./QuickTaskCard";
import CalendarIntroModal from "@/components/tour/calendar/CalendarIntroModal";
import CalendarTooltipTour from "@/components/tour/calendar/CalendarTooltipTour";

// ── Constants ──────────────────────────────────────────────────────────────────

const PX_PER_HOUR  = 64;
const GRID_START   = 6;
const GRID_END     = 23;
const GRID_HOURS   = GRID_END - GRID_START;
const GRID_HEIGHT  = GRID_HOURS * PX_PER_HOUR;
const DAY_HDR_H    = 64;   // fixed height used for sticky top offsets
// Minimum legible width for the 7-column week grid. At narrower window
// widths the inner rows keep this width and the scroll container pans
// horizontally instead of collapsing the columns. 52px gutter + 7 × ~90px
// columns ≈ 700px is the threshold below which event chips lose their
// time labels.
const WEEK_MIN_WIDTH = 700;

const DOW_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Color palette for task pills in the tasks ribbon. Mirrors the
// priority chips used in TasksClient so the visual language is
// consistent across modules.
const PRIORITY_PALETTE: Record<string, { bg: string; fg: string; border: string }> = {
  high:     { bg: "rgba(220,62,13,0.10)",  fg: "var(--color-red-orange)", border: "rgba(220,62,13,0.28)" },
  medium:   { bg: "rgba(160,120,0,0.12)",  fg: "#7a5a00",                border: "rgba(160,120,0,0.28)" },
  low:      { bg: "rgba(155,163,122,0.14)",fg: "#4a5630",                border: "rgba(155,163,122,0.28)" },
  _default: { bg: "rgba(120,120,120,0.10)",fg: "#5a564f",                border: "rgba(120,120,120,0.22)" },
};

function pad2(n: number): string { return n.toString().padStart(2, "0"); }
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

/** Inverse of timeToY: pixel offset within a day column → minutes-from-day-start.
 *  Snaps to the nearest 15-min increment so drops always land on a clean
 *  grid slot. Clamped to [0, GRID_HOURS*60]. */
function yToMinutes(y: number): number {
  const minsFromGridStart = (y / PX_PER_HOUR) * 60;
  const snapped = Math.round(minsFromGridStart / 15) * 15;
  return Math.max(0, Math.min(GRID_HOURS * 60, snapped));
}

/** Build a Date for `day` at GRID_START + `minutes` minutes. */
function dayWithMinutes(day: Date, minutes: number): Date {
  const out = new Date(day);
  out.setHours(GRID_START, 0, 0, 0);
  out.setMinutes(minutes);
  return out;
}

/** Compute side-by-side column layout for a set of time-grid events that
 *  share a day. Walks events in start-time order, batching them into
 *  *transitive* overlap groups (A overlaps B, B overlaps C → all in one
 *  group even if A and C don't directly overlap). Within a group each
 *  event gets an index + total so the renderer can compute
 *  left = idx/total and width = 1/total. */
interface ChipLayout {
  startMs: number;
  endMs:   number;
  groupSize: number;
  columnIdx: number;
}
function layoutDayEvents<T extends { start: string; end: string }>(events: T[]): Map<T, ChipLayout> {
  const out  = new Map<T, ChipLayout>();
  if (events.length === 0) return out;
  // Sort by start ascending, then by end descending so longer events take
  // the leftmost column first — gives the most stable visual when many
  // chips share a slot.
  const sorted = [...events].sort((a, b) => {
    const sa = new Date(a.start).getTime();
    const sb = new Date(b.start).getTime();
    if (sa !== sb) return sa - sb;
    return new Date(b.end).getTime() - new Date(a.end).getTime();
  });
  // Greedy: extend the current group as long as the next event overlaps
  // *any* event in the group (tracked by the group's max end).
  let groupStart = 0;
  let groupMaxEnd = new Date(sorted[0].end).getTime();
  for (let i = 1; i <= sorted.length; i++) {
    const startMs = i < sorted.length ? new Date(sorted[i].start).getTime() : Infinity;
    if (startMs < groupMaxEnd) {
      groupMaxEnd = Math.max(groupMaxEnd, new Date(sorted[i].end).getTime());
      continue;
    }
    // Close out the group [groupStart, i). Assign column indices by
    // sweeping the group and giving each event the lowest column index
    // not currently occupied by an earlier overlapping event in the
    // group.
    const group = sorted.slice(groupStart, i);
    const columnEnds: number[] = []; // column → end ms of the event currently in that column
    const cols: number[] = [];
    for (const ev of group) {
      const s = new Date(ev.start).getTime();
      let col = columnEnds.findIndex((end) => end <= s);
      if (col === -1) { col = columnEnds.length; columnEnds.push(0); }
      columnEnds[col] = new Date(ev.end).getTime();
      cols.push(col);
    }
    const groupSize = columnEnds.length;
    group.forEach((ev, j) => {
      out.set(ev, {
        startMs:   new Date(ev.start).getTime(),
        endMs:     new Date(ev.end).getTime(),
        groupSize,
        columnIdx: cols[j],
      });
    });
    if (i < sorted.length) {
      groupStart  = i;
      groupMaxEnd = new Date(sorted[i].end).getTime();
    }
  }
  return out;
}

function fmtDate(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString("en-US", opts);
}

/** Resolve a task to a local Date — preferring due_at (timestamptz) if
 *  present, falling back to due_date (YYYY-MM-DD, parsed as local
 *  midnight so timezone offsets don't push the day forward). Used
 *  everywhere we need to bucket a task into a day cell. */
function parseTaskDueDate(due: string): Date | null {
  // due_date-style input (YYYY-MM-DD). Append local midnight; new Date()
  // would otherwise treat the bare string as UTC.
  if (due.length === 10) {
    const d = new Date(due + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  // due_at-style input (ISO timestamp). Date() parses local-vs-UTC
  // correctly from the offset.
  const d = new Date(due);
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

// (Legacy TaskPopover removed — Calendar v3 uses TaskQuickEditPopover
// from ./TaskQuickEditPopover for inline task editing.)

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

// ── MonthGrid ──────────────────────────────────────────────────────────────────
// Six-week month grid (so any month fits with no layout shift). Cells
// show up to 3 event chips and a "+N more" link that opens a day overlay.
// Day-number click drops the user into Week view for that date.

interface MonthGridProps {
  viewDate:        Date;
  events:          CalEvent[];
  tasks:           Task[];
  projects:        { id: string; title: string; due_date: string | null; status: string }[];
  showWeekends:    boolean;
  onEventClick:    (e: CalEvent, rect: DOMRect | null) => void;
  onTaskClick:     (e: React.MouseEvent, t: Task) => void;
  onEmptyCellClick:(date: Date) => void;
  onDayNumberClick:(date: Date) => void;
  onShowMore:      (date: Date, x: number, y: number) => void;
}

function MonthGrid({
  viewDate, events, tasks, projects, showWeekends,
  onEventClick, onTaskClick, onEmptyCellClick, onDayNumberClick, onShowMore,
}: MonthGridProps) {
  const first      = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart  = getWeekStart(first);
  const cells      = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const visibleCols = showWeekends ? 7 : 5;
  const dowHeaders  = showWeekends
    ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    : ["Mon","Tue","Wed","Thu","Fri"];

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: "var(--color-off-white)" }}
    >
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${visibleCols}, 1fr)`,
          borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-warm-white)",
          flexShrink: 0,
        }}
      >
        {dowHeaders.map((d) => (
          <div
            key={d}
            style={{
              padding: "8px 10px",
              fontSize: 10, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.06em",
              color: "var(--color-text-tertiary)",
              borderLeft: "0.5px solid var(--color-border)",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6-row grid */}
      <div
        style={{
          flex: 1, display: "grid",
          gridTemplateColumns: `repeat(${visibleCols}, 1fr)`,
          gridTemplateRows: "repeat(6, minmax(0, 1fr))",
          overflow: "hidden",
        }}
      >
        {cells.map((date, idx) => {
          // Drop weekend cells when showWeekends is off — but only entire
          // weeks, never half-show.
          if (!showWeekends && (date.getDay() === 0 || date.getDay() === 6)) return null;

          const isCurrentMonth = date.getMonth() === viewDate.getMonth();
          const today          = isToday(date);
          const dayEvents      = events.filter((e) => {
            if (e.allDay) {
              const s = new Date(e.start + (e.start.length === 10 ? "T00:00:00" : ""));
              return isSameDay(s, date);
            }
            return isSameDay(new Date(e.start), date);
          });
          const dayTasks    = tasks.filter((t) => {
            const d = parseTaskDueDate(t.due_date!);
            return d ? isSameDay(d, date) : false;
          });
          const dayProjects = projects.filter((p) => p.due_date && isSameDay(new Date(p.due_date + "T00:00:00"), date));
          const chips       = [
            ...dayEvents.map((e) => ({ kind: "event" as const, e })),
            ...dayTasks .map((t) => ({ kind: "task"  as const, t })),
            ...dayProjects.map((p) => ({ kind: "project" as const, p })),
          ];
          const VISIBLE  = 3;
          const overflow = Math.max(0, chips.length - VISIBLE);
          const shown    = chips.slice(0, VISIBLE);

          return (
            <div
              key={idx}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                onEmptyCellClick(date);
              }}
              style={{
                borderLeft: "0.5px solid var(--color-border)",
                borderTop:  idx >= visibleCols ? "0.5px solid var(--color-border)" : "none",
                background: isCurrentMonth ? "var(--color-off-white)" : "var(--color-warm-white)",
                padding: "4px 6px 6px",
                position: "relative",
                display: "flex", flexDirection: "column", gap: 2,
                cursor: "pointer",
                minHeight: 0, overflow: "hidden",
              }}
            >
              {/* Day number — click to jump to Week view */}
              <div
                onClick={(e) => { e.stopPropagation(); onDayNumberClick(date); }}
                style={{
                  alignSelf: "flex-start",
                  width: 22, height: 22,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "50%",
                  background: today ? "var(--color-sage)" : "transparent",
                  color: today
                    ? "white"
                    : isCurrentMonth
                      ? "var(--color-text-primary)"
                      : "var(--color-text-tertiary)",
                  fontSize: 11, fontWeight: today ? 600 : 500,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {date.getDate()}
              </div>

              {shown.map((c, i) => {
                if (c.kind === "event") {
                  const e = c.e;
                  const color = e.colorId
                    ? GCAL_COLORS[e.colorId]
                    : (e.source === "microsoft" ? "#0078d4" : "#039BE5");
                  return (
                    <button
                      key={`e-${e.id}-${i}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                        onEventClick(e, rect);
                      }}
                      style={{
                        textAlign: "left",
                        background: `${color}18`, color,
                        border: `0.5px solid ${color}44`,
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontSize: 10, fontWeight: 500,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                      title={e.title}
                    >
                      {e.title}
                    </button>
                  );
                }
                if (c.kind === "task") {
                  const t = c.t;
                  const palette = PRIORITY_PALETTE[t.priority ?? "_default"];
                  return (
                    <button
                      key={`t-${t.id}`}
                      onClick={(ev) => { ev.stopPropagation(); onTaskClick(ev, t); }}
                      style={{
                        textAlign: "left",
                        background: palette.bg, color: palette.fg,
                        border: `0.5px solid ${palette.border}`,
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontSize: 10, fontWeight: 500,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        fontFamily: "inherit",
                        cursor: "pointer",
                        opacity: t.completed ? 0.45 : 1,
                        textDecoration: t.completed ? "line-through" : "none",
                      }}
                      title={t.title}
                    >
                      ☐ {t.title}
                    </button>
                  );
                }
                const p = c.p;
                return (
                  <div
                    key={`p-${p.id}`}
                    style={{
                      background: "rgba(155,163,122,0.14)",
                      color: "#5a7040",
                      border: "0.5px solid rgba(155,163,122,0.25)",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontSize: 10, fontWeight: 500,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {p.title} due
                  </div>
                );
              })}

              {overflow > 0 && (
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                    onShowMore(date, rect.left, rect.top + rect.height + 4);
                  }}
                  style={{
                    background: "transparent", border: "none",
                    color: "var(--color-text-tertiary)",
                    fontSize: 10, fontWeight: 500,
                    textAlign: "left", padding: "1px 6px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  +{overflow} more
                </button>
              )}
            </div>
          );
        })}
      </div>
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
  calendarId?: string | null;
  writable?:   boolean;
}

// Google Calendar event colors (colorId → hex)
const GCAL_COLORS: Record<string, string> = {
  "1": "#7986CB", "2": "#33B679", "3": "#8E24AA", "4": "#E67C73",
  "5": "#F6BF26", "6": "#F4511E", "7": "#039BE5", "8": "#616161",
  "9": "#3F51B5", "10": "#0B8043", "11": "#D50000",
};

// Tight projection of Opportunity used by the all-day row. Keeps the prop
// surface small — the Presence module owns the full record.
export interface CalendarOpportunity {
  id:          string;
  title:       string;
  event_type:  string;
  category:    string;
  start_date:  string | null;
  end_date:    string | null;
  location:    string | null;
  user_status: string | null;
}

interface Props {
  initialTasks:    Task[];
  initialProjects: { id: string; title: string; due_date: string | null; status: string }[];
  initialContacts: Pick<Contact, "id" | "first_name" | "last_name">[];
  initialOpportunities?: CalendarOpportunity[];
  googleConnected?:    boolean;
  googleAccountName?:  string | null;
  outlookConnected?:   boolean;
  outlookAccountName?: string | null;
}

// Soft palette per opportunity category. Stays close to Presence's catColor
// while leaning paler so a week of fairs doesn't overpower personal events.
const OPP_PALETTE: Record<string, { bg: string; fg: string; border: string }> = {
  fair:       { bg: "rgba(109,79,163,0.10)", fg: "#6d4fa3", border: "rgba(109,79,163,0.30)" },
  openCall:   { bg: "rgba(184,134,11,0.10)", fg: "#b8860b", border: "rgba(184,134,11,0.30)" },
  grant:      { bg: "rgba(61,107,79,0.10)",  fg: "#3d6b4f", border: "rgba(61,107,79,0.30)" },
  award:      { bg: "rgba(220,62,13,0.10)",  fg: "var(--color-red-orange)", border: "rgba(220,62,13,0.28)" },
  residency:  { bg: "rgba(20,140,140,0.10)", fg: "#148c8c", border: "rgba(20,140,140,0.30)" },
  _default:   { bg: "rgba(155,163,122,0.12)",fg: "#5a7040", border: "rgba(155,163,122,0.28)" },
};
function oppPalette(category: string) {
  return OPP_PALETTE[category] ?? OPP_PALETTE._default;
}

const OPP_CATEGORY_LABELS: Record<string, string> = {
  fair:      "Fairs",
  openCall:  "Open calls",
  grant:     "Grants",
  award:     "Awards",
  residency: "Residencies",
};
function oppCategoryLabel(cat: string): string {
  return OPP_CATEGORY_LABELS[cat] ?? (cat.charAt(0).toUpperCase() + cat.slice(1));
}

const OPP_VIS_STORAGE_KEY = "perennial:cal-opp-visibility";

function parseOppDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Categories we intentionally hide from the Perennial Feed in this pass.
// "award" is being reworked from ongoing submission protocols to a
// deadline-based UX (see deferred TODOs); until that ships, awards are
// dropped from the visible feed + all-day row so they don't read as
// recurring blocks.
const HIDDEN_FEED_CATEGORIES = new Set<string>(["award"]);

export default function CalendarClient({
  initialTasks, initialProjects, initialContacts,
  initialOpportunities: initialOpportunitiesRaw = [],
  googleConnected = false,
  outlookConnected = false,
}: Props) {
  // Drop the categories we don't surface in this pass before they reach
  // the feed list, the all-day row, or any cross-derived state.
  const initialOpportunities = useMemo(
    () => initialOpportunitiesRaw.filter(o => !HIDDEN_FEED_CATEGORIES.has(o.category)),
    [initialOpportunitiesRaw],
  );
  const [viewDate,        setViewDate]        = useState(new Date());
  const [tasks,           setTasks]           = useState<Task[]>(initialTasks);
  const [newTaskOpen,     setNewTaskOpen]     = useState(false);
  const [nowY,            setNowY]            = useState<number | null>(null);
  const [gcalEvents,      setGcalEvents]      = useState<CalEvent[]>([]);
  const [optionsOpen,     setOptionsOpen]     = useState(false);
  const [showWeekends,    setShowWeekends]    = useState(true);
  const [showDeclined,    setShowDeclined]    = useState(true);
  const [openEvent,       setOpenEvent]       = useState<CalEvent | null>(null);
  const [openEventAnchor, setOpenEventAnchor] = useState<DOMRect | null>(null);
  /** Open an event's preview panel anchored to the clicked chip's rect.
   *  Falls back to right-edge anchoring when called without a rect (deep
   *  links, month overlay rows). */
  function openEventAt(ev: CalEvent, rect: DOMRect | null) {
    setOpenEvent(ev);
    setOpenEventAnchor(rect);
  }
  const [createError,     setCreateError]     = useState<string | null>(null);
  const [newEventOpen,    setNewEventOpen]    = useState(false);
  const [newEventPrefill, setNewEventPrefill] = useState<{ start?: Date; end?: Date; allDay?: boolean } | null>(null);
  const [quickTask,       setQuickTask]       = useState<{ task: Task; x: number; y: number } | null>(null);
  // Quick-create task card. Triggered from a tasks-ribbon empty cell or
  // from a time-grid drag-create when the user picks "Create task"
  // instead of an event. Anchored to the clicked cell's rect.
  const [quickTaskCreate, setQuickTaskCreate] = useState<{ day: Date; anchorRect: DOMRect | null; defaultTime?: string; defaultEndTime?: string } | null>(null);
  const [viewMode,        setViewMode]        = useState<"Week" | "Month">("Week");
  const [monthDayOverlay, setMonthDayOverlay] = useState<{ date: Date; x: number; y: number } | null>(null);

  // Per-category visibility for the Perennial Feed opportunities ribbon.
  // We store hidden categories (not visible ones) so a fresh user who's
  // never touched the toggles sees everything. localStorage round-trips
  // on every change, gated on window so SSR doesn't choke.
  const [hiddenOppCats, setHiddenOppCats] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(OPP_VIS_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.filter((x): x is string => typeof x === "string"));
    } catch { return new Set(); }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OPP_VIS_STORAGE_KEY, JSON.stringify(Array.from(hiddenOppCats)));
    } catch { /* quota / safari private mode — ignore */ }
  }, [hiddenOppCats]);

  // Drag-to-reschedule task pills. Tracks the in-flight drag so we can
  // hide the source pill slightly while it follows the cursor.
  const [taskDrag, setTaskDrag] = useState<{ task: Task; x: number; y: number } | null>(null);
  function openQuickTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.right + 8 + 280 > window.innerWidth ? rect.left - 288 : rect.right + 8;
    const y = Math.min(rect.top, window.innerHeight - 280);
    setQuickTask({ task, x, y });
  }

  // Drag-to-create on the time grid. We track the column the drag started
  // in (so a horizontal wiggle doesn't bleed into the next day) and the
  // raw start/current Y in column-local pixels. Snap-to-15-min happens
  // on render of the ghost and at drop time.
  const [dragCreate, setDragCreate] = useState<{
    columnIdx: number;
    day:       Date;
    startY:    number;
    currentY:  number;
    allDay:    boolean;
    /** false once mouseup has fired and the create card is open — the
     *  ghost stays drawn but stops tracking the cursor and the global
     *  mousemove/mouseup listeners detach. */
    active:    boolean;
  } | null>(null);
  // Distinguish a click on the empty grid (single-slot 30 min add) from a
  // genuine drag — if the user releases within this px threshold of where
  // they started, we treat it as a 30 minute create at that time.
  const DRAG_THRESHOLD_PX = 4;

  // Freeze "did this user have any calendar connected at mount?" so the
  // tooltip tour can drop the connect-integration steps if so (mirrors the
  // hasPipelinesAtStart trick in OutreachTooltipTour).
  const [hadIntegrationAtMount] = useState(googleConnected || outlookConnected);
  const anyConnected = googleConnected || outlookConnected;

  const gridWrapRef  = useRef<HTMLDivElement>(null);
  const supabase     = createClient();

  const allWeekDays = getWeekDays(viewDate);
  const weekDays    = showWeekends
    ? allWeekDays
    : allWeekDays.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);

  // ── Drag-to-create: global mousemove/mouseup while a drag is active.
  // We keep the per-column hit testing in the column's own mousedown so
  // we can capture the originating column index and starting offset; the
  // global listeners just update currentY and finalize on release.
  useEffect(() => {
    if (!dragCreate || !dragCreate.active) return;

    function onMove(e: MouseEvent) {
      if (!dragCreate) return;
      // The column DOM node is uniquely identified by the data attribute
      // we set on each column root. We look up the originating column to
      // recompute the local Y as the user moves up/down (we don't allow
      // drag across columns — Notion Calendar doesn't either).
      const col = document.querySelector<HTMLElement>(
        `[data-cal-col="${dragCreate.columnIdx}"]`,
      );
      if (!col) return;
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top;
      setDragCreate((prev) => (prev ? { ...prev, currentY: y } : prev));
    }

    function onUp() {
      const drag = dragCreate;
      if (!drag) return;
      const dy = Math.abs(drag.currentY - drag.startY);

      // Snap both endpoints to 15-min grid. If the drag was effectively
      // a click (tiny dy), pop a 30-min default at the click point.
      const startMin = yToMinutes(Math.min(drag.startY, drag.currentY));
      let endMin     = yToMinutes(Math.max(drag.startY, drag.currentY));
      if (dy < DRAG_THRESHOLD_PX) endMin = startMin + 30;
      if (endMin <= startMin)     endMin = startMin + 15;

      const startDate = dayWithMinutes(drag.day, startMin);
      const endDate   = dayWithMinutes(drag.day, endMin);

      // Keep the drag ghost rendered so the user can see what area they
      // just selected while the create card is open. We snap startY /
      // currentY back to the finalized minute boundaries so the ghost
      // matches the prefilled times exactly. `active: false` detaches the
      // global listeners so the ghost stops tracking the cursor; it's
      // cleared entirely when the card closes (cancel / submit /
      // click-outside).
      const finalStartY = (startMin / 60) * PX_PER_HOUR;
      const finalEndY   = (endMin   / 60) * PX_PER_HOUR;
      setDragCreate({ ...drag, startY: finalStartY, currentY: finalEndY, active: false });
      setNewEventPrefill({ start: startDate, end: endDate, allDay: drag.allDay });
      setNewEventOpen(true);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [dragCreate]);

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
    function onCreated(e: Event) {
      const detail = (e as CustomEvent).detail as { event?: CalEvent } | undefined;
      if (!detail?.event) return;
      // Optimistically merge the new event into the visible week without
      // waiting for the next aggregator round-trip. The refresh-events
      // event also fires from NewEventModal and will reconcile shortly.
      setGcalEvents((prev) => {
        if (prev.some((p) => p.id === detail.event!.id)) return prev;
        return [...prev, detail.event!];
      });
    }
    window.addEventListener("calendar:refresh-events", onRefresh);
    window.addEventListener("calendar:event-created",  onCreated);
    return () => {
      window.removeEventListener("calendar:refresh-events", onRefresh);
      window.removeEventListener("calendar:event-created",  onCreated);
    };
  }, []);
  useEffect(() => {
    if (!anyConnected) return;
    // Month view fetches a 6-week window (always the full month-grid
    // visible range) so the cells don't miss events that straddle the
    // first or last visible day. Week view fetches the standard Sun-Sat.
    let startDate: Date, endDate: Date;
    if (viewMode === "Month") {
      const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      startDate = getWeekStart(first);
      endDate   = new Date(startDate);
      endDate.setDate(endDate.getDate() + 41); // 6 rows × 7 cols - 1
    } else {
      const days = getWeekDays(viewDate);
      startDate = days[0];
      endDate   = days[6];
    }
    const start = startDate.toISOString().split("T")[0];
    const end   = endDate.toISOString().split("T")[0];
    let cancelled = false;
    fetch(`/api/integrations/calendar/events?startDate=${start}&endDate=${end}`)
      .then(r => r.json())
      .then((d: { events?: CalEvent[] }) => {
        if (cancelled) return;
        setGcalEvents(d.events ?? []);
      })
      .catch(() => { /* swallow — failure leaves the previous events in place */ });
    return () => { cancelled = true; };
  }, [viewDate, viewMode, anyConnected, refreshNonce]);

  // ── Deep link: ?eventId=<encoded provider:external_id> opens the
  // EventDetailPanel for that event once it lands in gcalEvents. Used
  // by Ash references and shareable calendar links. We strip the query
  // immediately so refreshes don't re-fire on a stale id.
  const [pendingDeepLinkId, setPendingDeepLinkId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const enc = url.searchParams.get("eventId");
    if (!enc) return;
    setPendingDeepLinkId(decodeURIComponent(enc));
    url.searchParams.delete("eventId");
    window.history.replaceState({}, "", url.toString());
  }, []);

  useEffect(() => {
    if (!pendingDeepLinkId) return;
    // Format: "<provider>:<external_id>" — match either by that composite
    // or by external_id alone if the caller forgot the provider prefix.
    const ix       = pendingDeepLinkId.indexOf(":");
    const provider = ix > 0 ? pendingDeepLinkId.slice(0, ix) : null;
    const extId    = ix > 0 ? pendingDeepLinkId.slice(ix + 1) : pendingDeepLinkId;
    const match = gcalEvents.find((e) =>
      e.id === extId && (provider ? e.source === provider : true),
    );
    if (match) {
      // Deep link: no clicked chip, so anchor falls back to right edge.
      openEventAt(match, null);
      setPendingDeepLinkId(null);
    }
  }, [pendingDeepLinkId, gcalEvents]);

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
  function prevWeek() {
    setViewDate((d) => {
      const n = new Date(d);
      if (viewMode === "Month") n.setMonth(n.getMonth() - 1);
      else                       n.setDate(n.getDate() - 7);
      return n;
    });
  }
  function nextWeek() {
    setViewDate((d) => {
      const n = new Date(d);
      if (viewMode === "Month") n.setMonth(n.getMonth() + 1);
      else                       n.setDate(n.getDate() + 7);
      return n;
    });
  }
  function goToday()  { setViewDate(new Date()); }

  // ── Week label uses the full Sun-Sat span even when weekends are
  // hidden — the label describes the whole week the user is paging
  // through, not just the visible columns. In Month view we show just
  // the month name + year.
  const ws = allWeekDays[0];
  const we = allWeekDays[6];
  const weekLabel = viewMode === "Month"
    ? `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`
    : ws.getMonth() === we.getMonth()
      ? `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
      : `${fmtDate(ws, { month: "short", day: "numeric" })} – ${fmtDate(we, { month: "short", day: "numeric", year: "numeric" })}`;

  // ── Drag-to-reschedule: drop a task pill in a different day cell. We
  // optimistically write the new due_date and persist in the background.
  async function rescheduleTask(id: string, dueDateIso: string | null) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: dueDateIso } as Task : t)));
    await supabase.from("tasks").update({ due_date: dueDateIso }).eq("id", id);
  }

  // ── Completion: drop the task from the visible list immediately. The
  // server-side filter (.eq("completed", false)) already excludes
  // completed tasks on next page load, but the previous "linger + undo"
  // behavior kept the row in local state for 5s, which the user read as
  // "completed tasks aren't going away." Removing in-state on completion
  // makes the calendar surface match its semantics.
  async function markComplete(id: string) {
    setTasks(prev => prev.filter(r => r.id !== id));
    await supabase.from("tasks").update({ completed: true }).eq("id", id);
  }

  // Restore a task that was just marked complete. Used by the rail's Undo
  // link when the row is still present in local state at the moment of
  // the click (it's gone for good once removed, which is fine — the user
  // can recover it from Tasks).
  async function undoComplete(id: string) {
    setTasks(prev => prev.map(r => r.id === id ? { ...r, completed: false } : r));
    await supabase.from("tasks").update({ completed: false }).eq("id", id);
  }

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

  // Quick-create from the tasks ribbon (or any anchored entry point).
  // Supports the optional time-of-day via due_at — when set, the task
  // renders in the time grid; when null, it stays in the ribbon.
  async function quickCreateTask(input: QuickTaskInput) {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        setCreateError("Couldn't save — you may need to sign in again.");
        return;
      }
      const payload: Record<string, unknown> = {
        user_id:    user.id,
        title:      input.title,
        completed:  false,
        due_date:   input.dueDate,
        due_at:     input.dueAt,
        notes:      input.description,
      };
      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select("*, project:projects(id, title), contact:contacts(id, first_name, last_name)")
        .single();
      if (error || !data) {
        console.error("[calendar.quickCreateTask] insert failed:", error);
        setCreateError("Couldn't save that task. Try again — if it keeps failing, refresh the page.");
        return;
      }
      setTasks(prev => [data as Task, ...prev]);
    } catch (err) {
      console.error("[calendar.quickCreateTask] unexpected error:", err);
      setCreateError("Something went wrong saving that task.");
    }
  }

  // ── Derived lists ────────────────────────────────────────────────────────────
  // Tasks store due_date as a date (no time) — so everything renders as
  // all-day on the week grid. Time-of-day reminders are gone with the
  // reminders table.

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const scheduledTasks   = useMemo(() => tasks.filter(t => t.due_date), [tasks]);
  const unscheduledTasks = useMemo(() => tasks.filter(t => !t.due_date), [tasks]);
  // Ribbon tasks: have a due_date but NO due_at (day-only). These render
  // in the tasks ribbon above the time grid, as they always have.
  const ribbonTasks      = useMemo(() => tasks.filter(t => t.due_date && !t.due_at), [tasks]);
  // Timed tasks: have a due_at. These promote into the time grid as
  // copper-toned chips with a checkbox icon so they read as tasks, not
  // events. due_date may or may not also be set — we don't rely on it
  // for time-grid placement.
  const timedTasks       = useMemo(() => tasks.filter(t => !!t.due_at), [tasks]);

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
                onClick={(e) => openQuickTask(e, t)}
                className="flex items-start gap-2 px-3 py-[8px] transition-colors cursor-pointer"
                style={{ borderBottom: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => { if (!t.completed) e.currentTarget.style.background = "var(--color-cream)"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Check square — direct action */}
                <div
                  onClick={(e) => { e.stopPropagation(); t.completed ? undoComplete(t.id) : markComplete(t.id); }}
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
                    onClick={(e) => { e.stopPropagation(); undoComplete(t.id); }}
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
                  onClick={(e) => openQuickTask(e, t)}
                  className="flex items-start gap-2 px-3 py-[8px] transition-colors cursor-pointer"
                  style={{ borderBottom: "0.5px solid var(--color-border)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div
                    onClick={(e) => { e.stopPropagation(); t.completed ? undoComplete(t.id) : markComplete(t.id); }}
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

          {/* Perennial Feed — per-category toggles for the opportunity
              bars that float in from Presence. Categories with no rows
              are hidden so the list stays honest. */}
          {(() => {
            const counts: Record<string, number> = {};
            for (const o of initialOpportunities) {
              counts[o.category] = (counts[o.category] ?? 0) + 1;
            }
            const cats = Object.keys(counts).sort((a, b) =>
              oppCategoryLabel(a).localeCompare(oppCategoryLabel(b)),
            );
            if (cats.length === 0) return null;
            const allHidden = cats.every(c => hiddenOppCats.has(c));
            return (
              <div data-tour-target="calendar.opportunities" style={{ padding: "10px 0 4px" }}>
                <div style={{
                  padding: "0 14px 6px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
                    Perennial Feed
                  </span>
                  <button
                    onClick={() => {
                      setHiddenOppCats(() => allHidden ? new Set() : new Set(cats));
                    }}
                    style={{
                      background: "transparent", border: "none",
                      fontSize: 10, color: "var(--color-grey)",
                      cursor: "pointer", fontFamily: "inherit", padding: 0,
                    }}
                  >
                    {allHidden ? "Show all" : "Hide all"}
                  </button>
                </div>
                {cats.map(cat => {
                  const visible = !hiddenOppCats.has(cat);
                  const pal     = oppPalette(cat);
                  return (
                    <div
                      key={cat}
                      onClick={() => {
                        setHiddenOppCats(prev => {
                          const next = new Set(prev);
                          if (next.has(cat)) next.delete(cat); else next.add(cat);
                          return next;
                        });
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "4px 14px 4px 14px",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-cream)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{
                        width: 10, height: 10, borderRadius: 9999,
                        background: visible ? pal.fg : "transparent",
                        border: visible ? "none" : `1.5px solid ${pal.fg}`,
                        flexShrink: 0,
                      }} />
                      <span style={{
                        flex: 1, minWidth: 0,
                        fontSize: 11.5,
                        color: visible ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {oppCategoryLabel(cat)}
                      </span>
                      <span style={{
                        fontSize: 10, color: "var(--color-text-tertiary)",
                        flexShrink: 0,
                      }}>
                        {counts[cat]}
                      </span>
                      {visible
                        ? <Eye    size={12} strokeWidth={1.75} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
                        : <EyeOff size={12} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
                      }
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Calendar integrations connect-CTAs — only shown when the user
              has nothing connected yet. The connected-state status cards
              were removed; CalendarSourcesPanel handles per-account UI for
              connected users. The tour anchors here so a brand-new user
              still gets a clear "connect something" pointer. */}
          {!anyConnected && (
            <div data-tour-target="calendar.integrations" className="mx-3 mt-5 mb-3 flex flex-col gap-2">
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
            </div>
          )}
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

      {/* ── Main calendar ───────────────────────────────────────────────────────
          minWidth: 0 is critical — without it the flex item's intrinsic
          min-content (≥WEEK_MIN_WIDTH of the time grid below) prevents the
          column from shrinking under that width, which means the calendar
          pushes the viewport instead of letting `overflow-x: auto` on the
          inner grid wrapper kick in. */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ minWidth: 0 }}>

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
              {(["Week","Month"] as const).map((v) => {
                const active = viewMode === v;
                return (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className="px-3 py-[5px] text-[11px]"
                    style={{
                      background: active ? "var(--color-off-white)" : "transparent",
                      color:      active ? "var(--color-charcoal)" : "var(--color-grey)",
                      fontWeight: active ? 600 : 400,
                      border: "none", fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >{v}</button>
                );
              })}
            </div>

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

            <button
              data-tour-target="calendar.new-task-button"
              onClick={() => openNewTask()}
              style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 500,
                borderRadius: 8, cursor: "pointer",
                background: "var(--color-warm-white)", color: "var(--color-charcoal)",
                border: "0.5px solid var(--color-border)",
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-warm-white)")}
            >
              <CheckSquare size={11} />
              New task
            </button>
            <button
              onClick={() => { setNewEventPrefill(null); setNewEventOpen(true); }}
              style={{
                padding: "7px 14px", fontSize: 12, fontWeight: 500,
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
              New event
            </button>
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
                    onClick={(e) => openQuickTask(e, t)}
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

        {viewMode === "Month" ? (
          <MonthGrid
            viewDate={viewDate}
            events={gcalEvents}
            tasks={scheduledTasks}
            projects={initialProjects}
            showWeekends={showWeekends}
            onEventClick={openEventAt}
            onTaskClick={openQuickTask}
            onEmptyCellClick={(date) => {
              const start = new Date(date); start.setHours(0, 0, 0, 0);
              const end   = new Date(start); end.setDate(end.getDate() + 1);
              setNewEventPrefill({ start, end, allDay: true });
              setNewEventOpen(true);
            }}
            onDayNumberClick={(date) => { setViewMode("Week"); setViewDate(date); }}
            onShowMore={(date, x, y) => setMonthDayOverlay({ date, x, y })}
          />
        ) : (
        /* ── Single scroll container: day headers + all-day + time grid all share same width ──
            The outer wrapper provides BOTH axes of scroll. A single inner
            block carries minWidth: WEEK_MIN_WIDTH so every row shares the
            exact same horizontal scroll offset — day headers, tasks
            ribbon, all-day row, and time grid all pan together. Without
            the shared parent the sticky rows would compute their own
            min-width contexts and drift apart on narrow viewports. */
        <div
          ref={gridWrapRef}
          className="flex-1 overflow-y-auto overflow-x-auto"
          style={{ position: "relative", background: "var(--color-off-white)" }}
        >
        <div style={{ minWidth: WEEK_MIN_WIDTH, position: "relative" }}>

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

          {/* Tasks ribbon — sits directly under the day headers (above the
              all-day row) so the day's to-dos are the first thing the user
              scans. Drag-and-drop between cells reschedules. Sticky so it
              stays visible when the time grid scrolls underneath. */}
          <div
            style={{
              position: "sticky",
              top: `${DAY_HDR_H}px`,
              zIndex: 19,
              display: "flex",
              background: "var(--color-warm-white)",
              borderBottom: "0.5px solid var(--color-border)",
              minHeight: 26,
            }}
          >
            <div
              style={{
                width: 52, flexShrink: 0,
                display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                paddingRight: 8, paddingTop: 6,
                fontSize: 9, color: "var(--color-grey)",
                textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
              }}
            >
              Tasks
            </div>
            {weekDays.map((day, i) => {
              // Ribbon only shows day-only tasks now. Timed tasks (due_at)
              // render in the time grid below as chips.
              const dayTasks = ribbonTasks.filter((t) => {
                const d = parseTaskDueDate(t.due_date!);
                return d ? isSameDay(d, day) : false;
              });
              return (
                <div
                  key={i}
                  onClick={(e) => {
                    // Empty-cell click → open the quick-create task card
                    // anchored to this cell, pre-filled with the day.
                    if (e.target !== e.currentTarget) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setQuickTaskCreate({ day, anchorRect: rect });
                  }}
                  onDragOver={(e) => {
                    if (taskDrag) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
                  }}
                  onDrop={(e) => {
                    if (!taskDrag) return;
                    e.preventDefault();
                    const iso = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`;
                    if (taskDrag.task.due_date !== iso) rescheduleTask(taskDrag.task.id, iso);
                    setTaskDrag(null);
                  }}
                  style={{
                    flex: 1, borderLeft: "0.5px solid var(--color-border)",
                    padding: "3px 3px", display: "flex", flexDirection: "column", gap: 2,
                    background: taskDrag ? "rgba(155,163,122,0.04)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {dayTasks.map((t) => {
                    const palette = PRIORITY_PALETTE[t.priority ?? "_default"];
                    return (
                      <button
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          setTaskDrag({ task: t, x: e.clientX, y: e.clientY });
                          e.dataTransfer.effectAllowed = "move";
                          // Firefox refuses to fire drop events unless setData
                          // is called during dragstart. Empty payload is fine.
                          e.dataTransfer.setData("text/plain", t.id);
                        }}
                        onDragEnd={() => setTaskDrag(null)}
                        onClick={(e) => { e.stopPropagation(); openQuickTask(e, t); }}
                        style={{
                          background: palette.bg,
                          color: palette.fg,
                          border: `0.5px solid ${palette.border}`,
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontSize: 10, fontWeight: 500,
                          textAlign: "left",
                          cursor: "grab",
                          fontFamily: "inherit",
                          opacity: t.completed ? 0.45 : (taskDrag?.task.id === t.id ? 0.4 : 1),
                          textDecoration: t.completed ? "line-through" : "none",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}
                        title={t.title}
                      >
                        ☐ {t.title}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* All-day row — sits below the tasks ribbon. Uses CSS grid so
              multi-day opportunity bars can span columns natively without
              percentage-math. Per-day chips occupy the first grid row;
              each multi-day bar gets its own row beneath, sized to the
              visible window for this week. */}
          {(() => {
            // Compute opportunity spans visible in this week. startIdx/endIdx
            // are clamped to 0..6 so a multi-week opp still shows correctly.
            // Categories the user has toggled off via the left-rail
            // Perennial Feed panel are filtered out at the source.
            const oppSpans = initialOpportunities
              .filter(o => !hiddenOppCats.has(o.category))
              .map(o => {
                const s = parseOppDate(o.start_date);
                if (!s) return null;
                const e = parseOppDate(o.end_date) ?? s;
                const startIdx = weekDays.findIndex(d => isSameDay(d, s) || d > s);
                const endIdx   = weekDays.findIndex(d => isSameDay(d, e) || d > e);
                const inferStart = startIdx === -1 ? -1 : (s < weekDays[0] ? 0 : startIdx);
                const inferEnd   = e   < weekDays[0]               ? -1
                                 : e   > weekDays[weekDays.length - 1] ? 6
                                 : endIdx === -1 ? 6 : (isSameDay(weekDays[endIdx], e) ? endIdx : Math.max(0, endIdx - 1));
                if (inferStart < 0 || inferEnd < 0 || inferEnd < inferStart) return null;
                return { opp: o, startIdx: inferStart, endIdx: inferEnd };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
              // Longest first so the most prominent bars settle into the
              // top rows; shorter ones stack underneath.
              .sort((a, b) => (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));

            return (
              <div
                style={{
                  position: "sticky",
                  top: `${DAY_HDR_H + 26}px`,
                  zIndex: 18,
                  background: "var(--color-off-white)",
                  borderBottom: "0.5px solid var(--color-border)",
                  display: "grid",
                  gridTemplateColumns: "52px repeat(7, 1fr)",
                  gridAutoRows: "min-content",
                  rowGap: 2,
                  minHeight: 30,
                  paddingBottom: oppSpans.length > 0 ? 4 : 0,
                }}
              >
                <div
                  style={{
                    gridColumn: 1, gridRow: "1 / -1",
                    display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
                    paddingRight: 8, paddingTop: 6,
                    fontSize: 9, color: "var(--color-grey)",
                  }}
                >
                  All day
                </div>

                {/* Per-day cells: single-day items (gcal all-day, project
                    deadlines). Multi-day opps move to rows below. */}
                {weekDays.map((day, i) => {
                  const dayProjects   = initialProjects.filter(p => p.due_date && isSameDay(new Date(p.due_date + "T00:00:00"), day));
                  const dayGcalAllDay = gcalEvents.filter(e => e.allDay && isSameDay(new Date(e.start), day));
                  return (
                    <div
                      key={i}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const start = new Date(day); start.setHours(0, 0, 0, 0);
                        const end   = new Date(start); end.setDate(end.getDate() + 1);
                        setNewEventPrefill({ start, end, allDay: true });
                        setNewEventOpen(true);
                      }}
                      style={{
                        gridColumn: i + 2, gridRow: 1,
                        borderLeft: "0.5px solid var(--color-border)",
                        padding: "3px 3px",
                        display: "flex", flexDirection: "column", gap: 2,
                        cursor: "pointer",
                        minHeight: 28,
                      }}
                    >
                      {dayGcalAllDay.map(e => {
                        const color = e.colorId ? GCAL_COLORS[e.colorId] : (e.source === "microsoft" ? "#0078d4" : "#039BE5");
                        return (
                          <button
                            key={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEventAt(e, (ev.currentTarget as HTMLElement).getBoundingClientRect());
                            }}
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
                      {dayProjects.map(p => (
                        <div key={p.id} className="text-[10px] font-medium px-[6px] py-[1px] rounded truncate"
                          style={{ background: "rgba(155,163,122,0.14)", color: "#5a7040", border: "0.5px solid rgba(155,163,122,0.25)" }}
                        >{p.title} due</div>
                      ))}
                    </div>
                  );
                })}

                {/* Multi-day opp bars — one per row, spanning the visible
                    range of the opportunity. Title shows at the left edge of
                    the bar; the bar stretches to indicate the duration. */}
                {oppSpans.map((span, idx) => {
                  const pal = oppPalette(span.opp.category);
                  const s = parseOppDate(span.opp.start_date);
                  const e = parseOppDate(span.opp.end_date) ?? s;
                  const startsBeforeWeek = s && s < weekDays[0];
                  const endsAfterWeek    = e && e > weekDays[weekDays.length - 1];
                  return (
                    <a
                      key={span.opp.id}
                      href={`/presence?opportunityId=${span.opp.id}`}
                      title={`${span.opp.title}${span.opp.location ? ` · ${span.opp.location}` : ""}`}
                      style={{
                        gridColumn: `${span.startIdx + 2} / ${span.endIdx + 3}`,
                        gridRow: idx + 2,
                        marginLeft: 2, marginRight: 2,
                        background: pal.bg, color: pal.fg,
                        border: `0.5px dashed ${pal.border}`,
                        // Round outside edges; flat where the bar continues
                        // beyond this week so the user can tell it's a span.
                        borderTopLeftRadius:    startsBeforeWeek ? 0 : 4,
                        borderBottomLeftRadius: startsBeforeWeek ? 0 : 4,
                        borderTopRightRadius:   endsAfterWeek    ? 0 : 4,
                        borderBottomRightRadius: endsAfterWeek   ? 0 : 4,
                        padding: "1px 6px",
                        fontSize: 10, fontWeight: 500,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        textDecoration: "none",
                        fontFamily: "inherit",
                      }}
                    >
                      {startsBeforeWeek && "← "}{span.opp.title}{endsAfterWeek && " →"}
                    </a>
                  );
                })}
              </div>
            );
          })()}

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
                const dragHere = dragCreate?.columnIdx === colIdx ? dragCreate : null;
                return (
                  <div
                    key={colIdx}
                    data-cal-col={colIdx}
                    onMouseDown={(e) => {
                      // Only start a drag on left-click of the empty column.
                      // Clicks on event chips inside the column have their
                      // own onClick that calls stopPropagation via setOpenEvent;
                      // we additionally bail if the target isn't this exact
                      // column node so descendant interactive elements win.
                      if (e.button !== 0) return;
                      if (e.target !== e.currentTarget) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      setDragCreate({
                        columnIdx: colIdx,
                        day,
                        startY:    y,
                        currentY:  y,
                        allDay:    e.shiftKey,
                        active:    true,
                      });
                    }}
                    style={{
                      flex: 1,
                      borderLeft: "0.5px solid var(--color-border)",
                      position: "relative",
                      height: `${GRID_HEIGHT}px`,
                      background: today ? "rgba(155,163,122,0.05)" : "transparent",
                      cursor: "crosshair",
                      userSelect: dragCreate ? "none" : "auto",
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

                    {/* Drag-to-create ghost block */}
                    {dragHere && (() => {
                      const startMin = yToMinutes(Math.min(dragHere.startY, dragHere.currentY));
                      const endMin   = Math.max(
                        startMin + 15,
                        yToMinutes(Math.max(dragHere.startY, dragHere.currentY)),
                      );
                      const topPx    = (startMin / 60) * PX_PER_HOUR;
                      const heightPx = ((endMin - startMin) / 60) * PX_PER_HOUR;
                      const startD   = dayWithMinutes(day, startMin);
                      const endD     = dayWithMinutes(day, endMin);
                      const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                      return (
                        <div
                          style={{
                            position: "absolute",
                            top:      `${topPx}px`,
                            left:     "2px",
                            right:    "2px",
                            height:   `${heightPx}px`,
                            background:   "rgba(155,163,122,0.22)",
                            border:       "1px solid var(--color-sage)",
                            borderRadius: 4,
                            zIndex:       4,
                            pointerEvents: "none",
                            padding:      "2px 6px",
                            color:        "#4a5630",
                            fontSize:     10,
                            fontWeight:   500,
                            overflow:     "hidden",
                          }}
                        >
                          New event<br/>
                          <span style={{ fontSize: 9, opacity: 0.85 }}>
                            {fmt(startD)} – {fmt(endD)}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Current time indicator */}
                    {today && nowY !== null && (
                      <div style={{ position: "absolute", top: `${nowY}px`, left: 0, right: 0, zIndex: 5, pointerEvents: "none" }}>
                        <div style={{ position: "absolute", left: "-4px", top: "-3.5px", width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-orange)" }} />
                        <div style={{ height: "1.5px", background: "var(--color-orange)" }} />
                      </div>
                    )}

                    {/* Google Calendar events — laid out side-by-side when
                        they overlap so each chip stays legible. The
                        layoutDayEvents helper builds transitive overlap
                        groups; within a group every chip gets a column
                        index and groupSize to compute left/width. */}
                    {(() => {
                      const dayEvents = gcalEvents.filter(e => {
                        if (e.allDay) return false;
                        return isSameDay(new Date(e.start), day);
                      });
                      const layout = layoutDayEvents(dayEvents);
                      return dayEvents.map((e, ei) => {
                        const start = new Date(e.start);
                        const end   = new Date(e.end);
                        const y     = timeToY(start.getHours(), start.getMinutes());
                        const endY  = timeToY(end.getHours(), end.getMinutes());
                        const h     = Math.max(24, endY - y);
                        const color = e.colorId ? GCAL_COLORS[e.colorId] : (e.source === "microsoft" ? "#0078d4" : "#039BE5");
                        if (y < 0 || y > GRID_HEIGHT) return null;
                        const slot = layout.get(e);
                        const groupSize = slot?.groupSize ?? 1;
                        const colIdx    = slot?.columnIdx ?? 0;
                        const GAP_PX    = 2;
                        // Width is a percentage of the column; we leave a
                        // tiny gap between adjacent chips so the eye reads
                        // them as separate items.
                        const widthPct  = 100 / groupSize;
                        const leftPct   = colIdx * widthPct;
                        // Short chips (≤30 min) only have room for one line;
                        // longer ones get the two-line clamp.
                        const titleLines = h < 36 ? 1 : 2;
                        return (
                          <button
                            key={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openEventAt(e, (ev.currentTarget as HTMLElement).getBoundingClientRect());
                            }}
                            style={{
                              position: "absolute",
                              top:    `${y}px`,
                              left:   `calc(${leftPct}% + ${colIdx === 0 ? 4 : GAP_PX / 2}px)`,
                              width:  `calc(${widthPct}% - ${colIdx === 0 || colIdx === groupSize - 1 ? GAP_PX + 4 : GAP_PX}px)`,
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
                              // Title + time stack from the top of the chip;
                              // for short chips this keeps the title visible
                              // instead of vertically centering it into the
                              // time text below.
                              display:         "flex",
                              flexDirection:   "column",
                              justifyContent:  "flex-start",
                              alignItems:      "stretch",
                              gap:             1,
                            }}
                            title={`${e.title}${e.location ? ` · ${e.location}` : ""}`}
                          >
                            <p
                              className="text-[11px] font-medium"
                              style={{
                                color, lineHeight: "1.25",
                                display: "-webkit-box",
                                WebkitLineClamp: titleLines,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                wordBreak: "break-word",
                              }}
                            >
                              {e.title}
                            </p>
                            <p
                              className="text-[9px]"
                              style={{
                                color, opacity: 0.8,
                                display: "-webkit-box",
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              {e.location ? ` · ${e.location}` : ""}
                            </p>
                          </button>
                        );
                      });
                    })()}

                    {/* Timed tasks — render as copper-toned chips with a
                        checkbox icon so they read as tasks, not events.
                        Tasks without a due_at stay in the tasks ribbon
                        above. Click opens the quick-edit popover. */}
                    {(() => {
                      const dayTimedTasks = timedTasks.filter((t) => {
                        const d = t.due_at ? new Date(t.due_at) : null;
                        return d ? isSameDay(d, day) : false;
                      });
                      return dayTimedTasks.map((t) => {
                        const at = new Date(t.due_at!);
                        const y  = timeToY(at.getHours(), at.getMinutes());
                        if (y < 0 || y > GRID_HEIGHT) return null;
                        const h  = 32;
                        // Copper-tone palette — keeps tasks visually
                        // distinct from the cool-toned event chips.
                        const fg     = "#a85a1f";
                        const bg     = "rgba(168,90,31,0.10)";
                        const border = "rgba(168,90,31,0.30)";
                        return (
                          <button
                            key={`tt-${t.id}`}
                            onClick={(ev) => { ev.stopPropagation(); openQuickTask(ev, t); }}
                            style={{
                              position: "absolute",
                              top:    `${y}px`,
                              left:   "4px",
                              right:  "4px",
                              height: `${h}px`,
                              borderRadius: 4,
                              borderLeft:   `2.5px solid ${fg}`,
                              borderTop:    "none",
                              borderRight:  "none",
                              borderBottom: "none",
                              background:   bg,
                              padding:      "3px 6px",
                              cursor:       "pointer",
                              zIndex:       3,
                              overflow:     "hidden",
                              textAlign:    "left",
                              fontFamily:   "inherit",
                              display: "flex", alignItems: "flex-start", gap: 5,
                              outline: `0.5px solid ${border}`,
                              outlineOffset: "-0.5px",
                              opacity: t.completed ? 0.5 : 1,
                            }}
                            title={t.title}
                          >
                            <CheckSquare size={10} strokeWidth={2} style={{ color: fg, flexShrink: 0, marginTop: 1 }} />
                            <span style={{
                              flex: 1, minWidth: 0,
                              fontSize: 11, fontWeight: 500, color: fg,
                              lineHeight: 1.25,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              textDecoration: t.completed ? "line-through" : "none",
                            }}>
                              {t.title}
                            </span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
        </div>
        )}
        </>
        )}
      </div>

      {/* Month "+N more" day overlay */}
      {monthDayOverlay && (() => {
        const date = monthDayOverlay.date;
        const dayEvents   = gcalEvents.filter((e) => {
          if (e.allDay) {
            const s = new Date(e.start + (e.start.length === 10 ? "T00:00:00" : ""));
            return isSameDay(s, date);
          }
          return isSameDay(new Date(e.start), date);
        });
        const dayTasks    = scheduledTasks.filter((t) => {
          const d = parseTaskDueDate(t.due_date!);
          return d ? isSameDay(d, date) : false;
        });
        const dayProjects = initialProjects.filter((p) => p.due_date && isSameDay(new Date(p.due_date + "T00:00:00"), date));

        const W = 280;
        const left = Math.min(monthDayOverlay.x, window.innerWidth - W - 8);
        const top  = Math.min(monthDayOverlay.y, window.innerHeight - 320);

        return (
          <>
            <div
              onClick={() => setMonthDayOverlay(null)}
              style={{ position: "fixed", inset: 0, zIndex: 75 }}
            />
            <div
              style={{
                position: "fixed",
                top: `${Math.max(8, top)}px`,
                left: `${Math.max(8, left)}px`,
                zIndex: 76,
                width: W,
                maxHeight: 380, overflowY: "auto",
                background: "var(--color-off-white)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
                padding: 14,
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <p style={{
                    fontSize: 9, fontWeight: 600, textTransform: "uppercase",
                    letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
                    marginBottom: 2,
                  }}>
                    {date.toLocaleDateString("en-US", { weekday: "long" })}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
                    {date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                  </p>
                </div>
                <button
                  onClick={() => setMonthDayOverlay(null)}
                  style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: "transparent", border: "none",
                    color: "var(--color-text-tertiary)", cursor: "pointer", fontSize: 16,
                  }}
                >×</button>
              </div>

              {dayEvents.length === 0 && dayTasks.length === 0 && dayProjects.length === 0 && (
                <p style={{ fontSize: 11.5, color: "var(--color-text-tertiary)" }}>Nothing scheduled.</p>
              )}

              {dayEvents.map((e) => {
                const color = e.colorId ? GCAL_COLORS[e.colorId] : (e.source === "microsoft" ? "#0078d4" : "#039BE5");
                const time  = e.allDay ? "all day" : new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                return (
                  <button
                    key={e.id}
                    onClick={() => { setMonthDayOverlay(null); openEventAt(e, null); }}
                    style={{
                      width: "100%", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", marginBottom: 2,
                      background: "transparent", border: "none",
                      borderLeft: `2.5px solid ${color}`,
                      cursor: "pointer", fontFamily: "inherit",
                      borderRadius: 4,
                    }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--color-cream)")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", flexShrink: 0, width: 56 }}>{time}</span>
                    <span style={{ fontSize: 11.5, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.title}
                    </span>
                  </button>
                );
              })}
              {dayTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={(ev) => { setMonthDayOverlay(null); openQuickTask(ev, t); }}
                  style={{
                    width: "100%", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px", marginBottom: 2,
                    background: "transparent", border: "none",
                    borderLeft: "2.5px solid var(--color-sage)",
                    cursor: "pointer", fontFamily: "inherit",
                    borderRadius: 4,
                    opacity: t.completed ? 0.5 : 1,
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", flexShrink: 0, width: 56 }}>task</span>
                  <span style={{ fontSize: 11.5, color: "var(--color-text-primary)", textDecoration: t.completed ? "line-through" : "none" }}>
                    {t.title}
                  </span>
                </button>
              ))}
              {dayProjects.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px",
                    borderLeft: "2.5px solid #5a7040",
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", flexShrink: 0, width: 56 }}>due</span>
                  <span style={{ fontSize: 11.5, color: "var(--color-text-primary)" }}>{p.title}</span>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* Quick-edit task popover (rail + ribbon + topbar) */}
      {quickTask && (
        <TaskQuickEditPopover
          task={quickTask.task}
          x={quickTask.x}
          y={quickTask.y}
          onClose={() => setQuickTask(null)}
          onUpdated={(t) => setTasks((prev) => prev.map((p) => (p.id === t.id ? t : p)))}
          onCompleted={(id, completed) => {
            // Drop from local state immediately when completed (the server
            // filter already hides completed tasks on next load). On undo
            // (completed=false) just flip the boolean so the row reappears.
            if (completed) {
              setTasks((prev) => prev.filter((p) => p.id !== id));
            } else {
              setTasks((prev) => prev.map((p) => (p.id === id ? { ...p, completed } : p)));
            }
          }}
          onDeleted={(id) => setTasks((prev) => prev.filter((p) => p.id !== id))}
        />
      )}

      {/* Quick-create task card (ribbon empty-cell click) */}
      {quickTaskCreate && (
        <QuickTaskCard
          day={quickTaskCreate.day}
          anchorRect={quickTaskCreate.anchorRect}
          defaultTime={quickTaskCreate.defaultTime}
          defaultEndTime={quickTaskCreate.defaultEndTime}
          onClose={() => setQuickTaskCreate(null)}
          onCreate={quickCreateTask}
        />
      )}

      {/* New event modal */}
      {newEventOpen && (
        <NewEventModal
          defaultStart={newEventPrefill?.start}
          defaultEnd={newEventPrefill?.end}
          defaultAllDay={newEventPrefill?.allDay}
          onClose={() => {
            setNewEventOpen(false);
            setNewEventPrefill(null);
            // Closing the create card always clears the drag-create ghost
            // (whether opened via cancel, submit, click-outside, or Esc).
            setDragCreate(null);
          }}
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
          anchorRect={openEventAnchor}
          onClose={() => { setOpenEvent(null); setOpenEventAnchor(null); }}
          onUpdated={(updated) => {
            setGcalEvents((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } as CalEvent : e)));
            setOpenEvent((prev) => (prev && prev.id === updated.id ? ({ ...prev, ...updated } as CalEvent) : prev));
          }}
          onDeleted={(id) => {
            setGcalEvents((prev) => prev.filter((e) => e.id !== id));
            setOpenEvent(null);
            setOpenEventAnchor(null);
          }}
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
