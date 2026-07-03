"use client";

// Create/edit modal for a scheduling link. Recurring links edit weekly hours;
// one-off links edit explicit date windows + single-use/expiration. Shared
// fields: title, duration, location/conferencing, description, timezone,
// target calendar, and an Advanced section (notice, window, buffers).

import { useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { wallClockToUtc } from "@/lib/scheduling/availability";
import Modal from "@/components/ui/Modal";
import type {
  SchedulingLink, SchedulingLinkKind, SchedulingLocationType,
  SchedulingAvailability, DayWindow,
} from "@/types/database";

interface CalOpt { id: string; name: string; provider: string; account_email: string | null; }

interface Props {
  link:      SchedulingLink | null;   // null → creating
  kind:      SchedulingLinkKind;      // used when creating
  calendars: CalOpt[];                // writable target calendars
  onClose:   () => void;
  onSaved:   (link: SchedulingLink) => void;
  onDeleted: (id: string) => void;
}

const WEEKDAYS = [
  { idx: "1", label: "Monday" }, { idx: "2", label: "Tuesday" },
  { idx: "3", label: "Wednesday" }, { idx: "4", label: "Thursday" },
  { idx: "5", label: "Friday" }, { idx: "6", label: "Saturday" }, { idx: "0", label: "Sunday" },
];

const LOCATIONS: { value: SchedulingLocationType; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams",       label: "Microsoft Teams" },
  { value: "phone",       label: "Phone call" },
  { value: "in_person",   label: "In person" },
  { value: "custom",      label: "Custom" },
];

const DURATIONS = [15, 20, 30, 45, 60, 90];

const COMMON_TZS = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney",
];

interface OneOffRow { date: string; start: string; end: string }

