"use client";

// In-rail compose panel for creating a scheduling link by dragging time
// windows on the calendar grid (Notion Calendar's pattern). The dragged
// windows live in the parent CalendarClient (which owns the grid); this panel
// renders the settings + the list of dragged ranges and performs the save.

import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { wallClockToUtc } from "@/lib/scheduling/availability";
import Select from "@/components/ui/Select";
import Toggle from "@/components/ui/Toggle";
import Checkbox from "@/components/ui/Checkbox";
import NumberStepper from "@/components/ui/NumberStepper";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { fmtTime } from "@/lib/format/date";
import type {
  SchedulingLink, SchedulingLinkKind, SchedulingLocationType,
  SchedulingAvailability, DayWindow,
} from "@/types/database";

/** One dragged availability block. Dates are browser-local; their wall-clock
 *  components are reinterpreted in the link's timezone at save. */
export interface ComposeWindow { id: string; start: Date; end: Date; }

export interface ScheduleCompose {
  id?:                string;            // set when editing an existing link
  kind:               SchedulingLinkKind;
  title:              string;
  description:        string;
  duration:           number;
  location_type:      SchedulingLocationType;
  location_detail:    string;
  timezone:           string;
  single_use:         boolean;
  target_calendar_id: string;
  avoid_conflicts:    boolean;
  /** Calendars to scan for conflicts. Empty = all visible. */
  conflict_calendar_ids: string[];
  windows:            ComposeWindow[];
}

interface CalOpt { id: string; name: string; provider: string; account_email: string | null; writable?: boolean; }

interface Props {
  compose:    ScheduleCompose;
  setCompose: (updater: (c: ScheduleCompose) => ScheduleCompose) => void;
  onSaved:    (link: SchedulingLink) => void;
  onCancel:   () => void;
  onDeleted?: (id: string) => void;
}

const DURATIONS = [15, 20, 30, 45, 60];
const LOCATIONS: { value: SchedulingLocationType; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams",       label: "Microsoft Teams" },
  { value: "zoom",        label: "Zoom" },
  { value: "phone",       label: "Phone call" },
  { value: "in_person",   label: "In person" },
  { value: "custom",      label: "Custom" },
];
const DETAIL_PLACEHOLDER: Partial<Record<SchedulingLocationType, string>> = {
  zoom:      "Zoom link (leave blank to use your saved one)",
  phone:     "Phone number",
  in_person: "Address",
  custom:    "Details shown to the invitee",
};
const WEEKDAY = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const COMMON_TZS = [
  "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Australia/Sydney",
];

