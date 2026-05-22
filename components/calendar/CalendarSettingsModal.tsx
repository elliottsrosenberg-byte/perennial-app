"use client";

// Calendar settings — full-scrim modal with a left sidebar of tabs. Each
// tab is a placeholder for now ("Coming soon") so the IA is in place; real
// persistence (account management, conferencing defaults, working hours,
// notifications, keyboard shortcuts) is tracked as a deferred TODO and
// will hang off this shell.

import { useEffect, useRef, useState } from "react";
import { X, Cable, Video, Clock, Bell, Keyboard, SlidersHorizontal } from "lucide-react";

interface Props {
  onClose: () => void;
}

type TabKey = "accounts" | "conferencing" | "hours" | "notifications" | "shortcuts" | "general";

interface Tab {
  key:   TabKey;
  label: string;
  icon:  React.ReactNode;
  blurb: string;
}

const TABS: Tab[] = [
  { key: "general",       label: "General",         icon: <SlidersHorizontal size={13} strokeWidth={1.75} />, blurb: "Default view, week-start, weekend visibility, timezone display." },
  { key: "accounts",      label: "Calendar accounts", icon: <Cable size={13} strokeWidth={1.75} />,             blurb: "Connect or remove Google and Outlook accounts, and pick which calendars from each account show up here." },
  { key: "conferencing",  label: "Conferencing",    icon: <Video size={13} strokeWidth={1.75} />,             blurb: "Default to Google Meet or Teams when creating events — per account." },
  { key: "hours",         label: "Working hours",   icon: <Clock size={13} strokeWidth={1.75} />,             blurb: "Shade non-working hours, and use them when Ash suggests times." },
  { key: "notifications", label: "Notifications",   icon: <Bell size={13} strokeWidth={1.75} />,              blurb: "Default reminder times for new events, and how Perennial nudges you before a meeting." },
  { key: "shortcuts",     label: "Keyboard shortcuts", icon: <Keyboard size={13} strokeWidth={1.75} />,        blurb: "Create events, jump dates, switch views — without lifting your hands." },
];

export default function CalendarSettingsModal({ onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tab = TABS.find(t => t.key === activeTab) ?? TABS[0];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(31,33,26,0.45)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal={true}
        style={{
          width: "100%", maxWidth: 960,
          height: "100%", maxHeight: "calc(100vh - 64px)",
          background: "var(--color-off-white)",
          border:     "0.5px solid var(--color-border)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.28)",
          fontFamily: "inherit",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "0.5px solid var(--color-border)",
          flexShrink: 0,
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
              fontSize: 18, fontWeight: 600,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
            }}>
              Settings
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

        {/* Body: left sidebar + right content */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Sidebar */}
          <div style={{
            width: 220, flexShrink: 0,
            borderRight: "0.5px solid var(--color-border)",
            background: "var(--color-warm-white)",
            padding: "12px 8px",
            overflowY: "auto",
          }}>
            {TABS.map(t => {
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "8px 10px", marginBottom: 2,
                    borderRadius: 7, border: "none",
                    background: active ? "var(--color-cream)" : "transparent",
                    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: active ? 500 : 400,
                    fontSize: 12.5,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>{t.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "28px 32px" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
              marginBottom: 6,
            }}>
              {tab.label}
            </p>
            <h3 style={{
              fontSize: 22, fontWeight: 600,
              fontFamily: "var(--font-display)",
              color: "var(--color-text-primary)",
              letterSpacing: "-0.01em",
              marginBottom: 10,
            }}>
              {tab.label === "General" ? "General preferences" : tab.label}
            </h3>
            <p style={{
              fontSize: 13, lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              marginBottom: 20,
              maxWidth: 520,
            }}>
              {tab.blurb}
            </p>

            <div
              style={{
                padding: "20px 22px",
                borderRadius: 12,
                background: "var(--color-warm-white)",
                border: "0.5px dashed var(--color-border-strong)",
                color: "var(--color-text-tertiary)",
                fontSize: 12.5,
                lineHeight: 1.55,
                maxWidth: 520,
              }}
            >
              <p style={{ fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Coming soon
              </p>
              <p>
                This tab is a placeholder so the surface is in place. Real controls will land here as the calendar grows; the IA stays the same.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
