"use client";

// Calendar settings — currently a stub. The modal exists so the user
// can see where the surface will land; sections are placeholders with
// "Coming soon" captions. Real persistence is tracked as a deferred
// TODO ("Calendar settings modal — wire real settings"). Wiring will
// hang account management, conferencing defaults, working hours, and
// notifications off this same shell.

import { useEffect, useRef } from "react";
import { X, Cable, Video, Clock, Bell } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function CalendarSettingsModal({ onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(31,33,26,0.35)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={true}
        style={{
          width: 520, maxWidth: "100%",
          maxHeight: "calc(100vh - 48px)", overflowY: "auto",
          background: "var(--color-off-white)",
          border:     "0.5px solid var(--color-border)",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
          fontFamily: "inherit",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "0.5px solid var(--color-border)",
        }}>
          <div>
            <p style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
              marginBottom: 2,
            }}>
              Calendar
            </p>
            <h2 style={{
              fontSize: 16, fontWeight: 600,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-display)",
            }}>
              Calendar settings
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "transparent", border: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-text-secondary)", cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={15} />
          </button>
        </div>

        {/* Sections */}
        <div style={{ padding: "12px 14px 18px" }}>
          <SettingsSection
            icon={<Cable size={14} strokeWidth={1.75} />}
            title="Calendar accounts"
            blurb="Connect or remove Google and Outlook accounts, and pick which calendars from each account show up here."
          />
          <SettingsSection
            icon={<Video size={14} strokeWidth={1.75} />}
            title="Conferencing defaults"
            blurb="Default to Google Meet or Teams when creating events — per account."
          />
          <SettingsSection
            icon={<Clock size={14} strokeWidth={1.75} />}
            title="Working hours"
            blurb="Shade non-working hours, and use them when Ash suggests times."
          />
          <SettingsSection
            icon={<Bell size={14} strokeWidth={1.75} />}
            title="Notifications"
            blurb="Default reminder times for new events, and how Perennial nudges you before a meeting."
          />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "10px 16px",
          borderTop: "0.5px solid var(--color-border)",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "7px 16px", fontSize: 12, borderRadius: 7,
              color: "var(--color-grey)", border: "0.5px solid var(--color-border)",
              background: "transparent", cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ icon, title, blurb }: { icon: React.ReactNode; title: string; blurb: string }) {
  return (
    <div
      style={{
        display: "flex", gap: 12,
        padding: "12px 14px",
        marginBottom: 8,
        background: "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
      }}
    >
      <span style={{ color: "var(--color-text-tertiary)", flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            {title}
          </p>
          <span style={{
            fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--color-text-tertiary)",
            background: "var(--color-surface-sunken)",
            padding: "2px 7px", borderRadius: 999,
          }}>
            Coming soon
          </span>
        </div>
        <p style={{
          fontSize: 11.5, lineHeight: 1.55, color: "var(--color-text-tertiary)",
          marginTop: 4,
        }}>
          {blurb}
        </p>
      </div>
    </div>
  );
}
