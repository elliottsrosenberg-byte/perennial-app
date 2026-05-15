"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/types/database";
import EmptyState from "@/components/ui/EmptyState";
import AshMark from "@/components/ui/AshMark";

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
function openAshTasks(message: string) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter  = "all" | "overdue" | "today" | "upcoming" | "no_date" | "completed" | `project:${string}`;
type SortKey = "due_date" | "priority" | "created_at";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_DOT: Record<string, string> = {
  high:   "var(--color-red-orange)",
  medium: "#b8860b",
  low:    "var(--color-text-tertiary)",
};
const PRIORITY_LABELS: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

function todayMidnight(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseDate(s: string): Date { return new Date(s + "T00:00:00"); }
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(due: string | null): boolean {
  if (!due) return false;
  return parseDate(due).getTime() === todayMidnight().getTime();
}
function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return parseDate(due) < todayMidnight();
}
function isUpcoming(due: string | null): boolean {
  if (!due) return false;
  const diff = (parseDate(due).getTime() - todayMidnight().getTime()) / 86400000;
  return diff > 0 && diff <= 14;
}
function isLater(due: string | null): boolean {
  if (!due) return false;
  return (parseDate(due).getTime() - todayMidnight().getTime()) / 86400000 > 14;
}

function getDueLabelText(due: string | null): string | null {
  if (!due) return null;
  const days = Math.round((parseDate(due).getTime() - todayMidnight().getTime()) / 86400000);
  if (days < 0)   return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 14) return `${days} days`;
  return parseDate(due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function getDueLabelColor(due: string | null): string {
  if (!due) return "var(--color-text-tertiary)";
  const days = (parseDate(due).getTime() - todayMidnight().getTime()) / 86400000;
  if (days < 0)  return "var(--color-red-orange)";
  if (days <= 1) return "#a07800";
  if (days <= 7) return "var(--color-text-secondary)";
  return "var(--color-text-tertiary)";
}

function sortTasks(list: Task[], sort: SortKey, dir: SortDir): Task[] {
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (sort === "due_date") {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      cmp = a.due_date.localeCompare(b.due_date);
    } else if (sort === "priority") {
      cmp = (a.priority ? PRIORITY_ORDER[a.priority] : 3) - (b.priority ? PRIORITY_ORDER[b.priority] : 3);
    } else {
      cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return dir === "asc" ? -cmp : cmp;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── InlineDatePicker ─────────────────────────────────────────────────────────

function InlineDatePicker({
  value, onChange, onClear, align = "left",
}: {
  value:    string | null;
  onChange: (date: string) => void;
  onClear?: () => void;
  align?:   "left" | "right";
}) {
  const [open, setOpen]         = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? parseDate(value) : new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const yr = viewDate.getFullYear(), mo = viewDate.getMonth();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDow    = new Date(yr, mo, 1).getDay();
  const cells       = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const DOW    = ["S","M","T","W","T","F","S"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const isSel = (d: number) =>
    !!value && parseDate(value).getDate() === d && parseDate(value).getMonth() === mo && parseDate(value).getFullYear() === yr;
  const isTod = (d: number) => {
    const t = todayMidnight();
    return t.getDate() === d && t.getMonth() === mo && t.getFullYear() === yr;
  };

  function pickShortcut(offset: number) {
    const d = new Date(todayMidnight());
    d.setDate(d.getDate() + offset);
    onChange(toISODate(d));
    setOpen(false);
  }

  const labelText  = getDueLabelText(value);
  const labelColor = value ? getDueLabelColor(value) : "var(--color-text-tertiary)";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, padding: "3px 8px", borderRadius: 9999,
          border: `0.5px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
          background: value ? "var(--color-surface-sunken)" : "transparent",
          color: labelColor, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          transition: "all 0.1s ease",
        }}
        onMouseEnter={e => { if (!value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { if (!value) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/>
        </svg>
        {labelText ?? "Due date"}
      </button>

      {open && (
        <div style={{
          position: "absolute", [align === "right" ? "right" : "left"]: 0,
          top: "calc(100% + 5px)", zIndex: 200, width: 220,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.12)", padding: 12,
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {[{ label: "Today", days: 0 }, { label: "Tomorrow", days: 1 }, { label: "Next week", days: 7 }].map(s => (
              <button type="button" key={s.label} onClick={() => pickShortcut(s.days)} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 9999,
                background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
                color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              >{s.label}</button>
            ))}
            {value && onClear && (
              <button type="button" onClick={() => { onClear(); setOpen(false); }} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 9999,
                background: "transparent", border: "0.5px solid var(--color-border)",
                color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--color-red-orange)"; e.currentTarget.style.borderColor = "var(--color-red-orange)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-tertiary)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
              >Clear</button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={() => setViewDate(new Date(yr, mo - 1, 1))} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 15, color: "var(--color-text-secondary)" }}>‹</button>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>{MONTHS[mo]} {yr}</span>
            <button type="button" onClick={() => setViewDate(new Date(yr, mo + 1, 1))} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", fontSize: 15, color: "var(--color-text-secondary)" }}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
            {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "2px 0" }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {cells.map((day, i) => day === null ? <div key={`e${i}`} /> : (
              <button type="button" key={day} onClick={() => { onChange(toISODate(new Date(yr, mo, day))); setOpen(false); }} style={{
                width: "100%", aspectRatio: "1", borderRadius: 4, border: "none",
                fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                background: isSel(day) ? "var(--color-sage)" : "transparent",
                color: isSel(day) ? "white" : isTod(day) ? "var(--color-sage)" : "var(--color-text-primary)",
                fontWeight: isSel(day) ? 600 : 400,
                outline: isTod(day) && !isSel(day) ? "1.5px solid var(--color-sage)" : "none",
                outlineOffset: -1,
              }}
              onMouseEnter={e => { if (!isSel(day)) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
              onMouseLeave={e => { if (!isSel(day)) e.currentTarget.style.background = "transparent"; }}
              >{day}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Link types ───────────────────────────────────────────────────────────────

type LinkState = {
  projectId:     string | null;
  contactId:     string | null;
  opportunityId: string | null;
};

type ContactOpt     = { id: string; first_name: string; last_name: string };
type OpportunityOpt = { id: string; title: string; category: string };

// ─── InlineLinkPicker ─────────────────────────────────────────────────────────

type LinkTab = "projects" | "contacts" | "opportunities";

function InlineLinkPicker({
  links, projects, onChange, align = "left",
}: {
  links:    LinkState;
  projects: { id: string; title: string }[];
  onChange: (links: LinkState) => void;
  align?:   "left" | "right";
}) {
  const [open,     setOpen]     = useState(false);
  const [tab,      setTab]      = useState<LinkTab>("projects");
  const [search,   setSearch]   = useState("");
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [opps,     setOpps]     = useState<OpportunityOpt[]>([]);
  const [loaded,   setLoaded]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function openPicker() {
    setOpen(v => !v);
    if (!loaded) {
      const supabase = createClient();
      Promise.all([
        supabase.from("contacts").select("id, first_name, last_name").order("first_name"),
        supabase.from("opportunities").select("id, title, category").order("title"),
      ]).then(([{ data: c }, { data: o }]) => {
        if (c) setContacts(c as ContactOpt[]);
        if (o) setOpps(o as OpportunityOpt[]);
        setLoaded(true);
      });
    }
  }

  const hasLinks  = links.projectId || links.contactId || links.opportunityId;
  const q         = search.toLowerCase();
  const fProjects = projects.filter(p => p.title.toLowerCase().includes(q));
  const fContacts = contacts.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q));
  const fOpps     = opps.filter(o => o.title.toLowerCase().includes(q));

  const labelParts = [
    links.projectId     ? projects.find(p => p.id === links.projectId)?.title                                                     : null,
    links.contactId     ? contacts.find(c => c.id === links.contactId) ? `${contacts.find(c => c.id === links.contactId)!.first_name} ${contacts.find(c => c.id === links.contactId)!.last_name}` : null : null,
    links.opportunityId ? opps.find(o => o.id === links.opportunityId)?.title                                                      : null,
  ].filter(Boolean) as string[];

  const TABS: { key: LinkTab; label: string }[] = [
    { key: "projects",      label: "Projects"      },
    { key: "contacts",      label: "Contacts"      },
    { key: "opportunities", label: "Opportunities" },
  ];

  function row(
    key: string,
    label: React.ReactNode,
    selected: boolean,
    onToggle: () => void,
  ) {
    return (
      <button type="button" key={key} onClick={onToggle} style={{
        width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, fontSize: 12,
        background: selected ? "rgba(155,163,122,0.12)" : "transparent", border: "none",
        color: selected ? "#5a7040" : "var(--color-text-secondary)", fontWeight: selected ? 600 : 400,
        cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
      >
        {selected
          ? <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#5a7040" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          : <div style={{ width: 9 }} />
        }
        {label}
      </button>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={openPicker}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, padding: "3px 8px", borderRadius: 9999,
          border: `0.5px solid ${open ? "var(--color-border-strong)" : hasLinks ? "rgba(155,163,122,0.3)" : "var(--color-border)"}`,
          background: hasLinks ? "rgba(155,163,122,0.12)" : "transparent",
          color: hasLinks ? "#5a7040" : "var(--color-text-tertiary)",
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", maxWidth: 180,
          transition: "all 0.1s ease",
        }}
        onMouseEnter={e => { if (!hasLinks) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { if (!hasLinks) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 3l4 4-4 4M7 13l-4-4 4-4"/>
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {labelParts.length > 0 ? labelParts.join(", ") : "Link"}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute", [align === "right" ? "right" : "left"]: 0,
          top: "calc(100% + 5px)", zIndex: 200, width: 300,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          maxHeight: 360,
        }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border)", padding: "0 4px", flexShrink: 0 }}>
            {TABS.map(t => (
              <button type="button" key={t.key} onClick={() => { setTab(t.key); setSearch(""); }} style={{
                padding: "7px 10px", fontSize: 11, fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                borderBottom: `2px solid ${tab === t.key ? "var(--color-sage)" : "transparent"}`,
                background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit", marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "6px 8px", flexShrink: 0, borderBottom: "0.5px solid var(--color-border)" }}>
            <input
              autoFocus
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${tab}…`}
              style={{
                width: "100%", padding: "5px 8px", fontSize: 11,
                border: "0.5px solid var(--color-border)", borderRadius: 6,
                background: "var(--color-surface-sunken)", outline: "none",
                color: "var(--color-text-primary)", fontFamily: "inherit",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", padding: "4px" }}>
            {!loaded && <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>Loading…</div>}

            {loaded && tab === "projects" && (
              fProjects.length === 0
                ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No projects</div>
                : <>
                    {links.projectId && row("_clear_proj", <span style={{ color: "var(--color-text-tertiary)" }}>No project</span>, false, () => onChange({ ...links, projectId: null }))}
                    {fProjects.map(p => row(p.id, p.title, links.projectId === p.id, () => onChange({ ...links, projectId: links.projectId === p.id ? null : p.id })))}
                  </>
            )}

            {loaded && tab === "contacts" && (
              fContacts.length === 0
                ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No contacts</div>
                : <>
                    {links.contactId && row("_clear_contact", <span style={{ color: "var(--color-text-tertiary)" }}>No contact</span>, false, () => onChange({ ...links, contactId: null }))}
                    {fContacts.map(c => row(c.id, `${c.first_name} ${c.last_name}`, links.contactId === c.id, () => onChange({ ...links, contactId: links.contactId === c.id ? null : c.id })))}
                  </>
            )}

            {loaded && tab === "opportunities" && (
              fOpps.length === 0
                ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No opportunities</div>
                : <>
                    {links.opportunityId && row("_clear_opp", <span style={{ color: "var(--color-text-tertiary)" }}>No opportunity</span>, false, () => onChange({ ...links, opportunityId: null }))}
                    {fOpps.map(o => row(o.id,
                      <div>
                        <div>{o.title}</div>
                        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>{o.category}</div>
                      </div>,
                      links.opportunityId === o.id,
                      () => onChange({ ...links, opportunityId: links.opportunityId === o.id ? null : o.id }),
                    ))}
                  </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PriorityPicker ───────────────────────────────────────────────────────────

function PriorityPicker({
  value, onChange, align = "left",
}: {
  value:    "high" | "medium" | "low" | null;
  onChange: (v: "high" | "medium" | "low" | null) => void;
  align?:   "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dotColor = value ? PRIORITY_DOT[value] : "var(--color-border-strong)";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, padding: "3px 8px", borderRadius: 9999,
          border: `0.5px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
          background: value ? "var(--color-surface-sunken)" : "transparent",
          color: value ? PRIORITY_DOT[value] : "var(--color-text-tertiary)",
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          transition: "all 0.1s ease",
        }}
        onMouseEnter={e => { if (!value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { if (!value) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        {value ? PRIORITY_LABELS[value] : "Priority"}
      </button>

      {open && (
        <div style={{
          position: "absolute", [align === "right" ? "right" : "left"]: 0,
          top: "calc(100% + 5px)", zIndex: 200, minWidth: 130,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {value && (
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 11, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-border-strong)" }} />
              None
            </button>
          )}
          {(["high", "medium", "low"] as const).map(p => (
            <button type="button" key={p} onClick={() => { onChange(p); setOpen(false); }} style={{
              width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 11,
              background: p === value ? "var(--color-surface-sunken)" : "transparent",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              color: PRIORITY_DOT[p], fontWeight: p === value ? 600 : 400,
              display: "flex", alignItems: "center", gap: 8,
            }}
            onMouseEnter={e => { if (p !== value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
            onMouseLeave={e => { if (p !== value) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT[p] }} />
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QuickAdd ─────────────────────────────────────────────────────────────────

function QuickAdd({
  projects, defaultProjectId, onAdded,
}: {
  projects:         { id: string; title: string }[];
  defaultProjectId: string | null;
  onAdded:          (task: Task) => void;
}) {
  const [title,    setTitle]    = useState("");
  const [dueDate,  setDueDate]  = useState<string | null>(null);
  const [priority, setPriority] = useState<"high" | "medium" | "low" | null>(null);
  const [links,    setLinks]    = useState<LinkState>({ projectId: defaultProjectId, contactId: null, opportunityId: null });
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLinks(l => ({ ...l, projectId: defaultProjectId })); }, [defaultProjectId]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim() || loading) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id, title: title.trim(), completed: false,
        due_date: dueDate, priority,
        project_id: links.projectId, contact_id: links.contactId, opportunity_id: links.opportunityId,
      })
      .select("*, project:projects(id, title), contact:contacts(id, first_name, last_name), opportunity:opportunities(id, title, category)")
      .single();

    if (data) onAdded(data as Task);
    setTitle(""); setDueDate(null); setPriority(null);
    setLinks({ projectId: defaultProjectId, contactId: null, opportunityId: null });
    setLoading(false);
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
      borderBottom: "0.5px solid var(--color-border)",
      background: "var(--color-surface-raised)", flexShrink: 0,
    }}>
      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: "1.5px dashed var(--color-border-strong)", background: "transparent" }} />
      <input
        ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
        placeholder="New task…"
        style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--color-text-primary)", fontFamily: "inherit", minWidth: 0 }}
      />
      <PriorityPicker value={priority} onChange={setPriority} align="right" />
      <InlineDatePicker value={dueDate} onChange={setDueDate} onClear={() => setDueDate(null)} align="right" />
      <InlineLinkPicker links={links} projects={projects} onChange={setLinks} align="right" />
      {title.trim() && (
        <button type="submit" disabled={loading} style={{
          fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
          background: "var(--color-sage)", color: "white", border: "none",
          cursor: "pointer", flexShrink: 0, opacity: loading ? 0.5 : 1,
        }}>Add</button>
      )}
    </form>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, dot, dimCount }: { title: string; count: number; dot?: string; dimCount?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "8px 16px 5px",
      background: "var(--color-surface-sunken)",
      borderBottom: "0.5px solid var(--color-border)",
      borderTop: "0.5px solid var(--color-border)",
    }}>
      {dot && <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>{title}</span>
      <span style={{ fontSize: 10, color: dimCount ? "rgba(0,0,0,0.25)" : "var(--color-text-tertiary)" }}>{count}</span>
    </div>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, projects, onToggle, onUpdate, highlighted,
}: {
  task:        Task;
  projects:    { id: string; title: string }[];
  onToggle:    (id: string, completed: boolean) => void;
  onUpdate:    (id: string, fields: Partial<Task> & { project?: { id: string; title: string } | null; contact?: { id: string; first_name: string; last_name: string } | null; opportunity?: { id: string; title: string; category: string } | null }) => void;
  /** Briefly tints the row when arriving via /tasks?taskId=… deep-link. */
  highlighted?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(task.title); }, [task.title]);

  function startEdit() {
    if (task.completed) return;
    setDraft(task.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === task.title) { setDraft(task.title); return; }
    onUpdate(task.id, { title: trimmed });
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(task.title);
  }

  return (
    <div
      id={`task-${task.id}`}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 16px",
        borderBottom: "0.5px solid var(--color-border)",
        background: highlighted
          ? "rgba(155,163,122,0.18)"
          : (hovered || editing) && !task.completed
            ? "var(--color-surface-sunken)"
            : "var(--color-surface-raised)",
        opacity: task.completed ? 0.5 : 1,
        transition: "opacity 0.3s ease, background 0.6s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onToggle(task.id, !task.completed)}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: task.completed ? "none" : "1.5px solid var(--color-border-strong)",
          background: task.completed ? "var(--color-sage)" : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.12s ease",
        }}
        onMouseEnter={e => { if (!task.completed) e.currentTarget.style.borderColor = "var(--color-sage)"; }}
        onMouseLeave={e => { if (!task.completed) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
      >
        {task.completed && (
          <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
            if (e.key === "Escape") cancelEdit();
          }}
          style={{
            flex: 1, fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.4,
            border: "none", outline: "none", background: "transparent",
            fontFamily: "inherit", minWidth: 0, padding: 0,
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          style={{
            flex: 1, fontSize: 13, color: "var(--color-text-primary)",
            textDecoration: task.completed ? "line-through" : "none",
            lineHeight: 1.4, minWidth: 0,
            cursor: task.completed ? "default" : "text",
          }}
        >
          {task.title}
        </span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* Links */}
        {(task.project || task.contact || task.opportunity || hovered) && !task.completed && (
          <InlineLinkPicker
            links={{ projectId: task.project_id, contactId: task.contact_id, opportunityId: task.opportunity_id }}
            projects={projects}
            onChange={newLinks => {
              const proj = newLinks.projectId ? (projects.find(p => p.id === newLinks.projectId) ?? null) : null;
              onUpdate(task.id, { project_id: newLinks.projectId, project: proj, contact_id: newLinks.contactId, opportunity_id: newLinks.opportunityId });
            }}
            align="right"
          />
        )}
        {/* Compact read-only chips for completed tasks */}
        {task.completed && (task.project || task.contact || task.opportunity) && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {[task.project && (task.project as { title: string }).title, task.contact && `${task.contact.first_name} ${task.contact.last_name}`, task.opportunity && (task.opportunity as { title: string }).title].filter(Boolean).join(", ")}
          </span>
        )}

        {/* Date */}
        {(task.due_date || hovered) && !task.completed && (
          <InlineDatePicker
            value={task.due_date}
            onChange={date => onUpdate(task.id, { due_date: date })}
            onClear={() => onUpdate(task.id, { due_date: null })}
            align="right"
          />
        )}
        {task.due_date && task.completed && getDueLabelText(task.due_date) && (
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
            {getDueLabelText(task.due_date)}
          </span>
        )}

        {/* Priority */}
        {(task.priority || hovered) && !task.completed && (
          <PriorityPicker
            value={task.priority}
            onChange={p => onUpdate(task.id, { priority: p })}
            align="right"
          />
        )}
        {task.priority && task.completed && (
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT[task.priority] }} />
        )}
      </div>
    </div>
  );
}

// ─── SidebarItem ──────────────────────────────────────────────────────────────

function SidebarItem({
  id, label, count, dot, activeFilter, onSelect,
}: {
  id: string; label: string; count?: number; dot?: string;
  activeFilter: string; onSelect: (id: string) => void;
}) {
  const active = activeFilter === id;
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 7,
        padding: "5px 10px", borderRadius: 6, border: "none",
        background: active ? "var(--color-surface-raised)" : "transparent",
        cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {dot
        ? <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
        : <div style={{ width: 5, flexShrink: 0 }} />
      }
      <span style={{ flex: 1, fontSize: 12, color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: active ? 500 : 400 }}>
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{count}</span>
      )}
    </button>
  );
}

// ─── TasksClient ──────────────────────────────────────────────────────────────

interface Props {
  initialTasks:     Task[];
  initialCompleted: Task[];
  projects:         { id: string; title: string }[];
}

export default function TasksClient({ initialTasks, initialCompleted, projects }: Props) {
  const [tasks,               setTasks]               = useState<Task[]>(initialTasks);
  const [completed,           setCompleted]           = useState<Task[]>(initialCompleted);
  const [lingering,           setLingering]           = useState<Task[]>([]);
  const [filter,              setFilter]              = useState<Filter>("all");
  const [sort,                setSort]                = useState<SortKey>("due_date");
  const [sortDir,             setSortDir]             = useState<SortDir>("asc");
  const [completedExpanded,   setCompletedExpanded]   = useState(false);
  const [showProjCompleted,   setShowProjCompleted]   = useState(false);
  const [projCompleted,       setProjCompleted]       = useState<Task[]>([]);
  const [highlightedId,       setHighlightedId]       = useState<string | null>(null);

  // Deep link: /tasks?taskId=… (from Ash inline "Created task → View task")
  // scrolls the row into view and briefly tints it sage. Cleared after 2.4s
  // so the row settles back into its normal state.
  const router       = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (!taskId) return;
    setHighlightedId(taskId);
    router.replace("/tasks");
    // Wait one frame for the row to render, then scroll into view.
    const raf = requestAnimationFrame(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const t = setTimeout(() => setHighlightedId(null), 2400);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reset per-project completed when filter changes
  useEffect(() => { setShowProjCompleted(false); setProjCompleted([]); }, [filter]);

  // ── Counts ───────────────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:       tasks.length,
    overdue:   tasks.filter(t => isOverdue(t.due_date)).length,
    today:     tasks.filter(t => isToday(t.due_date)).length,
    upcoming:  tasks.filter(t => isUpcoming(t.due_date)).length,
    no_date:   tasks.filter(t => !t.due_date).length,
    completed: completed.length,
  }), [tasks, completed]);

  const projectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach(t => { if (t.project_id) map[t.project_id] = (map[t.project_id] ?? 0) + 1; });
    return map;
  }, [tasks]);

  const sidebarProjects = useMemo(
    () => projects.filter(p => projectCounts[p.id] > 0),
    [projects, projectCounts],
  );

  // ── Sorted view tasks ────────────────────────────────────────────────────────

  const viewTasks = useMemo(() => {
    if (filter === "completed") return sortTasks(completed, sort, sortDir);
    let list: Task[];
    if      (filter === "all")       list = tasks;
    else if (filter === "overdue")   list = tasks.filter(t => isOverdue(t.due_date));
    else if (filter === "today")     list = tasks.filter(t => isToday(t.due_date));
    else if (filter === "upcoming")  list = tasks.filter(t => isUpcoming(t.due_date));
    else if (filter === "no_date")   list = tasks.filter(t => !t.due_date);
    else if (filter.startsWith("project:")) list = tasks.filter(t => t.project_id === filter.slice(8));
    else list = tasks;
    return sortTasks(list, sort, sortDir);
  }, [tasks, completed, filter, sort, sortDir]);

  // Lingering tasks relevant to the current non-all view (for the linger-then-fade effect)
  const lingeringForView = useMemo(() => {
    if (filter === "all" || filter === "completed") return [];
    if (filter === "overdue")  return lingering.filter(t => isOverdue(t.due_date));
    if (filter === "today")    return lingering.filter(t => isToday(t.due_date));
    if (filter === "upcoming") return lingering.filter(t => isUpcoming(t.due_date));
    if (filter === "no_date")  return lingering.filter(t => !t.due_date);
    if (filter.startsWith("project:")) return lingering.filter(t => t.project_id === filter.slice(8));
    return [];
  }, [lingering, filter]);

  // Sections with lingering tasks interleaved (all view only)
  const allSections = useMemo(() => {
    if (filter !== "all") return null;
    return [
      { title: "Overdue",  dot: "var(--color-red-orange)", active: viewTasks.filter(t => isOverdue(t.due_date)),  ghost: lingering.filter(t => isOverdue(t.due_date))  },
      { title: "Today",    dot: "#a07800",                  active: viewTasks.filter(t => isToday(t.due_date)),    ghost: lingering.filter(t => isToday(t.due_date))    },
      { title: "Upcoming", dot: "var(--color-sage)",        active: viewTasks.filter(t => isUpcoming(t.due_date)), ghost: lingering.filter(t => isUpcoming(t.due_date)) },
      { title: "Later",    dot: undefined,                  active: viewTasks.filter(t => isLater(t.due_date)),    ghost: lingering.filter(t => isLater(t.due_date))    },
      { title: "No date",  dot: undefined,                  active: viewTasks.filter(t => !t.due_date),            ghost: lingering.filter(t => !t.due_date)            },
    ].filter(s => s.active.length > 0 || s.ghost.length > 0);
  }, [viewTasks, lingering, filter]);

  const defaultProjectId = filter.startsWith("project:") ? filter.slice(8) : null;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAdded(task: Task) {
    setTasks(prev => [task, ...prev]);
  }

  async function handleUpdate(id: string, fields: Partial<Task> & { project?: unknown; contact?: unknown; opportunity?: unknown }) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    setCompleted(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    setProjCompleted(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    const { project: _p, contact: _c, opportunity: _o, ...dbFields } = fields as Record<string, unknown>;
    void _p; void _c; void _o;
    if (Object.keys(dbFields).length > 0) {
      const supabase = createClient();
      await supabase.from("tasks").update(dbFields).eq("id", id);
    }
  }

  async function fetchProjCompleted(pid: string) {
    const { data } = await createClient()
      .from("tasks")
      .select("*, project:projects(id,title), contact:contacts(id,first_name,last_name), opportunity:opportunities(id,title,category)")
      .eq("project_id", pid).eq("completed", true)
      .order("created_at", { ascending: false });
    if (data) setProjCompleted(data as Task[]);
  }

  async function handleToggle(id: string, newCompleted: boolean) {
    const supabase = createClient();

    if (newCompleted) {
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      const done = { ...task, completed: true };

      // Remove from active, add to lingering
      setTasks(prev => prev.filter(t => t.id !== id));
      setLingering(prev => [...prev, done]);

      // After linger, settle into completed
      setTimeout(() => {
        setLingering(prev => prev.filter(t => t.id !== id));
        setCompleted(prev => [done, ...prev]);
        setCompletedExpanded(true);
      }, 650);

      await supabase.from("tasks").update({ completed: true }).eq("id", id);
    } else {
      // Un-complete: move back to active
      const task = completed.find(t => t.id === id) ?? lingering.find(t => t.id === id);
      if (task) {
        setCompleted(prev => prev.filter(t => t.id !== id));
        setLingering(prev => prev.filter(t => t.id !== id));
        setTasks(prev => [{ ...task, completed: false }, ...prev]);
      }
      await supabase.from("tasks").update({ completed: false }).eq("id", id);
    }
  }

  async function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    setCompleted(prev => prev.filter(t => t.id !== id));
    setLingering(prev => prev.filter(t => t.id !== id));
    const supabase = createClient();
    await supabase.from("tasks").delete().eq("id", id);
  }

  // ── Filter label ─────────────────────────────────────────────────────────────

  function filterLabel(): string {
    if (filter === "all")       return "All tasks";
    if (filter === "overdue")   return "Overdue";
    if (filter === "today")     return "Today";
    if (filter === "upcoming")  return "Upcoming";
    if (filter === "no_date")   return "No date";
    if (filter === "completed") return "Completed";
    if (filter.startsWith("project:")) return projects.find(p => p.id === filter.slice(8))?.title ?? "Project";
    return "Tasks";
  }

  // ── Empty state ───────────────────────────────────────────────────────────────

  function TaskEmptyState() {
    const isFirstTime = tasks.length === 0 && completed.length === 0 && filter === "all";

    if (isFirstTime) {
      return (
        <EmptyState
          icon="✓"
          heading="Your task list is clear"
          body="Tasks keep you on top of action items across your projects, contacts, and practice. Add a task above or ask Ash to suggest what needs doing."
          ashPrompt="Based on my projects and contacts, what tasks should I be working on right now?"
          tips={[
            "Tasks can be standalone or linked to a project or contact — so follow-up calls, material orders, and invoice reminders all live in one place.",
            "Filter by Today, Overdue, or Upcoming to focus on what matters right now.",
            "Ask Ash to review your workload and suggest what to prioritize — it has full context on your projects and deadlines.",
          ]}
        />
      );
    }

    const msgs: Partial<Record<string, [string, string]>> = {
      all:       ["No open tasks", "Add your first task above."],
      overdue:   ["Nothing overdue", "You're on top of things."],
      today:     ["Nothing due today", "All caught up for today."],
      upcoming:  ["Nothing in the next 2 weeks", "Tasks due soon will appear here."],
      no_date:   ["No undated tasks", "All tasks have a due date."],
      completed: ["No completed tasks", "Completed tasks will appear here."],
    };
    let heading: string, sub: string;
    if (filter.startsWith("project:")) {
      const title = projects.find(p => p.id === filter.slice(8))?.title ?? "this project";
      [heading, sub] = [`No tasks for ${title}`, "Add a task above to get started."];
    } else {
      [heading, sub] = msgs[filter] ?? ["No tasks", ""];
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 6, textAlign: "center", padding: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{heading}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", maxWidth: 240, lineHeight: 1.6 }}>{sub}</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasActiveTasks  = filter === "all" ? (viewTasks.length + lingering.length) > 0 : (viewTasks.length + lingeringForView.length) > 0;
  const showCompletedSection = filter !== "completed" && completed.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Topbar */}
      <div style={{
        height: 44, display: "flex", alignItems: "center", padding: "0 20px", flexShrink: 0, gap: 10,
        borderBottom: "0.5px solid var(--color-border)", background: "var(--color-surface-raised)",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", flex: 1 }}>Tasks</span>
        <button
          onClick={() => openAshTasks("What should I prioritize in my task list right now? What's overdue and what's coming up?")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "transparent", color: "var(--color-ash-dark)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ash-tint)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <div style={{ width: 15, height: 15, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AshMark size={8} variant="on-dark" />
          </div>
          Ask Ash
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{
          width: 196, flexShrink: 0, display: "flex", flexDirection: "column",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-surface-sunken)",
          overflow: "hidden",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
            <SidebarItem id="all"       label="All tasks"  count={counts.all}       activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
            {counts.overdue > 0 && <SidebarItem id="overdue" label="Overdue" count={counts.overdue} dot="var(--color-red-orange)" activeFilter={filter} onSelect={f => setFilter(f as Filter)} />}
            <SidebarItem id="today"     label="Today"      count={counts.today}     activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
            <SidebarItem id="upcoming"  label="Upcoming"   count={counts.upcoming}  activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
            <SidebarItem id="no_date"   label="No date"    count={counts.no_date}   activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
            <div style={{ height: "0.5px", background: "var(--color-border)", margin: "8px 4px" }} />
            <SidebarItem id="completed" label="Completed"  count={counts.completed} activeFilter={filter} onSelect={f => setFilter(f as Filter)} />

            {sidebarProjects.length > 0 && (
              <>
                <div style={{ height: "0.5px", background: "var(--color-border)", margin: "8px 4px" }} />
                <div style={{ padding: "4px 10px 4px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Projects</div>
                {sidebarProjects.map(p => (
                  <SidebarItem key={p.id} id={`project:${p.id}`} label={p.title} count={projectCounts[p.id]} activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* View header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", height: 40, flexShrink: 0,
            borderBottom: "0.5px solid var(--color-border)", background: "var(--color-surface-raised)",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{filterLabel()}</span>

            {/* Sort controls: [↑↓] [Date | Priority | Created] + show-completed pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {filter.startsWith("project:") && (
              <button
                onClick={() => {
                  const next = !showProjCompleted;
                  setShowProjCompleted(next);
                  if (next && projCompleted.length === 0) fetchProjCompleted(filter.slice(8));
                }}
                style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 9999, marginRight: 4,
                  background: showProjCompleted ? "var(--color-surface-sunken)" : "transparent",
                  border: `0.5px solid ${showProjCompleted ? "var(--color-border-strong)" : "transparent"}`,
                  color: showProjCompleted ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Completed
              </button>
            )}
              <button
                onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                title={sortDir === "asc" ? "Ascending" : "Descending"}
                style={{
                  width: 24, height: 24, borderRadius: 5, border: "0.5px solid var(--color-border)",
                  background: "transparent", cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--color-text-secondary)", flexShrink: 0,
                  marginRight: 4,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {sortDir === "asc" ? (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12V4M4 4L2 6M4 4l2 2M10 4h4M10 8h3M10 12h2"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4v8M4 12l-2-2M4 12l2-2M10 4h4M10 8h3M10 12h2"/>
                  </svg>
                )}
              </button>
              {(["due_date", "priority", "created_at"] as SortKey[]).map(s => (
                <button key={s} onClick={() => setSort(s)} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 9999,
                  background: sort === s ? "var(--color-surface-sunken)" : "transparent",
                  border: `0.5px solid ${sort === s ? "var(--color-border-strong)" : "transparent"}`,
                  color: sort === s ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  {s === "due_date" ? "Date" : s === "priority" ? "Priority" : "Created"}
                </button>
              ))}
            </div>
          </div>

          {/* Task list */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {filter !== "completed" && (
              <QuickAdd projects={projects} defaultProjectId={defaultProjectId} onAdded={handleAdded} />
            )}

            {/* "All" view: sectioned with lingering ghosts + completed at bottom */}
            {allSections !== null ? (
              <>
                {allSections.length === 0 && !showCompletedSection ? <TaskEmptyState /> : (
                  allSections.map(section => (
                    <div key={section.title}>
                      <SectionHeader title={section.title} count={section.active.length} dot={section.dot} />
                      {section.active.map(task => (
                        <TaskRow key={task.id} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedId === task.id} />
                      ))}
                      {section.ghost.map(task => (
                        <TaskRow key={`ghost-${task.id}`} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} />
                      ))}
                    </div>
                  ))
                )}

                {/* Completed section at bottom of All view */}
                {showCompletedSection && (
                  <div>
                    <button
                      onClick={() => setCompletedExpanded(v => !v)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 16px 5px",
                        background: "var(--color-surface-sunken)",
                        borderBottom: "0.5px solid var(--color-border)",
                        borderTop: "0.5px solid var(--color-border)",
                        border: "none", cursor: "pointer", fontFamily: "inherit",
                        textAlign: "left",
                      }}
                    >
                      <svg
                        width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round"
                        style={{ transform: completedExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", flexShrink: 0 }}
                      >
                        <path d="M2 1l4 3-4 3"/>
                      </svg>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>Completed</span>
                      <span style={{ fontSize: 10, color: "rgba(0,0,0,0.25)" }}>{completed.length}</span>
                    </button>
                    {completedExpanded && completed.map(task => (
                      <TaskRow key={task.id} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedId === task.id} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Non-all views: flat list + lingering ghosts */
              <>
                {!hasActiveTasks && filter !== "completed" ? <TaskEmptyState /> : (
                  <>
                    {viewTasks.map(task => (
                      <TaskRow key={task.id} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedId === task.id} />
                    ))}
                    {lingeringForView.map(task => (
                      <TaskRow key={`ghost-${task.id}`} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} />
                    ))}
                    {viewTasks.length === 0 && lingeringForView.length === 0 && <TaskEmptyState />}
                  </>
                )}
                {filter === "completed" && viewTasks.length === 0 && <TaskEmptyState />}

                {/* Completed tasks for project view */}
                {filter.startsWith("project:") && showProjCompleted && projCompleted.length > 0 && (
                  <div>
                    <SectionHeader title="Completed" count={projCompleted.length} dot={undefined} dimCount />
                    {projCompleted.map(task => (
                      <TaskRow key={task.id} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedId === task.id} />
                    ))}
                  </div>
                )}
                {filter.startsWith("project:") && showProjCompleted && projCompleted.length === 0 && (
                  <div style={{ padding: "16px", fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" }}>No completed tasks for this project</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
