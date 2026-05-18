"use client";

// Per-account, per-calendar visibility checkboxes for the left rail.
// Mirrors the Sources section of Notion Calendar — one group per
// (provider × account_email) with a colored checkbox per calendar.
// Toggles optimistically, persists via PATCH /api/integrations/calendar/calendars,
// then fires `calendar:refresh-events` so the main grid re-pulls.

import { useEffect, useMemo, useState } from "react";
import type { UserCalendar } from "@/types/database";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  /** Bumped by parent on connect/refresh so we re-fetch the list. */
  refreshNonce?: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  google:          "Google",
  google_calendar: "Google",
  microsoft:       "Outlook",
  apple_icloud:    "iCloud",
};

const PROVIDER_DEFAULT_COLOR: Record<string, string> = {
  google:          "#039BE5",
  google_calendar: "#039BE5",
  microsoft:       "#0078d4",
  apple_icloud:    "#34c759",
};

function groupKey(c: UserCalendar): string {
  // Group rows by (provider, account_email) so a user with three
  // accounts sees three sections. `account_email` may be null for
  // legacy gcal rows — bucket those under a placeholder.
  return `${c.provider}::${c.account_email ?? "primary"}`;
}

function groupLabel(c: UserCalendar): { account: string; provider: string } {
  return {
    account:  c.account_email ?? "Primary account",
    provider: PROVIDER_LABELS[c.provider] ?? c.provider,
  };
}

export default function CalendarSourcesPanel({ refreshNonce = 0 }: Props) {
  const [calendars, setCalendars] = useState<UserCalendar[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/integrations/calendar/calendars")
      .then((r) => r.json())
      .then((d: { calendars?: UserCalendar[] }) => {
        if (cancelled) return;
        setCalendars(d.calendars ?? []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshNonce]);

  const groups = useMemo(() => {
    const map = new Map<string, UserCalendar[]>();
    for (const c of calendars) {
      const k = groupKey(c);
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: groupLabel(list[0]),
      calendars: list,
    }));
  }, [calendars]);

  async function toggle(cal: UserCalendar) {
    const nextVisible = !cal.visible;
    // Optimistic
    setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, visible: nextVisible } : c)));
    try {
      const res = await fetch("/api/integrations/calendar/calendars", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: cal.id, visible: nextVisible }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      window.dispatchEvent(new Event("calendar:refresh-events"));
    } catch {
      // Roll back
      setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, visible: cal.visible } : c)));
    }
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div style={{ padding: "10px 14px", fontSize: 10, color: "var(--color-text-tertiary)" }}>
        Loading calendars…
      </div>
    );
  }

  if (groups.length === 0) {
    // Nothing to render — the integrations panel below this in the rail
    // already nudges the user to connect.
    return null;
  }

  return (
    <div style={{ padding: "10px 0 4px" }}>
      <div style={{
        padding: "0 14px 6px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-grey)" }}
        >
          Calendars
        </span>
      </div>

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <div key={g.key} style={{ marginBottom: 4 }}>
            <button
              onClick={() => toggleGroup(g.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px 4px 6px", background: "transparent", border: "none",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {isCollapsed
                ? <ChevronRight size={10} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
                : <ChevronDown  size={10} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />}
              <span
                style={{
                  fontSize: 10.5, fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  flex: 1, minWidth: 0,
                }}
              >
                {g.label.account}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 500, color: "var(--color-text-tertiary)",
                textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
              }}>
                {g.label.provider}
              </span>
            </button>

            {!isCollapsed && g.calendars.map((c) => {
              const color = c.color ?? PROVIDER_DEFAULT_COLOR[c.provider] ?? "#888";
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 14px 4px 22px",
                    background: "transparent", border: "none",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    aria-checked={c.visible}
                    role="checkbox"
                    style={{
                      width: 12, height: 12, borderRadius: 3,
                      border: `1.5px solid ${color}`,
                      background: c.visible ? color : "transparent",
                      flexShrink: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.1s ease",
                    }}
                  >
                    {c.visible && (
                      <svg width="7" height="5" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: c.visible ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                      fontWeight: c.is_primary ? 500 : 400,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      flex: 1, minWidth: 0,
                    }}
                  >
                    {c.name}
                  </span>
                  {c.is_primary && (
                    <span style={{
                      fontSize: 8.5, fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.05em", color: "var(--color-text-tertiary)",
                      flexShrink: 0,
                    }}>
                      Primary
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
