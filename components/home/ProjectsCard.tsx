"use client";

import Link from "next/link";

interface HomeProject {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
}

const STATUS_DOT: Record<string, string> = {
  in_progress: "var(--color-sage)",
  planning:    "var(--color-grey)",
  on_hold:     "var(--color-warm-yellow)",
};

function dueBadge(due: string | null): { label: string; color: string; bg: string } | null {
  if (!due) return null;
  const days = Math.ceil((new Date(due + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0)  return { label: "Overdue", color: "var(--color-red-orange)", bg: "rgba(220,62,13,0.10)" };
  if (days === 0) return { label: "Today",  color: "#a07800",                 bg: "rgba(232,197,71,0.15)" };
  if (days <= 7)  return { label: `${days}d`, color: "#a07800",               bg: "rgba(232,197,71,0.15)" };
  return {
    label: new Date(due + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    color: "var(--color-grey)",
    bg:    "rgba(31,33,26,0.06)",
  };
}

export default function ProjectsCard({ projects }: { projects: HomeProject[] }) {
  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px]"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>
          Projects
        </span>
        {projects.length > 0 && (
          <span
            className="text-[10px] px-[7px] py-[1px] rounded-full"
            style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
          >
            {projects.length}
          </span>
        )}
        <div className="flex-1" />
        <Link href="/projects" className="text-[11px] hover:underline" style={{ color: "#2563ab" }}>
          View all →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-7 px-4 text-center flex-1">
          <p className="text-[12px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No active projects</p>
          <Link href="/projects" className="text-[11px] hover:underline mt-1" style={{ color: "#2563ab" }}>
            Create your first project →
          </Link>
        </div>
      ) : (
        projects.map((p) => {
          const dot   = STATUS_DOT[p.status] ?? "var(--color-grey)";
          const badge = dueBadge(p.due_date);
          return (
            <div
              key={p.id}
              className="flex items-center gap-2.5 px-[14px] py-[8px]"
              style={{ borderBottom: "0.5px solid var(--color-border)" }}
            >
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
              <span className="flex-1 truncate text-[12px]" style={{ color: "#6b6860" }}>{p.title}</span>
              {badge ? (
                <span
                  className="text-[9px] font-semibold px-[6px] py-[2px] rounded-full shrink-0"
                  style={{ color: badge.color, background: badge.bg }}
                >
                  {badge.label}
                </span>
              ) : (
                <span className="text-[11px] shrink-0" style={{ color: "var(--color-grey)" }}>—</span>
              )}
            </div>
          );
        })
      )}

    </div>
  );
}
