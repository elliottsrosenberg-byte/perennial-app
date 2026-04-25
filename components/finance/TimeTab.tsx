"use client";

import { useState, useMemo } from "react";
import type { TimeEntry, ActiveTimer, Project } from "@/types/database";

interface Props {
  timeEntries: TimeEntry[];
  activeTimer: ActiveTimer | null;
  timerSeconds: number;
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onStopTimer: () => void;
  onStartTimer: (projectId: string | null, description: string) => void;
  onEntryCreated: (entry: TimeEntry) => void;
}

const PROJ_COLORS = ["#2563ab","#6d4fa3","#148c8c","#3d6b4f","#b8860b","#dc3e0d"];
function projectColor(id: string | null | undefined) {
  if (!id) return "#9BA37A";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return PROJ_COLORS[Math.abs(h) % PROJ_COLORS.length];
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

function getWeekDays(anchor: Date) {
  const d = new Date(anchor);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}

const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function TimeTab({ timeEntries, activeTimer, timerSeconds, projects, onStopTimer, onStartTimer, onEntryCreated }: Props) {
  const [filterProject, setFilterProject] = useState("all");
  const [billableOnly, setBillableOnly]   = useState(false);
  const [weekOffset, setWeekOffset]       = useState(0);

  const weekAnchor = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
  const weekStart = toDateStr(weekDays[0]);
  const weekEnd   = toDateStr(weekDays[6]);

  const filtered = useMemo(() => timeEntries.filter((e) => {
    if (filterProject !== "all" && e.project_id !== filterProject) return false;
    if (billableOnly && !e.billable) return false;
    return true;
  }), [timeEntries, filterProject, billableOnly]);

  const weekEntries = useMemo(() =>
    filtered.filter((e) => e.logged_at >= weekStart && e.logged_at <= weekEnd),
  [filtered, weekStart, weekEnd]);

  // Day totals for bar chart
  const dayTotals = useMemo(() => weekDays.map((d) => {
    const ds = toDateStr(d);
    const dayEntries = weekEntries.filter((e) => e.logged_at === ds);
    const byProject: Record<string, number> = {};
    dayEntries.forEach((e) => {
      const key = e.project_id ?? "__none__";
      byProject[key] = (byProject[key] ?? 0) + e.duration_minutes;
    });
    return { total: dayEntries.reduce((s, e) => s + e.duration_minutes, 0), byProject };
  }), [weekEntries, weekDays]);

  const maxMinutes = Math.max(60, ...dayTotals.map((d) => d.total));

  // Group filtered entries by date for the list below
  const grouped = useMemo(() => {
    const map: Record<string, TimeEntry[]> = {};
    filtered.forEach((e) => {
      if (!map[e.logged_at]) map[e.logged_at] = [];
      map[e.logged_at].push(e);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  const weekBillableMin = weekEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration_minutes, 0);

  function fmtGroupDate(ds: string) {
    const d = new Date(ds + "T12:00:00");
    const today = toDateStr(new Date());
    const yest  = toDateStr(new Date(Date.now() - 86400000));
    if (ds === today) return "Today";
    if (ds === yest)  return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const weekLabel = (() => {
    const s = weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const e = weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : `${s} – ${e}`;
  })();

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
          className="px-3 py-1.5 text-[11px] rounded-lg focus:outline-none"
          style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <div className="flex items-center gap-1 rounded-lg overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
          <button onClick={() => setWeekOffset((v) => v - 1)}
            className="px-2.5 py-1.5 text-[11px] transition-colors"
            style={{ color: "var(--color-grey)", background: "var(--color-warm-white)" }}>‹</button>
          <span className="px-2 py-1.5 text-[11px]"
            style={{ color: "var(--color-charcoal)", background: "var(--color-warm-white)", borderLeft: "0.5px solid var(--color-border)", borderRight: "0.5px solid var(--color-border)" }}>
            {weekLabel}
          </span>
          <button onClick={() => setWeekOffset((v) => Math.min(0, v + 1))} disabled={weekOffset === 0}
            className="px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-30"
            style={{ color: "var(--color-grey)", background: "var(--color-warm-white)" }}>›</button>
        </div>
        <button onClick={() => setBillableOnly((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg transition-colors"
          style={{
            background: billableOnly ? "rgba(61,107,79,0.1)" : "var(--color-warm-white)",
            border: `0.5px solid ${billableOnly ? "rgba(61,107,79,0.3)" : "var(--color-border)"}`,
            color: billableOnly ? "var(--color-sage)" : "var(--color-grey)",
          }}>
          Billable only
        </button>
        <div className="ml-auto text-[11px]" style={{ color: "var(--color-grey)" }}>
          Week total: <strong style={{ color: "var(--color-charcoal)" }}>{fmtDuration(weekEntries.reduce((s, e) => s + e.duration_minutes, 0))}</strong>
          {weekBillableMin > 0 && <span> · {fmtDuration(weekBillableMin)} billable</span>}
        </div>
      </div>

      {/* Week bar chart */}
      <div className="rounded-xl p-4 flex gap-3 items-end"
        style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
        {weekDays.map((day, i) => {
          const { total, byProject } = dayTotals[i];
          const isToday = toDateStr(day) === toDateStr(new Date());
          const barH = Math.round((total / maxMinutes) * 64);
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
              <div className="w-full flex flex-col justify-end gap-px" style={{ height: 64 }}>
                {Object.entries(byProject).map(([pid, mins]) => (
                  <div key={pid}
                    style={{
                      height: Math.max(2, Math.round((mins / maxMinutes) * 64)),
                      background: projectColor(pid === "__none__" ? null : pid),
                      opacity: 0.75,
                      borderRadius: 2,
                    }} />
                ))}
              </div>
              <span className="text-[10px] font-semibold tabular-nums"
                style={{ color: isToday ? "var(--color-sage)" : total === 0 ? "var(--color-border)" : "var(--color-charcoal)" }}>
                {total === 0 ? "—" : fmtDuration(total)}
              </span>
              <span className="text-[9px] uppercase tracking-wider"
                style={{ color: isToday ? "var(--color-sage)" : "var(--color-grey)", fontWeight: isToday ? 700 : 400 }}>
                {DAY_LABELS[i]}
              </span>
            </div>
          );
        })}
        {/* Legend */}
        {projects.filter((p) => weekEntries.some((e) => e.project_id === p.id)).length > 0 && (
          <div className="flex flex-col gap-1.5 pl-4 ml-2 shrink-0" style={{ borderLeft: "0.5px solid var(--color-border)" }}>
            {projects.filter((p) => weekEntries.some((e) => e.project_id === p.id)).map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-grey)" }}>
                <div className="w-2 h-2 rounded-sm" style={{ background: projectColor(p.id), opacity: 0.8 }} />
                {p.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Entry list */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
        {/* Active timer strip */}
        {activeTimer && (
          <div className="flex items-center gap-2.5 px-4 py-2.5"
            style={{ background: "rgba(61,107,79,0.06)", borderBottom: "0.5px solid rgba(61,107,79,0.15)" }}>
            <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: "var(--color-sage)" }} />
            <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "var(--color-sage)" }}>
              {activeTimer.project?.title ?? "No project"}{activeTimer.description ? ` · ${activeTimer.description}` : ""}
            </span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--color-sage)" }}>{fmtTimer(timerSeconds)}</span>
            <button onClick={onStopTimer}
              className="text-[10px] px-2 py-1 rounded-md"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
              Stop
            </button>
          </div>
        )}

        {grouped.length === 0 && !activeTimer && (
          <p className="px-4 py-6 text-[12px] text-center" style={{ color: "var(--color-grey)" }}>No time entries found.</p>
        )}

        {grouped.map(([date, entries]) => (
          <div key={date}>
            <div className="px-4 py-2" style={{ background: "rgba(31,33,26,0.04)", borderBottom: "0.5px solid var(--color-border)", borderTop: "0.5px solid var(--color-border)" }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>
                {fmtGroupDate(date)} · {fmtDuration(entries.reduce((s, e) => s + e.duration_minutes, 0))}
              </span>
            </div>
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: projectColor(e.project_id) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{e.description || "—"}</p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{e.project?.title ?? "No project"}</p>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: e.billable ? "rgba(61,107,79,0.1)" : "rgba(31,33,26,0.07)", color: e.billable ? "var(--color-sage)" : "var(--color-grey)" }}>
                  {e.billable ? "BILLABLE" : "INTERNAL"}
                </span>
                <span className="text-[12px] font-medium tabular-nums w-14 text-right" style={{ color: "var(--color-charcoal)" }}>
                  {fmtDuration(e.duration_minutes)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
