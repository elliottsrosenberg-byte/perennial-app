"use client";

// Unified event card — handles both creating a new event (no `event` prop)
// and viewing/editing an existing one (`event` prop present). The two
// surfaces share the same Notion-style layout: title up top, time chips
// with → and duration, date row, stacked All-day + Repeat rows, then
// icon-led sections (Participants, Conferencing, Location, Description),
// calendar selector, reminder dropdown.
//
// Edit mode differences from create mode:
//   - Every field pre-fills from the existing event
//   - Edits PATCH the provider on commit (Save button + on-blur)
//   - Calendar selector is read-only (events can't be moved between
//     calendars in this pass — provider quirks make that a follow-up)
//   - Delete button visible in the footer
//   - Read-only events (writable === false) render the same layout but
//     all fields are disabled and footer is hidden; only the Close X
//     remains in the header.

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserCalendar } from "@/types/database";
import {
  X, Users, Video, MapPin, FileText, Bell, ArrowRight, ChevronDown,
  ChevronUp, Repeat as RepeatIcon, Clock, Trash2,
} from "lucide-react";

export interface EventCardEvent {
  id:           string;
  title:        string;
  start:        string;
  end:          string;
  allDay:       boolean;
  description:  string | null;
  location:     string | null;
  htmlLink:     string | null;
  colorId:      string | null;
  source?:      "google" | "microsoft";
  accountName?: string | null;
  calendarId?:  string | null;
  writable?:    boolean;
  recurrence?:  string[] | null;
}

interface Props {
  /** Create mode when omitted; view/edit mode when present. */
  event?: EventCardEvent;
  /** Used in create mode to pre-fill the time range. */
  defaultStart?: Date;
  defaultEnd?:   Date;
  defaultAllDay?: boolean;
  defaultCalendarId?: string;
  /** Viewport-space rect of the chip the user clicked (edit mode only).
   *  Used to position the card next to the chip; falls back to the
   *  top-right corner if missing. Ignored in create mode. */
  anchorRect?: { top: number; left: number; right: number; bottom: number; width: number; height: number } | null;
  /** Used for the color stripe at the top in edit mode. */
  color?: string;
  onClose: () => void;
  /** Fired after a successful create (create mode only). */
  onCreated?: (event: EventCardEvent) => void;
  /** Fired after a successful PATCH (edit mode only). */
  onUpdated?: (event: EventCardEvent) => void;
  /** Fired after a successful DELETE (edit mode only). */
  onDeleted?: (eventId: string) => void;
}

export type RecurrenceKind = "none" | "daily" | "weekly" | "monthly" | "yearly";

export function rruleFor(kind: RecurrenceKind): string | null {
  switch (kind) {
    case "daily":   return "RRULE:FREQ=DAILY";
    case "weekly":  return "RRULE:FREQ=WEEKLY";
    case "monthly": return "RRULE:FREQ=MONTHLY";
    case "yearly":  return "RRULE:FREQ=YEARLY";
    default:        return null;
  }
}

export function recurrenceKindFromRrules(rrules: string[] | null | undefined): RecurrenceKind {
  if (!rrules || rrules.length === 0) return "none";
  const first = rrules.find(r => /^RRULE:/i.test(r));
  if (!first) return "none";
  const m = first.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i);
  if (!m) return "none";
  return m[1].toLowerCase() as RecurrenceKind;
}

function pad(n: number): string { return n.toString().padStart(2, "0"); }
function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toLocalTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function combineLocal(dateStr: string, timeStr: string): Date {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const [h, mm]    = timeStr.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, dd, h, mm, 0, 0);
}
export function snapTo15(d: Date): Date {
  const out = new Date(d);
  const mins = out.getMinutes();
  out.setMinutes(Math.round(mins / 15) * 15, 0, 0);
  return out;
}

