"use client";

// In-rail compose panel for creating a scheduling link by dragging time
// windows on the calendar grid (Notion Calendar's pattern). The dragged
// windows live in the parent CalendarClient (which owns the grid); this panel
// renders the settings + the list of dragged ranges and performs the save.

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { wallClockToUtc } from "@/lib/scheduling/availability";
import type {
  SchedulingLink, SchedulingLinkKind, SchedulingLocationType,
  SchedulingAvailability, DayWindow,
} from "@/types/database";

/** One dragged availability block. Dates are browser-local; their wall-clock
 *  components are reinterpreted in the link's timezone at save. */
export interface ComposeWindow { id: string; start: Date; end: Date; }

export interface ScheduleCompose {
  kind:               SchedulingLinkKind;
  title:              string;
  description:        string;
  duration:           number;
  location_type:      SchedulingLocationType;
  location_detail:    string;
  timezone:           string;
  single_use:         boolean;
  target_calendar_id: string;
  windows:            ComposeWindow[];
}

interface CalOpt { id: string; name: string; provider: string; account_email: string | null; writable?: boolean; }

interface Props {
  compose:    ScheduleCompose;
  setCompose: (updater: (c: ScheduleCompose) => ScheduleCompose) => void;
  onSaved:    (link: SchedulingLink) => void;
  onCancel:   () => void;
}

const DURATIONS = [15, 20, 30, 45, 60];
const LOCATIONS: { value: SchedulingLocationType; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams",       label: "Microsoft Teams" },
  { value: "phone",       label: "Phone call" },
  { value: "in_person",   label: "In person" },
  { value: "custom",      label: "Custom" },
];
const WEEKDAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const COMMON_TZS = [
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Australia/Sydney",
];

