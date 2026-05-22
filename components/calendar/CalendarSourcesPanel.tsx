"use client";

// Per-account, per-calendar visibility for the left rail.
// Mirrors the Sources section of Notion Calendar — one group per
// (provider × account_email), with each calendar row showing a color dot,
// a name, an eye toggle, and a 3-dot menu for per-calendar actions.

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserCalendar } from "@/types/database";
import { ChevronDown, ChevronRight, Eye, EyeOff, MoreHorizontal, Plus, ExternalLink, Trash2 } from "lucide-react";

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

// Notion-ish swatches. Keep these tightly curated — too many feels noisy
// and Google's own colour palette is similarly small.
const COLOR_SWATCHES: { name: string; value: string }[] = [
  { name: "Blue",    value: "#039BE5" },
  { name: "Green",   value: "#34c759" },
  { name: "Yellow",  value: "#e8c547" },
  { name: "Orange",  value: "#e8850d" },
  { name: "Red",     value: "#dc3e0d" },
  { name: "Pink",    value: "#c93a6a" },
  { name: "Purple",  value: "#6d4fa3" },
  { name: "Teal",    value: "#2a8a8a" },
  { name: "Grey",    value: "#9a9690" },
];

function groupKey(c: UserCalendar): string {
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [addOpen,    setAddOpen]    = useState(false);

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

  async function setVisible(cal: UserCalendar, nextVisible: boolean) {
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
      setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, visible: cal.visible } : c)));
    }
  }

  async function setColor(cal: UserCalendar, color: string) {
    setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, color } : c)));
    try {
      const res = await fetch("/api/integrations/calendar/calendars", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: cal.id, color }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      window.dispatchEvent(new Event("calendar:refresh-events"));
    } catch {
      setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, color: cal.color } : c)));
    }
  }

  // "Show only this calendar" — turn off every other calendar in the same
  // account group and turn this one on. Convenience for focus sessions; no
  // schema-level "solo" state, just a batch visibility flip.
  async function showOnlyThis(cal: UserCalendar) {
    const group = calendars.filter(c => groupKey(c) === groupKey(cal));
    const ops = group.map(c => setVisible(c, c.id === cal.id));
    await Promise.all(ops);
  }

  async function removeFromList(cal: UserCalendar) {
    // Optimistic — pull the row out immediately, restore on failure.
    const prev = calendars;
    setCalendars((cs) => cs.filter(c => c.id !== cal.id));
    try {
      const res = await fetch(`/api/integrations/calendar/calendars?id=${encodeURIComponent(cal.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("DELETE failed");
      window.dispatchEvent(new Event("calendar:refresh-events"));
    } catch {
      setCalendars(prev);
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

  return (
    <div style={{ padding: "10px 0 4px" }}>
      {groups.length > 0 && (
        <div style={{
          padding: "0 14px 6px",
          display: "flex", alignItems: "center",
        }}>
          <span
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-grey)" }}
          >
            Calendars
          </span>
        </div>
      )}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <div key={g.key} style={{ marginBottom: 6 }}>
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
                  fontSize: 11, fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  flex: 1, minWidth: 0,
                }}
                title={g.label.account}
              >
                {g.label.account}
              </span>
            </button>

            {!isCollapsed && g.calendars.map((c) => {
              const color = c.color ?? PROVIDER_DEFAULT_COLOR[c.provider] ?? "#888";
              const isOpen = openMenuId === c.id;
              return (
                <CalendarRow
                  key={c.id}
                  cal={c}
                  color={color}
                  menuOpen={isOpen}
                  onToggleMenu={() => setOpenMenuId(isOpen ? null : c.id)}
                  onCloseMenu={() => setOpenMenuId(null)}
                  onToggleVisible={() => setVisible(c, !c.visible)}
                  onColor={(v) => setColor(c, v)}
                  onShowOnly={() => showOnlyThis(c)}
                  onRemove={() => removeFromList(c)}
                />
              );
            })}
          </div>
        );
      })}

      {/* + Add calendar account */}
      <div style={{ padding: "8px 6px 4px", borderTop: groups.length > 0 ? "0.5px solid var(--color-border)" : "none", marginTop: groups.length > 0 ? 6 : 0, position: "relative" }}>
        <button
          onClick={() => setAddOpen(v => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 6,
            padding: "6px 8px", borderRadius: 6,
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: "inherit", textAlign: "left",
            fontSize: 11, color: "var(--color-text-secondary)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Plus size={11} strokeWidth={2} style={{ color: "var(--color-text-tertiary)" }} />
          Add calendar account
        </button>
        {addOpen && (
          <>
            <div onClick={() => setAddOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{
              position: "absolute",
              left: 6, right: 6, top: "calc(100% - 2px)",
              zIndex: 41,
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 10,
              boxShadow: "var(--shadow-overlay)",
              overflow: "hidden",
              padding: 4,
            }}>
              <AccountChoice
                label="Connect Google Calendar"
                onClick={() => { window.location.href = "/api/auth/google?next=/calendar"; }}
              />
              <AccountChoice
                label="Connect Outlook"
                onClick={() => { window.location.href = "/api/auth/microsoft?next=/calendar"; }}
              />
              <div style={{ height: 1, background: "var(--color-border)", margin: "2px 0" }} />
              <AccountChoice
                label="Manage integrations"
                external
                onClick={() => { window.location.href = "/settings?section=integrations"; }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function CalendarRow({
  cal, color, menuOpen, onToggleMenu, onCloseMenu,
  onToggleVisible, onColor, onShowOnly, onRemove,
}: {
  cal: UserCalendar;
  color: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleVisible: () => void;
  onColor: (hex: string) => void;
  onShowOnly: () => void;
  onRemove: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  // Compute the menu's fixed position from the trigger's viewport rect when
  // the menu opens. Using fixed positioning lets the menu escape the rail's
  // overflow-x: hidden so it can extend past the rail's right edge without
  // triggering a horizontal scroll on the toolbar.
  useEffect(() => {
    if (!menuOpen) { setMenuAnchor(null); return; }
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const MENU_W = 240;
    // Prefer anchoring under the trigger, but stay onscreen.
    const left = Math.min(window.innerWidth - MENU_W - 8, Math.max(8, r.left));
    const top  = r.bottom + 4;
    setMenuAnchor({ top, left });
  }, [menuOpen]);

  // Settings link maps to the user-facing provider settings page; falls back
  // to /settings?section=integrations for providers without a public settings URL.
  const settingsHref = cal.provider === "google" || cal.provider === "google_calendar"
    ? "https://calendar.google.com/calendar/u/0/r/settings"
    : cal.provider === "microsoft"
      ? "https://outlook.office.com/calendar/options/calendar"
      : "/settings?section=integrations";

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 10px 4px 22px",
        background: menuOpen ? "var(--color-surface-sunken)" : (hovered ? "var(--color-cream)" : "transparent"),
        cursor: "default",
        transition: "background 0.1s ease",
      }}
    >
      {/* Color dot */}
      <span style={{
        width: 10, height: 10, borderRadius: 9999,
        background: cal.visible ? color : "transparent",
        border: cal.visible ? "none" : `1.5px solid ${color}`,
        flexShrink: 0,
      }} />

      {/* Name */}
      <span
        title={cal.name}
        style={{
          fontSize: 11.5,
          color: cal.visible ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          fontWeight: cal.is_primary ? 500 : 400,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          flex: 1, minWidth: 0,
        }}
      >
        {cal.name}
      </span>

      {/* 3-dot — only on hover, sits between name and eye to mirror Notion */}
      {(hovered || menuOpen) && (
        <button
          ref={triggerRef}
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          aria-label="Calendar options"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 4,
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--color-text-tertiary)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <MoreHorizontal size={12} strokeWidth={2} />
        </button>
      )}

      {/* Eye / EyeOff */}
      <button
        onClick={onToggleVisible}
        aria-label={cal.visible ? "Hide calendar" : "Show calendar"}
        title={cal.visible ? "Hide" : "Show"}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 18, height: 18, borderRadius: 4,
          background: "transparent", border: "none", cursor: "pointer",
          color: cal.visible ? "var(--color-text-secondary)" : "var(--color-text-tertiary)",
          flexShrink: 0,
          opacity: cal.visible || hovered || menuOpen ? 1 : 0.4,
          transition: "opacity 0.1s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {cal.visible ? <Eye size={12} strokeWidth={1.75} /> : <EyeOff size={12} strokeWidth={1.75} />}
      </button>

      {menuOpen && menuAnchor && (
        <RowMenu
          cal={cal}
          color={color}
          anchor={menuAnchor}
          settingsHref={settingsHref}
          onClose={onCloseMenu}
          onColor={onColor}
          onShowOnly={onShowOnly}
          onToggleVisible={onToggleVisible}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

function RowMenu({
  cal, color, anchor, settingsHref, onClose, onColor, onShowOnly, onToggleVisible, onRemove,
}: {
  cal: UserCalendar;
  color: string;
  anchor: { top: number; left: number };
  settingsHref: string;
  onClose: () => void;
  onColor: (hex: string) => void;
  onShowOnly: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isExternal = settingsHref.startsWith("http");
  const settingsLabel = cal.provider === "microsoft"
    ? "Outlook Calendar settings"
    : cal.provider.startsWith("google")
      ? "Google Calendar settings"
      : "Integration settings";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
      <div style={{
        position: "fixed",
        top: anchor.top, left: anchor.left,
        zIndex: 81, minWidth: 240,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "var(--shadow-overlay)",
        overflow: "hidden",
        padding: 6,
      }}>
        {/* Colour swatches */}
        <div style={{ padding: "6px 8px" }}>
          <p style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
            Color
          </p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {COLOR_SWATCHES.map(s => (
              <button
                key={s.value}
                onClick={() => onColor(s.value)}
                title={s.name}
                style={{
                  width: 16, height: 16, borderRadius: 9999,
                  background: s.value,
                  border: "none", cursor: "pointer",
                  outline: color === s.value ? `2px solid ${s.value}` : "1px solid rgba(0,0,0,0.06)",
                  outlineOffset: color === s.value ? 1 : 0,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />

        <MenuRow
          label={cal.visible ? "Hide from calendar" : "Show on calendar"}
          icon={cal.visible ? <EyeOff size={12} /> : <Eye size={12} />}
          onClick={() => { onToggleVisible(); onClose(); }}
        />
        <MenuRow
          label="Show only this calendar"
          icon={<Eye size={12} />}
          onClick={() => { onShowOnly(); onClose(); }}
        />

        <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />

        <MenuRow
          label={settingsLabel}
          icon={<ExternalLink size={12} />}
          onClick={() => {
            if (isExternal) window.open(settingsHref, "_blank", "noopener,noreferrer");
            else window.location.href = settingsHref;
            onClose();
          }}
          rightHint={isExternal ? "↗" : undefined}
        />
        <MenuRow
          label="Remove from list"
          icon={<Trash2 size={12} />}
          danger
          onClick={() => { onRemove(); onClose(); }}
        />
      </div>
    </>
  );
}

function MenuRow({ label, icon, onClick, danger, rightHint }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  rightHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 10px", borderRadius: 6, border: "none",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
        fontSize: 12,
        color: danger ? "var(--color-red-orange)" : "var(--color-text-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, color: danger ? "var(--color-red-orange)" : "var(--color-text-tertiary)" }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {rightHint && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{rightHint}</span>}
    </button>
  );
}

function AccountChoice({ label, onClick, external }: { label: string; onClick: () => void; external?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 6, border: "none",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
        fontSize: 12, color: "var(--color-text-primary)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Plus size={12} strokeWidth={2} style={{ color: "var(--color-text-tertiary)" }} />
      <span style={{ flex: 1 }}>{label}</span>
      {external && <ExternalLink size={11} style={{ color: "var(--color-text-tertiary)" }} />}
    </button>
  );
}
