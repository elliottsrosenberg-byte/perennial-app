"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Project, Task, Note, Contact, ProjectType, ProjectStatus, ProjectPriority } from "@/types/database";
import { Maximize2, Minimize2, X, Settings, FileText, CheckSquare, FolderOpen, Trash2, Pencil, Plus, Link2, ExternalLink, Users, Mail, Phone } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useEditor, EditorContent } from "@tiptap/react";
import { getRichExtensions, RichToolbar, InlineAshPopover } from "@/components/ui/RichEditor";
import type { AshPromptState } from "@/components/ui/RichEditor";

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionTab = "canvas" | "tasks" | "notes" | "files" | "contacts";

interface ProjectFile {
  id:         string;
  project_id: string;
  user_id:    string;
  name:       string;
  url:        string;
  file_type:  string | null;
  size_bytes: number | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(due: string | null) {
  return !!due && new Date(due + "T23:59:59") < new Date();
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Options ───────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: "furniture",      label: "Furniture" },
  { value: "sculpture",      label: "Sculpture" },
  { value: "painting",       label: "Painting"  },
  { value: "client_project", label: "Client"    },
];

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning",    label: "Planning"    },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold",     label: "On Hold"     },
  { value: "complete",    label: "Complete"    },
  { value: "cut",         label: "Cut"         },
];

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string }[] = [
  { value: "high",   label: "High"   },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low"    },
];

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  furniture:      { bg: "#f0ebe0",                  color: "#b8860b"                   },
  sculpture:      { bg: "#f0ebe0",                  color: "#b8860b"                   },
  painting:       { bg: "rgba(37,99,171,0.10)",     color: "#2563ab"                   },
  client_project: { bg: "#e0eaf5",                  color: "#2563ab"                   },
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  planning:    { bg: "rgba(155,163,122,0.14)", color: "#6b6860"                      },
  in_progress: { bg: "rgba(141,208,71,0.15)",  color: "#5a7040"                      },
  on_hold:     { bg: "rgba(232,197,71,0.15)",  color: "#a07800"                      },
  complete:    { bg: "rgba(141,208,71,0.12)",  color: "#3d6b4f"                      },
  cut:         { bg: "rgba(220,62,13,0.08)",   color: "var(--color-red-orange)"      },
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  high:   { bg: "rgba(220,62,13,0.10)",   color: "var(--color-red-orange)" },
  medium: { bg: "rgba(232,197,71,0.15)",  color: "#a07800"                 },
  low:    { bg: "rgba(155,163,122,0.12)", color: "#5a7040"                 },
};

// ── CustomSelect ──────────────────────────────────────────────────────────────