function fmtTimeChip(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${pad(m)} ${period}`;
}

function fmtDuration(startDate: string, startTime: string, endDate: string, endTime: string, allDay: boolean): string {
  if (allDay) {
    const s = new Date(startDate + "T00:00:00");
    const e = new Date(endDate + "T00:00:00");
    const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000));
    return `${days}d`;
  }
  const start = combineLocal(startDate, startTime);
  const end   = combineLocal(endDate,   endTime);
  const mins  = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDateChip(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function encodeRef(event: EventCardEvent): string {
  const provider = event.source ?? "google";
  return encodeURIComponent(`${provider}:${event.id}`);
}

const REMINDER_CHOICES: { label: string; minutes: number | null }[] = [
  { label: "None",            minutes: null },
  { label: "At start",        minutes: 0 },
  { label: "5 min before",    minutes: 5 },
  { label: "10 min before",   minutes: 10 },
  { label: "30 min before",   minutes: 30 },
  { label: "1 hour before",   minutes: 60 },
  { label: "1 day before",    minutes: 1440 },
];

export default function EventCard({
  event, defaultStart, defaultEnd, defaultAllDay, defaultCalendarId,
  anchorRect, color, onClose, onCreated, onUpdated, onDeleted,
}: Props) {
  const isEdit   = !!event;
  // In edit mode we still let writable=false events render the card —
  // they show the same layout but every field is disabled and the
  // footer (Save / Delete) is hidden.
  const writable = isEdit ? !!event!.writable && !!event!.calendarId : true;

  const [calendars,   setCalendars]   = useState<UserCalendar[]>([]);
  const [calsLoading, setCalsLoading] = useState(true);

  // Seed initial values from the event in edit mode, or from the drag
  // prefill in create mode.
  const seed = useMemo(() => {
    if (event) {
      const s = new Date(event.start + (event.start.length === 10 ? "T00:00:00" : ""));
      const e = new Date(event.end   + (event.end.length   === 10 ? "T00:00:00" : ""));
      return {
        title:       event.title ?? "",
        allDay:      !!event.allDay,
        startDate:   toLocalDateInput(s),
        startTime:   toLocalTimeInput(s),
        endDate:     toLocalDateInput(e),
        endTime:     toLocalTimeInput(e),
        description: event.description ?? "",
        location:    event.location ?? "",
        calendarId:  event.calendarId ?? null,
        recurrence:  recurrenceKindFromRrules(event.recurrence),
      };
    }
    const start0 = defaultStart ?? snapTo15(new Date());
    const end0   = defaultEnd   ?? new Date(start0.getTime() + 30 * 60_000);
    return {
      title:       "",
      allDay:      !!defaultAllDay,
      startDate:   toLocalDateInput(start0),
      startTime:   toLocalTimeInput(start0),
      endDate:     toLocalDateInput(end0),
      endTime:     toLocalTimeInput(end0),
      description: "",
      location:    "",
      calendarId:  defaultCalendarId ?? null,
      recurrence:  "none" as RecurrenceKind,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title,         setTitle]         = useState(seed.title);
  const [allDay,        setAllDay]        = useState(seed.allDay);
  const [startDate,     setStartDate]     = useState(seed.startDate);
  const [startTime,     setStartTime]     = useState(seed.startTime);
  const [endDate,       setEndDate]       = useState(seed.endDate);
  const [endTime,       setEndTime]       = useState(seed.endTime);
  const [description,   setDescription]   = useState(seed.description);
  const [location,      setLocation]      = useState(seed.location);
  const [calendarId,    setCalendarId]    = useState<string | null>(seed.calendarId);
  const [attendees,     setAttendees]     = useState<string[]>([]);
  const [attendeeDraft, setAttendeeDraft] = useState("");
  const [addConference, setAddConference] = useState(false);
  const [reminderIdx,   setReminderIdx]   = useState(4); // 30 min before
  const [calMenuOpen,   setCalMenuOpen]   = useState(false);
  const [recurrence,    setRecurrence]    = useState<RecurrenceKind>(seed.recurrence);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState<{ url: string; provider: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const cardRef  = useRef<HTMLDivElement>(null);
  // Stable ref for onClose so the click-outside effect can be mount-only.
  // Without this, onClose's inline-arrow identity changes every parent
  // render and the effect tears down + re-arms — leaving the listener
  // briefly disarmed each cycle, which on a busy calendar (timer ticks,
  // event refetch) reads as "click-outside doesn't close the card."
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { if (!isEdit) titleRef.current?.focus(); }, [isEdit]);

  // Click-outside to close. Mount-only — the listener stays armed for the
  // life of the card. We still defer the first arm by one macrotask so
  // the very click that opened the card doesn't immediately close it.
  useEffect(() => {
    let armed = false;
    const arm = window.setTimeout(() => { armed = true; }, 0);
    function onDown(e: MouseEvent) {
      if (!armed) return;
      if (!cardRef.current) return;
      if (cardRef.current.contains(e.target as Node)) return;
      onCloseRef.current();
    }
    document.addEventListener("mousedown", onDown);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/calendar/calendars")
      .then((r) => r.json())
      .then((d: { calendars?: UserCalendar[]; default_calendar_id?: string | null }) => {
        if (cancelled) return;
        const writable = (d.calendars ?? []).filter((c) => c.writable);
        setCalendars(writable);
        setCalsLoading(false);
        if (!isEdit && !defaultCalendarId) {
          // Prefer the user's chosen default (from profiles); fall back to
          // an account's primary; final fallback is the first writable.
          const userDefault = d.default_calendar_id
            ? writable.find((c) => c.id === d.default_calendar_id)
            : null;
          const pick = userDefault ?? writable.find((c) => c.is_primary) ?? writable[0];
          if (pick) setCalendarId(pick.id);
        }
      })
      .catch(() => { if (!cancelled) setCalsLoading(false); });
    return () => { cancelled = true; };
  }, [defaultCalendarId, isEdit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedCal = useMemo(
    () => calendars.find((c) => c.id === calendarId) ?? null,
    [calendars, calendarId],
  );

  const noWritable = !isEdit && !calsLoading && calendars.length === 0;
  const isMicrosoft = (selectedCal?.provider ?? event?.source) === "microsoft";

  function addAttendee(raw: string) {
    const email = raw.trim().replace(/,$/, "");
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (attendees.includes(email)) { setAttendeeDraft(""); return; }
    setAttendees(prev => [...prev, email]);
    setAttendeeDraft("");
  }

  function buildBody(): Record<string, unknown> {
    let startIso: string;
    let endIso:   string;
    if (allDay) {
      startIso = `${startDate}T00:00:00`;
      endIso   = `${endDate}T00:00:00`;
    } else {
      startIso = combineLocal(startDate, startTime).toISOString();
      endIso   = combineLocal(endDate,   endTime).toISOString();
    }
    const r = rruleFor(recurrence);
    return {
      calendar_id:      calendarId,
      title:            title.trim(),
      start_iso:        startIso,
      end_iso:          endIso,
      all_day:          allDay,
      description:      description.trim() || null,
      location:         location.trim() || null,
      attendees,
      conferencing:     addConference
        ? (isMicrosoft ? "teams" : "google_meet")
        : "none",
      reminder_minutes: REMINDER_CHOICES[reminderIdx].minutes,
      recurrence:       r ? [r] : null,
    };
  }

  async function submit() {
    if (!title.trim() || !calendarId || submitting) return;
    setError(null);
    setNeedsReconnect(null);
    setSubmitting(true);

    try {
      if (isEdit) {
        const res = await fetch(`/api/integrations/calendar/events/${encodeRef(event!)}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody()),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 412 && json?.error === "scope_upgrade_required") {
          setNeedsReconnect({ url: json.reconnect_url, provider: json.provider });
          setSubmitting(false);
          return;
        }
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : "Couldn't save changes.");
          setSubmitting(false);
          return;
        }
        const updated = (json.event as EventCardEvent | undefined) ?? null;
        if (updated) {
          // Preserve calendar provenance the server may not echo back.
          const merged = { ...event!, ...updated, calendarId: event!.calendarId, writable: event!.writable, accountName: event!.accountName };
          onUpdated?.(merged);
        }
        window.dispatchEvent(new Event("calendar:refresh-events"));
        onClose();
      } else {
        const res = await fetch("/api/integrations/calendar/events", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody()),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 412 && json?.error === "scope_upgrade_required") {
          setNeedsReconnect({ url: json.reconnect_url, provider: json.provider });
          setSubmitting(false);
          return;
        }
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : "Couldn't save that event.");
          setSubmitting(false);
          return;
        }
        const ev = json.event as EventCardEvent | undefined;
        if (ev) {
          onCreated?.(ev);
          window.dispatchEvent(new CustomEvent("calendar:event-created", { detail: { event: ev } }));
          window.dispatchEvent(new Event("calendar:refresh-events"));
        }
        onClose();
      }
    } catch (err) {
      console.error("[EventCard] submit failed:", err);
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  async function deleteEvent() {
    if (!isEdit || !writable || !event?.calendarId) return;
    // Single-click delete — no window.confirm. Matches the task delete
    // pattern; the click is the commit.
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/integrations/calendar/events/${encodeRef(event)}?calendar_id=${encodeURIComponent(event.calendarId)}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 412 && json?.error === "scope_upgrade_required") {
        setNeedsReconnect({ url: json.reconnect_url, provider: json.provider });
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "Couldn't delete.");
        setSubmitting(false);
        return;
      }
      onDeleted?.(event.id);
      window.dispatchEvent(new Event("calendar:refresh-events"));
      onClose();
    } catch (e) {
      console.error("[EventCard] delete failed:", e);
      setError("Network error.");
      setSubmitting(false);
    }
  }

  // Position the card next to the clicked chip (edit mode) or at the
  // top-right corner (create mode).
  const PANEL_W = 340;
  const positionStyle: React.CSSProperties = (() => {
    if (!anchorRect || typeof window === "undefined") {
      return { top: 64, right: 16 };
    }
    const GAP = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    if (anchorRect.right + GAP + PANEL_W + 8 <= vw) {
      left = anchorRect.right + GAP;
    } else if (anchorRect.left - GAP - PANEL_W >= 8) {
      left = anchorRect.left - GAP - PANEL_W;
    } else {
      left = Math.max(8, vw - PANEL_W - 8);
    }
    const desiredTop = anchorRect.top - 8;
    const top = Math.max(8, Math.min(vh - 560 - 8, desiredTop));
    return { top, left };
  })();

  const providerLabel = event?.source === "microsoft" ? "Outlook" : event?.source === "google" ? "Google Calendar" : "Event";
  const fieldsDisabled = isEdit && !writable;

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        ...positionStyle,
        width: PANEL_W,
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
        background: "var(--color-off-white)",
        border:     "0.5px solid var(--color-border)",
        borderRadius: 14,
        boxShadow:  "0 8px 28px rgba(0,0,0,0.16)",
        fontFamily: "inherit",
        zIndex: 60,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "0.5px solid var(--color-border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {(() => {
            const dotColor = isEdit ? color : selectedCal?.color;
            if (!dotColor) return null;
            return (
              <span style={{
                width: 9, height: 9, borderRadius: "50%",
                background: dotColor, flexShrink: 0,
                boxShadow: `0 0 0 2px ${dotColor}22`,
              }} />
            );
          })()}
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {isEdit ? providerLabel : "Event"}
          </span>
          {fieldsDisabled && (
            <span style={{
              marginLeft: 4, padding: "2px 7px",
              fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
              color: "var(--color-text-tertiary)",
              background: "var(--color-surface-sunken)",
              borderRadius: 999,
            }}>
              Read-only
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, color: "var(--color-grey)", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <X size={13} />
        </button>
      </div>

      {/* Title */}
      <div style={{ padding: "14px 16px 6px" }}>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder="Event title"
          disabled={fieldsDisabled}
          style={{
            width: "100%",
            fontSize: 15, fontWeight: 500,
            color: "var(--color-charcoal)",
            background: "transparent", border: "none", outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Time row */}
      {!allDay && (
        <div style={{ padding: "4px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <TimeChip value={startTime} onChange={setStartTime} disabled={fieldsDisabled} />
          <ArrowRight size={11} style={{ color: "var(--color-text-tertiary)" }} />
          <TimeChip value={endTime} onChange={setEndTime} disabled={fieldsDisabled} />
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 2 }}>
            {fmtDuration(startDate, startTime, endDate, endTime, allDay)}
          </span>
        </div>
      )}

      {/* Date row */}
      <div style={{ padding: "4px 16px 6px", display: "flex", alignItems: "center", gap: 6 }}>
        <DateChip value={startDate} onChange={(v) => { setStartDate(v); if (v > endDate) setEndDate(v); }} disabled={fieldsDisabled} />
        {(allDay && startDate !== endDate) && (
          <>
            <ArrowRight size={11} style={{ color: "var(--color-text-tertiary)" }} />
            <DateChip value={endDate} onChange={setEndDate} disabled={fieldsDisabled} />
          </>
        )}
      </div>

      {/* All-day + Repeat — stacked rows */}
      <div style={{ padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <SettingRow icon={<Clock size={12} />} label="All-day">
          <ToggleSwitch
            checked={allDay}
            disabled={fieldsDisabled}
            onChange={(next) => {
              setAllDay(next);
              if (next) setEndDate(startDate);
            }}
          />
        </SettingRow>
        <SettingRow icon={<RepeatIcon size={12} />} label="Repeat">
          <RepeatSelect value={recurrence} onChange={setRecurrence} disabled={fieldsDisabled} />
        </SettingRow>
      </div>

      <div style={{ height: 1, background: "var(--color-border)" }} />

      {/* Icon-led sections */}
      <div style={{ padding: "8px 6px" }}>
        <Section icon={<Users size={13} />} label="Participants">
          {attendees.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              {attendees.map(a => (
                <span key={a} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, padding: "2px 6px 2px 8px", borderRadius: 9999,
                  background: "var(--color-cream)", color: "var(--color-text-primary)",
                  border: "0.5px solid var(--color-border)",
                }}>
                  {a}
                  <button
                    type="button"
                    onClick={() => setAttendees(prev => prev.filter(x => x !== a))}
                    style={{ background: "transparent", border: "none", color: "var(--color-grey)", cursor: "pointer", padding: 0, display: "inline-flex" }}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={attendeeDraft}
            onChange={(e) => setAttendeeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addAttendee(attendeeDraft); }
              if (e.key === "Backspace" && !attendeeDraft && attendees.length > 0) {
                setAttendees(prev => prev.slice(0, -1));
              }
            }}
            onBlur={() => attendeeDraft && addAttendee(attendeeDraft)}
            placeholder="Add by email"
            disabled={fieldsDisabled}
            style={textInputStyle}
          />
        </Section>

        <Section icon={<Video size={13} />} label="Conferencing">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-text-secondary)", cursor: fieldsDisabled ? "default" : "pointer" }}>
            <input
              type="checkbox"
              checked={addConference}
              onChange={(e) => setAddConference(e.target.checked)}
              disabled={fieldsDisabled}
              style={{ accentColor: "var(--color-sage)" }}
            />
            {isMicrosoft ? "Add Microsoft Teams meeting" : "Add Google Meet"}
          </label>
        </Section>

        <Section icon={<MapPin size={13} />} label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Address, room, link…"
            disabled={fieldsDisabled}
            style={textInputStyle}
          />
        </Section>

        <Section icon={<FileText size={13} />} label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes, agenda, links"
            disabled={fieldsDisabled}
            rows={2}
            style={{ ...textInputStyle, resize: "vertical", minHeight: 44 }}
          />
        </Section>
      </div>

      <div style={{ height: 1, background: "var(--color-border)" }} />

      {/* Calendar row */}
      <div style={{ padding: "10px 16px", position: "relative" }}>
        {calsLoading ? (
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Loading calendars…</p>
        ) : noWritable ? (
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            No writable calendar. <a href="/settings?section=integrations" style={{ color: "var(--color-sage)", textDecoration: "underline" }}>Connect one</a> to create events.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => { if (!isEdit && !fieldsDisabled) setCalMenuOpen(v => !v); }}
            disabled={isEdit || fieldsDisabled}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              background: "transparent", border: "none", padding: "4px 0",
              fontFamily: "inherit", textAlign: "left",
              cursor: isEdit || fieldsDisabled ? "default" : "pointer",
              opacity: 1,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 9999, background: selectedCal?.color ?? color ?? "#039BE5", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedCal?.account_email ?? selectedCal?.name ?? event?.accountName ?? "Pick a calendar"}
            </span>
            {!isEdit && (calMenuOpen ? <ChevronUp size={11} style={{ color: "var(--color-text-tertiary)" }} /> : <ChevronDown size={11} style={{ color: "var(--color-text-tertiary)" }} />)}
          </button>
        )}
        {calMenuOpen && !isEdit && (
          <>
            <div onClick={() => setCalMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{
              position: "absolute", left: 12, right: 12, top: "calc(100% + 2px)",
              zIndex: 41,
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-overlay)",
              maxHeight: 240, overflowY: "auto",
              padding: 4,
            }}>
              {calendars.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCalendarId(c.id); setCalMenuOpen(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px", borderRadius: 6,
                    background: c.id === calendarId ? "var(--color-cream)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    fontSize: 12, color: "var(--color-text-primary)",
                  }}
                  onMouseEnter={(e) => { if (c.id !== calendarId) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={(e) => { if (c.id !== calendarId) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 9999, background: c.color ?? "#039BE5", flexShrink: 0 }} />
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.name}{c.account_email && c.name !== c.account_email ? ` · ${c.account_email}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Reminders */}
      <div style={{ padding: "0 16px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <Bell size={12} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)" }} />
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Reminder</span>
        <select
          value={reminderIdx}
          onChange={(e) => setReminderIdx(Number(e.target.value))}
          disabled={fieldsDisabled}
          style={{
            background: "transparent", border: "none", padding: 0,
            fontSize: 12, color: "var(--color-text-primary)", fontFamily: "inherit",
            cursor: fieldsDisabled ? "default" : "pointer",
          }}
        >
          {REMINDER_CHOICES.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
        </select>
      </div>

      {needsReconnect && (
        <div style={{
          margin: "0 16px 12px",
          padding: "10px 12px", borderRadius: 8,
          background: "rgba(220,62,13,0.06)",
          border: "0.5px solid rgba(220,62,13,0.25)",
          fontSize: 11.5, color: "var(--color-red-orange)", lineHeight: 1.5,
        }}>
          Your {needsReconnect.provider === "microsoft" ? "Outlook" : "Google"} connection doesn&apos;t have write permission yet.{" "}
          <a href={needsReconnect.url} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
            Reconnect to enable
          </a>.
        </div>
      )}
      {error && (
        <p style={{ fontSize: 11, color: "var(--color-red-orange)", margin: "0 16px 12px" }}>{error}</p>
      )}

      {!fieldsDisabled && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "10px 16px",
          borderTop: "0.5px solid var(--color-border)",
        }}>
          {isEdit ? (
            <button
              onClick={deleteEvent}
              disabled={submitting}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 7,
                background: "transparent",
                color: "var(--color-red-orange)",
                border: "0.5px solid rgba(220,62,13,0.25)",
                fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit",
                opacity: submitting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,62,13,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Trash2 size={12} strokeWidth={1.75} />
              Delete
            </button>
          ) : <span />}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "6px 12px", fontSize: 12, borderRadius: 7,
                color: "var(--color-grey)", border: "0.5px solid var(--color-border)",
                background: "transparent", cursor: "pointer", fontFamily: "inherit",
              }}
            >Cancel</button>
            <button
              onClick={submit}
              disabled={!title.trim() || !calendarId || submitting || noWritable}
              style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 7,
                color: "white",
                // Tint the primary action with the selected calendar's
                // colour so the user can see exactly what the resulting
                // chip will look like. Falls back to event accent (edit
                // mode) and finally sage.
                background: selectedCal?.color ?? color ?? "var(--color-sage)",
                opacity: (!title.trim() || !calendarId || submitting || noWritable) ? 0.5 : 1,
                border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {submitting ? "Saving…" : isEdit ? "Save" : "Add event"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

const textInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px", fontSize: 12,
  background: "transparent",
  border: "0.5px solid transparent",
  borderRadius: 6,
  fontFamily: "inherit",
  color: "var(--color-text-primary)",
  outline: "none",
};

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 10px 6px 10px" }}>
      <div style={{ width: 14, paddingTop: 7, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", marginTop: 2, marginBottom: 3 }}>{label}</div>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ icon, label, children }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 2px",
    }}>
      <span style={{ color: "var(--color-text-tertiary)", display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 12, color: "var(--color-text-primary)" }}>{label}</span>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 26, height: 14, borderRadius: 999, border: "none",
        background: checked ? "var(--color-sage)" : "var(--color-border-strong)",
        position: "relative", cursor: disabled ? "default" : "pointer", padding: 0,
        transition: "background 0.15s ease",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute",
        top: 1, left: checked ? 13 : 1,
        width: 12, height: 12, borderRadius: 999,
        background: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
        transition: "left 0.15s ease",
      }} />
    </button>
  );
}

const REPEAT_LABELS: Record<RecurrenceKind, string> = {
  none:    "Doesn't repeat",
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

function RepeatSelect({ value, onChange, disabled }: {
  value: RecurrenceKind; onChange: (v: RecurrenceKind) => void; disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 6,
        background: value === "none" ? "transparent" : "var(--color-cream)",
        border: `0.5px solid ${value === "none" ? "var(--color-border)" : "var(--color-charcoal)"}`,
        fontSize: 11, color: "var(--color-text-primary)",
        cursor: disabled ? "default" : "pointer", position: "relative",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span>{REPEAT_LABELS[value]}</span>
      <ChevronDown size={10} style={{ color: "var(--color-text-tertiary)" }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RecurrenceKind)}
        disabled={disabled}
        style={{
          position: "absolute", inset: 0,
          opacity: 0, cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        {(Object.keys(REPEAT_LABELS) as RecurrenceKind[]).map((k) => (
          <option key={k} value={k}>{REPEAT_LABELS[k]}</option>
        ))}
      </select>
    </label>
  );
}

function TimeChip({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 6,
        background: "var(--color-cream)",
        border: "0.5px solid var(--color-border)",
        fontSize: 12, color: "var(--color-text-primary)",
        cursor: disabled ? "default" : "pointer", position: "relative",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {fmtTimeChip(value)}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          position: "absolute", inset: 0,
          opacity: 0, cursor: disabled ? "default" : "pointer",
        }}
      />
    </label>
  );
}

function DateChip({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "3px 8px", borderRadius: 6,
        background: "var(--color-cream)",
        border: "0.5px solid var(--color-border)",
        fontSize: 12, color: "var(--color-text-primary)",
        cursor: disabled ? "default" : "pointer", position: "relative",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {fmtDateChip(value)}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          position: "absolute", inset: 0,
          opacity: 0, cursor: disabled ? "default" : "pointer",
        }}
      />
    </label>
  );
}
