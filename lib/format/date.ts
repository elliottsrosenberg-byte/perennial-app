// Shared date/time formatting helpers.
//
// This module de-duplicates the ~13 per-file formatter copies that had drifted
// apart over time (Change-Playbook registry item J). It is intentionally free of
// "use client" and any client-only imports so it can be imported from both
// server components / route handlers and client components.
//
// Each export documents the exact rendered shape it produces. When migrating a
// call site, pick the export whose output byte-for-byte matches the local copy.
// Several superficially-similar variants are kept distinct on purpose (e.g.
// short- vs long-month, numeric vs named fallback, noon-anchored date-only vs
// raw timestamp) to preserve each site's rendered output.

/**
 * Relative time, fine-grained: "just now" / "{m}m ago" / "{h}h ago" /
 * "{d}d ago" (under 7 days) / "Mon D" beyond a week.
 * Used by NotesCard, ProjectDetailPanel, NotesClient.
 */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Relative time, same thresholds as {@link timeAgo} but with a NUMERIC fallback
 * ("6/13" instead of "Jun 13") for entries older than a week — keeps narrow
 * integration rows from wrapping. Used by Settings ("Synced X" lines).
 */
export function timeAgoNumericFallback(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 3_600_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 24 * 3_600_000) return `${Math.floor(diff / (24 * 3_600_000))}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

/**
 * Relative time, day granularity only: "today" / "yesterday" /
 * "{d}d ago" (under 7 days) / "Mon D" beyond a week. No minute/hour buckets.
 * Used by AshPanel conversation history.
 */
export function timeAgoDays(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Time of day, "h:mm AM/PM" (e.g. "3:30 PM"). Accepts an ISO string or a Date. */
export function fmtTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Elapsed seconds as "H:MM:SS" (hours not zero-padded). Used by the timers. */
export function fmtTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Day, relative: "Today" / "Yesterday" / "Mon D" (no year). Operates on a full
 * timestamp via local calendar-day comparison.
 * Used by the Network/Outreach detail-panel activity rows.
 */
export function fmtDayRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Absolute date, short month with year: "Jun 13, 2026". Anchors a date-only
 * ("YYYY-MM-DD") string at local noon to avoid TZ off-by-one. Returns "—" for
 * null/empty. Used by InvoicesTab, ProjectDetailPanel.
 */
export function fmtDateShort(ds: string | null): string {
  if (!ds) return "—";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Same as {@link fmtDateShort} ("Jun 13, 2026") but returns "" (not "—") for
 * null/empty, since the caller renders the date inline only when present.
 * Used by PressTab.
 */
export function fmtDateShortBlank(ds: string | null): string {
  if (!ds) return "";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Absolute date, long month with year: "June 13, 2026". Anchors a date-only
 * ("YYYY-MM-DD") string at local noon to avoid TZ off-by-one. Returns "—" for
 * null/empty. Used by the invoice surfaces (public invoice page, print page,
 * send-invoice email).
 */
export function fmtDateLong(ds: string | null): string {
  if (!ds) return "—";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Long-month date from a full TIMESTAMP (no noon anchoring): "June 13, 2026".
 * Distinct from {@link fmtDateLong}, which expects a date-only string — this one
 * is for timestamptz values like `updated_at`. Used by the shared-note page.
 */
export function fmtTimestampLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Date + time, "Mon D, h:mm AM/PM" (e.g. "Jun 13, 3:30 PM"). Used by NotesClient. */
export function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