const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay  = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function SchedulingComposePanel({ compose, setCompose, onSaved, onCancel }: Props) {
  const [calendars, setCalendars] = useState<CalOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/calendar/calendars")
      .then((r) => r.json())
      .then((d) => {
        const writ = ((d.calendars ?? []) as CalOpt[]).filter((c) => c.writable);
        setCalendars(writ);
        if (!compose.target_calendar_id && writ[0]) setCompose((c) => ({ ...c, target_calendar_id: writ[0].id }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof ScheduleCompose>(key: K, val: ScheduleCompose[K]) =>
    setCompose((c) => ({ ...c, [key]: val }));

  const showDetail = ["phone", "in_person", "custom"].includes(compose.location_type);
  const sorted = [...compose.windows].sort((a, b) => a.start.getTime() - b.start.getTime());

  function buildAvailability(): SchedulingAvailability {
    const tz = compose.timezone;
    if (compose.kind === "one_off") {
      const windows = compose.windows.map((w) => ({
        start: wallClockToUtc(w.start.getFullYear(), w.start.getMonth() + 1, w.start.getDate(), w.start.getHours(), w.start.getMinutes(), tz).toISOString(),
        end:   wallClockToUtc(w.end.getFullYear(),   w.end.getMonth() + 1,   w.end.getDate(),   w.end.getHours(),   w.end.getMinutes(),   tz).toISOString(),
      }));
      return { windows };
    }
    // Recurring: collapse windows onto their weekday as wall-clock hours.
    const weekly_hours: Record<string, DayWindow[]> = {};
    for (const w of compose.windows) {
      const wd = String(w.start.getDay());
      const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      (weekly_hours[wd] ??= []).push({ start: hm(w.start), end: hm(w.end) });
    }
    for (const wd of Object.keys(weekly_hours)) weekly_hours[wd].sort((a, b) => a.start.localeCompare(b.start));
    return { weekly_hours };
  }

  async function save() {
    if (compose.windows.length === 0) { setError("Drag on the calendar to add availability."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/scheduling/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: compose.title.trim() || "Meeting",
          description: compose.description.trim() || null,
          kind: compose.kind,
          duration_minutes: compose.duration,
          location_type: compose.location_type,
          location_detail: showDetail ? (compose.location_detail.trim() || null) : null,
          timezone: compose.timezone,
          availability: buildAvailability(),
          target_calendar_id: compose.target_calendar_id || null,
          single_use: compose.kind === "one_off" ? compose.single_use : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't create the link."); setSaving(false); return; }
      onSaved(data.link);
    } catch { setError("Network error."); setSaving(false); }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
          {compose.kind === "one_off" ? "New one-off link" : "New recurring link"}
        </span>
        <button onClick={onCancel} style={{ color: "var(--color-text-tertiary)" }} title="Cancel"><X size={15} /></button>
      </div>

      <p className="px-3 pb-3 text-[11px] leading-relaxed" style={{ color: "var(--color-text-tertiary)" }}>
        Drag on the calendar to {compose.kind === "one_off" ? "mark times you're free." : "set your weekly hours."}
      </p>

      <div className="space-y-3 px-3 pb-4">
        {compose.kind === "one_off" && (
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            <input type="checkbox" checked={compose.single_use} onChange={(e) => set("single_use", e.target.checked)} />
            Single-use link
          </label>
        )}

        <Field label="Title">
          <input className="cp-input" value={compose.title} onChange={(e) => set("title", e.target.value)} />
        </Field>

        <Field label="Snippet">
          <textarea className="cp-input resize-none" rows={2} placeholder="Shown to the invitee" value={compose.description} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <Field label="Duration">
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d} onClick={() => set("duration", d)}
                className="rounded-md px-2 py-1 text-[12px]"
                style={compose.duration === d
                  ? { background: "var(--color-sage)", color: "#fff" }
                  : { background: "var(--color-cream)", color: "var(--color-text-secondary)" }}>
                {d}m
              </button>
            ))}
          </div>
        </Field>

        <Field label="Location">
          <select className="cp-input" value={compose.location_type} onChange={(e) => set("location_type", e.target.value as SchedulingLocationType)}>
            {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          {showDetail && <input className="cp-input mt-1.5" placeholder={compose.location_type === "phone" ? "Phone number" : compose.location_type === "in_person" ? "Address" : "Details"} value={compose.location_detail} onChange={(e) => set("location_detail", e.target.value)} />}
        </Field>

        <Field label="Timezone">
          <select className="cp-input" value={compose.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {[...new Set([compose.timezone, ...COMMON_TZS])].map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </Field>

        <Field label="Add bookings to">
          <select className="cp-input" value={compose.target_calendar_id} onChange={(e) => set("target_calendar_id", e.target.value)}>
            {calendars.length === 0 && <option value="">No writable calendar</option>}
            {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {/* Dragged ranges */}
        <Field label={compose.kind === "one_off" ? "Times" : "Weekly hours"}>
          {sorted.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>No times marked yet.</p>
          ) : (
            <div className="space-y-1">
              {sorted.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-md px-2 py-1.5" style={{ background: "var(--color-cream)" }}>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{fmtTime(w.start)} – {fmtTime(w.end)}</p>
                    <p className="text-[10.5px]" style={{ color: "var(--color-text-tertiary)" }}>
                      {compose.kind === "one_off" ? fmtDay(w.start) : `Every ${WEEKDAY[w.start.getDay()]}`}
                    </p>
                  </div>
                  <button onClick={() => setCompose((c) => ({ ...c, windows: c.windows.filter((x) => x.id !== w.id) }))} style={{ color: "var(--color-text-tertiary)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t bg-[var(--color-off-white)] px-3 py-3" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={onCancel} className="flex-1 rounded-lg py-2 text-[12px]" style={{ border: "1px solid var(--color-border-strong)", color: "var(--color-text-secondary)" }}>Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 rounded-lg py-2 text-[12px] font-medium text-white disabled:opacity-50" style={{ background: "var(--color-sage)" }}>
          {saving ? "Creating…" : "Create link"}
        </button>
      </div>

      <style>{`
        .cp-input { width:100%; border:1px solid var(--color-border-strong); border-radius:7px; padding:6px 8px; font-size:12.5px; color:var(--color-text-primary); background:var(--color-off-white); outline:none; }
        .cp-input:focus { border-color:var(--color-sage); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>{label}</p>
      {children}
    </div>
  );
}
