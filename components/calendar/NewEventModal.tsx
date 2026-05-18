"use client";

// Create-event modal. Same scrim shell as NewTaskModal but talks to the
// calendar write API instead of the tasks table. Fetches the user's
// writable calendars on open, defaults to the primary, and on submit
// dispatches `calendar:event-created` + `calendar:refresh-events` so
// CalendarClient can optimistically insert the new event without a
// full week refetch.

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserCalendar } from "@/types/database";
import DatePicker from "@/components/ui/DatePicker";

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
  /** Optional pre-fill from drag-to-create. ISO strings. */
  defaultStart?: Date;
  defaultEnd?:   Date;
  defaultAllDay?: boolean;
  /** Optional pre-selected calendar (overrides "primary writable" default). */
  defaultCalendarId?: string;
  onClose:  () => void;
  /** Fires on successful create with the normalized event row. */
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

/** Same Notion-style "round to 15 min" helper the drag handlers use. */
export function snapTo15(d: Date): Date {
  const out = new Date(d);
  const mins = out.getMinutes();
  out.setMinutes(Math.round(mins / 15) * 15, 0, 0);
  return out;
}

export default function NewEventModal({
  defaultStart, defaultEnd, defaultAllDay, defaultCalendarId,
  onClose, onCreated,
}: Props) {
  const [calendars, setCalendars] = useState<UserCalendar[]>([]);
  const [calsLoading, setCalsLoading] = useState(true);

  const start0 = defaultStart ?? snapTo15(new Date());
  const end0   = defaultEnd   ?? new Date(start0.getTime() + 30 * 60_000);

  const [title,       setTitle]       = useState("");
  const [allDay,      setAllDay]      = useState(!!defaultAllDay);
  const [startDate,   setStartDate]   = useState(toLocalDateInput(start0));
  const [startTime,   setStartTime]   = useState(toLocalTimeInput(start0));
  const [endDate,     setEndDate]     = useState(toLocalDateInput(end0));
  const [endTime,     setEndTime]     = useState(toLocalTimeInput(end0));
  const [description, setDescription] = useState("");
  const [location,    setLocation]    = useState("");
  const [calendarId,  setCalendarId]  = useState<string | null>(defaultCalendarId ?? null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState<{ url: string; provider: string } | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  // Load the user's writable calendars on open. We could pass these in
  // from the parent to avoid the round-trip, but the modal is opened
  // rarely enough that the fetch is fine and keeps the parent simpler.
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

  const selectedCal = useMemo(
    () => calendars.find((c) => c.id === calendarId) ?? null,
    [calendars, calendarId],
  );

  const noWritable = !calsLoading && calendars.length === 0;

  async function submit() {
    if (!title.trim() || !calendarId || submitting) return;
    setError(null);
    setNeedsReconnect(null);
    setSubmitting(true);

    let startIso: string;
    let endIso:   string;
    if (allDay) {
      // For all-day, end date is exclusive in iCalendar but Google + Graph
      // both also accept "same day". We pass the user-entered start and
      // end dates verbatim; the provider routes coerce.
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
          calendar_id: calendarId,
          title:       title.trim(),
          start_iso:   startIso,
          end_iso:     endIso,
          all_day:     allDay,
          description: description.trim() || null,
          location:    location.trim() || null,
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
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(31,33,26,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-2xl p-6 flex flex-col gap-4"
        style={{
          width: 460, maxHeight: "92vh", overflowY: "auto",
          background: "var(--color-off-white)",
          border:     "0.5px solid var(--color-border)",
          boxShadow:  "0 8px 40px rgba(0,0,0,0.18)",
          fontFamily: "inherit",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>
            New event
          </h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-[18px] leading-none"
            style={{ color: "var(--color-grey)", border: "none", background: "transparent" }}
          >×</button>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Event title"
          className="w-full bg-transparent focus:outline-none text-[15px] font-medium"
          style={{
            color:        "var(--color-charcoal)",
            borderBottom: "0.5px solid var(--color-border)",
            paddingBottom: 8,
          }}
        />

        {/* All-day toggle */}
        <label
          className="flex items-center gap-2 cursor-pointer text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            style={{ accentColor: "var(--color-sage)" }}
          />
          All-day
        </label>

        {/* Start */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
              Starts
            </label>
            <DatePicker
              value={startDate ? new Date(startDate + "T00:00:00") : null}
              onChange={(d) => setStartDate(toLocalDateInput(d))}
            />
          </div>
          {!allDay && (
            <div className="flex flex-col gap-1" style={{ width: 110 }}>
              <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
                Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{
                  padding: "8px 10px", fontSize: 12,
                  background: "var(--color-surface-sunken)",
                  border:     "0.5px solid var(--color-border)",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  color:       "var(--color-text-primary)",
                }}
              />
            </div>
          )}
        </div>

        {/* End */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
              Ends
            </label>
            <DatePicker
              value={endDate ? new Date(endDate + "T00:00:00") : null}
              onChange={(d) => setEndDate(toLocalDateInput(d))}
            />
          </div>
          {!allDay && (
            <div className="flex flex-col gap-1" style={{ width: 110 }}>
              <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
                Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{
                  padding: "8px 10px", fontSize: 12,
                  background: "var(--color-surface-sunken)",
                  border:     "0.5px solid var(--color-border)",
                  borderRadius: 8,
                  fontFamily: "inherit",
                  color:       "var(--color-text-primary)",
                }}
              />
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
            Calendar
          </label>
          {calsLoading ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading calendars…</p>
          ) : noWritable ? (
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              No writable calendars found. Reconnect Google or Outlook with write access from{" "}
              <a href="/settings?section=integrations" style={{ color: "var(--color-sage)", textDecoration: "underline" }}>
                Settings
              </a>{" "}
              to create events.
            </p>
          ) : (
            <select
              value={calendarId ?? ""}
              onChange={(e) => setCalendarId(e.target.value || null)}
              style={{
                padding: "8px 10px", fontSize: 12,
                background: "var(--color-surface-sunken)",
                border:     "0.5px solid var(--color-border)",
                borderRadius: 8,
                fontFamily: "inherit",
                color:       "var(--color-text-primary)",
              }}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.account_email ? ` — ${c.account_email}` : ""}
                  {c.is_primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Location */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
            Location
          </label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Add location or video link"
            style={{
              padding: "8px 10px", fontSize: 12,
              background: "var(--color-surface-sunken)",
              border:     "0.5px solid var(--color-border)",
              borderRadius: 8,
              fontFamily: "inherit",
              color:       "var(--color-text-primary)",
            }}
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes, agenda, links"
            rows={3}
            style={{
              padding: "8px 10px", fontSize: 12,
              background: "var(--color-surface-sunken)",
              border:     "0.5px solid var(--color-border)",
              borderRadius: 8,
              fontFamily: "inherit",
              color:       "var(--color-text-primary)",
              resize:      "vertical",
              minHeight:   60,
            }}
          />
        </div>

        {/* Footer */}
        {needsReconnect && (
          <div
            style={{
              padding: "10px 12px", borderRadius: 8,
              background: "rgba(220,62,13,0.06)",
              border: "0.5px solid rgba(220,62,13,0.25)",
              fontSize: 11.5, color: "var(--color-red-orange)", lineHeight: 1.5,
            }}
          >
            Your {needsReconnect.provider === "microsoft" ? "Outlook" : "Google"} connection
            doesn&apos;t have write permission yet.{" "}
            <a href={needsReconnect.url} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
              Reconnect to enable
            </a>.
          </div>
        )}
        {error && (
          <p className="text-[11px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={onClose}
            className="px-3 py-[6px] text-[12px] rounded-lg"
            style={{
              color: "var(--color-grey)",
              border: "0.5px solid var(--color-border)",
              background: "transparent",
            }}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={!title.trim() || !calendarId || submitting || noWritable}
            className="px-4 py-[6px] text-[12px] font-medium rounded-lg text-white"
            style={{
              background: "var(--color-sage)",
              opacity: (!title.trim() || !calendarId || submitting || noWritable) ? 0.5 : 1,
              border: "none",
            }}
          >
            {submitting ? "Saving…" : selectedCal ? `Add to ${selectedCal.name}` : "Add event"}
          </button>
        </div>
      </div>
    </div>
  );
}
