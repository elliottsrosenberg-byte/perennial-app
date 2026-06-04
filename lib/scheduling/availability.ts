// Availability engine for scheduling links. Pure, side-effect-free: given a
// link's rules, a browse range, the organizer's busy blocks, and existing
// bookings, it returns the open slots as absolute UTC instants. The busy
// blocks are fetched separately (lib/scheduling/busy.ts) so this stays
// trivially testable and free of network/timezone-of-the-server concerns.
//
// All wall-clock reasoning happens in the link's IANA timezone using Intl —
// no date library — so DST transitions are handled correctly.

import type { SchedulingLink } from "@/types/database";

export interface Interval { start: string; end: string } // ISO 8601

export interface SlotComputeInput {
  from: Date;            // browse range start (inclusive)
  to:   Date;            // browse range end (exclusive)
  now:  Date;            // current instant (min-notice anchor)
  busy: Interval[];      // absolute busy blocks from connected calendars
  bookings?: Interval[]; // existing confirmed bookings to also avoid
}

export interface OpenSlot { start: string; end: string } // ISO absolute

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** Milliseconds `tz` is ahead of UTC at the given instant (negative west of
 *  Greenwich). Works by formatting the instant as wall-clock in `tz` and
 *  diffing against the same fields read as UTC. */
export function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const f: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") f[p.type] = p.value;
  const asUTC = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour, +f.minute, +f.second);
  return asUTC - date.getTime();
}

/** Convert a wall-clock time in `tz` to the matching UTC instant, correcting
 *  for the offset that actually applies at that local time (DST-aware). */
export function wallClockToUtc(y: number, mo: number, d: number, hh: number, mm: number, tz: string): Date {
  const guessUTC = Date.UTC(y, mo - 1, d, hh, mm, 0);
  const off = tzOffsetMs(new Date(guessUTC), tz);
  let utc = guessUTC - off;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off) utc = guessUTC - off2; // recheck once across a DST jump
  return new Date(utc);
}

/** The civil (calendar) date of an instant as seen in `tz`. */
function civilDateInTz(date: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const f: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== "literal") f[p.type] = p.value;
  return { y: +f.year, mo: +f.month, d: +f.day };
}

function parseHM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h || 0, m || 0];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeOpenSlots(link: SchedulingLink, input: SlotComputeInput): OpenSlot[] {
  const { now, busy, bookings = [] } = input;
  const dur       = link.duration_minutes * MIN_MS;
  const inc       = (link.slot_increment_minutes ?? link.duration_minutes) * MIN_MS;
  const bufBefore = link.buffer_before_minutes * MIN_MS;
  const bufAfter  = link.buffer_after_minutes * MIN_MS;
  const minStart  = now.getTime() + link.min_notice_minutes * MIN_MS;

  // Hard upper bound on slot starts: browse range, booking window (recurring
  // only — one-off windows define their own reach), and link expiration.
  const caps = [input.to.getTime()];
  if (link.kind !== "one_off") caps.push(now.getTime() + link.booking_window_days * DAY_MS);
  if (link.expires_at) caps.push(new Date(link.expires_at).getTime());
  const windowEnd  = Math.min(...caps);
  const rangeStart = Math.max(input.from.getTime(), now.getTime());

  // Resolve the offered availability into absolute [start,end] windows.
  const windows: { start: number; end: number }[] = [];
  if (link.kind === "one_off") {
    for (const w of link.availability.windows ?? []) {
      windows.push({ start: new Date(w.start).getTime(), end: new Date(w.end).getTime() });
    }
  } else {
    const weekly = link.availability.weekly_hours ?? {};
    // Walk civil dates in the link's tz. Anchor each day at UTC noon so the
    // y/m/d/weekday we read back is stable across DST (noon never shifts day).
    const first = civilDateInTz(new Date(rangeStart), link.timezone);
    let cursor = Date.UTC(first.y, first.mo - 1, first.d, 12);
    const guard = windowEnd + DAY_MS;
    while (cursor <= guard) {
      const dd = new Date(cursor);
      const y = dd.getUTCFullYear(), mo = dd.getUTCMonth() + 1, d = dd.getUTCDate();
      const weekday = dd.getUTCDay();
      for (const win of weekly[String(weekday)] ?? []) {
        const [sh, sm] = parseHM(win.start);
        const [eh, em] = parseHM(win.end);
        const ws = wallClockToUtc(y, mo, d, sh, sm, link.timezone).getTime();
        const we = wallClockToUtc(y, mo, d, eh, em, link.timezone).getTime();
        if (we > ws) windows.push({ start: ws, end: we });
      }
      cursor += DAY_MS;
    }
  }

  const blocked = [...busy, ...bookings].map((b) => ({
    start: new Date(b.start).getTime(),
    end:   new Date(b.end).getTime(),
  }));

  const slots: OpenSlot[] = [];
  const seen = new Set<number>();
  for (const w of windows) {
    for (let s = w.start; s + dur <= w.end; s += inc) {
      if (s >= windowEnd) break;
      if (s < rangeStart || s < minStart) continue;
      if (seen.has(s)) continue;
      const e = s + dur;
      // The slot plus its buffers must be entirely free.
      const conflict = blocked.some((b) => overlaps(s - bufBefore, e + bufAfter, b.start, b.end));
      if (conflict) continue;
      seen.add(s);
      slots.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString() });
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  return slots;
}
