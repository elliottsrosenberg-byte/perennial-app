"use client";

// Per-account, per-calendar visibility for the left rail.
// Mirrors the Sources section of Notion Calendar — one group per
// (provider × account_email), with each calendar row showing a color dot,
// a name, an eye toggle, and a 3-dot menu for per-calendar actions.

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserCalendar } from "@/types/database";
import { PALETTE_SWATCHES } from "@/lib/ui/palette";
import { ChevronDown, ChevronRight, Eye, EyeOff, MoreHorizontal, Plus, ExternalLink, Trash2, Star, RefreshCw, Unplug } from "lucide-react";

interface Props {
  /** Bumped by parent on connect/refresh so we re-fetch the list. */
  refreshNonce?: number;
}

interface AccountInfo {
  key:            string;
  integration_id: string;
  provider:       string;
  account_email:  string | null;
  status:         string;
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

// Calendar colors draw from the canonical 10-color palette (lib/ui/palette.ts),
// the single source for all user-customizable colors across the app.
const COLOR_SWATCHES = PALETTE_SWATCHES;

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
  const [removedCals, setRemovedCals] = useState<UserCalendar[]>([]);
  // Account group keys whose stored credential is dead — rendered with a
  // Reconnect prompt instead of silently showing an empty calendar.
  const [reauthKeys, setReauthKeys] = useState<Set<string>>(new Set());
  // Per-account integration handles (keyed `${provider}::${account}`) so the
  // account ⋯ menu can disconnect/reconnect/refresh like Settings does.
  const [accounts, setAccounts] = useState<Record<string, AccountInfo>>({});
  const [openAccountMenu, setOpenAccountMenu] = useState<string | null>(null);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [expandedRemoved, setExpandedRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // Only show the loading state on the very first fetch. Subsequent
    // refetches (visibility toggle, color change, account add/remove)
    // happen silently so the list doesn't blank out mid-sync — the
    // optimistic local mutation has already updated the UI; we just
    // reconcile with the server in the background.
    fetch("/api/integrations/calendar/calendars")
      .then((r) => r.json())
      .then((d: { calendars?: UserCalendar[]; removed_calendars?: UserCalendar[]; default_calendar_id?: string | null; reauth_group_keys?: string[]; accounts?: AccountInfo[] }) => {
        if (cancelled) return;
        setCalendars(d.calendars ?? []);
        setRemovedCals(d.removed_calendars ?? []);
        setDefaultId(d.default_calendar_id ?? null);
        setReauthKeys(new Set(d.reauth_group_keys ?? []));
        setAccounts(Object.fromEntries((d.accounts ?? []).map((a) => [a.key, a])));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshNonce]);

  // Manual re-sync — re-fetch each connected account's calendar list.
  async function resync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/calendar/calendars", { method: "POST" });
      const d = await res.json() as { calendars?: UserCalendar[]; removed_calendars?: UserCalendar[] };
      if (res.ok) {
        setCalendars(d.calendars ?? []);
        setRemovedCals(d.removed_calendars ?? []);
        window.dispatchEvent(new Event("calendar:refresh-events"));
      }
    } finally {
      setSyncing(false);
    }
  }

  // Disconnect a whole account (parity with Settings → Integrations). The
  // account's calendars disappear on the next list read, so trigger a full
  // refresh once the integration is gone.
  async function disconnectAccount(integrationId: string) {
    const res = await fetch(`/api/integrations/${integrationId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Couldn't disconnect: ${j.error ?? res.statusText}`);
      return;
    }
    window.dispatchEvent(new Event("calendar:refresh-events"));
  }

  // Re-add a previously-removed calendar — flip removed=false and surface it.
  async function reAdd(cal: UserCalendar) {
    setRemovedCals((cs) => cs.filter(c => c.id !== cal.id));
    const restored = { ...cal, removed: false, visible: true };
    setCalendars((cs) => [...cs, restored]);
    window.dispatchEvent(new CustomEvent("calendar:row-changed", { detail: { id: cal.id, patch: { visible: true } } }));
    try {
      const res = await fetch("/api/integrations/calendar/calendars", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cal.id, removed: false }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      window.dispatchEvent(new Event("calendar:refresh-events"));
    } catch {
      setCalendars((cs) => cs.filter(c => c.id !== cal.id));
      setRemovedCals((cs) => [...cs, cal]);
    }
  }

  async function setDefault(cal: UserCalendar) {
    const prev = defaultId;
    setDefaultId(cal.id);
    window.dispatchEvent(new CustomEvent("calendar:default-changed", { detail: { id: cal.id } }));
    try {
      const res = await fetch("/api/integrations/calendar/calendars", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: cal.id, set_default: true }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      setDefaultId(prev);
      if (prev) window.dispatchEvent(new CustomEvent("calendar:default-changed", { detail: { id: prev } }));
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { active: UserCalendar[]; removed: UserCalendar[] }>();
    const ensure = (k: string) => { let g = map.get(k); if (!g) { g = { active: [], removed: [] }; map.set(k, g); } return g; };
    for (const c of calendars)   ensure(groupKey(c)).active.push(c);
    for (const c of removedCals) ensure(groupKey(c)).removed.push(c);
    return Array.from(map.entries()).map(([key, g]) => ({
      key,
      label: groupLabel(g.active[0] ?? g.removed[0]),
      calendars: g.active,
      removed: g.removed,
    }));
  }, [calendars, removedCals]);

  async function setVisible(cal: UserCalendar, nextVisible: boolean) {
    setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, visible: nextVisible } : c)));
    // Broadcast the optimistic patch immediately so the main grid's
    // calendarsById updates in lock-step — waiting for the PATCH round
    // trip leaves chips with stale colour for a beat.
    window.dispatchEvent(new CustomEvent("calendar:row-changed", { detail: { id: cal.id, patch: { visible: nextVisible } } }));
    try {
      const res = await fetch("/api/integrations/calendar/calendars", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: cal.id, visible: nextVisible }),
      });
      if (!res.ok) throw new Error("PATCH failed");
      // No refetch: the grid already has every non-removed calendar's
      // events and filters by the visible flag, which the optimistic
      // row-changed above flipped. The PATCH just persists it for next load.
    } catch {
      setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, visible: cal.visible } : c)));
      window.dispatchEvent(new CustomEvent("calendar:row-changed", { detail: { id: cal.id, patch: { visible: cal.visible } } }));
    }
  }

  async function setColor(cal: UserCalendar, color: string) {
    setCalendars((prev) => prev.map((c) => (c.id === cal.id ? { ...c, color } : c)));
    window.dispatchEvent(new CustomEvent("calendar:row-changed", { detail: { id: cal.id, patch: { color } } }));
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
      window.dispatchEvent(new CustomEvent("calendar:row-changed", { detail: { id: cal.id, patch: { color: cal.color } } }));
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
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-grey)" }}
          >
            Calendars
          </span>
          <button
            onClick={resync}
            disabled={syncing}
            title="Re-sync calendars from your accounts"
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: syncing ? "default" : "pointer", fontFamily: "inherit", fontSize: 10, color: "var(--color-grey)", padding: 0 }}
          >
            <RefreshCw size={11} strokeWidth={2} className={syncing ? "animate-spin" : undefined} />
            {syncing ? "Syncing…" : "Resync"}
          </button>
        </div>
      )}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const needsReauth = reauthKeys.has(g.key);
        const account = accounts[g.key];
        const showAccountMenuBtn = !!account && (hoveredGroup === g.key || openAccountMenu === g.key);
        const groupProvider = g.calendars[0]?.provider ?? g.removed[0]?.provider ?? "";
        const reconnectHref = groupProvider.startsWith("google")
          ? "/api/auth/google"
          : groupProvider === "microsoft" ? "/api/auth/microsoft" : null;
        return (
          <div key={g.key} style={{ marginBottom: 6 }}>
            <div
              onMouseEnter={() => setHoveredGroup(g.key)}
              onMouseLeave={() => setHoveredGroup((k) => (k === g.key ? null : k))}
              style={{
                display: "flex", alignItems: "center", gap: 2, paddingRight: 6,
                borderRadius: 4,
                background: openAccountMenu === g.key ? "var(--color-cream)" : "transparent",
              }}
            >
              <button
                onClick={() => toggleGroup(g.key)}
                style={{
                  flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 4px 4px 6px", background: "transparent", border: "none",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
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
              {showAccountMenuBtn && (
                <button
                  aria-label="Account options"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const MENU_W = 230;
                    setAccountMenuAnchor({ top: r.bottom + 4, left: Math.min(window.innerWidth - MENU_W - 8, Math.max(8, r.right - MENU_W)) });
                    setOpenAccountMenu(g.key);
                  }}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "var(--color-text-tertiary)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <MoreHorizontal size={12} strokeWidth={2} />
                </button>
              )}
            </div>

            {openAccountMenu === g.key && account && accountMenuAnchor && (
              <AccountMenu
                account={account}
                anchor={accountMenuAnchor}
                needsReauth={needsReauth}
                onClose={() => setOpenAccountMenu(null)}
                onRefresh={() => { resync(); }}
                onReconnect={() => {
                  const p = account.provider.startsWith("google") ? "google" : account.provider === "microsoft" ? "microsoft" : null;
                  if (p) window.location.href = `/api/auth/${p}?next=/calendar`;
                }}
                onDisconnect={() => disconnectAccount(account.integration_id)}
              />
            )}

            {needsReauth && reconnectHref && (
              <a
                href={reconnectHref}
                title="This account's connection expired — reconnect to load its events again."
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  margin: "0 10px 4px 20px", padding: "5px 8px",
                  fontSize: 10.5, fontWeight: 500, textDecoration: "none",
                  color: "var(--color-red-orange)",
                  background: "rgba(220,62,13,0.07)",
                  border: "0.5px solid rgba(220,62,13,0.25)", borderRadius: 6,
                }}
              >
                <RefreshCw size={11} style={{ flexShrink: 0 }} />
                <span>Connection expired — reconnect</span>
              </a>
            )}

            {!isCollapsed && g.calendars.map((c) => {
              const color = c.color ?? PROVIDER_DEFAULT_COLOR[c.provider] ?? "#888";
              const isOpen = openMenuId === c.id;
              return (
                <CalendarRow
                  key={c.id}
                  cal={c}
                  color={color}
                  isDefault={c.id === defaultId}
                  menuOpen={isOpen}
                  onToggleMenu={() => setOpenMenuId(isOpen ? null : c.id)}
                  onCloseMenu={() => setOpenMenuId(null)}
                  onToggleVisible={() => setVisible(c, !c.visible)}
                  onColor={(v) => setColor(c, v)}
                  onShowOnly={() => showOnlyThis(c)}
                  onRemove={() => removeFromList(c)}
                  onSetDefault={() => setDefault(c)}
                />
              );
            })}

            {/* Re-add previously-removed calendars from this account. */}
            {!isCollapsed && g.removed.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedRemoved(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 22px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 11, color: "var(--color-text-tertiary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {expandedRemoved.has(g.key) ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  {g.removed.length} removed calendar{g.removed.length === 1 ? "" : "s"}
                </button>
                {expandedRemoved.has(g.key) && g.removed.map((c) => {
                  const color = c.color ?? PROVIDER_DEFAULT_COLOR[c.provider] ?? "#888";
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px 4px 30px" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 9999, border: `1.5px solid ${color}`, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--color-text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.name}>
                        {c.name}
                      </span>
                      <button onClick={() => reAdd(c)} title="Add back to calendar"
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 500, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-sage)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                        <Plus size={10} strokeWidth={2.5} /> Add
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
  cal, color, isDefault, menuOpen, onToggleMenu, onCloseMenu,
  onToggleVisible, onColor, onShowOnly, onRemove, onSetDefault,
}: {
  cal: UserCalendar;
  color: string;
  isDefault: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onToggleVisible: () => void;
  onColor: (hex: string) => void;
  onShowOnly: () => void;
  onRemove: () => void;
  onSetDefault: () => void;
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
        title={isDefault ? `${cal.name} — default for new events` : cal.name}
        style={{
          fontSize: 11.5,
          color: cal.visible ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          fontWeight: cal.is_primary || isDefault ? 500 : 400,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          flex: 1, minWidth: 0,
        }}
      >
        {cal.name}
      </span>

      {/* Default-calendar marker — small ring around the colour dot's
          inverse. Unimposing: same colour as the calendar's, so it reads
          as "this row is highlighted" rather than a separate icon. */}
      {isDefault && (
        <span
          aria-label="Default calendar"
          title="Default for new events"
          style={{
            width: 6, height: 6, borderRadius: 9999,
            background: color,
            boxShadow: `0 0 0 1.5px ${color}`,
            marginRight: -2,
            flexShrink: 0,
          }}
        />
      )}

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
          isDefault={isDefault}
          anchor={menuAnchor}
          settingsHref={settingsHref}
          onClose={onCloseMenu}
          onColor={onColor}
          onShowOnly={onShowOnly}
          onToggleVisible={onToggleVisible}
          onRemove={onRemove}
          onSetDefault={onSetDefault}
        />
      )}
    </div>
  );
}