const fmtDay  = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function SchedulingComposePanel({ compose, setCompose, onSaved, onCancel, onDeleted }: Props) {
  const [allCals, setAllCals] = useState<CalOpt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDur, setCustomDur] = useState(!DURATIONS.includes(compose.duration));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const writableCals = allCals.filter((c) => c.writable);

  useEffect(() => {
    fetch("/api/integrations/calendar/calendars")
      .then((r) => r.json())
      .then((d) => {
        const cals = (d.calendars ?? []) as CalOpt[];
        setAllCals(cals);
        const writ = cals.filter((c) => c.writable);
        if (!compose.target_calendar_id && writ[0]) setCompose((c) => ({ ...c, target_calendar_id: writ[0].id }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof ScheduleCompose>(key: K, val: ScheduleCompose[K]) =>
    setCompose((c) => ({ ...c, [key]: val }));

  const showDetail = ["zoom", "phone", "in_person", "custom"].includes(compose.location_type);
  const sorted = [...compose.windows].sort((a, b) => a.start.getTime() - b.start.getTime());

  // A calendar is "checked" for conflicts when the list is empty (= all) or
  // explicitly includes it.
  const allChecked = compose.conflict_calendar_ids.length === 0;
  const isChecked = (id: string) => allChecked || compose.conflict_calendar_ids.includes(id);
  const toggleConflictCal = (id: string) => {
    setCompose((c) => {
      const ids = c.conflict_calendar_ids.length === 0 ? allCals.map((x) => x.id) : [...c.conflict_calendar_ids];
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
      // Collapse "everything checked" back to the empty = all sentinel.
      return { ...c, conflict_calendar_ids: next.length === allCals.length ? [] : next };
    });
  };

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
    const payload = {
      title: compose.title.trim() || "Meeting",
      description: compose.description.trim() || null,
      kind: compose.kind,
      duration_minutes: compose.duration,
      location_type: compose.location_type,
      location_detail: showDetail ? (compose.location_detail.trim() || null) : null,
      timezone: compose.timezone,
      availability: buildAvailability(),
      target_calendar_id: compose.target_calendar_id || null,
      avoid_conflicts: compose.avoid_conflicts,
      conflict_calendar_ids: compose.avoid_conflicts && compose.conflict_calendar_ids.length > 0 ? compose.conflict_calendar_ids : null,
      single_use: compose.kind === "one_off" ? compose.single_use : false,
    };
    try {
      const res = await fetch(compose.id ? `/api/scheduling/links/${compose.id}` : "/api/scheduling/links", {
        method: compose.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't save the link."); setSaving(false); return; }
      onSaved(data.link);
    } catch { setError("Network error."); setSaving(false); }
  }

  async function remove() {
    if (!compose.id) return;
    setSaving(true);
    await fetch(`/api/scheduling/links/${compose.id}`, { method: "DELETE" });
    onDeleted?.(compose.id);
  }

  const isEdit = !!compose.id;
  const tzOptions = [...new Set([compose.timezone, ...COMMON_TZS])].map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
  const targetOptions = writableCals.length
    ? writableCals.map((c) => ({
        value: c.id,
        // The primary calendar is usually named after the account email — don't
        // repeat it. Only append the account when it adds information.
        label: c.account_email && c.account_email !== c.name ? `${c.name} · ${c.account_email}` : c.name,
      }))
    : [{ value: "", label: "No writable calendar" }];

  // Conflict calendars grouped by account, so each account's calendars nest
  // under it.
  const calsByAccount = (() => {
    const groups = new Map<string, CalOpt[]>();
    for (const c of allCals) {
      const key = c.account_email ?? "Calendars";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
    }
    return [...groups.entries()];
  })();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
          {isEdit ? "Edit link" : compose.kind === "one_off" ? "New one-off link" : "New recurring link"}
        </span>
        <button onClick={onCancel} style={{ color: "var(--color-text-tertiary)" }} title="Cancel"><X size={15} /></button>
      </div>

      <p className="px-3 pb-3 text-[11px] leading-relaxed" style={{ color: "var(--color-text-tertiary)" }}>
        Drag on the calendar to {compose.kind === "one_off" ? "mark times you're free." : "set your weekly hours."}
      </p>

      <div className="space-y-3.5 px-3 pb-4">
        {compose.kind === "one_off" && (
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Single-use link</span>
            <Toggle checked={compose.single_use} onChange={() => set("single_use", !compose.single_use)} />
          </div>
        )}

        <Field label="Title">
          <input className="cp-input" value={compose.title} onChange={(e) => set("title", e.target.value)} />
        </Field>

        <Field label="Snippet">
          <textarea className="cp-input resize-none" rows={2} placeholder="Shown to the invitee" value={compose.description} onChange={(e) => set("description", e.target.value)} />
        </Field>

        <Field label="Duration">
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATIONS.map((d) => (
              <button key={d} onClick={() => { setCustomDur(false); set("duration", d); }}
                className="rounded-md px-2 py-1 text-[12px] transition-colors"
                style={!customDur && compose.duration === d
                  ? { background: "var(--color-sage)", color: "#fff" }
                  : { background: "var(--color-cream)", color: "var(--color-text-secondary)" }}>
                {d}m
              </button>
            ))}
            <button onClick={() => setCustomDur((v) => !v)}
              className="rounded-md px-2 py-1 text-[12px] transition-colors"
              style={customDur
                ? { background: "var(--color-sage)", color: "#fff" }
                : { background: "var(--color-cream)", color: "var(--color-text-secondary)" }}>
              Custom
            </button>
          </div>
          {customDur && (
            <div className="mt-2">
              <NumberStepper value={compose.duration} onChange={(v) => set("duration", v)} min={5} max={480} step={5} suffix=" min" />
            </div>
          )}
        </Field>

        <Field label="Location">
          <Select value={compose.location_type} onChange={(v) => set("location_type", v as SchedulingLocationType)} options={LOCATIONS} />
          {showDetail && (
            <input className="cp-input mt-1.5" placeholder={DETAIL_PLACEHOLDER[compose.location_type] ?? "Details"} value={compose.location_detail} onChange={(e) => set("location_detail", e.target.value)} />
          )}
        </Field>

        <Field label="Timezone">
          <Select value={compose.timezone} onChange={(v) => set("timezone", v)} options={tzOptions} />
        </Field>

        <Field label="Send the invite from">
          <Select value={compose.target_calendar_id} onChange={(v) => set("target_calendar_id", v)} options={targetOptions} placeholder="Choose a calendar" />
        </Field>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>Avoid conflicts</span>
            <Toggle checked={compose.avoid_conflicts} onChange={() => set("avoid_conflicts", !compose.avoid_conflicts)} />
          </div>
          {compose.avoid_conflicts && allCals.length > 0 && (
            <div className="mt-2 space-y-2 rounded-lg p-2.5" style={{ background: "var(--color-cream)" }}>
              <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>Hide times that conflict with:</p>
              {calsByAccount.map(([account, cals]) => (
                <div key={account}>
                  <p className="mb-0.5 truncate text-[10px] font-semibold" style={{ color: "var(--color-text-tertiary)" }}>{account}</p>
                  <div className="space-y-1 pl-1">
                    {cals.map((c) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Checkbox checked={isChecked(c.id)} onChange={() => toggleConflictCal(c.id)} />
                        <span className="truncate text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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

        {isEdit && (
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-red-orange)" }}>
            <Trash2 size={13} /> Delete link
          </button>
        )}

        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t bg-[var(--color-off-white)] px-3 py-3" style={{ borderColor: "var(--color-border)" }}>
        <button onClick={onCancel} className="flex-1 rounded-lg py-2 text-[12px]" style={{ border: "1px solid var(--color-border-strong)", color: "var(--color-text-secondary)" }}>Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 rounded-lg py-2 text-[12px] font-medium text-white disabled:opacity-50" style={{ background: "var(--color-sage)" }}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create link"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this link?"
        body="The booking link will stop working immediately. Existing bookings stay on your calendar."
        confirmLabel="Delete link"
        tone="danger"
        onConfirm={() => { setConfirmDelete(false); remove(); }}
        onCancel={() => setConfirmDelete(false)}
      />

      <style>{`
        .cp-input { width:100%; border:0.5px solid var(--color-border); border-radius:8px; padding:8px 12px; font-size:12px; color:var(--color-text-primary); background:var(--color-surface-sunken); outline:none; }
        .cp-input:focus { border-color:var(--color-sage); box-shadow:0 0 0 3px var(--color-focus-ring); }
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