function CustomSelect<T extends string>({
  label, value, options, tagStyle, onSave,
}: {
  label:    string;
  value:    T;
  options:  readonly { value: T; label: string }[];
  tagStyle: { bg: string; color: string };
  onSave:   (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex justify-between items-center py-[5px]" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
      <span className="text-[11px] shrink-0 mr-3" style={{ color: "var(--color-grey)" }}>{label}</span>
      <div ref={ref} style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(v => !v)}
          className="text-[10px] font-medium px-[8px] py-[2px] rounded-full flex items-center gap-[5px]"
          style={{ background: tagStyle.bg, color: tagStyle.color, border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          {selected?.label ?? value}
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M1 2.5l3 3 3-3"/>
          </svg>
        </button>
        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 3px)", zIndex: 200,
            background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
            borderRadius: 9, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", overflow: "hidden", minWidth: 120,
          }}>
            {options.map(o => (
              <button
                key={o.value}
                onClick={() => { onSave(o.value); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "6px 10px", fontSize: 11,
                  background: o.value === value ? "var(--color-surface-sunken)" : "transparent",
                  border: "none", cursor: "pointer", color: "var(--color-text-secondary)",
                  fontWeight: o.value === value ? 600 : 400, fontFamily: "inherit",
                }}
                onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DatePillField ─────────────────────────────────────────────────────────────
// Compact inline date control used in the project property rows. Always visible
// (even when empty) so users see a "Pick a date" affordance without first
// clicking an em-dash.

function DatePillField({
  value, onChange, onClear, alert = false,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  onClear?: () => void;
  alert?: boolean;
}) {
  const [open, setOpen]       = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const yr = (value ?? new Date()).getFullYear();
  const mo = (value ?? new Date()).getMonth();
  const [view, setView] = useState({ yr, mo });
  useEffect(() => { setView({ yr, mo }); }, [yr, mo]);

  const today        = new Date();
  const daysInMonth  = new Date(view.yr, view.mo + 1, 0).getDate();
  const firstDow     = new Date(view.yr, view.mo, 1).getDay();
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW    = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const cells  = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const isSel = (d: number) =>
    !!value && value.getDate() === d && value.getMonth() === view.mo && value.getFullYear() === view.yr;
  const isTo  = (d: number) =>
    today.getDate() === d && today.getMonth() === view.mo && today.getFullYear() === view.yr;

  const label = value
    ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Pick a date";

  const filled = !!value;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 9px", borderRadius: 999,
          fontSize: 10, fontWeight: 500,
          fontFamily: "inherit",
          background: filled
            ? (alert ? "rgba(220,62,13,0.10)" : "var(--color-surface-sunken)")
            : "transparent",
          color: alert
            ? "var(--color-red-orange)"
            : filled
              ? "#6b6860"
              : "var(--color-grey)",
          border: `0.5px ${filled ? "solid" : "dashed"} ${alert ? "rgba(220,62,13,0.35)" : "var(--color-border-strong)"}`,
          cursor: "pointer",
          transition: "background 0.1s ease, border-color 0.1s ease",
        }}
        onMouseEnter={e => {
          if (!filled) e.currentTarget.style.borderColor = "var(--color-sage)";
          if (!filled) e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        onMouseLeave={e => {
          if (!filled) e.currentTarget.style.borderColor = "var(--color-border-strong)";
          if (!filled) e.currentTarget.style.color = "var(--color-grey)";
        }}
      >
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/>
        </svg>
        {label}
      </button>

      {filled && hovered && onClear && (
        <button
          onClick={onClear}
          aria-label="Clear date"
          title="Clear"
          style={{
            background: "transparent", border: "none", padding: 0,
            color: "var(--color-grey)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60,
          width: 232,
          background: "var(--color-surface-raised)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
          padding: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button
              onClick={() => setView(v => ({ yr: v.mo === 0 ? v.yr - 1 : v.yr, mo: v.mo === 0 ? 11 : v.mo - 1 }))}
              style={{ width: 24, height: 24, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
            >‹</button>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {MONTHS[view.mo]} {view.yr}
            </span>
            <button
              onClick={() => setView(v => ({ yr: v.mo === 11 ? v.yr + 1 : v.yr, mo: v.mo === 11 ? 0 : v.mo + 1 }))}
              style={{ width: 24, height: 24, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
            >›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DOW.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) =>
              day === null ? <div key={`e${i}`} /> : (
                <button
                  key={day}
                  onClick={() => { onChange(new Date(view.yr, view.mo, day)); setOpen(false); }}
                  style={{
                    width: "100%", aspectRatio: "1", borderRadius: 6, border: "none",
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    fontWeight:  isSel(day) ? 600 : 400,
                    background:  isSel(day) ? "var(--color-sage)" : "transparent",
                    color:       isSel(day) ? "white" : isTo(day) ? "var(--color-sage)" : "var(--color-text-primary)",
                    outline:     isTo(day) && !isSel(day) ? "1.5px solid var(--color-sage)" : "none",
                    outlineOffset: -1,
                    transition:  "background 0.08s ease",
                  }}
                  onMouseEnter={e => { if (!isSel(day)) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={e => { if (!isSel(day)) e.currentTarget.style.background = "transparent"; }}
                >{day}</button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── EditableField ─────────────────────────────────────────────────────────────

function EditableField({ label, display, editDefault, inputType = "text", placeholder, onSave, alert = false }: {
  label: string; display: string; editDefault: string;
  inputType?: "text" | "number" | "date"; placeholder?: string;
  onSave: (raw: string) => void; alert?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(editDefault);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && inputType !== "date") inputRef.current?.focus(); }, [editing, inputType]);
  useEffect(() => { setDraft(editDefault); }, [editDefault]);

  function commit(raw?: string) { onSave((raw ?? draft).trim()); setEditing(false); }
  function cancel() { setDraft(editDefault); setEditing(false); }

  // ── Date input renders as an always-visible "Pick a date" pill so users
  // don't have to click an em-dash to discover they can set a date.
  if (inputType === "date") {
    const hasValue = !!editDefault;
    return (
      <div
        className="flex justify-between items-center py-[5px]"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[11px] shrink-0 mr-3" style={{ color: "var(--color-grey)" }}>{label}</span>
        <DatePillField
          value={editDefault ? new Date(editDefault + "T12:00:00") : null}
          onChange={d => onSave(toISODate(d))}
          onClear={hasValue ? () => onSave("") : undefined}
          alert={alert}
        />
      </div>
    );
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
          ref={inputRef} type={inputType} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit()} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          className="text-[11px] text-right bg-transparent focus:outline-none"
          style={{ color: "#6b6860", borderBottom: "1px solid var(--color-sage)", maxWidth: "130px", minWidth: "60px" }}
          placeholder={placeholder}
        />
      ) : (
        <div className="flex items-center gap-1.5 cursor-text" onClick={() => setEditing(true)}>
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

// ── EditableTitle ─────────────────────────────────────────────────────────────

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    if (draft.trim()) onSave(draft.trim());
    else setDraft(value);
    setEditing(false);
  }

  return editing ? (
    <input
      ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
      className="w-full font-bold bg-transparent focus:outline-none"
      style={{ fontSize: "17px", color: "var(--color-charcoal)", borderBottom: "1px solid var(--color-sage)", padding: "2px 0", lineHeight: 1.3 }}
    />
  ) : (
    <h2
      onClick={() => setEditing(true)}
      className="font-bold cursor-text leading-snug"
      style={{ fontSize: "17px", color: "var(--color-charcoal)" }}
    >
      {value}
    </h2>
  );
}

// ── EditableDescription ───────────────────────────────────────────────────────

function EditableDescription({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() { onSave(draft.trim() || null); setEditing(false); }

  return (
    <div className="mb-4">
      {editing ? (
        <textarea
          ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit} rows={3} placeholder="Add a description…"
          className="w-full text-[11px] leading-relaxed bg-transparent focus:outline-none resize-none"
          style={{ color: "#6b6860", border: "0.5px solid var(--color-sage)", borderRadius: "6px", padding: "5px 7px" }}
        />
      ) : (
        <div onClick={() => setEditing(true)} className="cursor-text">
          {value
            ? <p className="text-[11px] leading-relaxed" style={{ color: "#6b6860" }}>{value}</p>
            : <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Add a description…</p>
          }
        </div>
      )}
    </div>
  );
}

// ── CanvasEditor ──────────────────────────────────────────────────────────────

function CanvasEditor({
  projectId, initialHtml, onSaved,
}: {
  projectId:   string;
  initialHtml: string | null;
  onSaved:     (html: string | null) => void;
}) {
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [ashPrompt, setAshPrompt] = useState<AshPromptState>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAshTrigger = useCallback(
    (pos: number, coords: { top: number; left: number; bottom: number }) => {
      setAshPrompt({ pos, anchor: coords });
    },
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: getRichExtensions({ placeholder: "Start writing…", onAshTrigger: handleAshTrigger }),
    content: initialHtml ?? "",
    onUpdate({ editor }) {
      scheduleSave(editor.getHTML());
    },
    editorProps: {
      attributes: { style: "outline: none; min-height: 300px; font-size: 14px; line-height: 1.8; color: #6b6860;" },
    },
  }, [projectId]);

  // Flush pending save on unmount — and lift the final HTML up to the parent
  // so the next remount (e.g. switching back to the Canvas tab) loads the
  // freshest content instead of the stale snapshot from the initial fetch.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        const html = editor?.getHTML() ?? "";
        createClient().from("projects").update({ canvas_html: html || null }).eq("id", projectId);
        onSaved(html || null);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function scheduleSave(html: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true); setSaved(false);
    saveTimer.current = setTimeout(async () => {
      await createClient().from("projects").update({ canvas_html: html || null }).eq("id", projectId);
      onSaved(html || null);
      setSaving(false); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }

  async function handleAshSubmit(prompt: string) {
    if (!editor || !ashPrompt) return;
    const context = editor.getText().slice(0, 800);
    const res = await fetch("/api/notes/ash-inline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, noteContext: context }),
    });
    const { text } = await res.json() as { text: string };
    if (text) editor.chain().focus().setTextSelection(ashPrompt.pos).insertContent(text).run();
    setAshPrompt(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      <RichToolbar editor={editor} />

      <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)" }}>
        <div style={{ maxWidth: 760, padding: "36px 60px 80px" }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", padding: "5px 20px", borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)", flexShrink: 0 }}>
        {saving  && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Saving…</span>}
        {!saving && saved && <span style={{ fontSize: 10, color: "var(--color-sage)" }}>✓ Saved</span>}
      </div>

      {ashPrompt && (
        <InlineAshPopover anchor={ashPrompt.anchor} onSubmit={handleAshSubmit} onClose={() => setAshPrompt(null)} />
      )}
    </div>
  );
}

// ── Task inline pickers (mirrors TasksClient style) ───────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  high: "var(--color-red-orange)", medium: "#b8860b", low: "var(--color-text-tertiary)",
};
const PRIORITY_LABELS: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

function toISODateTask(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function taskTodayMidnight(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDueChipLabel(due: string | null): string | null {
  if (!due) return null;
  const days = Math.round((new Date(due + "T00:00:00").getTime() - taskTodayMidnight().getTime()) / 86400000);
  if (days < 0)   return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 14) return `${days} days`;
  return new Date(due + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDueChipColor(due: string | null): string {
  if (!due) return "var(--color-text-tertiary)";
  const days = Math.round((new Date(due + "T00:00:00").getTime() - taskTodayMidnight().getTime()) / 86400000);
  if (days < 0)  return "var(--color-red-orange)";
  if (days <= 1) return "#a07800";
  if (days <= 7) return "var(--color-text-secondary)";
  return "var(--color-text-tertiary)";
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

  const label = getDueChipLabel(value);
  const labelColor = value ? getDueChipColor(value) : "var(--color-text-tertiary)";

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

function TaskPriorityPicker({ value, onChange, align = "right" }: {
  value: "high" | "medium" | "low" | null; onChange: (v: "high" | "medium" | "low" | null) => void; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const dotColor = value ? PRIORITY_DOT[value] : "var(--color-border-strong)";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 8px", borderRadius: 9999,
        border: `0.5px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
        background: value ? "var(--color-surface-sunken)" : "transparent",
        color: value ? PRIORITY_DOT[value] : "var(--color-text-tertiary)",
        cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.1s ease",
      }}
      onMouseEnter={e => { if (!value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
      onMouseLeave={e => { if (!value) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        {value ? PRIORITY_LABELS[value] : "Priority"}
      </button>
      {open && (
        <div style={{
          position: "absolute", [align === "right" ? "right" : "left"]: 0, top: "calc(100% + 5px)", zIndex: 200, minWidth: 130,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {value && <button type="button" onClick={() => { onChange(null); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 11, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          ><div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-border-strong)" }} />None</button>}
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
            ><div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT[p] }} />{PRIORITY_LABELS[p]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ProjectTaskRow ────────────────────────────────────────────────────────────

function ProjectTaskRow({
  task, onToggle, onUpdate,
}: {
  task:     Task;
  onToggle: (id: string, completed: boolean) => void;
  onUpdate: (id: string, fields: Partial<Task>) => void;
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

  function getDueDays(due: string | null) {
    if (!due) return null;
    const d = new Date(); d.setHours(0,0,0,0);
    const diff = Math.round((new Date(due + "T00:00:00").getTime() - d.getTime()) / 86400000);
    if (diff < 0)  return { label: "Overdue",  color: "var(--color-red-orange)" };
    if (diff === 0) return { label: "Today",   color: "#a07800" };
    if (diff === 1) return { label: "Tomorrow", color: "#a07800" };
    if (diff <= 14) return { label: `${diff}d`, color: "var(--color-text-tertiary)" };
    return { label: new Date(due + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: "var(--color-text-tertiary)" };
  }

  const due = getDueDays(task.due_date);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 9, padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border)",
        background: hovered && !task.completed ? "rgba(0,0,0,0.015)" : "transparent",
        opacity: task.completed ? 0.5 : 1,
        transition: "opacity 0.25s ease, background 0.08s ease",
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
            <TaskPriorityPicker
              value={task.priority}
              onChange={p => onUpdate(task.id, { priority: p })}
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
        <span style={{ fontSize: 10, fontWeight: 500, color: getDueChipColor(task.due_date), flexShrink: 0, whiteSpace: "nowrap" }}>
          {getDueChipLabel(task.due_date)}
        </span>
      )}
    </div>
  );
}

// ── ProjectTasksTab ───────────────────────────────────────────────────────────

function ProjectTasksTab({
  projectId, tasks, setTasks,
}: {
  projectId: string;
  tasks:     Task[];
  setTasks:  React.Dispatch<React.SetStateAction<Task[]>>;
}) {
  const [newTitle,      setNewTitle]      = useState("");
  const [newPriority,   setNewPriority]   = useState<"high" | "medium" | "low" | null>(null);
  const [newDueDate,    setNewDueDate]    = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading,       setLoading]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      user_id: user.id, project_id: projectId, title: newTitle.trim(),
      completed: false, priority: newPriority, due_date: newDueDate,
    }).select().single();
    if (data) setTasks(prev => [...prev, data as Task]);
    setNewTitle(""); setNewPriority(null); setNewDueDate(null);
    setLoading(false);
    inputRef.current?.focus();
  }

  async function handleToggle(id: string, newCompleted: boolean) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: newCompleted } : t));
    await createClient().from("tasks").update({ completed: newCompleted }).eq("id", id);
  }

  async function handleUpdate(id: string, fields: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    await createClient().from("tasks").update(fields).eq("id", id);
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
          <TaskPriorityPicker value={newPriority} onChange={setNewPriority} />
          <TaskDatePicker value={newDueDate} onChange={setNewDueDate} onClear={() => setNewDueDate(null)} />
          {newTitle.trim() && (
            <button onClick={addTask} disabled={loading} style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", flexShrink: 0 }}>
              Add
            </button>
          )}
        </div>

        {active.map(task => <ProjectTaskRow key={task.id} task={task} onToggle={handleToggle} onUpdate={handleUpdate} />)}

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
            onMouseEnter={e => e.currentTarget.style.color = "#6b6860"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              style={{ transform: showCompleted ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
              <path d="M2 1l4 3-4 3"/>
            </svg>
            {showCompleted ? `Hide completed (${completed.length})` : `Show completed (${completed.length})`}
          </button>
        </div>

        {showCompleted && completed.map(task => <ProjectTaskRow key={task.id} task={task} onToggle={handleToggle} onUpdate={handleUpdate} />)}
      </div>
    </div>
  );
}

// ── InlineNoteEditor ──────────────────────────────────────────────────────────
// Auto-saves on title and content changes (debounced). Mirrors the Notes
// module's pattern — title up top, content below, no manual Save click.

function InlineNoteEditor({
  note, onDirtyChange, onDone, onDelete,
}: {
  note:          Note;
  onDirtyChange: (patch: Partial<Note>) => void; // local state sync for parent list
  onDone:        () => void;
  onDelete:      (id: string) => void;
}) {
  const [title, setTitle]   = useState(note.title ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist title + content changes with a small debounce so quick typing
  // doesn't pile up DB writes. Updates parent's note state too so the list
  // view shows the latest title/snippet immediately on Done.
  const persist = useCallback((fields: Partial<Note>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const updates = { ...fields, updated_at: new Date().toISOString() };
      await createClient().from("notes").update(updates).eq("id", note.id);
      onDirtyChange(updates);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    }, 500);
  }, [note.id, onDirtyChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: getRichExtensions({ placeholder: "Start writing…" }),
    content: note.content ?? "",
    onUpdate({ editor }) {
      persist({ content: editor.getHTML() || null });
    },
    editorProps: {
      attributes: { style: "outline: none; min-height: 140px; font-size: 13px; line-height: 1.7; color: var(--color-text-secondary);" },
    },
  }, [note.id]);

  // Auto-focus the title for newly-created (empty) notes so the user can
  // name it right away — matching the Notes module flow.
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!note.title && !note.content) titleRef.current?.focus();
  }, [note.title, note.content]);

  // Flush any pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function changeTitle(v: string) {
    setTitle(v);
    persist({ title: v.trim() || null });
  }

  return (
    <div style={{
      borderRadius: 10,
      background: "var(--color-surface-raised)",
      border: "0.5px solid var(--color-sage)",
      boxShadow: "0 0 0 2px rgba(155,163,122,0.15)",
      overflow: "hidden",
      marginBottom: 10,
    }}>
      <RichToolbar editor={editor} />
      <div style={{ padding: "12px 16px 8px" }}>
        <input
          ref={titleRef}
          value={title}
          onChange={e => changeTitle(e.target.value)}
          placeholder="Untitled note"
          style={{
            width: "100%",
            fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em",
            color: "var(--color-charcoal)",
            background: "transparent", border: "none", outline: "none",
            marginBottom: 8, fontFamily: "var(--font-display)",
          }}
        />
        <div onClick={() => editor?.chain().focus().run()}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px",
        borderTop: "0.5px solid var(--color-border)",
        background: "var(--color-off-white)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a
            href={`/notes?id=${note.id}`}
            style={{ fontSize: 10, color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-sage)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
          >
            <ExternalLink size={10} strokeWidth={1.75} /> Open in Notes
          </a>
          {status !== "idle" && (
            <span style={{ fontSize: 10, color: status === "saved" ? "var(--color-sage)" : "var(--color-text-tertiary)" }}>
              {status === "saving" ? "Saving…" : "✓ Saved"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-tertiary)", fontFamily: "inherit" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-tertiary)"}
          >Delete</button>
          <button
            type="button"
            onClick={onDone}
            style={{ fontSize: 11, padding: "4px 14px", borderRadius: 5, border: "none", background: "var(--color-sage)", color: "white", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
          >Done</button>
        </div>
      </div>
    </div>
  );
}

// ── NotesTab ──────────────────────────────────────────────────────────────────

function NotesTab({ projectId, notes, setNotes }: { projectId: string; notes: Note[]; setNotes: React.Dispatch<React.SetStateAction<Note[]>> }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Mirrors NotesClient.createNote: insert an empty note and open it for
  // editing right away, so the user names + writes from a clean slate.
  async function createNote() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: user.id, project_id: projectId, title: null, content: null })
      .select()
      .single();
    if (data) {
      const fresh = data as Note;
      setNotes(prev => [fresh, ...prev]);
      setEditingId(fresh.id);
    }
  }

  function handleDirtyChange(id: string, patch: Partial<Note>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }

  async function handleDelete(id: string) {
    await createClient().from("notes").delete().eq("id", id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (editingId === id) setEditingId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "0.5px solid var(--color-border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={createNote}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 6,
            fontSize: 11, fontWeight: 500,
            background: "var(--color-sage)", color: "white",
            border: "none", cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.12s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-sage-hover)"}
          onMouseLeave={e => e.currentTarget.style.background = "var(--color-sage)"}
        >
          <Plus size={12} strokeWidth={2.25} />
          New note
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {notes.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: "var(--color-grey)" }}>
            <FileText size={28} strokeWidth={1.25} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 12 }}>No notes yet</p>
            <button
              type="button"
              onClick={createNote}
              style={{
                marginTop: 4, padding: "5px 12px", borderRadius: 6,
                fontSize: 11, fontWeight: 500,
                background: "transparent", color: "var(--color-sage)",
                border: "0.5px solid var(--color-sage)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              + Create your first note
            </button>
          </div>
        )}
        {notes.map(note => {
          const isEditing = editingId === note.id;
          const snippet   = note.content ? note.content.replace(/<[^>]*>/g, " ").trim().slice(0, 120) : null;

          if (isEditing) {
            return (
              <InlineNoteEditor
                key={note.id}
                note={note}
                onDirtyChange={(patch) => handleDirtyChange(note.id, patch)}
                onDone={() => setEditingId(null)}
                onDelete={handleDelete}
              />
            );
          }

          return (
            <div
              key={note.id}
              onClick={() => setEditingId(note.id)}
              style={{ padding: "12px 14px", marginBottom: 8, borderRadius: 10, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", cursor: "pointer", transition: "border-color 0.1s ease" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--color-border-strong)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-border)")}
            >
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)", letterSpacing: "-0.01em", color: note.title ? "var(--color-charcoal)" : "var(--color-text-tertiary)", marginBottom: 4 }}>
                {note.title ?? "Untitled note"}
              </p>
              {snippet
                ? <p style={{ fontSize: 11.5, color: "#6b6860", lineHeight: 1.6, marginBottom: 4 }}>{snippet}{note.content && note.content.length > 120 ? "…" : ""}</p>
                : <p style={{ fontSize: 11, color: "var(--color-grey)", fontStyle: "italic", marginBottom: 4 }}>Empty</p>
              }
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{timeAgo(note.updated_at)}</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(note.id); }}
                  style={{ fontSize: 10, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
                >Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FilesTab ──────────────────────────────────────────────────────────────────

type AddMode = "upload" | "link" | null;

function FilesTab({ projectId }: { projectId: string }) {
  const [files,     setFiles]     = useState<ProjectFile[]>([]);
  const [addMode,   setAddMode]   = useState<AddMode>(null);
  const [newName,   setNewName]   = useState("");
  const [newUrl,    setNewUrl]    = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient().from("project_files").select("*").eq("project_id", projectId).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setFiles(data as ProjectFile[]); setLoading(false); });
  }, [projectId]);

  async function saveToDb(name: string, url: string, fileType: string | null, sizeBytes: number | null) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("project_files")
      .insert({ project_id: projectId, user_id: user.id, name, url, file_type: fileType, size_bytes: sizeBytes })
      .select().single();
    if (data) setFiles(prev => [data as ProjectFile, ...prev]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext  = file.name.split(".").pop()?.toLowerCase() ?? "";
      const path = `${projectId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("project-files").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
      await saveToDb(file.name, urlData.publicUrl, ext, file.size);
    } finally {
      setUploading(false);
      setAddMode(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function addLink() {
    if (!newName.trim() || !newUrl.trim()) return;
    const ext = newUrl.split(".").pop()?.toLowerCase().split("?")[0] ?? null;
    await saveToDb(newName.trim(), newUrl.trim(), ext, null);
    setNewName(""); setNewUrl(""); setAddMode(null);
  }

  async function deleteFile(id: string) {
    await createClient().from("project_files").delete().eq("id", id);
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  function fileIcon(type: string | null) {
    if (!type) return <Link2 size={14} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />;
    if (["jpg","jpeg","png","gif","webp","svg"].includes(type)) return <span style={{ fontSize: 14 }}>🖼</span>;
    if (type === "pdf") return <span style={{ fontSize: 14 }}>📄</span>;
    if (["doc","docx"].includes(type)) return <span style={{ fontSize: 14 }}>📝</span>;
    if (["xls","xlsx"].includes(type)) return <span style={{ fontSize: 14 }}>📊</span>;
    return <FolderOpen size={14} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />;
  }

  function fmtSize(bytes: number | null) {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <input
          ref={fileInputRef} type="file" style={{ display: "none" }}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => { setAddMode(addMode === "upload" ? null : "upload"); fileInputRef.current?.click(); }}
          disabled={uploading}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", opacity: uploading ? 0.6 : 1 }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Plus size={12} strokeWidth={2} />
          {uploading ? "Uploading…" : "Upload file"}
        </button>
        <button
          onClick={() => setAddMode(m => m === "link" ? null : "link")}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: addMode === "link" ? "var(--color-surface-sunken)" : "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit" }}
          onMouseEnter={e => { if (addMode !== "link") e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
          onMouseLeave={e => { if (addMode !== "link") e.currentTarget.style.background = "transparent"; }}
        >
          <Link2 size={12} strokeWidth={2} />
          Add link
        </button>
      </div>

      {/* Link form */}
      {addMode === "link" && (
        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, background: "var(--color-surface-sunken)" }}>
          <input
            autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Name (e.g. Brief v2)"
            style={{ fontSize: 12, padding: "5px 9px", border: "0.5px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-raised)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }}
          />
          <input
            value={newUrl} onChange={e => setNewUrl(e.target.value)}
            placeholder="URL — Google Drive, Dropbox, Figma…"
            onKeyDown={e => { if (e.key === "Enter") addLink(); if (e.key === "Escape") { setAddMode(null); setNewName(""); setNewUrl(""); } }}
            style={{ fontSize: 12, padding: "5px 9px", border: "0.5px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-raised)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addLink} style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer" }}>Save</button>
            <button onClick={() => { setAddMode(null); setNewName(""); setNewUrl(""); }} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, background: "transparent", border: "0.5px solid var(--color-border)", cursor: "pointer", color: "var(--color-grey)", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {loading && <p style={{ fontSize: 12, color: "var(--color-grey)" }}>Loading…</p>}
        {!loading && files.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 6, color: "var(--color-grey)" }}>
            <FolderOpen size={28} strokeWidth={1.25} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 12 }}>No files yet</p>
            <p style={{ fontSize: 11, textAlign: "center", maxWidth: 200, lineHeight: 1.5 }}>Upload images, PDFs, and documents, or add links to external files</p>
          </div>
        )}
        {files.map(file => (
          <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", marginBottom: 6, borderRadius: 9, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
            <span style={{ flexShrink: 0, width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>{fileIcon(file.file_type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
              <p style={{ fontSize: 10, color: "var(--color-grey)" }}>
                {file.file_type?.toUpperCase()}{file.size_bytes ? ` · ${fmtSize(file.size_bytes)}` : ""}
              </p>
            </div>
            <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-grey)", display: "flex", flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--color-charcoal)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--color-grey)")}
            >
              <ExternalLink size={13} strokeWidth={1.75} />
            </a>
            <button
              onClick={() => deleteFile(file.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-grey)", padding: 0, display: "flex", flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ContactsTab ───────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  active: "var(--color-sage)", lead: "#b8860b", inactive: "var(--color-grey)",
};

function ContactsTab({ projectId }: { projectId: string }) {
  const [contacts,    setContacts]    = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [search,      setSearch]      = useState("");
  const [showSearch,  setShowSearch]  = useState(false);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    createClient()
      .from("project_contacts")
      .select("contact:contacts(id, first_name, last_name, email, phone, title, status, tags)")
      .eq("project_id", projectId)
      .then(({ data }) => {
        if (data) setContacts(data.map((r: Record<string, unknown>) => r.contact as Contact).filter(Boolean));
        setLoading(false);
      });
  }, [projectId]);

  async function loadAll() {
    if (allContacts.length > 0) return;
    const { data } = await createClient().from("contacts")
      .select("id, first_name, last_name, email, phone, title, status, tags")
      .order("first_name");
    if (data) setAllContacts(data as Contact[]);
  }

  async function attach(c: Contact) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("project_contacts")
      .upsert({ project_id: projectId, contact_id: c.id, user_id: user.id }, { onConflict: "project_id,contact_id" });
    setContacts(prev => prev.some(x => x.id === c.id) ? prev : [...prev, c]);
    setSearch(""); setShowSearch(false);
  }

  // Create a new contact from the search query and attach it in one shot.
  // Splits the search on the first space — "Sarah Okonkwo" → first/last.
  async function createAndAttach() {
    const trimmed = search.trim();
    if (!trimmed) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const firstSpace = trimmed.indexOf(" ");
    const first = firstSpace > 0 ? trimmed.slice(0, firstSpace) : trimmed;
    const last  = firstSpace > 0 ? trimmed.slice(firstSpace + 1) : "";
    const { data: newContact } = await supabase
      .from("contacts")
      .insert({ user_id: user.id, first_name: first, last_name: last, status: "active" })
      .select("id, first_name, last_name, email, phone, title, status, tags")
      .single();
    if (!newContact) return;
    const c = newContact as Contact;
    setAllContacts(prev => [...prev, c]);
    await attach(c);
  }

  async function detach(id: string) {
    await createClient().from("project_contacts")
      .delete().eq("project_id", projectId).eq("contact_id", id);
    setContacts(prev => prev.filter(c => c.id !== id));
  }

  const searchResults = allContacts.filter(c =>
    !contacts.some(lc => lc.id === c.id) &&
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Attach bar */}
      <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        {showSearch ? (
          <div>
            <input
              autoFocus value={search}
              onChange={e => { setSearch(e.target.value); loadAll(); }}
              onKeyDown={e => { if (e.key === "Escape") { setShowSearch(false); setSearch(""); } }}
              placeholder="Search contacts to attach…"
              style={{ width: "100%", fontSize: 12, padding: "6px 10px", border: "0.5px solid var(--color-border)", borderRadius: 7, background: "var(--color-surface-sunken)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit", marginBottom: search ? 6 : 0 }}
            />
            {searchResults.map(c => (
              <button
                key={c.id} onClick={() => attach(c)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--color-grey)", flexShrink: 0 }}>
                  {c.first_name[0]}{c.last_name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.first_name} {c.last_name}</p>
                  {c.title && <p style={{ fontSize: 10, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>}
                </div>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[c.status] ?? "var(--color-grey)", flexShrink: 0 }} />
              </button>
            ))}
            {search.trim() && searchResults.length === 0 && (
              <div style={{ padding: "6px 4px 0" }}>
                <p style={{ fontSize: 11, color: "var(--color-grey)", padding: "0 6px 6px" }}>
                  No contact named &ldquo;{search.trim()}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={createAndAttach}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 9,
                    padding: "7px 10px", borderRadius: 7,
                    border: "0.5px dashed var(--color-sage)",
                    background: "rgba(155,163,122,0.06)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(155,163,122,0.12)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(155,163,122,0.06)"}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "var(--color-sage)", color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Plus size={14} strokeWidth={2.25} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)" }}>
                      Create &ldquo;{search.trim()}&rdquo;
                    </p>
                    <p style={{ fontSize: 10, color: "var(--color-grey)" }}>
                      Adds a new contact and attaches it to this project
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            onMouseEnter={e => e.currentTarget.style.color = "#6b6860"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
          >
            <Plus size={13} strokeWidth={2} />
            Attach contact
          </button>
        )}
      </div>

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {loading && <p style={{ fontSize: 12, color: "var(--color-grey)" }}>Loading…</p>}
        {!loading && contacts.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 6, color: "var(--color-grey)" }}>
            <Users size={28} strokeWidth={1.25} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: 12 }}>No contacts attached</p>
            <p style={{ fontSize: 11 }}>Attach contacts to track who's involved in this project</p>
          </div>
        )}
        {contacts.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 6, borderRadius: 10, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--color-cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--color-grey)", flexShrink: 0 }}>
              {c.first_name[0]}{c.last_name[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>{c.first_name} {c.last_name}</p>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_DOT[c.status] ?? "var(--color-grey)", flexShrink: 0 }} />
              </div>
              {c.title && <p style={{ fontSize: 10, color: "var(--color-grey)", marginTop: 1 }}>{c.title}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                {c.email && (
                  <a href={`mailto:${c.email}`} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--color-grey)", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--color-sage)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--color-grey)")}
                  >
                    <Mail size={10} strokeWidth={1.75} />{c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--color-grey)", textDecoration: "none" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--color-sage)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--color-grey)")}
                  >
                    <Phone size={10} strokeWidth={1.75} />{c.phone}
                  </a>
                )}
              </div>
            </div>
            <button
              onClick={() => detach(c.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-grey)", padding: 0, flexShrink: 0 }}
              title="Remove"
              onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AshStrip ──────────────────────────────────────────────────────────────────

function AshStrip({ project, activeTasks }: { project: Project; activeTasks: number }) {
  function generateContent(): { prompt: string; action: string; buttonLabel: string } {
    const t = project.title;
    const n = activeTasks;
    const tasks = `${n} open task${n !== 1 ? "s" : ""}`;

    if (project.due_date) {
      const days = Math.round((new Date(project.due_date + "T00:00:00").getTime() - Date.now()) / 86400000);
      if (days < 0 && n > 0) return {
        prompt:      `"${t}" is overdue with ${tasks} still open.`,
        action:      `Triage "${t}" — it's overdue with ${tasks}. Tell me what needs to move, what to drop, and the single most important next step.`,
        buttonLabel: "Triage tasks",
      };
      if (days >= 0 && days <= 7 && n > 0) return {
        prompt:      `"${t}" is due ${days === 0 ? "today" : `in ${days} day${days !== 1 ? "s" : ""}`} with ${tasks} open.`,
        action:      `Build a focused plan for "${t}" — it's due ${days === 0 ? "today" : `in ${days} days`} with ${tasks} still open. Prioritize ruthlessly.`,
        buttonLabel: "Build a plan",
      };
    }
    if (project.status === "on_hold") return {
      prompt:      `"${t}" is on hold. I can help figure out what's blocking it.`,
      action:      `Think through what's blocking "${t}" (currently on hold) and suggest a concrete path to get it moving again.`,
      buttonLabel: "Unblock it",
    };
    if (project.status === "planning") return {
      prompt:      `"${t}" is in planning — I can map out the key tasks and what to tackle first.`,
      action:      `Plan "${t}" from scratch — give me the key tasks, a rough timeline, and the single best place to start building momentum.`,
      buttonLabel: "Map it out",
    };
    if (project.status === "complete") return {
      prompt:      `"${t}" is complete. Want a quick wrap-up before moving on?`,
      action:      `Quick retrospective on "${t}" — what was accomplished, what to document, and any loose ends to tie off.`,
      buttonLabel: "Wrap it up",
    };
    if (n > 3) return {
      prompt:      `${n} open tasks on "${t}" — I can prioritise and flag what's at risk.`,
      action:      `Prioritize the ${n} open tasks for "${t}". Flag anything overdue or at risk, then give me a clear focus order.`,
      buttonLabel: "Prioritize tasks",
    };
    if (n > 0) return {
      prompt:      `"${t}" has ${tasks} — want a clear view of where things stand?`,
      action:      `Give me a focused view of "${t}" — look at the open tasks, any timeline pressure, and what I should do next.`,
      buttonLabel: "Where things stand",
    };
    return {
      prompt:      `I can pull together a full picture of where "${t}" stands right now.`,
      action:      `Give me a full rundown of "${t}" — status, what's in flight, any risks, and the clearest next move.`,
      buttonLabel: "Full rundown",
    };
  }

  const { prompt, action, buttonLabel } = generateContent();
  const projectDetail = { title: project.title, status: project.status, priority: project.priority };

  function handleContextual() {
    window.dispatchEvent(new CustomEvent("open-ash", {
      detail: { message: action, project: projectDetail },
    }));
  }

  function handleOpenAsh() {
    // No message — just opens the panel with project context but no auto-send
    window.dispatchEvent(new CustomEvent("open-ash", {
      detail: { project: projectDetail },
    }));
  }

  return (
    <div style={{
      flexShrink: 0,
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 18px", height: 56,
      background: "linear-gradient(135deg, #7a9a55 0%, #5a7a38 45%, #3a5228 100%)",
    }}>
      <img
        src="/Ash-Logomak.svg"
        alt=""
        style={{ width: 16, height: 16, flexShrink: 0, filter: "brightness(0) invert(1)", opacity: 0.9, animation: "ash-shimmer 4s ease-in-out infinite" }}
      />
      <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.88)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {prompt}
      </span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {/* Contextual action — sends a specific action statement */}
        <button
          onClick={handleContextual}
          style={{
            fontSize: 11, fontWeight: 700, color: "white",
            background: "rgba(255,255,255,0.22)", border: "0.5px solid rgba(255,255,255,0.35)",
            borderRadius: 9999, padding: "4px 12px",
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", lineHeight: 1,
            transition: "background 0.1s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.32)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
        >
          {buttonLabel} →
        </button>
        {/* Ask Ash — opens the dialogue without auto-sending */}
        <button
          onClick={handleOpenAsh}
          style={{
            fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.75)",
            background: "transparent", border: "0.5px solid rgba(255,255,255,0.25)",
            borderRadius: 9999, padding: "4px 12px",
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", lineHeight: 1,
            transition: "all 0.1s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
        >
          Ask Ash
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  project:    Project;
  onClose:    () => void;
  onUpdated?: (p: Project) => void;
  onDeleted?: (id: string) => void;
}

export default function ProjectDetailPanel({ project: initialProject, onClose, onUpdated, onDeleted }: Props) {
  const [localProject,   setLocalProject]   = useState<Project>(initialProject);
  const [tasks,          setTasks]          = useState<Task[]>(initialProject.tasks ?? []);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [canvasHtml,     setCanvasHtml]     = useState<string | null | undefined>(undefined);
  const [activeTab,      setActiveTab]      = useState<SectionTab>("canvas");
  const [maximized,      setMaximized]      = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [financeData,    setFinanceData]    = useState<{ hours: number; billableAmount: number; invoiceCount: number; invoiceTotal: number } | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState(false);

  // Hide the floating Ash button in scrim mode; broadcast project context for Ash
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("set-project-context", {
      detail: { title: localProject.title, status: localProject.status, priority: localProject.priority },
    }));
    if (!maximized) {
      const style = document.createElement("style");
      style.id = "project-panel-ash-hide";
      style.textContent = ".ash-fab { opacity: 0 !important; pointer-events: none !important; }";
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById("project-panel-ash-hide")?.remove();
    };
  }, [maximized, localProject.title, localProject.status, localProject.priority]);

  // Clear project context when panel unmounts
  useEffect(() => {
    return () => { window.dispatchEvent(new CustomEvent("clear-project-context")); };
  }, []);

  // Fetch finance data for this project
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("time_entries").select("duration_minutes, billable, project:projects(rate)").eq("project_id", initialProject.id),
      supabase.from("invoices").select("id, line_items:invoice_line_items(amount)").eq("project_id", initialProject.id).neq("status", "draft"),
    ]).then(([{ data: te }, { data: inv }]) => {
      const hours = (te ?? []).reduce((s, t) => s + t.duration_minutes, 0) / 60;
      const billable = (te ?? []).filter(t => t.billable);
      const rate = (initialProject as Project & { rate?: number }).rate ?? 0;
      const billableAmount = billable.reduce((s, t) => s + (t.duration_minutes / 60) * rate, 0);
      type Inv = { id: string; line_items: { amount: number }[] };
      const invs = (inv ?? []) as unknown as Inv[];
      const invoiceTotal = invs.reduce((s, i) => s + i.line_items.reduce((ss, l) => ss + Number(l.amount), 0), 0);
      setFinanceData({ hours: Math.round(hours * 10) / 10, billableAmount, invoiceCount: invs.length, invoiceTotal });
    });
  }, [initialProject.id, initialProject]);

  // Fetch fresh data on open — including canvas_html which is not in the server-rendered snapshot
  useEffect(() => {
    setLocalProject(initialProject);
    setTasks(initialProject.tasks ?? []);
    setActiveTab("canvas");
    setSettingsOpen(false);
    setCanvasHtml(undefined); // show loading state while fetching

    const supabase = createClient();
    Promise.all([
      supabase.from("notes").select("*").eq("project_id", initialProject.id).order("updated_at", { ascending: false }),
      supabase.from("tasks").select("*").eq("project_id", initialProject.id).order("created_at", { ascending: true }),
      supabase.from("projects").select("canvas_html").eq("id", initialProject.id).single(),
    ]).then(([{ data: n }, { data: t }, { data: p }]) => {
      if (n) setNotes(n as Note[]);
      if (t) setTasks(t as Task[]);
      setCanvasHtml(p?.canvas_html ?? null);
    });
  }, [initialProject.id]);

  // Refetch tasks + notes after each Ash turn — Ash may have created tasks
  // or notes via its tools, and those should appear without requiring the
  // user to close and reopen the panel.
  useEffect(() => {
    function refetchTasksAndNotes() {
      const supabase = createClient();
      const id = initialProject.id;
      Promise.all([
        supabase.from("tasks").select("*").eq("project_id", id).order("created_at", { ascending: true }),
        supabase.from("notes").select("*").eq("project_id", id).order("updated_at", { ascending: false }),
      ]).then(([{ data: t }, { data: n }]) => {
        if (t) setTasks(t as Task[]);
        if (n) setNotes(n as Note[]);
      });
    }
    window.addEventListener("ash:turn-complete", refetchTasksAndNotes);
    return () => window.removeEventListener("ash:turn-complete", refetchTasksAndNotes);
  }, [initialProject.id]);

  async function handleUpdate(field: string, value: unknown) {
    const updated = { ...localProject, [field]: value };
    setLocalProject(updated);
    onUpdated?.(updated);
    await createClient().from("projects").update({ [field]: value }).eq("id", localProject.id);
  }

  async function performDelete() {
    setConfirmDelete(false);
    await createClient().from("projects").delete().eq("id", localProject.id);
    onDeleted?.(localProject.id);
    onClose();
  }

  const typeStyle     = localProject.type ? (TYPE_STYLE[localProject.type] ?? { bg: "var(--color-cream)", color: "#6b6860" }) : { bg: "var(--color-cream)", color: "#6b6860" };
  const statusStyle   = STATUS_STYLE[localProject.status] ?? STATUS_STYLE.planning;
  const priorityStyle = PRIORITY_STYLE[localProject.priority] ?? PRIORITY_STYLE.medium;
  const isClient      = localProject.type === "client_project";
  const overdue       = isOverdue(localProject.due_date);

  const NAV_ITEMS: { key: SectionTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "canvas",   label: "Canvas",   icon: <FileText    size={13} strokeWidth={1.75} /> },
    { key: "tasks",    label: "Tasks",    icon: <CheckSquare size={13} strokeWidth={1.75} />, count: tasks.filter(t => !t.completed).length },
    { key: "contacts", label: "Contacts", icon: <Users       size={13} strokeWidth={1.75} /> },
    { key: "notes",    label: "Notes",    icon: <FileText    size={13} strokeWidth={1.75} />, count: notes.length },
    { key: "files",    label: "Files",    icon: <FolderOpen  size={13} strokeWidth={1.75} /> },
  ];

  return (
    <>
      {/* Scrim */}
      {!maximized && (
        <div
          className="fixed inset-0 z-10 cursor-pointer"
          style={{ background: "rgba(20,18,16,0.52)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className="fixed z-20 flex overflow-hidden"
        style={{
          top:    maximized ? 0 : "52px",
          bottom: maximized ? 0 : "32px",
          left:   maximized ? 0 : "calc(56px + 32px)",
          right:  maximized ? 0 : "32px",
          background:   "var(--color-off-white)",
          borderRadius: maximized ? 0 : 12,
          boxShadow:    "0 8px 40px rgba(0,0,0,0.22)",
          border:       "0.5px solid var(--color-border)",
          transition:   "top 0.2s ease, bottom 0.2s ease, left 0.2s ease, right 0.2s ease, border-radius 0.2s ease",
        }}
      >
        {/* ── Left sidebar ── */}
        <div style={{
          width: 252, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          borderRadius: maximized ? 0 : "12px 0 0 12px",
        }}>

          {/* Top: title, desc, tags */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 12px" }}>
            <EditableTitle value={localProject.title} onSave={v => handleUpdate("title", v)} />
            <EditableDescription value={localProject.description} onSave={v => handleUpdate("description", v)} />

            {/* Status / Type / Priority — labeled */}
            <div data-tour-target="projects.detail-properties" style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Tags</p>
              <CustomSelect<ProjectStatus>
                label="Status"   value={localProject.status}
                options={STATUS_OPTIONS} tagStyle={statusStyle}
                onSave={v => handleUpdate("status", v)}
              />
              {localProject.type && (
                <CustomSelect<ProjectType>
                  label="Type"   value={localProject.type}
                  options={TYPE_OPTIONS} tagStyle={typeStyle}
                  onSave={v => handleUpdate("type", v)}
                />
              )}
              <CustomSelect<ProjectPriority>
                label="Priority" value={localProject.priority}
                options={PRIORITY_OPTIONS} tagStyle={priorityStyle}
                onSave={v => handleUpdate("priority", v)}
              />
            </div>

            {/* Properties */}
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Timeline</p>
              <EditableField label="Start" display={fmt(localProject.start_date)} editDefault={localProject.start_date ?? ""} inputType="date" onSave={v => handleUpdate("start_date", v || null)} />
              <EditableField label="Due"   display={fmt(localProject.due_date)}   editDefault={localProject.due_date   ?? ""} inputType="date" onSave={v => handleUpdate("due_date",   v || null)} alert={overdue} />
            </div>

            {!isClient ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Details</p>
                <EditableField label="Price"      display={localProject.listing_price ? `$${localProject.listing_price.toLocaleString()}` : "—"} editDefault={localProject.listing_price?.toString() ?? ""} inputType="number" placeholder="0" onSave={v => handleUpdate("listing_price", v ? parseFloat(v) : null)} />
                <EditableField label="Dimensions" display={localProject.dimensions ?? "—"} editDefault={localProject.dimensions ?? ""} placeholder='84" × 38"' onSave={v => handleUpdate("dimensions", v || null)} />
                <EditableField label="Materials"  display={localProject.materials  ?? "—"} editDefault={localProject.materials  ?? ""} placeholder="White oak" onSave={v => handleUpdate("materials",  v || null)} />
                <EditableField label="Weight"     display={localProject.weight     ?? "—"} editDefault={localProject.weight     ?? ""} placeholder="~180 lbs"  onSave={v => handleUpdate("weight",     v || null)} />
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Client</p>
                <EditableField label="Name"  display={localProject.client_name ?? "—"} editDefault={localProject.client_name ?? ""} placeholder="Client name" onSave={v => handleUpdate("client_name", v || null)} />
                <EditableField label="Rate"  display={localProject.rate ? `$${localProject.rate}/hr` : "—"} editDefault={localProject.rate?.toString() ?? ""} inputType="number" placeholder="150" onSave={v => handleUpdate("rate", v ? parseFloat(v) : null)} />
                <EditableField label="Billed" display={`${localProject.billed_hours} hrs`} editDefault={localProject.billed_hours.toString()} inputType="number" onSave={v => handleUpdate("billed_hours", v ? parseFloat(v) : 0)} />
                <EditableField label="Value" display={localProject.est_value ? `$${localProject.est_value.toLocaleString()}` : "—"} editDefault={localProject.est_value?.toString() ?? ""} inputType="number" placeholder="0" onSave={v => handleUpdate("est_value", v ? parseFloat(v) : null)} />
              </div>
            )}
            {/* ── Finance cross-module ── */}
            {financeData !== null && (financeData.hours > 0 || financeData.invoiceCount > 0) && (
              <div style={{ marginTop: 12, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Finance</p>
                {financeData.hours > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                    <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Time logged</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#6b6860" }}>{financeData.hours}h</span>
                  </div>
                )}
                {localProject.type === "client_project" && financeData.billableAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                    <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Billable</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#6b6860" }}>${financeData.billableAmount.toLocaleString()}</span>
                  </div>
                )}
                {financeData.invoiceCount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Invoiced</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#6b6860" }}>{financeData.invoiceCount} · ${financeData.invoiceTotal.toLocaleString()}</span>
                  </div>
                )}
                <button
                  onClick={() => window.location.href = "/finance"}
                  style={{ marginTop: 6, fontSize: 10, color: "var(--color-sage)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                >
                  View in Finance →
                </button>
              </div>
            )}

            {/* ── Navigation — inline after details ── */}
            <div data-tour-target="projects.detail-workspace" style={{ marginTop: 16, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Workspace</p>
              {NAV_ITEMS.map(item => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                      borderRadius: 7, border: "none", background: active ? "rgba(155,163,122,0.12)" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease", marginBottom: 1,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ color: active ? "#5a7040" : "var(--color-grey)" }}>{item.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, textAlign: "left", color: active ? "#5a7040" : "var(--color-grey)", fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Settings — fixed at bottom, expands upward ── */}
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 8px 8px", flexShrink: 0 }}>
            {/* Delete + future options appear above the Settings button */}
            {settingsOpen && (
              <div style={{ paddingBottom: 4 }}>
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                    borderRadius: 7, border: "none", background: "transparent",
                    cursor: "pointer", fontFamily: "inherit", color: "var(--color-red-orange)",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.07)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                  <span style={{ fontSize: 12 }}>Delete project</span>
                </button>
              </div>
            )}
            <button
              onClick={() => setSettingsOpen(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                borderRadius: 7, border: "none", background: settingsOpen ? "var(--color-surface-raised)" : "transparent",
                cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { if (!settingsOpen) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (!settingsOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <Settings size={13} strokeWidth={1.75} style={{ color: settingsOpen ? "var(--color-charcoal)" : "var(--color-grey)" }} />
              <span style={{ fontSize: 12, color: settingsOpen ? "var(--color-charcoal)" : "var(--color-grey)", fontWeight: settingsOpen ? 500 : 400 }}>Settings</span>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ marginLeft: "auto", color: "var(--color-grey)", transform: settingsOpen ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }}>
                <path d="M2 1l4 3-4 3"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Right: main area ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Top bar */}
          <div style={{
            height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 14px", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)",
            borderRadius: maximized ? 0 : "0 12px 0 0",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>
              {NAV_ITEMS.find(n => n.key === activeTab)?.label}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => setMaximized(v => !v)}
                title={maximized ? "Restore" : "Maximize"}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {maximized ? <Minimize2 size={13} strokeWidth={1.75} /> : <Maximize2 size={13} strokeWidth={1.75} />}
              </button>
              <button
                onClick={onClose}
                title="Close"
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {activeTab === "canvas" && (
              canvasHtml === undefined
                ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--color-grey)" }}>Loading…</div>
                : <CanvasEditor key={localProject.id} projectId={localProject.id} initialHtml={canvasHtml} onSaved={(h) => setCanvasHtml(h)} />
            )}
            {activeTab === "tasks" && (
              <ProjectTasksTab projectId={localProject.id} tasks={tasks} setTasks={setTasks} />
            )}
            {activeTab === "contacts" && (
              <ContactsTab key={localProject.id} projectId={localProject.id} />
            )}
            {activeTab === "notes" && (
              <NotesTab projectId={localProject.id} notes={notes} setNotes={setNotes} />
            )}
            {activeTab === "files" && (
              <FilesTab key={localProject.id} projectId={localProject.id} />
            )}
          </div>

          {/* Ash strip — scrim mode only */}
          {!maximized && <AshStrip project={localProject} activeTasks={tasks.filter(t => !t.completed).length} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete project?"
        body={`"${localProject.title}" and everything inside it — tasks, notes, files, time logs — will be permanently removed. This can't be undone.`}
        confirmLabel="Delete project"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