/** Decompose an absolute window back to {date,start,end} in a timezone. */
function windowToRow(startIso: string, endIso: string, tz: string): OneOffRow {
  const parts = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const f: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...opts }).formatToParts(new Date(iso)))
      if (p.type !== "literal") f[p.type] = p.value;
    return f;
  };
  const d = parts(startIso, { year: "numeric", month: "2-digit", day: "2-digit" });
  const s = parts(startIso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const e = parts(endIso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return { date: `${d.year}-${d.month}-${d.day}`, start: `${s.hour}:${s.minute}`, end: `${e.hour}:${e.minute}` };
}

export default function SchedulingLinkModal({ link, kind: createKind, calendars, onClose, onSaved, onDeleted }: Props) {
  const kind = link?.kind ?? createKind;
  const isEdit = !!link;

  const [title, setTitle] = useState(link?.title ?? (kind === "one_off" ? "One-off meeting" : "Meeting"));
  const [description, setDescription] = useState(link?.description ?? "");
  const [duration, setDuration] = useState(link?.duration_minutes ?? 30);
  const [locationType, setLocationType] = useState<SchedulingLocationType>(link?.location_type ?? "google_meet");
  const [locationDetail, setLocationDetail] = useState(link?.location_detail ?? "");
  const [tz, setTz] = useState(link?.timezone ?? (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "America/New_York"; } })());
  const [targetCal, setTargetCal] = useState(link?.target_calendar_id ?? calendars[0]?.id ?? "");

  // Weekly hours (recurring).
  const [weekly, setWeekly] = useState<Record<string, DayWindow | null>>(() => {
    const wh = link?.availability?.weekly_hours ?? {};
    const out: Record<string, DayWindow | null> = {};
    for (const { idx } of WEEKDAYS) {
      const w = wh[idx]?.[0];
      out[idx] = w ? { start: w.start, end: w.end } : (["1","2","3","4","5"].includes(idx) && !link ? { start: "09:00", end: "17:00" } : null);
    }
    return out;
  });

  // One-off windows.
  const [rows, setRows] = useState<OneOffRow[]>(() => {
    const ws = link?.availability?.windows ?? [];
    if (ws.length) return ws.map((w) => windowToRow(w.start, w.end, link!.timezone));
    return [{ date: "", start: "09:00", end: "12:00" }];
  });
  const [singleUse, setSingleUse] = useState(link?.single_use ?? (kind === "one_off"));
  const [expiresAt, setExpiresAt] = useState(link?.expires_at ? link.expires_at.slice(0, 10) : "");

  // Advanced.
  const [showAdv, setShowAdv] = useState(false);
  const [minNotice, setMinNotice] = useState(link?.min_notice_minutes ?? 240);
  const [windowDays, setWindowDays] = useState(link?.booking_window_days ?? 30);
  const [bufBefore, setBufBefore] = useState(link?.buffer_before_minutes ?? 0);
  const [bufAfter, setBufAfter] = useState(link?.buffer_after_minutes ?? 0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tzOptions = useMemo(() => [...new Set([tz, ...COMMON_TZS])], [tz]);

  function buildAvailability(): SchedulingAvailability {
    if (kind === "one_off") {
      const windows: { start: string; end: string }[] = [];
      for (const r of rows) {
        if (!r.date) continue;
        const [y, mo, d] = r.date.split("-").map(Number);
        const [sh, sm] = r.start.split(":").map(Number);
        const [eh, em] = r.end.split(":").map(Number);
        const start = wallClockToUtc(y, mo, d, sh, sm, tz).toISOString();
        const end = wallClockToUtc(y, mo, d, eh, em, tz).toISOString();
        if (new Date(end) > new Date(start)) windows.push({ start, end });
      }
      return { windows };
    }
    const weekly_hours: Record<string, DayWindow[]> = {};
    for (const { idx } of WEEKDAYS) {
      const w = weekly[idx];
      if (w && w.start < w.end) weekly_hours[idx] = [w];
    }
    return { weekly_hours };
  }

  async function save() {
    setSaving(true); setError(null);
    const payload = {
      title: title.trim() || "Meeting",
      description: description.trim() || null,
      kind,
      duration_minutes: duration,
      location_type: locationType,
      location_detail: ["phone", "in_person", "custom"].includes(locationType) ? (locationDetail.trim() || null) : null,
      timezone: tz,
      availability: buildAvailability(),
      target_calendar_id: targetCal || null,
      min_notice_minutes: minNotice,
      booking_window_days: windowDays,
      buffer_before_minutes: bufBefore,
      buffer_after_minutes: bufAfter,
      single_use: kind === "one_off" ? singleUse : false,
      expires_at: kind === "one_off" && expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null,
    };
    try {
      const res = await fetch(isEdit ? `/api/scheduling/links/${link!.id}` : "/api/scheduling/links", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't save."); setSaving(false); return; }
      onSaved(data.link);
    } catch {
      setError("Network error."); setSaving(false);
    }
  }

  async function remove() {
    if (!link) return;
    if (!confirm("Delete this scheduling link? Existing bookings are kept.")) return;
    setSaving(true);
    await fetch(`/api/scheduling/links/${link.id}`, { method: "DELETE" });
    onDeleted(link.id);
  }

  const showDetail = ["phone", "in_person", "custom"].includes(locationType);

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={isEdit ? "Edit link" : kind === "one_off" ? "New one-off link" : "New recurring link"}
      bodyStyle={{ padding: 0 }}
      footer={
        <div className="flex flex-1 items-center justify-between">
          {isEdit
            ? <button onClick={remove} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600"><Trash2 size={15} /> Delete</button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[#4a4842] hover:bg-[#f0eee8]">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-lg bg-[#4a5842] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create link"}
            </button>
          </div>
        </div>
      }
    >
        <div className="space-y-4 px-6 py-5">
          <Row label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="sl-input" />
          </Row>

          <Row label="Duration">
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`rounded-md px-2.5 py-1 text-sm ${duration === d ? "bg-[#4a5842] text-white" : "bg-[#f0eee8] text-[#4a4842] hover:bg-[#e7e4dc]"}`}>
                  {d}m
                </button>
              ))}
            </div>
          </Row>

          <Row label="Location">
            <select value={locationType} onChange={(e) => setLocationType(e.target.value as SchedulingLocationType)} className="sl-input">
              {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            {showDetail && (
              <input value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)} placeholder={locationType === "phone" ? "Phone number" : locationType === "in_person" ? "Address" : "Details"} className="sl-input mt-2" />
            )}
          </Row>

          <Row label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Shown to the invitee" className="sl-input resize-none" />
          </Row>

          {kind === "recurring" ? (
            <Row label="Weekly hours">
              <div className="space-y-1.5">
                {WEEKDAYS.map(({ idx, label }) => {
                  const w = weekly[idx];
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <label className="flex w-28 items-center gap-2 text-sm text-[#4a4842]">
                        <input type="checkbox" checked={!!w} onChange={(e) => setWeekly({ ...weekly, [idx]: e.target.checked ? { start: "09:00", end: "17:00" } : null })} />
                        {label}
                      </label>
                      {w ? (
                        <div className="flex items-center gap-1.5">
                          <input type="time" value={w.start} onChange={(e) => setWeekly({ ...weekly, [idx]: { ...w, start: e.target.value } })} className="sl-time" />
                          <span className="text-[#9a9690]">–</span>
                          <input type="time" value={w.end} onChange={(e) => setWeekly({ ...weekly, [idx]: { ...w, end: e.target.value } })} className="sl-time" />
                        </div>
                      ) : <span className="text-sm text-[#b8b4ac]">Unavailable</span>}
                    </div>
                  );
                })}
              </div>
            </Row>
          ) : (
            <Row label="Available windows">
              <div className="space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="date" value={r.date} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} className="sl-time flex-1" />
                    <input type="time" value={r.start} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} className="sl-time" />
                    <span className="text-[#9a9690]">–</span>
                    <input type="time" value={r.end} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} className="sl-time" />
                    <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-[#b8b4ac] hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                ))}
                <button onClick={() => setRows([...rows, { date: "", start: "09:00", end: "12:00" }])} className="flex items-center gap-1 text-sm text-[#4a5842] hover:underline">
                  <Plus size={14} /> Add window
                </button>
              </div>
            </Row>
          )}

          <Row label="Timezone">
            <select value={tz} onChange={(e) => setTz(e.target.value)} className="sl-input">
              {tzOptions.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
            </select>
          </Row>

          <Row label="Add bookings to">
            <select value={targetCal} onChange={(e) => setTargetCal(e.target.value)} className="sl-input">
              {calendars.length === 0 && <option value="">No writable calendar</option>}
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}{c.account_email ? ` · ${c.account_email}` : ""}</option>)}
            </select>
          </Row>

          {kind === "one_off" && (
            <Row label="Link options">
              <label className="flex items-center gap-2 text-sm text-[#4a4842]">
                <input type="checkbox" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} /> Single-use (close after first booking)
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-[#4a4842]">
                Expires <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="sl-time" />
              </label>
            </Row>
          )}

          <button onClick={() => setShowAdv(!showAdv)} className="text-sm text-[#9a9690] hover:text-[#4a4842]">
            {showAdv ? "− Hide" : "+ Show"} advanced
          </button>
          {showAdv && (
            <div className="space-y-3 rounded-lg bg-[#faf9f6] p-3">
              <Row label="Minimum notice (min)"><input type="number" value={minNotice} onChange={(e) => setMinNotice(+e.target.value)} className="sl-input" /></Row>
              {kind === "recurring" && <Row label="Booking window (days)"><input type="number" value={windowDays} onChange={(e) => setWindowDays(+e.target.value)} className="sl-input" /></Row>}
              <Row label="Buffer before (min)"><input type="number" value={bufBefore} onChange={(e) => setBufBefore(+e.target.value)} className="sl-input" /></Row>
              <Row label="Buffer after (min)"><input type="number" value={bufAfter} onChange={(e) => setBufAfter(+e.target.value)} className="sl-input" /></Row>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

      <style>{`
        .sl-input { width:100%; border:1px solid #e4e2db; border-radius:8px; padding:7px 10px; font-size:14px; color:#1f211a; background:#fff; outline:none; }
        .sl-input:focus { border-color:#4a5842; box-shadow:0 0 0 3px #4a584222; }
        .sl-time { border:1px solid #e4e2db; border-radius:7px; padding:5px 8px; font-size:13px; color:#1f211a; background:#fff; outline:none; }
        .sl-time:focus { border-color:#4a5842; }
      `}</style>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-[#6b6961]">{label}</p>
      {children}
    </div>
  );
}
