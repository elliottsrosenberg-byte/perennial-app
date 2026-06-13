"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/types/database";
import Topbar from "@/components/layout/Topbar";
import EmptyState from "@/components/ui/EmptyState";
import TasksIntroModal from "@/components/tour/tasks/TasksIntroModal";
import TasksTooltipTour from "@/components/tour/tasks/TasksTooltipTour";
import TasksOptionsMenu from "./TasksOptionsMenu";
import PriorityPicker, { PRIORITY_DOT } from "./PriorityPicker";
import { dueChipLabel, dueChipColor } from "@/lib/tasks/due";

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter  = "all" | "overdue" | "today" | "upcoming" | "no_date" | "completed"
             | `project:${string}` | `person:${string}` | `target:${string}`;
type SortKey = "due_date" | "priority" | "created_at";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

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

  const labelText  = dueChipLabel(value);
  const labelColor = value ? dueChipColor(value) : "var(--color-text-tertiary)";

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
  projectId: string | null;
  contactId: string | null;
  targetId:  string | null;
};

type ContactOpt = { id: string; first_name: string; last_name: string };
type TargetOpt  = { id: string; name: string; pipeline_id: string; pipeline?: { name: string; color: string } | null };

// ─── InlineLinkPicker ─────────────────────────────────────────────────────────
//
// Three sections — Projects, People (all contacts; lead status is irrelevant
// here), and Targets (outreach_targets). Opportunities used to live in this
// picker but were retired; the UI no longer reads or writes
// tasks.opportunity_id even though the column still exists in the DB.

type LinkTab = "projects" | "contacts" | "targets";

