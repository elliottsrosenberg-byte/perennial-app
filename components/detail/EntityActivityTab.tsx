"use client";

// ── EntityActivityTab ─────────────────────────────────────────────────────────
// Entity-agnostic Activity tab, extracted from the near-identical ActivityTab
// implementations in ContactDetailPanel and OrganizationDetailPanel so Contacts /
// Organizations / Outreach Targets share one implementation. The only per-entity
// differences are the activities table, the foreign-key column the row is filed
// under, and the parent "freshness" column bumped when a past/now entry is logged
// (`contacts.last_contacted_at` vs `organizations.last_touched_at`).
//
// Behavior is reproduced EXACTLY from the network panels: type segmented control,
// when-picker (datetime-local), Cmd/Ctrl+Enter to log, scheduled-future styling,
// date-grouped timeline.
//
// State can be either controlled (parent passes `activities` + `setActivities`,
// e.g. the network panels, which use `activities.length` for a tab-count badge)
// or uncontrolled (the tab loads + owns its own list, e.g. the Target panel).

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContactActivityType } from "@/types/database";
import { Clock } from "lucide-react";
import { fmtDayRelative as fmtDate, fmtTime } from "@/lib/format/date";

export type ActivitiesTable  = "contact_activities" | "organization_activities";
export type ActivityFkColumn = "contact_id" | "organization_id";

// Structural union of ContactActivity / OrganizationActivity — both carry the
// same shape; the fk column differs but is optional here.
export interface EntityActivity {
  id:               string;
  user_id:          string;
  type:             ContactActivityType;
  content:          string | null;
  occurred_at:      string;
  metadata:         Record<string, unknown> | null;
  created_at:       string;
  contact_id?:      string | null;
  organization_id?: string | null;
}

