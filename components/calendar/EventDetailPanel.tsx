"use client";

// Read-only event popup, modeled on TargetDetailPanel's scrim shell.
// Replaces the previous "click event → open Google in a new tab" behavior
// so users can scan event details without leaving Perennial.
//
// Phase D2 write-back (PATCH/DELETE) is intentionally deferred — the
// "Open in Google/Outlook" link is the escape hatch for now. When the
// write-back API lands, the title/time/location fields become editable
// in place.

import { useEffect, useRef } from "react";
import { X, MapPin, ExternalLink, Clock, Calendar as CalendarIcon } from "lucide-react";

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
}

interface Props {
  event:   CalendarEventLite;
  color:   string;
  onClose: () => void;
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

export default function EventDetailPanel({ event, color, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          width: 420, height: "100%",
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
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px 40px" }}>
          <h2
            style={{
              fontSize: 18, fontWeight: 600, lineHeight: 1.3,
              color: "var(--color-charcoal)",
              fontFamily: "var(--font-display)",
              marginBottom: 16,
            }}
          >
            {event.title || "(No title)"}
          </h2>

          {/* Meta rows */}
          <DetailRow icon={<Clock size={13} strokeWidth={1.75} />} label={fmtRange(event.start, event.end, event.allDay)} />

          {event.location && (
            <DetailRow icon={<MapPin size={13} strokeWidth={1.75} />} label={event.location} />
          )}

          {event.accountName && (
            <DetailRow
              icon={<CalendarIcon size={13} strokeWidth={1.75} />}
              label={event.accountName}
            />
          )}

          {event.description && (
            <div
              style={{
                marginTop: 20, padding: "14px 16px",
                background: "var(--color-warm-white)",
                border: "0.5px solid var(--color-border)",
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
              <p
                style={{
                  fontSize: 12.5, lineHeight: 1.7,
                  color: "#4a4640",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {event.description}
              </p>
            </div>
          )}

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
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
            padding: "10px 16px",
            borderTop: "0.5px solid var(--color-border)",
            background: "var(--color-warm-white)",
            flexShrink: 0,
          }}
        >
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8,
                background: "var(--color-sage)", color: "white",
                fontSize: 12, fontWeight: 500, textDecoration: "none",
                fontFamily: "inherit",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-sage-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-sage)")}
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

function DetailRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "8px 0",
        color: "var(--color-text-secondary)",
      }}
    >
      <span style={{ marginTop: 2, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-text-primary)" }}>{label}</span>
    </div>
  );
}
