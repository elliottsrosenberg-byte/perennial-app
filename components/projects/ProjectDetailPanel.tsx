"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Project, Task, Note, Reminder, ProjectType, ProjectStatus, ProjectPriority } from "@/types/database";
import { Expand, Pencil, Settings, FileText } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ON_TRACK = "var(--color-green)";

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(due: string | null) {
  return !!due && new Date(due).getTime() < Date.now();
}

function getDueBadge(due: string | null) {
  if (!due) return null;
  const daysLeft = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0)  return { label: "Overdue",      color: "var(--color-red-orange)", weight: 500 };
  if (daysLeft === 0) return { label: "Today",        color: "#a07800",                 weight: 500 };
  if (daysLeft <= 3)  return { label: `In ${daysLeft}d`, color: "#a07800",              weight: 500 };
  return {
    label: new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    color: "var(--color-grey)",
    weight: 400,
  };
}

// ── Style maps ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: "furniture",      label: "Furniture" },
  { value: "sculpture",      label: "Sculpture" },
  { value: "painting",       label: "Painting"  },
  { value: "client_project", label: "Client"    },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "in_progress", label: "In Progress" },
  { value: "planning",    label: "Planning"    },
  { value: "on_hold",     label: "On Hold"     },
  { value: "complete",    label: "Complete"    },
];

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  furniture:      { bg: "#f0ebe0", color: "#b8860b" },
  sculpture:      { bg: "#f0ebe0", color: "#b8860b" },
  painting:       { bg: "#e8e3f0", color: "#6d4fa3" },
  small_object:   { bg: "#e0f0e8", color: "#3d6b4f" },
  client_project: { bg: "#e0eaf5", color: "#2563ab" },
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  in_progress: { bg: "rgba(141,208,71,0.15)",  color: "#5a7040" },
  planning:    { bg: "rgba(155,163,122,0.14)", color: "#6b6860" },
  on_hold:     { bg: "rgba(232,197,71,0.15)",  color: "#a07800" },
  complete:    { bg: "rgba(141,208,71,0.12)",  color: "#3d6b4f" },
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  high:   { bg: "rgba(220,62,13,0.10)",   color: "var(--color-red-orange)", label: "High"   },
  medium: { bg: "rgba(232,197,71,0.15)",  color: "#a07800",                 label: "Medium" },
  low:    { bg: "rgba(155,163,122,0.12)", color: "#5a7040",                 label: "Low"    },
};

// ── EditableField ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  display: string;
  editDefault: string;
  inputType?: "text" | "number" | "date";
  placeholder?: string;
  onSave: (raw: string) => void;
  alert?: boolean;
}

