"use client";

import type { Project } from "@/types/database";
import { useProjectOptions } from "@/lib/projects/options";

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

// Convert an accent colour into a soft chip background — works for both
// hex strings (`#b8860b`) and our CSS variables (we fall back to a neutral
// translucent backdrop for the variable case, since color-mix on `var(...)`
// can be uneven across browsers).
function chipBackground(color: string): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r)) return `rgba(${r},${g},${b},0.12)`;
  }
  if (color === "var(--color-sage)")        return "rgba(155,163,122,0.14)";
  if (color === "var(--color-warm-yellow)") return "rgba(232,197,71,0.15)";
  if (color === "var(--color-red-orange)")  return "rgba(220,62,13,0.10)";
  if (color === "var(--color-green)")       return "rgba(141,208,71,0.12)";
  if (color === "var(--color-grey)")        return "rgba(154,150,144,0.14)";
  return "rgba(31,33,26,0.06)";
}

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
  const { resolve } = useProjectOptions();
  const tasks = project.tasks ?? [];
  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const taskPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const timeline      = timelineProgress(project.start_date, project.due_date);
  const statusOption  = resolve("status",   project.status);
  const priorityOption = resolve("priority", project.priority);
  const typeOption    = project.type ? resolve("type", project.type) : null;
  // Accent bar always reflects status — overdue is communicated via due badge and bar
  const accentColor = statusOption.color;
  const priorityChip = { bg: chipBackground(priorityOption.color), color: priorityOption.color, label: priorityOption.label };
  const typeChip     = typeOption ? { bg: chipBackground(typeOption.color), color: typeOption.color, label: typeOption.label } : null;
  // Visual "muted" state for legacy on_hold / cut keys (still labelled by user)
  const isMuted = project.status === "on_hold" || project.status === "cut";

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
  } else if (project.status === "on_hold") {
    dueBadge = { label: statusOption.label, bg: "rgba(232,197,71,0.15)", color: "#a07800" };
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
        opacity: isDragging ? 0.88 : isMuted ? 0.65 : 1,
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
            style={{ background: priorityChip.bg, color: priorityChip.color }}
          >
            {priorityChip.label}
          </span>
        </div>

        {/* Type tag */}
        {typeChip && (
          <div className="mb-3">
            <span
              className="text-[10px] font-medium px-[7px] py-[2px] rounded-full"
              style={{ background: typeChip.bg, color: typeChip.color }}
            >
              {typeChip.label}
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
