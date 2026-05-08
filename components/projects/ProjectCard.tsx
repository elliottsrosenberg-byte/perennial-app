"use client";

import type { Project } from "@/types/database";

// ── Helpers ──────────────────────────────────────────────────────────────────

function timelineProgress(start: string | null, due: string | null) {
  if (!due) return null;
  const now = Date.now();
  const dueTs = new Date(due).getTime();
  if (!start) return { pct: now > dueTs ? 100 : 0, overdue: now > dueTs };
  const startTs = new Date(start).getTime();
  const total = dueTs - startTs;
  const elapsed = now - startTs;
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  return { pct, overdue: now > dueTs };
}

function timeActive(startDate: string | null) {
  if (!startDate) return "Not started yet";
  const weeks = Math.floor(
    (Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24 * 7)
  );
  if (weeks < 1) return "Started this week";
  return `Started ${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function formatDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const STATUS_ACCENT: Record<string, string> = {
  in_progress: "var(--color-sage)",
  planning:    "var(--color-grey)",
  on_hold:     "var(--color-warm-yellow)",
  complete:    "var(--color-green)",
  cut:         "var(--color-red-orange)",
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  high:   { bg: "rgba(220,62,13,0.10)",   color: "var(--color-red-orange)", label: "High" },
  medium: { bg: "rgba(232,197,71,0.15)",  color: "#a07800",                 label: "Med"  },
  low:    { bg: "rgba(155,163,122,0.12)", color: "#5a7040",                 label: "Low"  },
};

const TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  painting:       { bg: "#e8e3f0", color: "#6d4fa3", label: "Painting"  },
  sculpture:      { bg: "#f0ebe0", color: "#b8860b", label: "Sculpture" },
  furniture:      { bg: "#f0ebe0", color: "#b8860b", label: "Furniture" },
  client_project: { bg: "#e0eaf5", color: "#2563ab", label: "Client"    },
};

function TypeSpecificProps({ project }: { project: Project }) {
  const rows: { label: string; value: string }[] = [];

  if (project.type === "client_project") {
    if (project.client_name) rows.push({ label: "Client",    value: project.client_name });
    if (project.rate)        rows.push({ label: "Rate",      value: `$${project.rate} / hr` });
    rows.push({ label: "Billed", value: `${project.billed_hours} hrs` });
    if (project.est_value)   rows.push({ label: "Est. value", value: `$${project.est_value.toLocaleString()}` });
  } else {
    if (project.listing_price) rows.push({ label: "Price",      value: `$${project.listing_price.toLocaleString()}` });
    if (project.dimensions)    rows.push({ label: "Dimensions", value: project.dimensions });
    if (project.materials)     rows.push({ label: "Materials",  value: project.materials });
    if (project.weight)        rows.push({ label: "Weight",     value: project.weight });
  }

  if (rows.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-[5px] py-[10px] mb-3"
      style={{ borderTop: "0.5px solid var(--color-border)", borderBottom: "0.5px solid var(--color-border)" }}
    >
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>{r.label}</span>
          <span className="text-[11px] font-medium text-right" style={{ color: "#6b6860" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  project:    Project;
  onClick?:   () => void;
  isDragging?: boolean;
}

export default function ProjectCard({ project, onClick, isDragging }: Props) {
  const tasks = project.tasks ?? [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const taskPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const timeline = timelineProgress(project.start_date, project.due_date);
  const priority = PRIORITY_STYLE[project.priority] ?? PRIORITY_STYLE.medium;
  const typeStyle = project.type ? TYPE_STYLE[project.type] : null;
  // Accent bar always reflects status — overdue is communicated via due badge and bar
  const accentColor = STATUS_ACCENT[project.status] ?? "var(--color-grey)";
  const isHold = project.status === "on_hold";
  const isCut  = project.status === "cut";

  // Due badge
  let dueBadge: { label: string; bg: string; color: string } | null = null;
  if (project.due_date) {
    const daysLeft = Math.ceil(
      (new Date(project.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft < 0) {
      dueBadge = { label: "Overdue", bg: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" };
    } else if (daysLeft <= 14) {
      dueBadge = { label: `Due ${formatDate(project.due_date)}`, bg: "rgba(232,197,71,0.15)", color: "#a07800" };
    } else {
      dueBadge = { label: `Due ${formatDate(project.due_date)}`, bg: "var(--color-cream)", color: "#6b6860" };
    }
  } else if (isHold) {
    dueBadge = { label: "On hold", bg: "rgba(232,197,71,0.15)", color: "#a07800" };
  }

  return (
    <div
      onClick={onClick}
      className="flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all duration-150"
      style={{
        height: "100%",
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        opacity: isDragging ? 0.88 : isHold || isCut ? 0.65 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.07)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Accent bar */}
      <div className="h-[3px] shrink-0" style={{ background: accentColor }} />

      <div className="px-4 pt-[14px] pb-4 flex flex-col flex-1">
        {/* Title + priority */}
        <div className="flex items-start justify-between gap-2 mb-[5px]">
          <span className="text-[13px] font-semibold leading-snug" style={{ color: "var(--color-charcoal)" }}>
            {project.title}
          </span>
          <span
            className="text-[10px] font-medium px-[7px] py-[2px] rounded-full shrink-0 mt-[1px]"
            style={{ background: priority.bg, color: priority.color }}
          >
            {priority.label}
          </span>
        </div>

        {/* Type tag */}
        {typeStyle && (
          <div className="mb-3">
            <span
              className="text-[10px] font-medium px-[7px] py-[2px] rounded-full"
              style={{ background: typeStyle.bg, color: typeStyle.color }}
            >
              {typeStyle.label}
            </span>
          </div>
        )}

        {/* Properties */}
        <TypeSpecificProps project={project} />

        {/* Timeline bar OR time-active */}
        {timeline ? (
          <div className="mb-3">
            <div className="flex justify-between mb-[5px]">
              <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                {project.start_date ? formatDate(project.start_date) : "Not started"}
              </span>
              <span
                className="text-[10px]"
                style={{ color: timeline.overdue ? "var(--color-red-orange)" : "var(--color-grey)" }}
              >
                {formatDate(project.due_date!)} {timeline.overdue ? "· overdue" : ""}
              </span>
            </div>
            <div className="h-1 rounded-full" style={{ background: "var(--color-border)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${timeline.pct}%`,
                  background: timeline.overdue ? "var(--color-red-orange)" : "var(--color-sage)",
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mb-3">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-grey)" strokeWidth="1.4">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5v3.75l2.25 1.5" />
            </svg>
            <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              {timeActive(project.start_date)}{" "}
              {!project.due_date && (
                <strong style={{ color: "#6b6860", fontWeight: 500 }}>· no due date</strong>
              )}
            </span>
          </div>
        )}

        {/* Task progress */}
        <div className="flex items-center gap-2.5 justify-between">
          <div className="flex-1 h-[3px] rounded-full" style={{ background: "var(--color-border)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${taskPct}%`,
                background: timeline?.overdue ? "var(--color-red-orange)" : "var(--color-sage)",
              }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              {completedCount} / {totalCount} tasks
            </span>
            {dueBadge && (
              <span
                className="text-[10px] font-medium px-[7px] py-[2px] rounded-full"
                style={{ background: dueBadge.bg, color: dueBadge.color }}
              >
                {dueBadge.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
