"use client";

// ── EntityTasksTab ────────────────────────────────────────────────────────────
// Entity-agnostic Tasks tab, extracted from ProjectDetailPanel's ProjectTasksTab
// so Projects / Targets (and future surfaces) share one implementation. The only
// per-entity differences are the foreign-key column the `tasks` row is filed
// under and the DOM-id prefix used for highlight scroll-to.
//
// Behavior is reproduced EXACTLY from the Project version: progress bar, quick
// add with priority + due-date pickers, inline-editable rows, show/hide
// completed, optimistic insert + toggle + update.
//
// State can be either uncontrolled (the tab loads + owns its own `tasks`) or
// controlled (the parent passes `tasks` + `setTasks`, e.g. Projects, which uses
// the list elsewhere). When uncontrolled the tab fetches on mount.

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/types/database";
import { CheckSquare } from "lucide-react";
import PriorityPicker from "@/components/tasks/PriorityPicker";
import { dueChipLabel, dueChipColor } from "@/lib/tasks/due";

export type TaskFkColumn = "project_id" | "contact_id" | "organization_id" | "target_id";

// ── Task inline pickers (mirrors TasksClient style) ───────────────────────────

function toISODateTask(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function taskTodayMidnight(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function TaskDatePicker({ value, onChange, onClear }: {
  value: string | null; onChange: (d: string) => void; onClear?: () => void;
}) {
  const [open, setOpen]         = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? new Date(value + "T12:00:00") : new Date());
  const [dropPos, setDropPos]   = useState({ top: 0, right: 0 });
  const ref        = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const yr = viewDate.getFullYear(), mo = viewDate.getMonth();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDow    = new Date(yr, mo, 1).getDay();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const DOW    = ["S","M","T","W","T","F","S"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const isSel = (d: number) => !!value && new Date(value + "T12:00:00").getDate() === d && new Date(value + "T12:00:00").getMonth() === mo && new Date(value + "T12:00:00").getFullYear() === yr;
  const isTod = (d: number) => { const t = taskTodayMidnight(); return t.getDate() === d && t.getMonth() === mo && t.getFullYear() === yr; };

  const label = dueChipLabel(value);
  const labelColor = value ? dueChipColor(value) : "var(--color-text-tertiary)";

  function handleOpen() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 5, right: window.innerWidth - r.right });
    }
    setOpen(v => !v);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button ref={triggerRef} type="button" onClick={handleOpen} style={{
        display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 8px", borderRadius: 9999,
        border: `0.5px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
        background: value ? "var(--color-surface-sunken)" : "transparent",
        color: labelColor, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.1s ease",
      }}
      onMouseEnter={e => { if (!value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
      onMouseLeave={e => { if (!value) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/></svg>
        {label ?? "Due date"}
      </button>
      {open && (
        <div style={{
          position: "fixed", top: dropPos.top, right: dropPos.right, zIndex: 9999, width: 220,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.12)", padding: 12,
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {[{ label: "Today", days: 0 }, { label: "Tomorrow", days: 1 }, { label: "Next week", days: 7 }].map(s => (
              <button type="button" key={s.label} onClick={() => { const d = new Date(taskTodayMidnight()); d.setDate(d.getDate() + s.days); onChange(toISODateTask(d)); setOpen(false); }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 9999, background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              >{s.label}</button>
            ))}
            {value && onClear && (
              <button type="button" onClick={() => { onClear(); setOpen(false); }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 9999, background: "transparent", border: "0.5px solid var(--color-border)", color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit" }}
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
              <button type="button" key={day} onClick={() => { onChange(toISODateTask(new Date(yr, mo, day))); setOpen(false); }} style={{
                width: "100%", aspectRatio: "1", borderRadius: 4, border: "none", fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                background: isSel(day) ? "var(--color-sage)" : "transparent",
                color: isSel(day) ? "white" : isTod(day) ? "var(--color-sage)" : "var(--color-text-primary)",
                fontWeight: isSel(day) ? 600 : 400, outline: isTod(day) && !isSel(day) ? "1.5px solid var(--color-sage)" : "none", outlineOffset: -1,
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

// ── EntityTaskRow ─────────────────────────────────────────────────────────────

function EntityTaskRow({
  task, onToggle, onUpdate, highlighted, idPrefix,
}: {
  task:         Task;
  onToggle:     (id: string, completed: boolean) => void;
  onUpdate:     (id: string, fields: Partial<Task>) => void;
  highlighted?: boolean;
  idPrefix:     string;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(task.title); }, [task.title]);

  function commitEdit() {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== task.title) onUpdate(task.id, { title: t });
    else setDraft(task.title);
  }

  return (
    <div
      id={`${idPrefix}-task-${task.id}`}
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border)",
        background: highlighted
          ? "rgba(var(--color-sage-rgb),0.18)"
          : hovered && !task.completed
            ? "rgba(0,0,0,0.015)"
            : "transparent",
        opacity: task.completed ? 0.5 : 1,
        transition: "opacity 0.25s ease, background 0.6s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onToggle(task.id, !task.completed)}
        style={{
          width: 15, height: 15, borderRadius: 4, flexShrink: 0,
          border: task.completed ? "none" : "1.5px solid var(--color-border-strong)",
          background: task.completed ? "var(--color-sage)" : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.12s ease",
        }}
        onMouseEnter={e => { if (!task.completed) e.currentTarget.style.borderColor = "var(--color-sage)"; }}
        onMouseLeave={e => { if (!task.completed) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
      >
        {task.completed && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>

      {editing ? (
        <input
          ref={inputRef} autoFocus value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setEditing(false); setDraft(task.title); } }}
          style={{ flex: 1, fontSize: 12, color: "var(--color-charcoal)", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", padding: 0 }}
        />
      ) : (
        <span
          onClick={() => !task.completed && setEditing(true)}
          style={{ flex: 1, fontSize: 12, color: task.completed ? "var(--color-grey)" : "var(--color-charcoal)", textDecoration: task.completed ? "line-through" : "none", cursor: task.completed ? "default" : "text", lineHeight: 1.4, minWidth: 0 }}
        >
          {task.title}
        </span>
      )}

      {/* Interactive pickers — always visible when set, appear on hover otherwise */}
      {!task.completed && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          {(task.priority || hovered) && (
            <PriorityPicker
              value={task.priority}
              onChange={p => onUpdate(task.id, { priority: p })}
              align="right"
            />
          )}
          {(task.due_date || hovered) && (
            <TaskDatePicker
              value={task.due_date}
              onChange={d => onUpdate(task.id, { due_date: d })}
              onClear={() => onUpdate(task.id, { due_date: null })}
            />
          )}
        </div>
      )}
      {task.completed && task.due_date && (
        <span style={{ fontSize: 10, fontWeight: 500, color: dueChipColor(task.due_date), flexShrink: 0, whiteSpace: "nowrap" }}>
          {dueChipLabel(task.due_date)}
        </span>
      )}
    </div>
  );
}

// ── EntityTasksTab ────────────────────────────────────────────────────────────

export default function EntityTasksTab({
  fkColumn, id, highlightedTaskId, idPrefix = "entity",
  tasks: controlledTasks, setTasks: setControlledTasks,
}: {
  fkColumn:           TaskFkColumn;
  id:                 string;
  highlightedTaskId?: string | null;
  /** DOM-id prefix for highlight scroll-to: `${idPrefix}-task-${task.id}`. */
  idPrefix?:          string;
  /** Optional controlled state. When omitted the tab owns + loads its own. */
  tasks?:             Task[];
  setTasks?:          React.Dispatch<React.SetStateAction<Task[]>>;
}) {
  const isControlled = controlledTasks !== undefined && setControlledTasks !== undefined;
  const [ownTasks, setOwnTasks] = useState<Task[]>([]);
  const tasks   = isControlled ? controlledTasks! : ownTasks;
  const setTasks = (isControlled ? setControlledTasks! : setOwnTasks) as React.Dispatch<React.SetStateAction<Task[]>>;

  const [newTitle,      setNewTitle]      = useState("");
  const [newPriority,   setNewPriority]   = useState<"high" | "medium" | "low" | null>(null);
  const [newDueDate,    setNewDueDate]    = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Self-load only when uncontrolled.
  useEffect(() => {
    if (isControlled) return;
    createClient().from("tasks").select("*").eq(fkColumn, id).order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setOwnTasks(data as Task[]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fkColumn, id, isControlled]);

  const active    = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed);
  const pct       = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  async function addTask() {
    if (!newTitle.trim() || loading) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from("tasks").insert({
      user_id: user.id, [fkColumn]: id, title: newTitle.trim(),
      completed: false, priority: newPriority, due_date: newDueDate,
    }).select().single();
    if (data) setTasks(prev => [...prev, data as Task]);
    setNewTitle(""); setNewPriority(null); setNewDueDate(null);
    setLoading(false);
    inputRef.current?.focus();
  }

  async function handleToggle(taskId: string, newCompleted: boolean) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t));
    await createClient().from("tasks").update({ completed: newCompleted }).eq("id", taskId);
  }

  async function handleUpdate(taskId: string, fields: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...fields } : t));
    await createClient().from("tasks").update(fields).eq("id", taskId);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Progress bar — no duplicate "Tasks" label since the top bar already shows it */}
      {tasks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 4px", flexShrink: 0 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 9999, background: "var(--color-border)" }}>
            <div style={{ height: "100%", borderRadius: 9999, width: `${pct}%`, background: "var(--color-sage)", transition: "width 0.3s ease" }} />
          </div>
          <span style={{ fontSize: 10, color: "var(--color-grey)", flexShrink: 0 }}>{completed.length}/{tasks.length} done</span>
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Quick add with priority + date */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderBottom: "0.5px solid var(--color-border)" }}>
          <div style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: "1.5px dashed var(--color-border-strong)" }} />
          <input
            ref={inputRef} value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTask(); }}
            placeholder="New task…"
            style={{ flex: 1, fontSize: 12, border: "none", outline: "none", background: "transparent", color: "var(--color-charcoal)", fontFamily: "inherit", minWidth: 0 }}
          />
          <PriorityPicker value={newPriority} onChange={setNewPriority} align="right" />
          <TaskDatePicker value={newDueDate} onChange={setNewDueDate} onClear={() => setNewDueDate(null)} />
          {newTitle.trim() && (
            <button onClick={addTask} disabled={loading} style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", flexShrink: 0 }}>
              Add
            </button>
          )}
        </div>

        {active.map(task => <EntityTaskRow key={task.id} task={task} onToggle={handleToggle} onUpdate={handleUpdate} highlighted={highlightedTaskId === task.id} idPrefix={idPrefix} />)}

        {active.length === 0 && completed.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, gap: 6, color: "var(--color-grey)" }}>
            <CheckSquare size={28} strokeWidth={1.25} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 12 }}>No tasks yet</p>
          </div>
        )}

        {/* Show completed toggle */}
        <div style={{ padding: "10px 16px 4px", borderTop: completed.length > 0 ? "0.5px solid var(--color-border)" : "none", marginTop: 4 }}>
          <button
            onClick={() => setShowCompleted(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-secondary)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              style={{ transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
              <path d="M2 1l4 3-4 3"/>
            </svg>
            {showCompleted ? `Hide completed (${completed.length})` : `Show completed (${completed.length})`}
          </button>
        </div>

        {showCompleted && completed.map(task => <EntityTaskRow key={task.id} task={task} onToggle={handleToggle} onUpdate={handleUpdate} idPrefix={idPrefix} />)}
      </div>
    </div>
  );
}
