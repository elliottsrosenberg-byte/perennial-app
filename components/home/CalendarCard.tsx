"use client";

import { useEffect, useState } from "react";
import VisitButton from "@/components/ui/VisitButton";

export interface CalendarItem {
  id:    string;
  title: string;
  date:  string;
  kind:  "deadline" | "task";
}

// A connected-calendar event, as returned by /api/integrations/calendar/events.
interface CalEvent {
  id:     string;
  title:  string;
  start:  string;
  allDay: boolean;
}

// Unified row rendered in the card — real calendar events merged with project
// deadlines and dated tasks, sorted by date.
interface Row {
  key:   string;
  title: string;
  date:  string;   // ISO (date or datetime) used for the day badge + sort
  label: string;   // "Event" / "Project deadline" / "Task"
  time?: string;   // "3:30 PM" for timed events
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function relative(iso: string): string {
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  const today  = new Date();    today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0)   return `${Math.abs(diff)}d ago`;
  if (diff < 7)   return `In ${diff}d`;
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function CalendarCard({ items }: { items: CalendarItem[] }) {
  const now = new Date();
  const [events, setEvents] = useState<CalEvent[]>([]);

  // Pull upcoming events from the connected calendars (Google/Outlook). If no
  // calendar is connected the response is empty and the card falls back to
  // deadlines/tasks only.
  useEffect(() => {
    const start = new Date();
    const end   = new Date(Date.now() + 21 * 86400000);
    const s = start.toISOString().split("T")[0];
    const e = end.toISOString().split("T")[0];
    let cancelled = false;
    fetch(`/api/integrations/calendar/events?startDate=${s}&endDate=${e}`)
      .then((r) => r.json())
      .then((d: { events?: CalEvent[] }) => { if (!cancelled) setEvents(d.events ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  const rows: Row[] = [
    ...events.map((ev) => ({
      key:   `event-${ev.id}`,
      title: ev.title,
      date:  ev.start,
      label: "Event",
      time:  ev.allDay ? undefined : fmtTime(ev.start),
    })),
    ...items.map((it) => ({
      key:   `${it.kind}-${it.id}`,
      title: it.title,
      date:  it.date,
      label: it.kind === "deadline" ? "Project deadline" : "Task",
    })),
  ];

  const upcoming = rows
    .filter((r) => new Date(r.date).getTime() >= startOfToday.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 6);

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px] shrink-0"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Calendar</span>
        <span
          className="text-[10px] px-[7px] py-[1px] rounded-full"
          style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
        >
          {MONTHS[now.getMonth()]} {now.getDate()}
        </span>
        <VisitButton href="/calendar" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-8 px-4 h-full">
            <p className="text-[12px] font-medium mb-0.5" style={{ color: "var(--color-charcoal)" }}>
              Nothing upcoming
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              Calendar events, project deadlines, and dated tasks show up here.
            </p>
          </div>
        ) : (
          upcoming.map((row) => {
            const d = new Date(row.date);
            return (
              <div
                key={row.key}
                className="flex items-center gap-3 px-[14px] py-[9px]"
                style={{ borderBottom: "0.5px solid var(--color-border)" }}
              >
                <div
                  className="flex flex-col items-center justify-center flex-shrink-0"
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: "var(--color-cream)",
                    border: "0.5px solid var(--color-border)",
                  }}
                >
                  <span className="text-[8px] uppercase" style={{ color: "var(--color-grey)", letterSpacing: "0.05em" }}>
                    {MONTHS[d.getMonth()]}
                  </span>
                  <span className="text-[12px] font-semibold leading-none" style={{ color: "var(--color-charcoal)" }}>
                    {d.getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] truncate" style={{ color: "var(--color-charcoal)" }}>
                    {row.title}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                    {relative(row.date)}{row.time ? ` · ${row.time}` : ""} · {row.label}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