function EditableField({ label, display, editDefault, inputType = "text", placeholder, onSave, alert = false }: FieldProps) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(editDefault);
  const [hovered, setHovered]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(editDefault); }, [editDefault]);

  function commit() {
    onSave(draft.trim());
    setEditing(false);
  }

  function cancel() {
    setDraft(editDefault);
    setEditing(false);
  }

  return (
    <div
      className="flex justify-between items-center py-[5px]"
      style={{ borderBottom: "0.5px solid var(--color-border)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="text-[11px] shrink-0 mr-3" style={{ color: "var(--color-grey)" }}>{label}</span>

      {editing ? (
        <input
          ref={inputRef}
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          className="text-[11px] text-right bg-transparent focus:outline-none"
          style={{
            color: "#6b6860",
            borderBottom: "1px solid var(--color-sage)",
            maxWidth: "130px",
            minWidth: "60px",
          }}
          placeholder={placeholder}
        />
      ) : (
        <div
          className="flex items-center gap-1.5 cursor-text"
          onClick={() => setEditing(true)}
        >
          <span
            className="text-[11px] font-medium text-right"
            style={{ color: alert ? "var(--color-red-orange)" : display === "—" ? "var(--color-grey)" : "#6b6860", fontWeight: display === "—" ? 400 : 500 }}
          >
            {display}
          </span>
          {hovered && <Pencil size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />}
        </div>
      )}
    </div>
  );
}

// ── EditableTag ───────────────────────────────────────────────────────────────

interface TagOption { value: string; label: string; }

function EditableTag({
  value, options, tagStyle, onSave,
}: {
  value: string;
  options: readonly TagOption[];
  tagStyle: { bg: string; color: string };
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const label = options.find((o) => o.value === value)?.label ?? value;

  if (editing) {
    return (
      <select
        value={value}
        autoFocus
        onChange={(e) => { onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="text-[10px] px-[7px] py-[2px] rounded-full focus:outline-none cursor-pointer"
        style={{ background: tagStyle.bg, color: tagStyle.color, border: "1px solid " + tagStyle.color }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  return (
    <div
      className="flex items-center gap-1 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setEditing(true)}
    >
      <span
        className="text-[10px] font-medium px-[7px] py-[2px] rounded-full"
        style={{ background: tagStyle.bg, color: tagStyle.color }}
      >
        {label}
      </span>
      {hovered && <Pencil size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />}
    </div>
  );
}

// ── EditableTitle ─────────────────────────────────────────────────────────────

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    if (draft.trim()) onSave(draft.trim());
    else setDraft(value);
    setEditing(false);
  }

  return (
    <div
      className="mb-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editing ? (
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className="w-full font-bold leading-snug bg-transparent focus:outline-none"
          style={{ fontSize: "18px", color: "var(--color-charcoal)", borderBottom: "1px solid var(--color-sage)", padding: "2px 0" }}
        />
      ) : (
        <div className="flex items-start gap-2 cursor-text" onClick={() => setEditing(true)}>
          <h2 className="font-bold leading-snug flex-1" style={{ fontSize: "18px", color: "var(--color-charcoal)" }}>
            {value}
          </h2>
          {hovered && <Pencil size={12} strokeWidth={1.75} style={{ color: "var(--color-grey)", marginTop: 4, flexShrink: 0 }} />}
        </div>
      )}
    </div>
  );
}

// ── EditableDescription ───────────────────────────────────────────────────────

function EditableDescription({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? "");
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) { ref.current?.focus(); } }, [editing]);
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    onSave(draft.trim() || null);
    setEditing(false);
  }

  return (
    <div
      className="mb-5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {editing ? (
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          rows={3}
          placeholder="Add a description…"
          className="w-full text-[12px] leading-relaxed bg-transparent focus:outline-none resize-none"
          style={{ color: "#6b6860", border: "0.5px solid var(--color-sage)", borderRadius: "6px", padding: "6px 8px" }}
        />
      ) : (
        <div className="flex items-start gap-1.5 cursor-text" onClick={() => setEditing(true)}>
          {value ? (
            <p className="text-[12px] leading-relaxed flex-1" style={{ color: "#6b6860" }}>{value}</p>
          ) : (
            <p className="text-[12px] flex-1" style={{ color: "var(--color-grey)" }}>Add a description…</p>
          )}
          {hovered && <Pencil size={10} strokeWidth={1.75} style={{ color: "var(--color-grey)", marginTop: 2, flexShrink: 0 }} />}
        </div>
      )}
    </div>
  );
}

// ── PropsPanel ────────────────────────────────────────────────────────────────

