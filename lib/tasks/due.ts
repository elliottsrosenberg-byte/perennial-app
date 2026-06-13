// ─── Shared task due-date chip helpers ──────────────────────────────────────
//
// Single source of truth for the Overdue / Today / Tomorrow / "N days" chip
// label + colour used by the task pickers in both the Tasks page and the
// project detail panel. Dates are stored as bare "YYYY-MM-DD" strings and
// compared at local midnight.

function todayMidnight(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

export function dueChipLabel(due: string | null): string | null {
  if (!due) return null;
  const days = Math.round((parseDate(due).getTime() - todayMidnight().getTime()) / 86400000);
  if (days < 0)   return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 14) return `${days} days`;
  return parseDate(due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dueChipColor(due: string | null): string {
  if (!due) return "var(--color-text-tertiary)";
  const days = (parseDate(due).getTime() - todayMidnight().getTime()) / 86400000;
  if (days < 0)  return "var(--color-red-orange)";
  if (days <= 1) return "#a07800";
  if (days <= 7) return "var(--color-text-secondary)";
  return "var(--color-text-tertiary)";
}
