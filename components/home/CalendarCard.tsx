"use client";

import VisitButton from "@/components/ui/VisitButton";

export interface CalendarItem {
  id:    string;
  title: string;
  date:  string;
  kind:  "deadline" | "task";
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

export default function CalendarCard({ items }: { items: CalendarItem[] }) {
  const now = new Date();
  const upcoming = items
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

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
              Nothing on the calendar
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              Project deadlines and dated tasks will show up here.
            </p>
          </div>
        ) : (
          upcoming.map((item) => {
            const d = new Date(item.date);
            return (
              <div
                key={`${item.kind}-${item.id}`}
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
                    {item.title}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                    {relative(item.date)} · {item.kind === "deadline" ? "Project deadline" : "Task"}
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
