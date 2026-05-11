"use client";

import Link from "next/link";

export interface CalendarItem {
  id: string;
  title: string;
  date: string;       // ISO date or datetime
  kind: "deadline" | "reminder";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function relative(iso: string): string {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0)   return `${Math.abs(diff)}d ago`;
  if (diff < 7)   return `In ${diff}d`;
  return formatDay(iso);
}

export default function CalendarCard({ items }: { items: CalendarItem[] }) {
  const now = new Date();
  const upcoming = items
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 14,
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-charcoal)" }}>
          Calendar
        </h2>
        <Link
          href="/calendar"
          className="text-[11px] font-medium"
          style={{ color: "var(--color-sage)" }}
        >
          View all →
        </Link>
      </div>

      <div className="flex-1 overflow-hidden px-4 py-4">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ height: "100%" }}>
            <p className="text-[20px] font-medium" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-newsreader)" }}>
              {MONTHS[now.getMonth()]} {now.getDate()}
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--color-grey)" }}>
              Nothing on the calendar
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3">
                <div
                  className="flex flex-col items-center justify-center flex-shrink-0"
                  style={{
                    width: 38, height: 38, borderRadius: 8,
                    background: "var(--color-cream)",
                    border: "0.5px solid var(--color-border)",
                  }}
                >
                  <span className="text-[8px] uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>
                    {MONTHS[new Date(item.date).getMonth()]}
                  </span>
                  <span className="text-[13px] font-semibold leading-none" style={{ color: "var(--color-charcoal)" }}>
                    {new Date(item.date).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>
                    {item.title}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                    {relative(item.date)} · {item.kind === "deadline" ? "Project deadline" : "Reminder"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/calendar"
        className="px-4 py-3 text-[11px] font-medium flex items-center gap-1"
        style={{ borderTop: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
      >
        + New event
      </Link>
    </div>
  );
}