function RowMenu({
  cal, color, isDefault, anchor, settingsHref, onClose, onColor, onShowOnly, onToggleVisible, onRemove, onSetDefault,
}: {
  cal: UserCalendar;
  color: string;
  isDefault: boolean;
  anchor: { top: number; left: number };
  settingsHref: string;
  onClose: () => void;
  onColor: (hex: string) => void;
  onShowOnly: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  onSetDefault: () => void;
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
                onClick={() => { onColor(s.value); onClose(); }}
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
          label={isDefault ? "Default for new events" : "Make default"}
          icon={<Star size={12} fill={isDefault ? "currentColor" : "none"} />}
          onClick={() => { if (!isDefault) onSetDefault(); onClose(); }}
          disabled={isDefault}
        />
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

// Account-level ⋯ menu on the rail's account headers — mirrors the actions
// available in Settings → Integrations so account management is doable from
// inside the Calendar module (reconnect, refresh, disconnect).
function AccountMenu({ account, anchor, needsReauth, onClose, onRefresh, onReconnect, onDisconnect }: {
  account: AccountInfo;
  anchor: { top: number; left: number };
  needsReauth: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const providerLabel = account.provider.startsWith("google") ? "Google" : account.provider === "microsoft" ? "Outlook" : account.provider;
  const canOAuth = account.provider.startsWith("google") || account.provider === "microsoft";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80 }} />
      <div style={{
        position: "fixed", top: anchor.top, left: anchor.left,
        zIndex: 81, minWidth: 230,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10, boxShadow: "var(--shadow-overlay)",
        overflow: "hidden", padding: 6,
      }}>
        <div style={{ padding: "4px 10px 6px" }}>
          <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={account.account_email ?? undefined}>
            {account.account_email ?? "Account"}
          </p>
          <p style={{ fontSize: 10, color: needsReauth ? "var(--color-red-orange)" : "var(--color-text-tertiary)" }}>
            {providerLabel}{needsReauth ? " — connection expired" : ""}
          </p>
        </div>
        <div style={{ height: 1, background: "var(--color-border)", margin: "2px 0 4px" }} />
        {canOAuth && (
          <MenuRow
            label={needsReauth ? "Reconnect account" : "Reconnect"}
            icon={<RefreshCw size={12} />}
            onClick={() => { onReconnect(); onClose(); }}
          />
        )}
        <MenuRow label="Refresh calendars" icon={<RefreshCw size={12} />} onClick={() => { onRefresh(); onClose(); }} />
        <MenuRow label="Manage in Settings" icon={<ExternalLink size={12} />} onClick={() => { window.location.href = "/settings?section=integrations"; onClose(); }} rightHint="↗" />
        <div style={{ height: 1, background: "var(--color-border)", margin: "4px 0" }} />
        {confirming ? (
          <div style={{ padding: "4px 10px 6px" }}>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>
              Disconnect this account? Its calendars and events will be removed from Perennial.
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setConfirming(false)} style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={() => { onDisconnect(); onClose(); }} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "5px 8px", borderRadius: 6, border: "none", background: "var(--color-red-orange)", color: "white", cursor: "pointer", fontFamily: "inherit" }}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <MenuRow label="Disconnect account" icon={<Unplug size={12} />} danger onClick={() => setConfirming(true)} />
        )}
      </div>
    </>
  );
}

function MenuRow({ label, icon, onClick, danger, rightHint, disabled }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  rightHint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 10px", borderRadius: 6, border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        textAlign: "left",
        fontSize: 12,
        opacity: disabled ? 0.6 : 1,
        color: danger ? "var(--color-red-orange)" : "var(--color-text-primary)",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
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
