"use client";

// Create-event preview card. Non-blocking right-edge panel — calendar stays
// visible behind. Layout mirrors Notion Calendar's event card: title up top,
// time range with auto-computed duration, date row, all-day pill, then
// icon-led sections (Participants, Conferencing, Location, Description),
// then the calendar selector + reminder at the bottom.

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserCalendar } from "@/types/database";
import {
  X, Users, Video, MapPin, FileText, Bell, ArrowRight, ChevronDown,
  ChevronUp,
} from "lucide-react";

interface CreatedEvent {
  id:          string;
  title:       string;
  start:       string;
  end:         string;
  allDay:      boolean;
  description: string | null;
  location:    string | null;
  htmlLink:    string | null;
  colorId:     string | null;
  source:      "google" | "microsoft";
  accountName: string | null;
  calendarId:  string | null;
  writable:    boolean;
}

interface Props {
  defaultStart?: Date;
  defaultEnd?:   Date;
  defaultAllDay?: boolean;
  defaultCalendarId?: string;
  onClose:  () => void;
  onCreated?: (event: CreatedEvent) => void;
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

const REMINDER_CHOICES: { label: string; minutes: number | null }[] = [
  { label: "None",            minutes: null },
  { label: "At start",        minutes: 0 },
  { label: "5 min before",    minutes: 5 },
  { label: "10 min before",   minutes: 10 },
  { label: "30 min before",   minutes: 30 },
  { label: "1 hour before",   minutes: 60 },
  { label: "1 day before",    minutes: 1440 },
];

export default function NewEventModal({
  defaultStart, defaultEnd, defaultAllDay, defaultCalendarId,
  onClose, onCreated,
}: Props) {
  const [calendars,   setCalendars]   = useState<UserCalendar[]>([]);
  const [calsLoading, setCalsLoading] = useState(true);

  const start0 = defaultStart ?? snapTo15(new Date());
  const end0   = defaultEnd   ?? new Date(start0.getTime() + 30 * 60_000);

  const [title,         setTitle]         = useState("");
  const [allDay,        setAllDay]        = useState(!!defaultAllDay);
  const [startDate,     setStartDate]     = useState(toLocalDateInput(start0));
  const [startTime,     setStartTime]     = useState(toLocalTimeInput(start0));
  const [endDate,       setEndDate]       = useState(toLocalDateInput(end0));
  const [endTime,       setEndTime]       = useState(toLocalTimeInput(end0));
  const [description,   setDescription]   = useState("");
  const [location,      setLocation]      = useState("");
  const [calendarId,    setCalendarId]    = useState<string | null>(defaultCalendarId ?? null);
  const [attendees,     setAttendees]     = useState<string[]>([]);
  const [attendeeDraft, setAttendeeDraft] = useState("");
  const [addConference, setAddConference] = useState(false);
  const [reminderIdx,   setReminderIdx]   = useState(4); // 30 min before
  const [calMenuOpen,   setCalMenuOpen]   = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState<{ url: string; provider: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/calendar/calendars")
      .then((r) => r.json())
      .then((d: { calendars?: UserCalendar[] }) => {
        if (cancelled) return;
        const writable = (d.calendars ?? []).filter((c) => c.writable);
        setCalendars(writable);
        setCalsLoading(false);
        if (!defaultCalendarId) {
          const primary = writable.find((c) => c.is_primary) ?? writable[0];
          if (primary) setCalendarId(primary.id);
        }
      })
      .catch(() => { if (!cancelled) setCalsLoading(false); });
    return () => { cancelled = true; };
  }, [defaultCalendarId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedCal = useMemo(
    () => calendars.find((c) => c.id === calendarId) ?? null,
    [calendars, calendarId],
  );

  const noWritable = !calsLoading && calendars.length === 0;
  const isMicrosoft = selectedCal?.provider === "microsoft";

  function addAttendee(raw: string) {
    const email = raw.trim().replace(/,$/, "");
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (attendees.includes(email)) { setAttendeeDraft(""); return; }
    setAttendees(prev => [...prev, email]);
    setAttendeeDraft("");
  }

  async function submit() {
    if (!title.trim() || !calendarId || submitting) return;
    setError(null);
    setNeedsReconnect(null);
    setSubmitting(true);

    let startIso: string;
    let endIso:   string;
    if (allDay) {
      startIso = `${startDate}T00:00:00`;
      endIso   = `${endDate}T00:00:00`;
    } else {
      startIso = combineLocal(startDate, startTime).toISOString();
      endIso   = combineLocal(endDate,   endTime).toISOString();
    }

    try {
      const res = await fetch("/api/integrations/calendar/events", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
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
      const event = json.event as CreatedEvent | undefined;
      if (event) {
        onCreated?.(event);
        window.dispatchEvent(new CustomEvent("calendar:event-created", { detail: { event } }));
        window.dispatchEvent(new Event("calendar:refresh-events"));
      }
      onClose();
    } catch (err) {
      console.error("[NewEventModal] create failed:", err);
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        right: 16,
        width: 380,
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
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>Event</span>
          <ChevronDown size={11} style={{ color: "var(--color-text-tertiary)" }} />
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
          style={{
            width: "100%",
            fontSize: 15, fontWeight: 500,
            color: "var(--color-charcoal)",
            background: "transparent", border: "none", outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Time row — "6 PM → 8 PM 2h" */}
      {!allDay && (
        <div style={{ padding: "4px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <TimeChip value={startTime} onChange={setStartTime} />
          <ArrowRight size={11} style={{ color: "var(--color-text-tertiary)" }} />
          <TimeChip value={endTime} onChange={setEndTime} />
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 2 }}>
            {fmtDuration(startDate, startTime, endDate, endTime, allDay)}
          </span>
        </div>
      )}

      {/* Date row */}
      <div style={{ padding: "4px 16px 6px", display: "flex", alignItems: "center", gap: 6 }}>
        <DateChip value={startDate} onChange={(v) => { setStartDate(v); if (v > endDate) setEndDate(v); }} />
        {(allDay && startDate !== endDate) && (
          <>
            <ArrowRight size={11} style={{ color: "var(--color-text-tertiary)" }} />
            <DateChip value={endDate} onChange={setEndDate} />
          </>
        )}
      </div>

      {/* All-day / Time zone / Repeat strip — Time zone + Repeat inert for now */}
      <div style={{ padding: "4px 14px 10px", display: "flex", alignItems: "center", gap: 4 }}>
        <PillButton
          active={allDay}
          onClick={() => {
            setAllDay(!allDay);
            if (!allDay) setEndDate(startDate); // first toggle on: collapse to same day
          }}
        >All-day</PillButton>
        <PillButton inert title="Time-zone selection — coming soon">Time zone</PillButton>
        <PillButton inert title="Recurring events — coming soon">Repeat</PillButton>
      </div>

      <div style={{ height: 1, background: "var(--color-border)" }} />

      {/* Icon-led sections */}
      <div style={{ padding: "8px 6px" }}>
        {/* Participants */}
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
            style={textInputStyle}
          />
        </Section>

        {/* Conferencing */}
        <Section icon={<Video size={13} />} label="Conferencing">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={addConference}
              onChange={(e) => setAddConference(e.target.checked)}
              style={{ accentColor: "var(--color-sage)" }}
            />
            {isMicrosoft ? "Add Microsoft Teams meeting" : "Add Google Meet"}
          </label>
        </Section>

        {/* Location */}
        <Section icon={<MapPin size={13} />} label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Address, room, link…"
            style={textInputStyle}
          />
        </Section>

        {/* Description */}
        <Section icon={<FileText size={13} />} label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes, agenda, links"
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
            No writable calendar. <a href="/settings#integrations" style={{ color: "var(--color-sage)", textDecoration: "underline" }}>Connect one</a> to create events.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setCalMenuOpen(v => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              background: "transparent", border: "none", padding: "4px 0",
              fontFamily: "inherit", textAlign: "left", cursor: "pointer",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 9999, background: selectedCal?.color ?? "#039BE5", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedCal?.account_email ?? selectedCal?.name ?? "Pick a calendar"}
            </span>
            {calMenuOpen ? <ChevronUp size={11} style={{ color: "var(--color-text-tertiary)" }} /> : <ChevronDown size={11} style={{ color: "var(--color-text-tertiary)" }} />}
          </button>
        )}
        {calMenuOpen && (
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
          style={{
            background: "transparent", border: "none", padding: 0,
            fontSize: 12, color: "var(--color-text-primary)", fontFamily: "inherit",
            cursor: "pointer",
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

      <div style={{
        display: "flex", justifyContent: "flex-end", gap: 8,
        padding: "10px 16px",
        borderTop: "0.5px solid var(--color-border)",
      }}>
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
            color: "white", background: "var(--color-sage)",
            opacity: (!title.trim() || !calendarId || submitting || noWritable) ? 0.5 : 1,
            border: "none", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {submitting ? "Saving…" : "Add event"}
        </button>
      </div>
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

function PillButton({ active, inert, onClick, children, title }: {
  active?: boolean; inert?: boolean; onClick?: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={inert ? undefined : onClick}
      title={title}
      disabled={inert}
      style={{
        padding: "3px 10px", fontSize: 11, borderRadius: 9999,
        background: active ? "var(--color-cream)" : "transparent",
        border: `0.5px solid ${active ? "var(--color-charcoal)" : "var(--color-border)"}`,
        color: inert ? "var(--color-text-tertiary)" : (active ? "var(--color-charcoal)" : "var(--color-text-secondary)"),
        fontFamily: "inherit",
        cursor: inert ? "default" : "pointer",
        opacity: inert ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function TimeChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Native time input lives behind a styled label so the chip can read
  // "6 PM" instead of the OS-default formatting; click anywhere on the
  // chip opens the picker.
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 6,
        background: "var(--color-cream)",
        border: "0.5px solid var(--color-border)",
        fontSize: 12, color: "var(--color-text-primary)",
        cursor: "pointer", position: "relative",
      }}
    >
      {fmtTimeChip(value)}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: "absolute", inset: 0,
          opacity: 0, cursor: "pointer",
        }}
      />
    </label>
  );
}

function DateChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center",
        padding: "3px 8px", borderRadius: 6,
        background: "var(--color-cream)",
        border: "0.5px solid var(--color-border)",
        fontSize: 12, color: "var(--color-text-primary)",
        cursor: "pointer", position: "relative",
      }}
    >
      {fmtDateChip(value)}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: "absolute", inset: 0,
          opacity: 0, cursor: "pointer",
        }}
      />
    </label>
  );
}
