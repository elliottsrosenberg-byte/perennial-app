"use client";

// Invitee-facing booking UI. Three panes: meeting details, a month calendar
// (days with availability are dotted), and the chosen day's time slots. Pick a
// time → confirm form → confirmation screen. All times come from the API as
// absolute UTC instants and are formatted in the visitor's chosen timezone.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicOrganizer } from "@/lib/scheduling/public-link";
import type { SchedulingLocationType, SchedulingLinkKind } from "@/types/database";

export interface PublicLinkView {
  title:            string;
  description:      string | null;
  duration_minutes: number;
  location_type:    SchedulingLocationType;
  location_detail:  string | null;
  timezone:         string;
  kind:             SchedulingLinkKind;
}

interface Props {
  slug:      string;
  link:      PublicLinkView;
  organizer: PublicOrganizer;
}

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const LOCATION_LABEL: Record<SchedulingLocationType, string> = {
  google_meet: "Google Meet",
  teams:       "Microsoft Teams",
  phone:       "Phone call",
  in_person:   "In person",
  custom:      "Details provided upon confirmation",
};

/** Civil date key (YYYY-MM-DD) of an instant in a timezone. */
function dayKeyInTz(iso: string, tz: string): string {
  const f: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso))) if (p.type !== "literal") f[p.type] = p.value;
  return `${f.year}-${f.month}-${f.day}`;
}

function timeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit",
  }).format(new Date(iso)).toLowerCase().replace(" ", "");
}

function longDateInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric",
  }).format(new Date(iso));
}

function tzOffsetLabel(tz: string): string {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  return s;
}

const COMMON_TZS = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney",
];