const ACTIVITY_CONFIG: Record<ContactActivityType, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
  email:   { bg: "rgba(var(--color-blue-rgb),0.10)",  color: "var(--color-blue)", label: "Email",   icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l6 5 6-5"/><rect x="1" y="3" width="14" height="10" rx="2"/></svg> },
  call:    { bg: "rgba(var(--color-green-deep-rgb),0.10)",  color: "var(--color-green-deep)", label: "Call",    icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.3 11.5l-2.1-2.1a1 1 0 00-1.4 0l-1 1c-.9-.5-1.7-1.2-2.4-2l1-1a1 1 0 000-1.4L6.3 3.9a1 1 0 00-1.4 0L3.5 5.3C3 7.5 5 11 8.7 14.5l1.5-1.5a1 1 0 001.1-1.5z"/></svg> },
  note:    { bg: "rgba(var(--color-gold-rgb),0.10)", color: "var(--color-gold)", label: "Note",    icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h12v9H2z"/><path d="M5 6h6M5 9h4"/></svg> },
  meeting: { bg: "rgba(var(--color-purple-rgb),0.10)", color: "var(--color-purple)", label: "Meeting", icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/></svg> },
};

const ACTIVITY_TYPE_ORDER: ContactActivityType[] = ["email", "call", "meeting", "note"];
const TYPE_PLACEHOLDER: Record<ContactActivityType, string> = {
  email:   "What was the email about?",
  call:    "Notes from the call…",
  meeting: "What did you discuss?",
  note:    "Quick note…",
};

/** Convert a Date to the `YYYY-MM-DDTHH:mm` shape required by datetime-local
 *  inputs, in the user's local timezone. */
function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Render a friendly label for a logged time — "Just now" if within ~1 min of
 *  current time, otherwise something like "Today 3:24 PM" or "Mar 12, 9:00 AM". */
function fmtWhenLabel(iso: string): string {
  const d = new Date(iso);
  const diffMs = Math.abs(Date.now() - d.getTime());
  if (diffMs < 60_000) return "Just now";
  const today = new Date(); const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString())   return `Today ${timeStr}`;
  if (d.toDateString() === yest.toDateString())    return `Yesterday ${timeStr}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${timeStr}`;
}

function groupByDate(activities: EntityActivity[]) {
  const result: { label: string; items: EntityActivity[] }[] = [];
  const map = new Map<string, EntityActivity[]>();
  for (const a of activities) {
    const label = fmtDate(a.occurred_at);
    if (!map.has(label)) { map.set(label, []); result.push({ label, items: map.get(label)! }); }
    map.get(label)!.push(a);
  }
  return result;
}

export default function EntityActivityTab({
  activitiesTable, fkColumn, id,
  filterType,
  parent,
  onLogged,
  activities: controlledActivities,
  setActivities: setControlledActivities,
}: {
  activitiesTable: ActivitiesTable;
  fkColumn:        ActivityFkColumn;
  id:              string;
  /** When set, only this activity type is shown in the timeline. */
  filterType?:     "note";
  /** Optional parent freshness bump — when a past/now entry is logged that is
   *  newer than the current value, the parent row's column is updated and the
   *  caller is notified so its local copy stays in sync. */
  parent?: {
    table:        "contacts" | "organizations";
    bumpColumn:   string;
    currentValue: string | null;
    onBumped:     (iso: string) => void;
  };
  /** Fired after any successful log — e.g. so a wrapping Target can bump its
   *  own `last_touched_at`. */
  onLogged?:       () => void;
  /** Optional controlled state. When omitted the tab owns + loads its own. */
  activities?:     EntityActivity[];
  setActivities?:  React.Dispatch<React.SetStateAction<EntityActivity[]>>;
}) {
  const isControlled = controlledActivities !== undefined && setControlledActivities !== undefined;
  const [ownActivities, setOwnActivities] = useState<EntityActivity[]>([]);
  const activities    = isControlled ? controlledActivities! : ownActivities;
  const setActivities = (isControlled ? setControlledActivities! : setOwnActivities) as React.Dispatch<React.SetStateAction<EntityActivity[]>>;

  const [actInput,   setActInput]   = useState("");
  const [actType,    setActType]    = useState<ContactActivityType>("note");
  const [whenLocal,  setWhenLocal]  = useState<string>(() => toLocalDateTimeInput(new Date()));
  const [whenOpen,   setWhenOpen]   = useState(false);
  const [loadingAct, setLoadingAct] = useState(false);

  // Self-load only when uncontrolled.
  useEffect(() => {
    if (isControlled) return;
    createClient().from(activitiesTable).select("*").eq(fkColumn, id).order("occurred_at", { ascending: false })
      .then(({ data }) => { if (data) setOwnActivities(data as EntityActivity[]); });
  }, [activitiesTable, fkColumn, id, isControlled]);

  const filtered = filterType ? activities.filter(a => a.type === filterType) : activities;
  const grouped  = groupByDate(filtered);

  // Reset the editor to "now" once typing/editing settles back to an empty
  // composer, so the next log entry doesn't accidentally inherit a stale time.
  function resetComposer() {
    setActInput("");
    setWhenLocal(toLocalDateTimeInput(new Date()));
    setWhenOpen(false);
  }

  async function logActivity() {
    if (!actInput.trim()) return;
    setLoadingAct(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoadingAct(false); return; }
    const occurredISO = new Date(whenLocal).toISOString();
    const { data } = await supabase.from(activitiesTable)
      .insert({ user_id: user.id, [fkColumn]: id, type: actType, content: actInput.trim(), occurred_at: occurredISO })
      .select("*").single();
    if (data) {
      setActivities(prev => [data as EntityActivity, ...prev]
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()));
      // Only bump the parent's freshness when the entry is past/now AND newer
      // than what's already recorded — backdating an old entry or scheduling a
      // future meeting should not mark the entity as freshly contacted.
      if (parent) {
        const occurredTs = new Date(occurredISO).getTime();
        const existingTs = parent.currentValue ? new Date(parent.currentValue).getTime() : 0;
        if (occurredTs <= Date.now() + 60_000 && occurredTs > existingTs) {
          await supabase.from(parent.table).update({ [parent.bumpColumn]: occurredISO }).eq("id", id);
          parent.onBumped(occurredISO);
        }
      }
      onLogged?.();
    }
    resetComposer();
    setLoadingAct(false);
  }

  const canSubmit = !!actInput.trim() && !loadingAct;
  const isScheduledFuture = new Date(whenLocal).getTime() > Date.now() + 60_000;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* ── Composer card ─────────────────────────────────────────────────── */}
      <div style={{ padding: "12px 16px 14px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <div style={{
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {/* Type segmented control — distinct visual language from the Log
              CTA so the user reads "kind of thing" vs "submit" as different. */}
          <div role="tablist" aria-label="Activity type" style={{
            display: "flex", padding: 4, gap: 2,
            background: "var(--color-surface-sunken)",
            borderBottom: "0.5px solid var(--color-border)",
          }}>
            {ACTIVITY_TYPE_ORDER.map(t => {
              const cfg = ACTIVITY_CONFIG[t];
              const active = actType === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActType(t)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    padding: "5px 6px", borderRadius: 6,
                    fontSize: 11, fontWeight: 500,
                    background: active ? "var(--color-surface-raised)" : "transparent",
                    color: active ? cfg.color : "var(--color-text-tertiary)",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    boxShadow: active ? "var(--shadow-sm)" : "none",
                    transition: "background 0.12s ease, color 0.12s ease",
                  }}
                >
                  <span style={{ display: "inline-flex" }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Body — multi-line so a real note has room. Cmd/Ctrl+Enter logs. */}
          <textarea
            value={actInput}
            onChange={e => setActInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                logActivity();
              }
            }}
            placeholder={TYPE_PLACEHOLDER[actType]}
            rows={3}
            style={{
              width: "100%", minHeight: 64, resize: "vertical",
              padding: "10px 12px",
              background: "transparent", border: "none", outline: "none",
              fontSize: 13, lineHeight: 1.55, color: "var(--color-charcoal)",
              fontFamily: "inherit",
            }}
          />

          {/* Footer — when (date/time) on the left, primary CTA on the right. */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 10px",
            borderTop: "0.5px solid var(--color-border)",
            background: "var(--color-warm-white)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {whenOpen ? (
                <input
                  type="datetime-local"
                  value={whenLocal}
                  autoFocus
                  onChange={e => setWhenLocal(e.target.value)}
                  onBlur={() => setWhenOpen(false)}
                  style={{
                    fontSize: 11, padding: "4px 6px",
                    background: "var(--color-surface-raised)",
                    border: "0.5px solid var(--color-border)", borderRadius: 6,
                    color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setWhenOpen(true)}
                  title="Change when this happened"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 8px", borderRadius: 6,
                    fontSize: 11, color: "var(--color-text-secondary)",
                    background: "transparent", border: "0.5px dashed var(--color-border)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Clock size={11} strokeWidth={1.75} />
                  {fmtWhenLabel(new Date(whenLocal).toISOString())}
                </button>
              )}
              {isScheduledFuture && (
                <span style={{ fontSize: 10, color: "var(--color-gold)", fontWeight: 500 }}>scheduled</span>
              )}
            </div>
            <button
              onClick={logActivity}
              disabled={!canSubmit}
              style={{
                padding: "6px 16px", fontSize: 12, fontWeight: 500,
                background: canSubmit ? "var(--color-sage)" : "var(--color-surface-sunken)",
                color: canSubmit ? "white" : "var(--color-text-tertiary)",
                border: "none", borderRadius: 7, cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: "inherit", transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = "var(--color-sage-hover)"; }}
              onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = "var(--color-sage)"; }}
            >
              {isScheduledFuture ? "Schedule" : "Log"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {grouped.length === 0
          ? <p style={{ fontSize: 12, textAlign: "center", padding: "32px 0", color: "var(--color-grey)" }}>No activity yet.</p>
          : grouped.map(({ label, items }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 0 6px", color: "var(--color-grey)" }}>{label}</div>
              {items.map(act => {
                const cfg = ACTIVITY_CONFIG[act.type];
                const isFuture = new Date(act.occurred_at).getTime() > Date.now() + 60_000;
                return (
                  <div key={act.id} style={{ display: "flex", gap: 10, marginBottom: 12, opacity: isFuture ? 0.78 : 1 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: cfg.bg, color: cfg.color, border: "0.5px solid var(--color-border)" }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>{cfg.label}</span>
                        {isFuture && <span style={{ fontSize: 9, color: "var(--color-gold)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scheduled</span>}
                        <span style={{ fontSize: 10, marginLeft: "auto", color: "var(--color-grey)" }}>{fmtTime(act.occurred_at)}</span>
                      </div>
                      {act.content && <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>{act.content}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        }
      </div>
    </div>
  );
}
