"use client";

// Event detail scrim. Models off TargetDetailPanel.
//
// When the parent user_calendars row is writable the title, time,
// location, and description become click-to-edit and a Delete button
// appears in the footer. Writes go through PATCH/DELETE
// /api/integrations/calendar/events/[encodedId]. Read-only events keep
// the "Open in Google/Outlook" escape hatch.

import { useEffect, useRef, useState } from "react";
import { X, MapPin, ExternalLink, Clock, Calendar as CalendarIcon, Trash2 } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";

export interface CalendarEventLite {
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
}

interface Props {
  event:   CalendarEventLite;
  color:   string;
  onClose: () => void;
  /** Called after a successful PATCH so the parent can update its cache. */
  onUpdated?: (event: CalendarEventLite) => void;
  /** Called after a successful DELETE so the parent can drop the event. */
  onDeleted?: (eventId: string) => void;
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
  const [h, mm]    = (timeStr || "00:00").split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, dd, h, mm, 0, 0);
}

function fmtRange(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) {
    const s = new Date(startIso + (startIso.length === 10 ? "T00:00:00" : ""));
    return s.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + " · all day";
  }
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  const day  = s.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const st   = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const et   = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `${day} · ${st} – ${et}`;
  const day2 = e.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${st} → ${day2}, ${et}`;
}

function encodeRef(event: CalendarEventLite): string {
  const provider = event.source ?? "google";
  return encodeURIComponent(`${provider}:${event.id}`);
}

export default function EventDetailPanel({ event: initialEvent, color, onClose, onUpdated, onDeleted }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [event, setEvent] = useState(initialEvent);
  const writable = !!event.writable && !!event.calendarId;

  // Local edit buffer per field — committed on blur/save. Keeping them
  // separate from the snapshot lets us discard on cancel without
  // round-tripping the server.
  const [editing,  setEditing]  = useState<null | "title" | "time" | "location" | "description">(null);
  const [titleBuf, setTitleBuf] = useState(event.title);
  const [locBuf,   setLocBuf]   = useState(event.location ?? "");
  const [descBuf,  setDescBuf]  = useState(event.description ?? "");
  const [allDayBuf,setAllDayBuf]= useState(event.allDay);
  const [startD,   setStartD]   = useState(toLocalDateInput(new Date(event.start)));
  const [startT,   setStartT]   = useState(toLocalTimeInput(new Date(event.start)));
  const [endD,     setEndD]     = useState(toLocalDateInput(new Date(event.end)));
  const [endT,     setEndT]     = useState(toLocalTimeInput(new Date(event.end)));

  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [reconnect,setReconnect]= useState<{ url: string; provider: string } | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (editing) { cancelEdit(); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editing]);

  function cancelEdit() {
    setEditing(null);
    setTitleBuf(event.title);
    setLocBuf(event.location ?? "");
    setDescBuf(event.description ?? "");
    setAllDayBuf(event.allDay);
    setStartD(toLocalDateInput(new Date(event.start)));
    setStartT(toLocalTimeInput(new Date(event.start)));
    setEndD(toLocalDateInput(new Date(event.end)));
    setEndT(toLocalTimeInput(new Date(event.end)));
    setErr(null);
  }

  async function patch(patchBody: Record<string, unknown>): Promise<boolean> {
    if (!writable || !event.calendarId) return false;
    setSaving(true);
    setErr(null);
    setReconnect(null);
    try {
      const res = await fetch(`/api/integrations/calendar/events/${encodeRef(event)}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ calendar_id: event.calendarId, ...patchBody }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 412 && json?.error === "scope_upgrade_required") {
        setReconnect({ url: json.reconnect_url, provider: json.provider });
        setSaving(false);
        return false;
      }
      if (!res.ok) {
        setErr(typeof json?.error === "string" ? json.error : "Couldn't save changes.");
        setSaving(false);
        return false;
      }
      const updated = (json.event as CalendarEventLite | undefined) ?? null;
      if (updated) {
        // Preserve calendarId + writable + accountName the server may
        // not have echoed back on the PATCH response.
        const merged = { ...event, ...updated, calendarId: event.calendarId, writable: event.writable, accountName: event.accountName };
        setEvent(merged);
        onUpdated?.(merged);
      }
      setSaving(false);
      return true;
    } catch (e) {
      console.error("[EventDetailPanel] patch failed:", e);
      setErr("Network error.");
      setSaving(false);
      return false;
    }
  }

  async function saveTitle() {
    if (titleBuf.trim() === event.title) { setEditing(null); return; }
    const ok = await patch({ title: titleBuf.trim() });
    if (ok) setEditing(null);
  }

  async function saveLocation() {
    if (locBuf === (event.location ?? "")) { setEditing(null); return; }
    const ok = await patch({ location: locBuf });
    if (ok) setEditing(null);
  }

  async function saveDescription() {
    if (descBuf === (event.description ?? "")) { setEditing(null); return; }
    const ok = await patch({ description: descBuf });
    if (ok) setEditing(null);
  }

  async function saveTime() {
    let startIso: string;
    let endIso:   string;
    if (allDayBuf) {
      startIso = `${startD}T00:00:00`;
      endIso   = `${endD}T00:00:00`;
    } else {
      startIso = combineLocal(startD, startT).toISOString();
      endIso   = combineLocal(endD,   endT).toISOString();
    }
    const ok = await patch({
      start_iso: startIso,
      end_iso:   endIso,
      all_day:   allDayBuf,
    });
    if (ok) setEditing(null);
  }

  async function deleteEvent() {
    if (!writable || !event.calendarId) return;
    if (!window.confirm("Delete this event? This can't be undone.")) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/integrations/calendar/events/${encodeRef(event)}?calendar_id=${encodeURIComponent(event.calendarId)}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 412 && json?.error === "scope_upgrade_required") {
        setReconnect({ url: json.reconnect_url, provider: json.provider });
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setErr(typeof json?.error === "string" ? json.error : "Couldn't delete.");
        setSaving(false);
        return;
      }
      onDeleted?.(event.id);
      // Also fire the global refresh so the grid drops the event even if
      // the parent didn't wire onDeleted.
      window.dispatchEvent(new Event("calendar:refresh-events"));
      onClose();
    } catch (e) {
      console.error("[EventDetailPanel] delete failed:", e);
      setErr("Network error.");
      setSaving(false);
    }
  }

  const providerLabel = event.source === "microsoft" ? "Outlook" : event.source === "google" ? "Google Calendar" : "External";

  return (
    <div
      aria-modal
      role="dialog"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(31,33,26,0.32)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}
    >
      <div
        ref={ref}
        style={{
          width: 440, height: "100%",
          background: "var(--color-off-white)",
          borderLeft: "0.5px solid var(--color-border)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.16)",
          display: "flex", flexDirection: "column",
          fontFamily: "inherit",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              style={{
                width: 9, height: 9, borderRadius: "50%",
                background: color, flexShrink: 0,
                boxShadow: `0 0 0 2px ${color}22`,
              }}
            />
            <span
              style={{
                fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)",
                textTransform: "uppercase", letterSpacing: "0.06em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {providerLabel}{event.accountName ? ` · ${event.accountName}` : ""}
            </span>
            {!writable && (
              <span
                style={{
                  marginLeft: 6, padding: "2px 7px",
                  fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                  color: "var(--color-text-tertiary)",
                  background: "var(--color-surface-sunken)",
                  borderRadius: 999,
                }}
              >
                Read-only
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 7,
              border: "none", background: "transparent",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-text-secondary)", cursor: "pointer",
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 40px" }}>
          {/* Title — click-to-edit when writable */}
          {writable && editing === "title" ? (
            <input
              autoFocus
              value={titleBuf}
              onChange={(e) => setTitleBuf(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
                if (e.key === "Escape") cancelEdit();
              }}
              style={{
                width: "100%",
                fontSize: 18, fontWeight: 600, lineHeight: 1.3,
                color: "var(--color-charcoal)",
                fontFamily: "var(--font-display)",
                background: "var(--color-warm-white)",
                border: "0.5px solid var(--color-sage)",
                borderRadius: 6,
                padding: "6px 8px",
                marginBottom: 16,
              }}
            />
          ) : (
            <h2
              onClick={writable ? () => setEditing("title") : undefined}
              style={{
                fontSize: 18, fontWeight: 600, lineHeight: 1.3,
                color: "var(--color-charcoal)",
                fontFamily: "var(--font-display)",
                marginBottom: 16,
                cursor: writable ? "text" : "default",
                padding: writable ? "6px 8px" : 0,
                borderRadius: 6,
                margin: writable ? "0 -8px 10px" : "0 0 16px",
              }}
              onMouseEnter={writable ? (e) => (e.currentTarget.style.background = "var(--color-cream)") : undefined}
              onMouseLeave={writable ? (e) => (e.currentTarget.style.background = "transparent") : undefined}
            >
              {event.title || "(No title)"}
            </h2>
          )}

          {/* Time — click-to-edit when writable */}
          {writable && editing === "time" ? (
            <div
              style={{
                padding: "12px 14px",
                background: "var(--color-warm-white)",
                border: "0.5px solid var(--color-sage)",
                borderRadius: 10,
                marginBottom: 12,
              }}
            >
              <label
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "var(--color-text-secondary)",
                  marginBottom: 10, cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={allDayBuf}
                  onChange={(e) => setAllDayBuf(e.target.checked)}
                  style={{ accentColor: "var(--color-sage)" }}
                />
                All-day
              </label>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>
                    Starts
                  </label>
                  <DatePicker
                    value={new Date(startD + "T00:00:00")}
                    onChange={(d) => setStartD(toLocalDateInput(d))}
                  />
                </div>
                {!allDayBuf && (
                  <div style={{ width: 100 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>
                      Time
                    </label>
                    <input
                      type="time"
                      value={startT}
                      onChange={(e) => setStartT(e.target.value)}
                      style={{
                        width: "100%", padding: "8px 10px", fontSize: 12,
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

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>
                    Ends
                  </label>
                  <DatePicker
                    value={new Date(endD + "T00:00:00")}
                    onChange={(d) => setEndD(toLocalDateInput(d))}
                  />
                </div>
                {!allDayBuf && (
                  <div style={{ width: 100 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>
                      Time
                    </label>
                    <input
                      type="time"
                      value={endT}
                      onChange={(e) => setEndT(e.target.value)}
                      style={{
                        width: "100%", padding: "8px 10px", fontSize: 12,
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

              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  onClick={cancelEdit}
                  style={{ padding: "5px 10px", fontSize: 11, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}
                >Cancel</button>
                <button
                  onClick={saveTime}
                  disabled={saving}
                  style={{ padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6, border: "none", background: "var(--color-sage)", color: "white", cursor: "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit" }}
                >{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          ) : (
            <ClickableRow
              icon={<Clock size={13} strokeWidth={1.75} />}
              label={fmtRange(event.start, event.end, event.allDay)}
              editable={writable}
              onClick={() => setEditing("time")}
            />
          )}

          {/* Location */}
          {writable && editing === "location" ? (
            <div style={{ padding: "8px 0" }}>
              <input
                autoFocus
                value={locBuf}
                onChange={(e) => setLocBuf(e.target.value)}
                onBlur={saveLocation}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveLocation(); }
                  if (e.key === "Escape") cancelEdit();
                }}
                placeholder="Add location"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12.5,
                  background: "var(--color-warm-white)",
                  border:     "0.5px solid var(--color-sage)",
                  borderRadius: 6,
                  fontFamily: "inherit",
                  color:       "var(--color-text-primary)",
                }}
              />
            </div>
          ) : (
            (event.location || writable) && (
              <ClickableRow
                icon={<MapPin size={13} strokeWidth={1.75} />}
                label={event.location || "Add location"}
                muted={!event.location}
                editable={writable}
                onClick={() => setEditing("location")}
              />
            )
          )}

          {event.accountName && (
            <ClickableRow
              icon={<CalendarIcon size={13} strokeWidth={1.75} />}
              label={event.accountName}
              editable={false}
            />
          )}

          {/* Description */}
          {writable && editing === "description" ? (
            <div
              style={{
                marginTop: 20, padding: "12px 14px",
                background: "var(--color-warm-white)",
                border: "0.5px solid var(--color-sage)",
                borderRadius: 10,
              }}
            >
              <p style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
                marginBottom: 8,
              }}>
                Description
              </p>
              <textarea
                autoFocus
                value={descBuf}
                onChange={(e) => setDescBuf(e.target.value)}
                placeholder="Notes, agenda, links"
                rows={4}
                style={{
                  width: "100%", padding: "6px 8px", fontSize: 12.5, lineHeight: 1.6,
                  background: "var(--color-off-white)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 6,
                  fontFamily: "inherit",
                  color: "var(--color-text-primary)",
                  resize: "vertical",
                  minHeight: 80,
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={cancelEdit}
                  style={{ padding: "5px 10px", fontSize: 11, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}
                >Cancel</button>
                <button
                  onClick={saveDescription}
                  disabled={saving}
                  style={{ padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6, border: "none", background: "var(--color-sage)", color: "white", cursor: "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit" }}
                >{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          ) : (
            (event.description || writable) && (
              <div
                onClick={writable ? () => setEditing("description") : undefined}
                style={{
                  marginTop: 20, padding: "14px 16px",
                  background: "var(--color-warm-white)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 10,
                  cursor: writable ? "text" : "default",
                  transition: "border-color 0.12s ease",
                }}
                onMouseEnter={writable ? (e) => (e.currentTarget.style.borderColor = "var(--color-sage)") : undefined}
                onMouseLeave={writable ? (e) => (e.currentTarget.style.borderColor = "var(--color-border)") : undefined}
              >
                <p style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
                  marginBottom: 8,
                }}>
                  Description
                </p>
                <p
                  style={{
                    fontSize: 12.5, lineHeight: 1.7,
                    color: event.description ? "#4a4640" : "var(--color-text-tertiary)",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    fontStyle: event.description ? "normal" : "italic",
                  }}
                >
                  {event.description || "Add a description…"}
                </p>
              </div>
            )
          )}

          {reconnect && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(220,62,13,0.06)",
                border: "0.5px solid rgba(220,62,13,0.25)",
                fontSize: 11.5, color: "var(--color-red-orange)", lineHeight: 1.5,
              }}
            >
              Your {reconnect.provider === "microsoft" ? "Outlook" : "Google"} connection
              doesn&apos;t have write permission yet.{" "}
              <a href={reconnect.url} style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
                Reconnect to enable
              </a>.
            </div>
          )}

          {err && (
            <p style={{ marginTop: 12, fontSize: 11.5, color: "var(--color-red-orange)" }}>{err}</p>
          )}

          {!writable && (
            <div
              style={{
                marginTop: 22,
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--color-warm-white)",
                border: "0.5px dashed var(--color-border)",
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                lineHeight: 1.55,
              }}
            >
              This calendar is read-only in Perennial. Open it in {providerLabel} to edit, reschedule, or invite people.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "10px 16px",
            borderTop: "0.5px solid var(--color-border)",
            background: "var(--color-warm-white)",
            flexShrink: 0,
          }}
        >
          {writable ? (
            <button
              onClick={deleteEvent}
              disabled={saving}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 7,
                background: "transparent",
                color: "var(--color-red-orange)",
                border: "0.5px solid rgba(220,62,13,0.25)",
                fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit",
                opacity: saving ? 0.5 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,62,13,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Trash2 size={12} strokeWidth={1.75} />
              Delete
            </button>
          ) : <span />}

          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8,
                background: writable ? "transparent" : "var(--color-sage)",
                color: writable ? "var(--color-text-secondary)" : "white",
                border: writable ? "0.5px solid var(--color-border)" : "none",
                fontSize: 12, fontWeight: 500, textDecoration: "none",
                fontFamily: "inherit",
                transition: "background 0.12s ease",
              }}
            >
              <ExternalLink size={12} strokeWidth={2} />
              Open in {providerLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ClickableRow({
  icon, label, editable, onClick, muted,
}: {
  icon:      React.ReactNode;
  label:     string;
  editable:  boolean;
  onClick?:  () => void;
  muted?:    boolean;
}) {
  return (
    <div
      onClick={editable ? onClick : undefined}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: editable ? "8px" : "8px 0",
        margin: editable ? "0 -8px" : 0,
        color: "var(--color-text-secondary)",
        cursor: editable ? "text" : "default",
        borderRadius: 6,
        transition: "background 0.12s ease",
      }}
      onMouseEnter={editable ? (e) => (e.currentTarget.style.background = "var(--color-cream)") : undefined}
      onMouseLeave={editable ? (e) => (e.currentTarget.style.background = "transparent") : undefined}
    >
      <span style={{ marginTop: 2, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontSize: 12.5, lineHeight: 1.55,
        color: muted ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
        fontStyle: muted ? "italic" : "normal",
      }}>{label}</span>
    </div>
  );
}
