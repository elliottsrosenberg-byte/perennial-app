"use client";

// Dropdown opened by the 3-dot button in the Calendar topbar. Mirrors
// ContactsOptionsMenu — list-wide preferences plus a refresh action that
// re-syncs calendar lists from every connected provider.

import { useEffect, useRef, useState } from "react";
import { RefreshCw, EyeOff, CalendarDays } from "lucide-react";

interface Props {
  showWeekends: boolean;
  onToggleShowWeekends: () => void;
  showDeclined: boolean;
  onToggleShowDeclined: () => void;
  onClose: () => void;
}

export default function CalendarOptionsMenu({
  showWeekends, onToggleShowWeekends,
  showDeclined, onToggleShowDeclined,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function refreshCalendars() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const res = await fetch("/api/integrations/calendar/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRefreshNote(typeof data?.message === "string" ? data.message : "Calendars refreshed.");
        window.dispatchEvent(new Event("calendar:refresh-events"));
      } else {
        setRefreshNote("Couldn't refresh — try again in a moment.");
      }
    } catch {
      setRefreshNote("Couldn't refresh — try again in a moment.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)",
        width: 270, zIndex: 40,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-overlay)",
        overflow: "hidden",
      }}
    >
      <div style={{
        padding: "10px 14px 6px",
        borderBottom: "0.5px solid var(--color-border)",
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
        }}>
          Calendar options
        </p>
      </div>

      <div style={{ padding: 6 }}>
        <OptionToggleRow
          icon={<CalendarDays size={13} strokeWidth={1.75} style={{ color: showWeekends ? "var(--color-sage)" : "var(--color-text-tertiary)" }} />}
          title="Show weekends"
          subtitle={showWeekends ? "Sat + Sun visible" : "Weekdays only"}
          active={showWeekends}
          onClick={onToggleShowWeekends}
        />

        <OptionToggleRow
          icon={<EyeOff size={13} strokeWidth={1.75} style={{ color: showDeclined ? "var(--color-text-tertiary)" : "var(--color-sage)" }} />}
          title={showDeclined ? "Showing declined events" : "Hiding declined events"}
          subtitle="Declined events stay dimmed when visible"
          active={showDeclined}
          onClick={onToggleShowDeclined}
        />

        <div style={{ height: 1, background: "var(--color-border)", margin: "6px 4px" }} />

        <button
          onClick={refreshCalendars}
          disabled={refreshing}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent",
            cursor: refreshing ? "default" : "pointer",
            fontFamily: "inherit", textAlign: "left",
            opacity: refreshing ? 0.65 : 1,
          }}
          onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <RefreshCw
            size={13}
            strokeWidth={1.75}
            style={{
              color: "var(--color-text-secondary)",
              flexShrink: 0,
              animation: refreshing ? "spin 0.9s linear infinite" : undefined,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              {refreshing ? "Refreshing calendars…" : "Refresh calendars"}
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              {refreshNote ?? "Re-pull this week's events from every connected provider."}
            </p>
          </div>
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function OptionToggleRow({
  icon, title, subtitle, active, onClick,
}: {
  icon:     React.ReactNode;
  title:    string;
  subtitle: string;
  active:   boolean;
  onClick:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 7, border: "none",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{title}</p>
        <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>{subtitle}</p>
      </div>
      <span
        aria-checked={active}
        style={{
          flexShrink: 0,
          width: 26, height: 14, borderRadius: 999,
          background: active ? "var(--color-sage)" : "var(--color-border-strong)",
          position: "relative",
          transition: "background 0.15s ease",
        }}
      >
        <span style={{
          position: "absolute",
          top: 1, left: active ? 13 : 1,
          width: 12, height: 12, borderRadius: 999,
          background: "white",
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          transition: "left 0.15s ease",
        }} />
      </span>
    </button>
  );
}