function PropsPanel({ project, onUpdate }: { project: Project; onUpdate: (field: string, value: unknown) => void }) {
  const typeStyle   = project.type ? TYPE_STYLE[project.type] : { bg: "var(--color-cream)", color: "#6b6860" };
  const statusStyle = STATUS_STYLE[project.status] ?? STATUS_STYLE.planning;
  const priority    = PRIORITY_STYLE[project.priority] ?? PRIORITY_STYLE.medium;
  const overdue     = isOverdue(project.due_date);
  const isClient    = project.type === "client_project";

  return (
    <div
      className="flex flex-col"
      style={{ width: "248px", flexShrink: 0, borderRight: "0.5px solid var(--color-border)", background: "var(--color-off-white)", borderRadius: "12px 0 0 12px" }}
    >
      <div className="flex-1 px-5 py-5 overflow-y-auto">
        <EditableTitle value={project.title} onSave={(v) => onUpdate("title", v)} />
        <EditableDescription value={project.description} onSave={(v) => onUpdate("description", v)} />

        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          {project.type && (
            <EditableTag value={project.type} options={TYPE_OPTIONS} tagStyle={typeStyle} onSave={(v) => onUpdate("type", v)} />
          )}
          <EditableTag value={project.status} options={STATUS_OPTIONS} tagStyle={statusStyle} onSave={(v) => onUpdate("status", v)} />
          <EditableTag value={project.priority} options={PRIORITY_OPTIONS} tagStyle={{ bg: priority.bg, color: priority.color }} onSave={(v) => onUpdate("priority", v)} />
        </div>

        {!isClient ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--color-grey)" }}>Properties</p>
            <EditableField label="Price"      display={project.listing_price ? `$${project.listing_price.toLocaleString()}` : "—"} editDefault={project.listing_price?.toString() ?? ""} inputType="number" placeholder="0"              onSave={(v) => onUpdate("listing_price", v ? parseFloat(v) : null)} />
            <EditableField label="Dimensions" display={project.dimensions ?? "—"}  editDefault={project.dimensions ?? ""}  placeholder='84" × 38" × 30"' onSave={(v) => onUpdate("dimensions", v || null)} />
            <EditableField label="Materials"  display={project.materials  ?? "—"}  editDefault={project.materials  ?? ""}  placeholder="White oak, steel" onSave={(v) => onUpdate("materials",  v || null)} />
            <EditableField label="Weight"     display={project.weight     ?? "—"}  editDefault={project.weight     ?? ""}  placeholder="~180 lbs"         onSave={(v) => onUpdate("weight",     v || null)} />
            <div className="mb-4" />
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--color-grey)" }}>Client</p>
            <EditableField label="Name"       display={project.client_name ?? "—"}  editDefault={project.client_name ?? ""}  placeholder="Client name" onSave={(v) => onUpdate("client_name", v || null)} />
            <EditableField label="Rate"       display={project.rate ? `$${project.rate}/hr` : "—"} editDefault={project.rate?.toString() ?? ""} inputType="number" placeholder="150" onSave={(v) => onUpdate("rate", v ? parseFloat(v) : null)} />
            <EditableField label="Billed"     display={`${project.billed_hours} hrs`} editDefault={project.billed_hours.toString()} inputType="number" onSave={(v) => onUpdate("billed_hours", v ? parseFloat(v) : 0)} />
            <EditableField label="Est. value" display={project.est_value ? `$${project.est_value.toLocaleString()}` : "—"} editDefault={project.est_value?.toString() ?? ""} inputType="number" placeholder="0" onSave={(v) => onUpdate("est_value", v ? parseFloat(v) : null)} />
            <div className="mb-4" />
          </>
        )}

        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--color-grey)" }}>Timeline</p>
        <EditableField label="Start" display={fmt(project.start_date)} editDefault={project.start_date ?? ""} inputType="date" onSave={(v) => onUpdate("start_date", v || null)} />
        <EditableField label="Due"   display={fmt(project.due_date)}   editDefault={project.due_date   ?? ""} inputType="date" onSave={(v) => onUpdate("due_date",   v || null)} alert={overdue} />
      </div>

      <div className="px-4 py-3 shrink-0" style={{ borderTop: "0.5px solid var(--color-border)" }}>
        <button
          className="flex items-center gap-2 w-full rounded-lg px-3 py-[8px] text-[12px] transition-colors"
          style={{ color: "#6b6860" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Settings size={13} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
          Project settings
        </button>
      </div>
    </div>
  );
}

// ── QuickNote ─────────────────────────────────────────────────────────────────

function QuickNote({ projectId, onSave }: { projectId: string; onSave: (note: Note) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");

  async function save() {
    if (!body.trim() && !title.trim()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: user.id, project_id: projectId, title: title.trim() || null, content: body.trim() || null })
      .select()
      .single();
    if (data) {
      onSave(data as Note);
      setTitle("");
      setBody("");
    }
  }

  return (
    <div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full text-[12px] font-medium bg-transparent focus:outline-none mb-1"
        style={{ color: "var(--color-charcoal)" }}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write something…"
        rows={3}
        className="w-full text-[13px] leading-relaxed focus:outline-none resize-none"
        style={{ background: "transparent", border: "none", color: "var(--color-charcoal)" }}
      />
      {(title.trim() || body.trim()) && (
        <div className="flex justify-end mt-1">
          <button
            onClick={save}
            className="text-[11px] px-3 py-[5px] rounded-lg font-medium text-white"
            style={{ background: "var(--color-sage)" }}
          >
            Save note
          </button>
        </div>
      )}
    </div>
  );
}

// ── PanelReminderRow ──────────────────────────────────────────────────────────