export default function BookingClient({ slug, link, organizer }: Props) {
  const accent = organizer.brand_color || "#4a5842";

  const browserTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return link.timezone; }
  }, [link.timezone]);
  const [tz, setTz] = useState(link.timezone);
  useEffect(() => { if (browserTz) setTz(browserTz); }, [browserTz]);

  // Month being viewed (anchored to its 1st, local to the browser for grid math).
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-11

  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState<"expired" | "full" | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [step, setStep] = useState<"pick" | "confirm" | "done">("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<
    { start: string; meet_url: string | null; location: string | null } | null
  >(null);

  // Fetch slots for the visible month (clamped to now on the low end).
  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 1);
    const from = monthStart.getTime() < now.getTime() ? now : monthStart;
    const params = new URLSearchParams({ from: from.toISOString(), to: monthEnd.toISOString() });
    try {
      const res = await fetch(`/api/book/${slug}/slots?${params}`);
      const data = await res.json();
      if (data.closed) { setClosed(data.closed); setSlots([]); }
      else setSlots(data.slots?.map((s: { start: string }) => s.start) ?? []);
    } catch { setSlots([]); }
    setLoading(false);
  }, [slug, viewYear, viewMonth, now]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Map of dayKey → sorted slot ISO list, in the chosen tz.
  const slotsByDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots) {
      const k = dayKeyInTz(s, tz);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort();
    return m;
  }, [slots, tz]);

  // If the selected day loses its slots (tz change / refetch), clear it.
  useEffect(() => {
    if (selectedDay && !slotsByDay.has(selectedDay)) { setSelectedDay(null); setSelectedSlot(null); }
  }, [slotsByDay, selectedDay]);

  const daySlots = selectedDay ? slotsByDay.get(selectedDay) ?? [] : [];

  // Build the month grid (leading blanks + days).
  const grid = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, key });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const canGoPrev = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth > now.getMonth());
  const goPrev = () => {
    if (!canGoPrev) return;
    const m = viewMonth - 1; if (m < 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(m);
    setSelectedDay(null); setSelectedSlot(null);
  };
  const goNext = () => {
    const m = viewMonth + 1; if (m > 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(m);
    setSelectedDay(null); setSelectedSlot(null);
  };

  async function submit() {
    if (!selectedSlot) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selectedSlot, name, email, notes, timezone: tz }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); setSubmitting(false); return; }
      setConfirmation({ start: selectedSlot, meet_url: data.booking?.meet_url ?? null, location: data.booking?.location ?? null });
      setStep("done");
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (step === "done" && confirmation) {
    return (
      <Shell accent={accent}>
        <div className="px-8 py-12 text-center max-w-md mx-auto">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full" style={{ background: `${accent}1f` }}>
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h1 className="text-xl font-semibold text-[#1f211a]">You&rsquo;re scheduled</h1>
          <p className="mt-1 text-sm text-[#9a9690]">A calendar invite is on its way to {email}.</p>
          <div className="mt-6 rounded-xl border border-[#eceae3] bg-[#faf9f6] p-5 text-left">
            <p className="text-sm font-semibold text-[#1f211a]">{link.title}</p>
            <p className="mt-2 text-sm text-[#4a4842]">{longDateInTz(confirmation.start, tz)}</p>
            <p className="text-sm text-[#4a4842]">{timeInTz(confirmation.start, tz)} – {timeInTz(addMinutes(confirmation.start, link.duration_minutes), tz)} ({tzOffsetLabel(tz)})</p>
            {confirmation.meet_url && (
              <a href={confirmation.meet_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium" style={{ color: accent }}>Join the video call →</a>
            )}
            {confirmation.location && <p className="mt-3 text-sm text-[#4a4842]">{confirmation.location}</p>}
          </div>
          <p className="mt-8 text-xs text-[#b8b4ac]">Scheduled with Perennial</p>
        </div>
      </Shell>
    );
  }

  // ── Main booking UI ─────────────────────────────────────────────────────────
  return (
    <Shell accent={accent}>
      <div className="grid md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr_300px]">
        {/* Meeting details */}
        <aside className="border-b border-[#eceae3] p-7 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2.5">
            {organizer.avatar_url
              ? <img src={organizer.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              : <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: accent }}>{organizer.name.charAt(0)}</div>}
            <div>
              <p className="text-sm font-medium text-[#1f211a]">{organizer.name}</p>
              <p className="text-xs text-[#9a9690]">Organizer</p>
            </div>
          </div>
          <h1 className="mt-5 text-lg font-semibold text-[#1f211a]">{link.title}</h1>
          <ul className="mt-4 space-y-2.5 text-sm text-[#4a4842]">
            <li className="flex items-center gap-2.5">
              <IconClock /> {link.duration_minutes} min
            </li>
            <li className="flex items-center gap-2.5">
              <IconPin /> {LOCATION_LABEL[link.location_type]}
            </li>
          </ul>
          {link.description && <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-[#6b6961]">{link.description}</p>}
        </aside>

        {/* Calendar */}
        <section className="border-b border-[#eceae3] p-7 lg:border-b-0 lg:border-r">
          <p className="mb-4 text-sm font-semibold text-[#1f211a]">Pick a date &amp; time</p>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-[#1f211a]">{MONTHS[viewMonth]} {viewYear}</span>
            <div className="flex gap-1">
              <button onClick={goPrev} disabled={!canGoPrev} className="grid h-7 w-7 place-items-center rounded-md text-[#9a9690] hover:bg-[#f0eee8] disabled:opacity-30" aria-label="Previous month">‹</button>
              <button onClick={goNext} className="grid h-7 w-7 place-items-center rounded-md text-[#9a9690] hover:bg-[#f0eee8]" aria-label="Next month">›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_LABELS.map((d) => <div key={d} className="pb-1 text-[11px] font-medium text-[#b8b4ac]">{d}</div>)}
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const has = slotsByDay.has(cell.key);
              const isSel = selectedDay === cell.key;
              return (
                <button
                  key={i}
                  disabled={!has}
                  onClick={() => { setSelectedDay(cell.key); setSelectedSlot(null); setStep("pick"); }}
                  className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm transition
                    ${isSel ? "text-white" : has ? "font-medium text-[#1f211a]" : "text-[#cdc9c1]"}
                    ${has && !isSel ? "hover:opacity-80" : ""}`}
                  style={
                    isSel ? { background: accent }
                    : has ? { background: `${accent}1a` }
                    : undefined
                  }
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-5 border-t border-[#eceae3] pt-4">
            <label className="flex items-center gap-2 text-xs text-[#9a9690]">
              <IconGlobe />
              <select
                value={tz}
                onChange={(e) => { setTz(e.target.value); }}
                className="flex-1 bg-transparent text-sm text-[#4a4842] outline-none"
              >
                {[...new Set([tz, link.timezone, browserTz, ...COMMON_TZS])].map((z) => (
                  <option key={z} value={z}>{z.replace(/_/g, " ")} ({tzOffsetLabel(z)})</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Times / confirm */}
        <section className="p-7">
          {loading ? (
            <p className="text-sm text-[#9a9690]">Loading…</p>
          ) : closed ? (
            <p className="text-sm text-[#9a9690]">{closed === "expired" ? "This link has expired." : "This link is fully booked."}</p>
          ) : step === "confirm" && selectedSlot ? (
            <div>
              <button onClick={() => setStep("pick")} className="mb-3 text-xs text-[#9a9690] hover:text-[#4a4842]">‹ Back</button>
              <p className="text-sm font-semibold text-[#1f211a]">{longDateInTz(selectedSlot, tz)}</p>
              <p className="mb-4 text-sm text-[#9a9690]">{timeInTz(selectedSlot, tz)} ({tzOffsetLabel(tz)})</p>
              <div className="space-y-3">
                <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className="bk-input" /></Field>
                <Field label="Email *"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="bk-input" /></Field>
                <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="bk-input resize-none" placeholder="Anything to share before the meeting?" /></Field>
              </div>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <button
                onClick={submit}
                disabled={submitting || !name || !email}
                className="mt-4 w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: accent }}
              >
                {submitting ? "Scheduling…" : "Confirm booking"}
              </button>
            </div>
          ) : selectedDay ? (
            <div>
              <p className="mb-3 text-sm font-semibold text-[#1f211a]">{longDateInTz(daySlots[0] ?? selectedDay + "T12:00:00Z", tz)}</p>
              <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                {daySlots.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelectedSlot(s); setStep("confirm"); setError(null); }}
                    className="rounded-lg border py-2.5 text-sm font-medium transition hover:text-white"
                    style={{ borderColor: `${accent}66`, color: accent }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = accent; }}
                  >
                    {timeInTz(s, tz)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#9a9690]">Select a day to see available times.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}

function addMinutes(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

function Shell({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f1] px-4 py-10" style={{ ["--accent" as string]: accent }}>
      <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-[#eceae3] bg-white shadow-md">
        {children}
      </div>
      <style>{`
        .bk-input { width:100%; border:1px solid #e4e2db; border-radius:8px; padding:8px 10px; font-size:14px; color:#1f211a; background:#fff; outline:none; }
        .bk-input:focus { border-color:${accent}; box-shadow:0 0 0 3px ${accent}22; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#6b6961]">{label}</span>
      {children}
    </label>
  );
}

function IconClock() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9a9690]" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>;
}
function IconPin() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9a9690]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
function IconGlobe() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 16 0 18M12 3c-2.5 2.5-2.5 16 0 18" /></svg>;
}