function InlineLinkPicker({
  links, projects, onChange, align = "left",
}: {
  links:    LinkState;
  projects: { id: string; title: string }[];
  onChange: (links: LinkState, picked?: { contact?: ContactOpt | null; target?: TargetOpt | null }) => void;
  align?:   "left" | "right";
}) {
  const [open,     setOpen]     = useState(false);
  const [tab,      setTab]      = useState<LinkTab>("projects");
  const [search,   setSearch]   = useState("");
  const [contacts, setContacts] = useState<ContactOpt[]>([]);
  const [targets,  setTargets]  = useState<TargetOpt[]>([]);
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
        supabase.from("contacts").select("id, first_name, last_name").eq("archived", false).order("first_name"),
        supabase.from("outreach_targets").select("id, name, pipeline_id, pipeline:outreach_pipelines(name, color)").order("name"),
      ]).then(([{ data: c }, { data: t }]) => {
        if (c) setContacts(c as ContactOpt[]);
        if (t) setTargets(t as unknown as TargetOpt[]);
        setLoaded(true);
      });
    }
  }

  const hasLinks  = links.projectId || links.contactId || links.targetId;
  const q         = search.toLowerCase();
  const fProjects = projects.filter(p => p.title.toLowerCase().includes(q));
  const fContacts = contacts.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q));
  const fTargets  = targets .filter(t => t.name.toLowerCase().includes(q));

  const contactById = (id: string) => contacts.find(c => c.id === id) ?? null;
  const targetById  = (id: string) => targets .find(t => t.id === id) ?? null;

  const labelParts = [
    links.projectId ? projects.find(p => p.id === links.projectId)?.title ?? null : null,
    links.contactId ? (contactById(links.contactId) ? `${contactById(links.contactId)!.first_name} ${contactById(links.contactId)!.last_name}` : null) : null,
    links.targetId  ? targetById(links.targetId)?.name ?? null : null,
  ].filter(Boolean) as string[];

  const TABS: { key: LinkTab; label: string }[] = [
    { key: "projects", label: "Projects" },
    { key: "contacts", label: "People"   },
    { key: "targets",  label: "Targets"  },
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
              placeholder={`Search ${tab === "contacts" ? "people" : tab}…`}
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
                ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No people</div>
                : <>
                    {links.contactId && row("_clear_contact", <span style={{ color: "var(--color-text-tertiary)" }}>No person</span>, false, () => onChange({ ...links, contactId: null }, { contact: null }))}
                    {fContacts.map(c => row(
                      c.id,
                      `${c.first_name} ${c.last_name}`,
                      links.contactId === c.id,
                      () => {
                        const willClear = links.contactId === c.id;
                        onChange(
                          { ...links, contactId: willClear ? null : c.id },
                          { contact: willClear ? null : c },
                        );
                      },
                    ))}
                  </>
            )}

            {loaded && tab === "targets" && (
              fTargets.length === 0
                ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No targets</div>
                : <>
                    {links.targetId && row("_clear_target", <span style={{ color: "var(--color-text-tertiary)" }}>No target</span>, false, () => onChange({ ...links, targetId: null }, { target: null }))}
                    {fTargets.map(t => row(
                      t.id,
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        {t.pipeline?.color && (
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.pipeline.color, flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                          {t.pipeline?.name && (
                            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{t.pipeline.name}</div>
                          )}
                        </div>
                      </div>,
                      links.targetId === t.id,
                      () => {
                        const willClear = links.targetId === t.id;
                        onChange(
                          { ...links, targetId: willClear ? null : t.id },
                          { target: willClear ? null : t },
                        );
                      },
                    ))}
                  </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QuickAdd ─────────────────────────────────────────────────────────────────

function QuickAdd({
  projects, defaultProjectId, defaultContactId, defaultTargetId, onAdded,
}: {
  projects:         { id: string; title: string }[];
  defaultProjectId: string | null;
  defaultContactId: string | null;
  defaultTargetId:  string | null;
  onAdded:          (task: Task) => void;
}) {
  const [title,    setTitle]    = useState("");
  const [dueDate,  setDueDate]  = useState<string | null>(null);
  const [priority, setPriority] = useState<"high" | "medium" | "low" | null>(null);
  const [links,    setLinks]    = useState<LinkState>({ projectId: defaultProjectId, contactId: defaultContactId, targetId: defaultTargetId });
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLinks({ projectId: defaultProjectId, contactId: defaultContactId, targetId: defaultTargetId });
  }, [defaultProjectId, defaultContactId, defaultTargetId]);

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
        project_id: links.projectId, contact_id: links.contactId, target_id: links.targetId,
      })
      .select("*, project:projects(id, title), contact:contacts(id, first_name, last_name), target:outreach_targets(id, name, pipeline_id, pipeline:outreach_pipelines(name, color))")
      .single();

    if (data) {
      onAdded(data as Task);
      window.dispatchEvent(new CustomEvent("tasks:created", { detail: { id: data.id, title: data.title } }));
    }
    setTitle(""); setDueDate(null); setPriority(null);
    setLinks({ projectId: defaultProjectId, contactId: defaultContactId, targetId: defaultTargetId });
    setLoading(false);
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} data-tour-target="tasks.quick-add" style={{
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
  task, projects, onToggle, onUpdate, highlighted, tourTarget,
}: {
  task:        Task;
  projects:    { id: string; title: string }[];
  onToggle:    (id: string, completed: boolean) => void;
  onUpdate:    (id: string, fields: Partial<Task> & { project?: { id: string; title: string } | null; contact?: { id: string; first_name: string; last_name: string } | null; target?: { id: string; name: string; pipeline_id: string; pipeline?: { name: string; color: string } | null } | null }) => void;
  /** Briefly tints the row when arriving via /tasks?taskId=… deep-link. */
  highlighted?: boolean;
  /** When set, exposes a data-tour-target attribute so the welcome tour
   *  spotlight can anchor on a specific row (typically the first). */
  tourTarget?: string;
}) {
  const router = useRouter();
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
      data-tour-target={tourTarget}
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
        {/* Target pill — clickable, deep-links into Outreach. Sits LEFT of the
            link picker so it reads as a status chip rather than another action. */}
        {task.target && !task.completed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/outreach?targetId=${task.target!.id}`);
            }}
            title={task.target.pipeline?.name ? `${task.target.name} · ${task.target.pipeline.name}` : task.target.name}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, padding: "3px 8px", borderRadius: 9999,
              border: "0.5px solid var(--color-border)",
              background: "var(--color-surface-sunken)",
              color: "var(--color-text-secondary)",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              maxWidth: 160, transition: "all 0.1s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
          >
            {task.target.pipeline?.color && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: task.target.pipeline.color, flexShrink: 0 }} />
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{task.target.name}</span>
          </button>
        )}

        {/* Links */}
        {(task.project || task.contact || task.target || hovered) && !task.completed && (
          <InlineLinkPicker
            links={{ projectId: task.project_id, contactId: task.contact_id, targetId: task.target_id }}
            projects={projects}
            onChange={(newLinks, picked) => {
              const proj = newLinks.projectId ? (projects.find(p => p.id === newLinks.projectId) ?? null) : null;
              const fields: Partial<Task> & { project?: typeof proj; contact?: Task["contact"]; target?: Task["target"] } = {
                project_id: newLinks.projectId,
                project:    proj,
                contact_id: newLinks.contactId,
                target_id:  newLinks.targetId,
              };
              if (picked?.contact !== undefined) fields.contact = picked.contact;
              if (picked?.target  !== undefined) fields.target  = picked.target;
              onUpdate(task.id, fields);
            }}
            align="right"
          />
        )}
        {/* Compact read-only chips for completed tasks */}
        {task.completed && (task.project || task.contact || task.target) && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {[
              task.project && (task.project as { title: string }).title,
              task.contact && `${task.contact.first_name} ${task.contact.last_name}`,
              task.target  && task.target.name,
            ].filter(Boolean).join(", ")}
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
        {task.due_date && task.completed && dueChipLabel(task.due_date) && (
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
            {dueChipLabel(task.due_date)}
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
  const [optionsOpen,         setOptionsOpen]         = useState(false);

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

  // Derive People/Targets that have at least one linked task, ordered by
  // task count (matches the implicit "most-tasks first" ordering Projects
  // already follows). We don't fetch a separate roster — we just walk the
  // tasks list and group by joined contact/target metadata.
  const sidebarPeople = useMemo(() => {
    const acc = new Map<string, { id: string; name: string; count: number }>();
    for (const t of tasks) {
      if (!t.contact_id || !t.contact) continue;
      const cur = acc.get(t.contact_id);
      const name = `${t.contact.first_name} ${t.contact.last_name}`.trim();
      if (cur) cur.count++;
      else acc.set(t.contact_id, { id: t.contact_id, name, count: 1 });
    }
    return [...acc.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [tasks]);

  const sidebarTargets = useMemo(() => {
    const acc = new Map<string, { id: string; name: string; color: string | null; count: number }>();
    for (const t of tasks) {
      if (!t.target_id || !t.target) continue;
      const cur = acc.get(t.target_id);
      if (cur) cur.count++;
      else acc.set(t.target_id, {
        id:    t.target_id,
        name:  t.target.name,
        color: t.target.pipeline?.color ?? null,
        count: 1,
      });
    }
    return [...acc.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [tasks]);

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
    else if (filter.startsWith("person:"))  list = tasks.filter(t => t.contact_id === filter.slice(7));
    else if (filter.startsWith("target:"))  list = tasks.filter(t => t.target_id  === filter.slice(7));
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
    if (filter.startsWith("person:"))  return lingering.filter(t => t.contact_id === filter.slice(7));
    if (filter.startsWith("target:"))  return lingering.filter(t => t.target_id  === filter.slice(7));
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
  const defaultContactId = filter.startsWith("person:")  ? filter.slice(7) : null;
  const defaultTargetId  = filter.startsWith("target:")  ? filter.slice(7) : null;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleAdded(task: Task) {
    setTasks(prev => [task, ...prev]);
  }

  async function handleUpdate(id: string, fields: Partial<Task> & { project?: unknown; contact?: unknown; target?: unknown }) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    setCompleted(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    setProjCompleted(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    const { project: _p, contact: _c, target: _t, ...dbFields } = fields as Record<string, unknown>;
    void _p; void _c; void _t;
    if (Object.keys(dbFields).length > 0) {
      const supabase = createClient();
      await supabase.from("tasks").update(dbFields).eq("id", id);
    }
  }

  async function fetchProjCompleted(pid: string) {
    const { data } = await createClient()
      .from("tasks")
      .select("*, project:projects(id,title), contact:contacts(id,first_name,last_name), target:outreach_targets(id, name, pipeline_id, pipeline:outreach_pipelines(name, color))")
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

  // Export currently-visible tasks as CSV. The options menu is the only
  // entry point — the surface stays uncluttered for users who don't need it.
  function exportVisibleCsv() {
    const rows = viewTasks.map(t => [
      t.title,
      t.due_date ?? "",
      t.priority ?? "",
      t.completed ? "completed" : "open",
      t.project?.title ?? "",
      t.contact ? `${t.contact.first_name} ${t.contact.last_name}` : "",
      t.target?.name ?? "",
      t.notes ?? "",
    ]);
    const header = ["Title","Due","Priority","Status","Project","Person","Target","Notes"];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tasks.csv";
    a.click();
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
    if (filter.startsWith("person:"))  return sidebarPeople.find(p => p.id === filter.slice(7))?.name ?? "Person";
    if (filter.startsWith("target:"))  return sidebarTargets.find(t => t.id === filter.slice(7))?.name ?? "Target";
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
    } else if (filter.startsWith("person:")) {
      const name = sidebarPeople.find(p => p.id === filter.slice(7))?.name ?? "this person";
      [heading, sub] = [`No tasks for ${name}`, "Add a task above to get started."];
    } else if (filter.startsWith("target:")) {
      const name = sidebarTargets.find(t => t.id === filter.slice(7))?.name ?? "this target";
      [heading, sub] = [`No tasks for ${name}`, "Add a task above to get started."];
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
    <>
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Topbar — title + 3-dot options. No primary CTA on the right; the
          quick-add input handles task creation inline. Matches Projects/People
          padding (Topbar component is 52px tall, px-6). */}
      <Topbar
        title="Tasks"
        actions={
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOptionsOpen(v => !v)}
              aria-label="Task options"
              title="Task options"
              data-tour-target="tasks.options-menu"
              style={{
                width: 28, height: 28, borderRadius: 7,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: optionsOpen ? "var(--color-surface-sunken)" : "transparent",
                border: "none", cursor: "pointer",
                color: "var(--color-text-secondary)",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { if (!optionsOpen) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
              onMouseLeave={e => { if (!optionsOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <MoreHorizontal size={16} strokeWidth={2} />
            </button>
            {optionsOpen && (
              <TasksOptionsMenu
                showCompletedInline={completedExpanded}
                onToggleShowCompletedInline={() => setCompletedExpanded(v => !v)}
                completedCount={completed.length}
                onExportCsv={exportVisibleCsv}
                onClose={() => setOptionsOpen(false)}
              />
            )}
          </div>
        }
      />

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div data-tour-target="tasks.sidebar" style={{
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

            {sidebarPeople.length > 0 && (
              <>
                <div style={{ height: "0.5px", background: "var(--color-border)", margin: "8px 4px" }} />
                <div style={{ padding: "4px 10px 4px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>People</div>
                {sidebarPeople.map(p => (
                  <SidebarItem key={p.id} id={`person:${p.id}`} label={p.name} count={p.count} activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
                ))}
              </>
            )}

            {sidebarTargets.length > 0 && (
              <>
                <div style={{ height: "0.5px", background: "var(--color-border)", margin: "8px 4px" }} />
                <div style={{ padding: "4px 10px 4px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Targets</div>
                {sidebarTargets.map(t => (
                  <SidebarItem key={t.id} id={`target:${t.id}`} label={t.name} count={t.count} dot={t.color ?? undefined} activeFilter={filter} onSelect={f => setFilter(f as Filter)} />
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
            <div data-tour-target="tasks.sort" style={{ display: "flex", alignItems: "center", gap: 3 }}>
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
              <QuickAdd
                projects={projects}
                defaultProjectId={defaultProjectId}
                defaultContactId={defaultContactId}
                defaultTargetId={defaultTargetId}
                onAdded={handleAdded}
              />
            )}

            {/* "All" view: sectioned with lingering ghosts + completed at bottom */}
            {allSections !== null ? (
              <>
                {allSections.length === 0 && !showCompletedSection ? <TaskEmptyState /> : (
                  allSections.map((section, sIdx) => (
                    <div key={section.title}>
                      <SectionHeader title={section.title} count={section.active.length} dot={section.dot} />
                      {section.active.map((task, tIdx) => (
                        <TaskRow key={task.id} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedId === task.id} tourTarget={sIdx === 0 && tIdx === 0 ? "tasks.first-row" : undefined} />
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
                    {viewTasks.map((task, idx) => (
                      <TaskRow key={task.id} task={task} projects={projects} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedId === task.id} tourTarget={idx === 0 ? "tasks.first-row" : undefined} />
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

    {/* Walkthrough: intro modal first, then progressive tooltips */}
    <TasksIntroModal />
    <TasksTooltipTour />
    </>
  );
}