function PanelReminderRow({
  reminder, onToggle, onUpdate, onDelete,
}: {
  reminder: Reminder;
  onToggle: (r: Reminder) => void;
  onUpdate: (id: string, fields: Partial<Reminder>) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle]             = useState(reminder.title);
  const [desc, setDesc]               = useState(reminder.description ?? "");
  const [dueLocal, setDueLocal]       = useState(
    reminder.due_date ? new Date(reminder.due_date).toISOString().slice(0, 16) : ""
  );
  const supabase = createClient();
  const badge    = getDueBadge(reminder.due_date);

  useEffect(() => {
    setTitle(reminder.title);
    setDesc(reminder.description ?? "");
    setDueLocal(reminder.due_date ? new Date(reminder.due_date).toISOString().slice(0, 16) : "");
  }, [reminder.id]);

  async function saveTitle() {
    if (!title.trim()) { setTitle(reminder.title); setEditingTitle(false); return; }
    await supabase.from("reminders").update({ title: title.trim() }).eq("id", reminder.id);
    onUpdate(reminder.id, { title: title.trim() });
    setEditingTitle(false);
  }

  async function saveDesc() {
    const d = desc.trim() || null;
    await supabase.from("reminders").update({ description: d }).eq("id", reminder.id);
    onUpdate(reminder.id, { description: d });
  }

  async function saveDue(val: string) {
    const v = val || null;
    await supabase.from("reminders").update({ due_date: v }).eq("id", reminder.id);
    onUpdate(reminder.id, { due_date: v });
  }

  return (
    <div style={{ borderBottom: "0.5px solid var(--color-border)", opacity: reminder.completed ? 0.45 : 1 }}>
      <div className="flex items-start gap-3 py-[10px]">
        {/* Checkbox */}
        <div
          onClick={() => onToggle(reminder)}
          className="w-[16px] h-[16px] rounded-full shrink-0 mt-[2px] flex items-center justify-center cursor-pointer"
          style={{
            border: reminder.completed ? "none" : "1.5px solid var(--color-border)",
            background: reminder.completed ? "var(--color-sage)" : "transparent",
          }}
        >
          {reminder.completed && (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
              <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") { setTitle(reminder.title); setEditingTitle(false); }
              }}
              className="w-full text-[13px] font-medium bg-transparent focus:outline-none"
              style={{ color: "var(--color-charcoal)", borderBottom: "1px solid var(--color-sage)" }}
            />
          ) : (
            <p
              onClick={() => !reminder.completed && setEditingTitle(true)}
              className="text-[13px] font-medium leading-snug cursor-text"
              style={{
                color: "var(--color-charcoal)",
                textDecoration: reminder.completed ? "line-through" : "none",
              }}
            >
              {reminder.title}
            </p>
          )}
          {/* Subtitle — clicking expands */}
          <div
            className="flex items-center gap-2 mt-[2px] cursor-pointer"
            onClick={() => !reminder.completed && setExpanded((v) => !v)}
          >
            {reminder.description ? (
              <span className="text-[11px] truncate" style={{ color: "var(--color-grey)" }}>{reminder.description}</span>
            ) : !reminder.completed ? (
              <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{expanded ? "▲ less" : "▼ details"}</span>
            ) : null}
          </div>
        </div>

        {badge && (
          <span className="text-[10px] shrink-0 mt-[2px]" style={{ color: badge.color, fontWeight: badge.weight }}>
            {badge.label}
          </span>
        )}
      </div>

      {expanded && (
        <div className="pb-3 pl-[28px] pr-1 flex flex-col gap-2">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={saveDesc}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveDesc();
                setExpanded(false);
              }
            }}
            placeholder="Add notes… (Enter to save, Shift+Enter for new line)"
            rows={2}
            className="text-[12px] bg-transparent focus:outline-none resize-none w-full"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)", borderRadius: "6px", padding: "5px 7px" }}
          />
          <div className="flex items-center gap-3">
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => { setDueLocal(e.target.value); saveDue(e.target.value); }}
              className="text-[11px] bg-transparent focus:outline-none"
              style={{ color: "#6b6860", border: "0.5px solid var(--color-border)", borderRadius: "6px", padding: "3px 6px" }}
            />
            <button
              onClick={() => { if (window.confirm("Delete reminder?")) onDelete(reminder.id); }}
              className="text-[11px] ml-auto transition-colors"
              style={{ color: "var(--color-grey)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-red-orange)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-grey)")}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  project, tasks, notes, reminders, onToggle, onAddNote, onToggleReminder,
}: {
  project: Project;
  tasks: Task[];
  notes: Note[];
  reminders: Reminder[];
  onToggle: (t: Task) => void;
  onAddNote: (note: Note) => void;
  onToggleReminder: (r: Reminder) => void;
}) {
  const completed  = tasks.filter((t) => t.completed).length;
  const total      = tasks.length;
  const pct        = total > 0 ? (completed / total) * 100 : 0;
  const overdue    = isOverdue(project.due_date);
  const barColor   = overdue ? "var(--color-red-orange)" : ON_TRACK;
  const incomplete = tasks.filter((t) => !t.completed);
  const activeReminders = reminders
    .filter((r) => !r.completed)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    })
    .slice(0, 4);

  const s = { background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" };

  return (
    <div>
      {/* Tasks mini */}
      <div className="rounded-xl p-4 mb-4" style={s}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Tasks</span>
          {total > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-16 h-[3px] rounded-full" style={{ background: "var(--color-border)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>{completed}/{total}</span>
            </div>
          )}
        </div>
        {incomplete.slice(0, 4).map((task) => (
          <div
            key={task.id}
            onClick={() => onToggle(task)}
            className="flex items-center gap-2.5 py-[6px] cursor-pointer rounded-lg px-2 -mx-2 transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ border: "1.5px solid var(--color-border)" }} />
            <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{task.title}</span>
          </div>
        ))}
        {total === 0 && <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>No tasks yet.</p>}
        {incomplete.length > 4 && (
          <p className="text-[11px] mt-2" style={{ color: "var(--color-grey)" }}>+{incomplete.length - 4} more — see Tasks tab</p>
        )}
      </div>

      {/* Quick note */}
      <div className="rounded-xl p-4 mb-4" style={s}>
        <span className="text-[12px] font-semibold block mb-2" style={{ color: "var(--color-charcoal)" }}>Note</span>
        <QuickNote projectId={project.id} onSave={onAddNote} />
      </div>

      {/* Reminders mini */}
      <div className="rounded-xl p-4 mb-4" style={s}>
        <span className="text-[12px] font-semibold block mb-2" style={{ color: "var(--color-charcoal)" }}>Upcoming reminders</span>
        {activeReminders.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>No upcoming reminders.</p>
        ) : (
          activeReminders.map((r) => {
            const badge = getDueBadge(r.due_date);
            return (
              <div key={r.id} className="flex items-center gap-2.5 py-[6px]">
                <div
                  onClick={() => onToggleReminder(r)}
                  className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center cursor-pointer"
                  style={{ border: "1.5px solid var(--color-border)" }}
                />
                <span className="text-[12px] flex-1" style={{ color: "var(--color-charcoal)" }}>{r.title}</span>
                {badge && <span className="text-[10px] shrink-0" style={{ color: badge.color, fontWeight: badge.weight }}>{badge.label}</span>}
              </div>
            );
          })
        )}
        {reminders.filter((r) => !r.completed).length > 4 && (
          <p className="text-[11px] mt-1" style={{ color: "var(--color-grey)" }}>
            +{reminders.filter((r) => !r.completed).length - 4} more — see Reminders tab
          </p>
        )}
      </div>

      {/* Files placeholder */}
      <div className="rounded-xl p-4" style={s}>
        <span className="text-[12px] font-semibold block mb-2" style={{ color: "var(--color-charcoal)" }}>Files</span>
        <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>File attachments coming soon.</p>
      </div>
    </div>
  );
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ project, tasks, onToggle, onAdd }: {
  project: Project;
  tasks: Task[];
  onToggle: (t: Task) => void;
  onAdd: (title: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding]     = useState(false);
  const completed = tasks.filter((t) => t.completed).length;
  const pct       = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
  const overdue   = isOverdue(project.due_date);
  const barColor  = overdue ? "var(--color-red-orange)" : ON_TRACK;

  function submit() {
    if (!newTitle.trim()) { setAdding(false); return; }
    onAdd(newTitle.trim());
    setNewTitle("");
    setAdding(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-[14px]">
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-charcoal)" }}>To-dos</span>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-[3px] rounded-full" style={{ background: "var(--color-border)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>{completed} of {tasks.length} complete</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[2px] mb-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onToggle(task)}
            className="flex items-start gap-2.5 px-3 py-[9px] rounded-lg cursor-pointer transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-off-white)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div
              className="w-4 h-4 rounded-full shrink-0 mt-[1px] flex items-center justify-center"
              style={{
                border: task.completed ? "none" : "1.5px solid var(--color-border)",
                background: task.completed ? "var(--color-sage)" : "transparent",
              }}
            >
              {task.completed && (
                <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                  <path d="M1 3l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span
              className="text-[13px] leading-snug"
              style={{
                color: task.completed ? "var(--color-grey)" : "var(--color-charcoal)",
                textDecoration: task.completed ? "line-through" : "none",
              }}
            >
              {task.title}
            </span>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-4 h-4 rounded-full border-dashed border shrink-0" style={{ borderColor: "var(--color-border)" }} />
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setAdding(false); setNewTitle(""); } }}
            onBlur={submit}
            placeholder="Task name..."
            className="flex-1 text-[13px] bg-transparent focus:outline-none"
            style={{ color: "var(--color-charcoal)" }}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2.5 px-3 py-[9px] rounded-lg w-full text-left transition-colors"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "#6b6860"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
        >
          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[11px] shrink-0" style={{ border: "1.5px dashed var(--color-border)" }}>
            +
          </div>
          <span className="text-[13px]">Add a task</span>
        </button>
      )}
    </div>
  );
}

// ── Project Notes tab ─────────────────────────────────────────────────────────

function ProjectNotesTab({
  projectId, notes, onAdd, onDelete,
}: {
  projectId: string;
  notes: Note[];
  onAdd: (note: Note) => void;
  onDelete: (id: string) => void;
}) {
  const s = { background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" };

  return (
    <div>
      {/* Compose */}
      <div className="rounded-xl p-4 mb-5" style={s}>
        <span className="text-[12px] font-semibold block mb-2" style={{ color: "var(--color-charcoal)" }}>New note</span>
        <QuickNote projectId={projectId} onSave={onAdd} />
      </div>

      {/* Existing notes */}
      {notes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1" style={{ background: "var(--color-cream)" }}>
            <FileText size={16} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />
          </div>
          <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>No notes yet</p>
          <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Write a note above to link it to this project.</p>
        </div>
      )}
    </div>
  );
}

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({ note, onDelete }: { note: Note; onDelete: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const snippet = note.content
    ? note.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
    : null;

  return (
    <div
      className="rounded-xl p-4 relative"
      style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold mb-[3px]" style={{ color: "var(--color-charcoal)" }}>
            {note.title || "Untitled"}
          </p>
          {snippet && (
            <p className="text-[12px] leading-relaxed mb-[4px]" style={{ color: "#6b6860" }}>
              {snippet}{note.content && note.content.length > 120 ? "…" : ""}
            </p>
          )}
          <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{timeAgo(note.updated_at)}</p>
        </div>
        {hovered && (
          <button
            onClick={() => { if (window.confirm("Delete note?")) onDelete(note.id); }}
            className="text-[10px] shrink-0 transition-colors mt-[1px]"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-red-orange)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-grey)")}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Project Reminders tab ─────────────────────────────────────────────────────

function ProjectRemindersTab({
  projectId, reminders, onCreate, onToggle, onUpdate, onDelete,
}: {
  projectId: string;
  reminders: Reminder[];
  onCreate: (title: string, dueDate: string | null) => void;
  onToggle: (r: Reminder) => void;
  onUpdate: (id: string, fields: Partial<Reminder>) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding]       = useState(false);
  const [addTitle, setAddTitle]   = useState("");
  const [addDue, setAddDue]       = useState("");

  const active    = reminders.filter((r) => !r.completed).sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
  const completed = reminders.filter((r) => r.completed);

  function submit() {
    if (!addTitle.trim()) { setAdding(false); setAddDue(""); return; }
    onCreate(addTitle.trim(), addDue || null);
    setAddTitle("");
    setAddDue("");
    setAdding(false);
  }

  const SectionLabel = ({ label, count }: { label: string; count: number }) => (
    <div className="flex items-center gap-2 mb-3" style={{ color: "var(--color-grey)" }}>
      <span className="text-[10px] font-semibold uppercase tracking-widest">{label}</span>
      <span className="text-[10px]">{count}</span>
    </div>
  );

  return (
    <div>
      <SectionLabel label="Active" count={active.length} />

      {active.map((r) => (
        <PanelReminderRow key={r.id} reminder={r} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
      ))}

      {/* Inline add */}
      {adding ? (
        <div
          className="flex items-center gap-3 py-[10px]"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}
        >
          <div className="w-[16px] h-[16px] rounded-full shrink-0" style={{ border: "1.5px dashed var(--color-border)" }} />
          <input
            autoFocus
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setAdding(false); setAddTitle(""); setAddDue(""); } }}
            onBlur={submit}
            placeholder="Reminder title…"
            className="flex-1 text-[13px] font-medium bg-transparent focus:outline-none"
            style={{ color: "var(--color-charcoal)" }}
          />
          <input
            type="date"
            value={addDue}
            onChange={(e) => setAddDue(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-[11px] bg-transparent focus:outline-none shrink-0"
            style={{ color: addDue ? "#6b6860" : "var(--color-grey)", border: "0.5px solid var(--color-border)", borderRadius: "6px", padding: "3px 6px" }}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-3 w-full py-[10px] text-left transition-colors"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#6b6860")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-grey)")}
        >
          <div className="w-[16px] h-[16px] rounded-full shrink-0" style={{ border: "1.5px dashed var(--color-border)" }} />
          <span className="text-[13px]">+ Add reminder</span>
        </button>
      )}

      {completed.length > 0 && (
        <div className="mt-8">
          <SectionLabel label="Completed" count={completed.length} />
          {completed.map((r) => (
            <PanelReminderRow key={r.id} reminder={r} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Placeholder tab ───────────────────────────────────────────────────────────

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-1" style={{ background: "var(--color-cream)" }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-grey)" strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <path d="M5 8h6M5 5.5h4M5 10.5h3" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>{name}</p>
      <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Coming soon</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const WORKSPACE_TABS = ["Overview", "Tasks", "Notes", "Reminders", "Files"] as const;
type WorkspaceTab = typeof WORKSPACE_TABS[number];

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ProjectDetailPanel({ project: initialProject, onClose }: Props) {
  const [localProject, setLocalProject] = useState<Project>(initialProject);
  const [tasks, setTasks]               = useState<Task[]>(initialProject.tasks ?? []);
  const [notes, setNotes]               = useState<Note[]>([]);
  const [reminders, setReminders]       = useState<Reminder[]>([]);
  const [activeTab, setActiveTab]       = useState<WorkspaceTab>("Overview");

  useEffect(() => {
    setLocalProject(initialProject);
    setTasks(initialProject.tasks ?? []);
    setActiveTab("Overview");

    const supabase = createClient();
    Promise.all([
      supabase.from("notes").select("*").eq("project_id", initialProject.id).order("updated_at", { ascending: false }),
      supabase.from("reminders").select("*").eq("project_id", initialProject.id).order("due_date", { ascending: true, nullsFirst: false }),
    ]).then(([{ data: n }, { data: r }]) => {
      if (n) setNotes(n as Note[]);
      if (r) setReminders(r as Reminder[]);
    });
  }, [initialProject.id]);

  async function handleUpdate(field: string, value: unknown) {
    setLocalProject((prev) => ({ ...prev, [field]: value }));
    const supabase = createClient();
    await supabase.from("projects").update({ [field]: value }).eq("id", localProject.id);
  }

  async function handleToggleTask(task: Task) {
    const updated = !task.completed;
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: updated } : t));
    const supabase = createClient();
    await supabase.from("tasks").update({ completed: updated }).eq("id", task.id);
  }

  async function handleAddTask(title: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("tasks")
      .insert({ project_id: localProject.id, user_id: user.id, title })
      .select()
      .single();
    if (data) setTasks((prev) => [...prev, data as Task]);
  }

  function handleAddNote(note: Note) {
    setNotes((prev) => [note, ...prev]);
  }

  async function handleDeleteNote(id: string) {
    const supabase = createClient();
    await supabase.from("notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleCreateReminder(title: string, dueDate: string | null) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload: Record<string, unknown> = { user_id: user.id, project_id: localProject.id, title };
    if (dueDate) payload.due_date = dueDate;
    const { data } = await supabase.from("reminders").insert(payload).select().single();
    if (data) setReminders((prev) => [...prev, data as Reminder]);
  }

  function handleUpdateReminder(id: string, fields: Partial<Reminder>) {
    setReminders((prev) => prev.map((r) => r.id === id ? { ...r, ...fields } : r));
  }

  async function handleToggleReminder(r: Reminder) {
    const completed = !r.completed;
    setReminders((prev) => prev.map((rem) => rem.id === r.id ? { ...rem, completed } : rem));
    const supabase = createClient();
    await supabase.from("reminders").update({ completed }).eq("id", r.id);
  }

  async function handleDeleteReminder(id: string) {
    const supabase = createClient();
    await supabase.from("reminders").delete().eq("id", id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-10 cursor-pointer"
        style={{ background: "rgba(20,18,16,0.52)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
        onClick={onClose}
      />

      {/* Expand button */}
      <button
        className="fixed z-20 w-[28px] h-[28px] flex items-center justify-center rounded-full transition-colors"
        style={{
          top: "60px",
          left: "calc(56px + 6px)",
          background: "rgba(255,255,255,0.14)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "0.5px solid rgba(255,255,255,0.22)",
          color: "rgba(255,255,255,0.8)",
        }}
        title="Expand to full screen (coming soon)"
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
      >
        <Expand size={12} strokeWidth={1.75} />
      </button>

      {/* Floating panel */}
      <div
        className="fixed z-20 flex overflow-hidden"
        style={{
          top: "52px",
          bottom: "32px",
          left: "calc(56px + 32px)",
          right: "32px",
          background: "var(--color-off-white)",
          borderRadius: "12px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
          border: "0.5px solid var(--color-border)",
        }}
      >
        {/* Left: properties */}
        <PropsPanel project={localProject} onUpdate={handleUpdate} />

        {/* Right: workspace */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--color-warm-white)", borderRadius: "0 12px 12px 0" }}>
          {/* Tab bar */}
          <div
            className="flex items-center px-7 shrink-0"
            style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)", borderRadius: "0 12px 0 0" }}
          >
            {WORKSPACE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-[13px] text-[12px] transition-colors"
                style={{
                  color: activeTab === tab ? "var(--color-charcoal)" : "#6b6860",
                  fontWeight: activeTab === tab ? 600 : 400,
                  borderBottom: `2px solid ${activeTab === tab ? "var(--color-charcoal)" : "transparent"}`,
                  marginBottom: "-0.5px",
                  background: "transparent",
                }}
              >
                {tab}
                {tab === "Notes" && notes.length > 0 && (
                  <span className="ml-1.5 text-[9px] px-[5px] py-[1px] rounded-full" style={{ background: "var(--color-cream)", color: "var(--color-grey)" }}>
                    {notes.length}
                  </span>
                )}
                {tab === "Reminders" && reminders.filter((r) => !r.completed).length > 0 && (
                  <span className="ml-1.5 text-[9px] px-[5px] py-[1px] rounded-full" style={{ background: "var(--color-cream)", color: "var(--color-grey)" }}>
                    {reminders.filter((r) => !r.completed).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-7">
            {activeTab === "Overview" && (
              <OverviewTab
                project={localProject}
                tasks={tasks}
                notes={notes}
                reminders={reminders}
                onToggle={handleToggleTask}
                onAddNote={handleAddNote}
                onToggleReminder={handleToggleReminder}
              />
            )}
            {activeTab === "Tasks" && (
              <TasksTab project={localProject} tasks={tasks} onToggle={handleToggleTask} onAdd={handleAddTask} />
            )}
            {activeTab === "Notes" && (
              <ProjectNotesTab
                projectId={localProject.id}
                notes={notes}
                onAdd={handleAddNote}
                onDelete={handleDeleteNote}
              />
            )}
            {activeTab === "Reminders" && (
              <ProjectRemindersTab
                projectId={localProject.id}
                reminders={reminders}
                onCreate={handleCreateReminder}
                onToggle={handleToggleReminder}
                onUpdate={handleUpdateReminder}
                onDelete={handleDeleteReminder}
              />
            )}
            {activeTab === "Files" && <PlaceholderTab name="Files" />}
          </div>
        </div>
      </div>
    </>
  );
}
