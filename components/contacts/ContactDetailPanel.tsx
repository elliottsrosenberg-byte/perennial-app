"use client";

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactActivity, ContactActivityType, ContactStatus, LeadStage, Project, Task, Note } from "@/types/database";
import { X, Maximize2, Minimize2, FileText, CheckSquare, FolderOpen, Calendar, Settings, Trash2, Users, Link2 } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { getRichExtensions, RichToolbar, InlineAshPopover, SelectionBubble } from "@/components/ui/RichEditor";
import type { AshPromptState } from "@/components/ui/RichEditor";
import CanvasAshHint from "@/components/ui/CanvasAshHint";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// ── Constants ─────────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  gallery:  { bg: "rgba(37,99,171,0.10)",   color: "#2563ab" },
  client:   { bg: "rgba(61,107,79,0.10)",   color: "#3d6b4f" },
  supplier: { bg: "rgba(184,134,11,0.10)",  color: "#b8860b" },
  press:    { bg: "rgba(109,79,163,0.10)",  color: "#6d4fa3" },
  event:    { bg: "rgba(20,140,140,0.10)",  color: "#148c8c" },
};
function tagStyle(tag: string) {
  const key = tag.toLowerCase().trim();
  if (TAG_COLORS[key]) return TAG_COLORS[key];
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffffffff;
  const FB = [{ bg: "rgba(37,99,171,0.10)", color: "#2563ab" }, { bg: "rgba(109,79,163,0.10)", color: "#6d4fa3" }, { bg: "rgba(20,140,140,0.10)", color: "#148c8c" }, { bg: "rgba(61,107,79,0.10)", color: "#3d6b4f" }, { bg: "rgba(184,134,11,0.10)", color: "#b8860b" }];
  return FB[Math.abs(h) % FB.length];
}

const STATUS_CONFIG: Record<ContactStatus, { dot: string; label: string }> = {
  active:       { dot: "var(--color-sage)", label: "Active"        },
  inactive:     { dot: "var(--color-grey)", label: "Inactive"      },
  former_client:{ dot: "#6d4fa3",          label: "Former client" },
};
const STATUS_OPTIONS: ContactStatus[] = ["active", "inactive", "former_client"];

const LEAD_STAGE_CONFIG: Record<LeadStage, { color: string; label: string }> = {
  new:            { color: "#9a9690", label: "New"            },
  reached_out:    { color: "#2563ab", label: "Reached out"    },
  in_conversation:{ color: "#148c8c", label: "In conversation" },
  proposal_sent:  { color: "#6d4fa3", label: "Proposal sent"  },
  qualified:      { color: "#3d6b4f", label: "Qualified"      },
  nurturing:      { color: "#b8860b", label: "Nurturing"      },
  lost:           { color: "#dc3e0d", label: "Lost"           },
};
const LEAD_STAGE_OPTIONS: LeadStage[] = ["new", "reached_out", "in_conversation", "proposal_sent", "qualified", "nurturing", "lost"];

const ACTIVITY_CONFIG: Record<ContactActivityType, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
  email:   { bg: "rgba(37,99,171,0.10)",  color: "#2563ab", label: "Email",   icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l6 5 6-5"/><rect x="1" y="3" width="14" height="10" rx="2"/></svg> },
  call:    { bg: "rgba(61,107,79,0.10)",  color: "#3d6b4f", label: "Call",    icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.3 11.5l-2.1-2.1a1 1 0 00-1.4 0l-1 1c-.9-.5-1.7-1.2-2.4-2l1-1a1 1 0 000-1.4L6.3 3.9a1 1 0 00-1.4 0L3.5 5.3C3 7.5 5 11 8.7 14.5l1.5-1.5a1 1 0 001.1-1.5z"/></svg> },
  note:    { bg: "rgba(184,134,11,0.10)", color: "#b8860b", label: "Note",    icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h12v9H2z"/><path d="M5 6h6M5 9h4"/></svg> },
  meeting: { bg: "rgba(109,79,163,0.10)", color: "#6d4fa3", label: "Meeting", icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/></svg> },
};

const PRESET_TAGS = ["Gallery", "Client", "Supplier", "Press", "Event"];

function initials(c: Contact) { return (c.first_name[0] + (c.last_name[0] ?? "")).toUpperCase(); }
function fmtDate(iso: string) {
  const d = new Date(iso), today = new Date(), yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
function lastContactedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never contacted", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today", color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`, color: "var(--color-sage)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: days < 14 ? "var(--color-charcoal)" : "#b8860b" };
  return { label: `${Math.floor(days / 30)}mo ago`, color: "var(--color-red-orange)" };
}
function groupByDate(activities: ContactActivity[]) {
  const result: { label: string; items: ContactActivity[] }[] = [];
  const map = new Map<string, ContactActivity[]>();
  for (const a of activities) {
    const label = fmtDate(a.occurred_at);
    if (!map.has(label)) { map.set(label, []); result.push({ label, items: map.get(label)! }); }
    map.get(label)!.push(a);
  }
  return result;
}

// ── Editable field (matches project panel style) ──────────────────────────────

function EditableField({ label, value, placeholder = "—", onSave }: {
  label: string; value: string | null; placeholder?: string; onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    setEditing(false);
    const v = draft.trim() || null;
    if (v !== (value || null)) onSave(v);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--color-border)" }}>
      <span style={{ fontSize: 11, color: "var(--color-grey)", width: 68, flexShrink: 0 }}>{label}</span>
      {editing
        ? <input value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
            autoFocus style={{ flex: 1, fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit", borderBottom: "1px solid var(--color-sage)" }} />
        : <span onClick={() => setEditing(true)} style={{ flex: 1, fontSize: 12, color: value ? "#6b6860" : "var(--color-grey)", cursor: "text" }} title="Click to edit">
            {value || placeholder}
          </span>
      }
    </div>
  );
}

// ── Picker dropdown ───────────────────────────────────────────────────────────

function PickerTag({ label, color, dot, onClick }: { label: string; color: string; dot: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 9999, border: `0.5px solid ${color}55`, color, background: `${color}11`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      {label}
    </button>
  );
}

// ── Canvas editor for contacts ────────────────────────────────────────────────

function ContactCanvasEditor({ contactId, initialHtml }: { contactId: string; initialHtml: string | null }) {
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [convertingNote, setConvertingNote] = useState(false);
  const [noteCreated,    setNoteCreated]    = useState(false);
  const [ashPrompt,      setAshPrompt]      = useState<AshPromptState>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAshTrigger = useCallback((pos: number, coords: { top: number; left: number; bottom: number }) => {
    setAshPrompt({ pos, anchor: coords });
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: getRichExtensions({ placeholder: "Canvas — notes, plans, anything about this contact…", onAshTrigger: handleAshTrigger }),
    content: initialHtml ?? "",
    onUpdate({ editor }) { scheduleSave(editor.getHTML()); },
    editorProps: { attributes: { style: "outline: none; min-height: 300px; font-size: 14px; line-height: 1.8; color: #6b6860;" } },
  }, [contactId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        const html = editor?.getHTML() ?? "";
        createClient().from("contacts").update({ canvas_html: html || null }).eq("id", contactId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  function scheduleSave(html: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true); setSaved(false);
    saveTimer.current = setTimeout(async () => {
      await createClient().from("contacts").update({ canvas_html: html || null }).eq("id", contactId);
      setSaving(false); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }

  async function handleAshSubmit(prompt: string) {
    if (!editor || !ashPrompt) return;
    const context = editor.getText().slice(0, 800);
    const res = await fetch("/api/notes/ash-inline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, noteContext: context }) });
    const { text } = await res.json() as { text: string };
    if (text) editor.chain().focus().setTextSelection(ashPrompt.pos).insertContent(text).run();
    setAshPrompt(null);
  }

  async function handleConvertToNote(sel: { text: string; html: string }) {
    if (convertingNote) return;
    setConvertingNote(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConvertingNote(false); return; }
    const title = sel.text.replace(/\s+/g, " ").trim().slice(0, 60);
    await supabase.from("notes").insert({
      user_id:    user.id,
      contact_id: contactId,
      title:      title || null,
      content:    sel.html,
    });
    setConvertingNote(false);
    setNoteCreated(true);
    setTimeout(() => setNoteCreated(false), 2400);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      <RichToolbar editor={editor} />
      <SelectionBubble editor={editor} onConvertToNote={handleConvertToNote} convertingToNote={convertingNote} />
      <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)", position: "relative" }}>
        <div style={{ maxWidth: 760, padding: "36px 60px 80px" }}>
          <EditorContent editor={editor} />
        </div>
        <CanvasAshHint />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "5px 20px", borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)", flexShrink: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>
        {noteCreated && <span style={{ color: "#4a5630", fontWeight: 600 }}>✓ Note created</span>}
        {saving && "Saving…"}
        {!saving && saved && <span style={{ color: "var(--color-sage)" }}>✓ Saved</span>}
      </div>
      {ashPrompt && <InlineAshPopover anchor={ashPrompt.anchor} onSubmit={handleAshSubmit} onClose={() => setAshPrompt(null)} />}
    </div>
  );
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function ActivityTab({ contactId, activities, setActivities, filterType, contact, onContactUpdated }: {
  contactId: string; activities: ContactActivity[]; setActivities: React.Dispatch<React.SetStateAction<ContactActivity[]>>;
  filterType?: "note"; contact: Contact; onContactUpdated: (c: Contact) => void;
}) {
  const [actInput,   setActInput]   = useState("");
  const [actType,    setActType]    = useState<ContactActivityType>("note");
  const [loadingAct, setLoadingAct] = useState(false);

  const filtered = filterType ? activities.filter(a => a.type === filterType) : activities;
  const grouped  = groupByDate(filtered);

  async function logActivity() {
    if (!actInput.trim()) return;
    setLoadingAct(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoadingAct(false); return; }
    const now = new Date().toISOString();
    const { data } = await supabase.from("contact_activities").insert({ user_id: user.id, contact_id: contactId, type: actType, content: actInput.trim(), occurred_at: now }).select("*").single();
    if (data) {
      setActivities(prev => [data as ContactActivity, ...prev]);
      await supabase.from("contacts").update({ last_contacted_at: now }).eq("id", contactId);
      onContactUpdated({ ...contact, last_contacted_at: now });
    }
    setActInput(""); setLoadingAct(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "10px 18px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
        <input id="act-input" type="text" value={actInput} onChange={e => setActInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); logActivity(); } }}
          placeholder={`Log a ${actType}…`} style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "var(--color-charcoal)", fontFamily: "inherit", marginLeft: 6 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
          {(["note", "call", "meeting"] as ContactActivityType[]).map(t => (
            <button key={t} onClick={() => setActType(t)} style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 9999,
              background: actType === t ? "var(--color-sage)" : "var(--color-cream)",
              color: actType === t ? "white" : "#6b6860", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit",
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
          <button onClick={logActivity} disabled={!actInput.trim() || loadingAct}
            style={{ fontSize: 10, padding: "2px 8px", borderRadius: 9999, background: "var(--color-charcoal)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", opacity: !actInput.trim() || loadingAct ? 0.4 : 1 }}>Log</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {grouped.length === 0
          ? <p style={{ fontSize: 12, textAlign: "center", padding: "32px 0", color: "var(--color-grey)" }}>No activity yet.</p>
          : grouped.map(({ label, items }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 0 6px", color: "var(--color-grey)" }}>{label}</div>
              {items.map(act => {
                const cfg = ACTIVITY_CONFIG[act.type];
                return (
                  <div key={act.id} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: cfg.bg, color: cfg.color, border: "0.5px solid var(--color-border)" }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b6860" }}>{cfg.label}</span>
                        <span style={{ fontSize: 10, marginLeft: "auto", color: "var(--color-grey)" }}>{fmtTime(act.occurred_at)}</span>
                      </div>
                      {act.content && <p style={{ fontSize: 12, lineHeight: 1.6, color: "#6b6860" }}>{act.content}</p>}
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

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ contactId, tasks, setTasks }: {
  contactId: string; tasks: Task[]; setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}) {
  const [taskInput, setTaskInput] = useState("");
  const openTasks = tasks.filter(t => !t.completed);
  const doneTasks = tasks.filter(t => t.completed);

  async function addTask() {
    if (!taskInput.trim()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data } = await supabase.from("tasks").insert({ user_id: user.id, contact_id: contactId, title: taskInput.trim(), completed: false }).select("*, project:projects(id,title)").single();
    if (data) { setTasks(prev => [data as Task, ...prev]); setTaskInput(""); }
  }

  async function toggleTask(id: string, completed: boolean) {
    await createClient().from("tasks").update({ completed }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed } : t));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, border: "1.5px dashed var(--color-border-strong)", flexShrink: 0 }} />
        <input type="text" value={taskInput} onChange={e => setTaskInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
          placeholder="New task…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: "var(--color-charcoal)", fontFamily: "inherit" }} />
        {taskInput.trim() && <button onClick={addTask} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer" }}>Add</button>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        {tasks.length === 0
          ? <p style={{ fontSize: 12, textAlign: "center", padding: "32px 0", color: "var(--color-grey)" }}>No tasks yet.</p>
          : <>
            {openTasks.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <button onClick={() => toggleTask(task.id, true)}
                  style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--color-border-strong)", background: "transparent", cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-sage)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-strong)"} />
                <span style={{ flex: 1, fontSize: 13, color: "var(--color-charcoal)" }}>{task.title}</span>
                {task.due_date && <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              </div>
            ))}
            {doneTasks.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "14px 0 6px", color: "var(--color-grey)" }}>Done ({doneTasks.length})</div>
                {doneTasks.map(task => (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "0.5px solid var(--color-border)", opacity: 0.5 }}>
                    <button onClick={() => toggleTask(task.id, false)}
                      style={{ width: 16, height: 16, borderRadius: 4, background: "var(--color-sage)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <span style={{ flex: 1, fontSize: 13, color: "var(--color-grey)", textDecoration: "line-through" }}>{task.title}</span>
                  </div>
                ))}
              </>
            )}
          </>
        }
      </div>
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({ contactId, notes, setNotes }: {
  contactId: string; notes: Note[]; setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
}) {
  async function createNote() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data } = await supabase.from("notes").insert({ user_id: user.id, contact_id: contactId }).select().single();
    if (data) setNotes(prev => [data as Note, ...prev]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 20px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <button onClick={createNote} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer" }}>+ New note</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
        {notes.length === 0
          ? <p style={{ fontSize: 12, textAlign: "center", padding: "32px 0", color: "var(--color-grey)" }}>No notes yet. Create one or link notes from the Notes module.</p>
          : notes.map(note => (
            <a key={note.id} href={`/notes?id=${note.id}`}
              style={{ display: "block", padding: "12px 14px", marginBottom: 8, borderRadius: 10, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", textDecoration: "none", cursor: "pointer", transition: "border-color 0.1s ease" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--color-border-strong)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-border)")}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 2 }}>{note.title || "Untitled"}</p>
              {note.content && <p style={{ fontSize: 11, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.content.replace(/<[^>]*>/g, " ").trim().slice(0, 100)}</p>}
              <p style={{ fontSize: 10, color: "var(--color-grey)", marginTop: 4 }}>{new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </a>
          ))
        }
      </div>
    </div>
  );
}

// ── ContactFile type ──────────────────────────────────────────────────────────

interface ContactFile {
  id: string; contact_id: string; user_id: string;
  name: string; url: string; file_type: string | null; size_bytes: number | null; created_at: string;
}

// ── ContactFilesTab ───────────────────────────────────────────────────────────

type FileAddMode = "upload" | "link" | null;

function ContactFilesTab({ contactId }: { contactId: string }) {
  const [files,     setFiles]     = useState<ContactFile[]>([]);
  const [addMode,   setAddMode]   = useState<FileAddMode>(null);
  const [newName,   setNewName]   = useState("");
  const [newUrl,    setNewUrl]    = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient().from("contact_files").select("*").eq("contact_id", contactId).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setFiles(data as ContactFile[]); setLoading(false); });
  }, [contactId]);

  async function saveToDb(name: string, url: string, fileType: string | null, sizeBytes: number | null) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("contact_files")
      .insert({ contact_id: contactId, user_id: user.id, name, url, file_type: fileType, size_bytes: sizeBytes })
      .select().single();
    if (data) setFiles(prev => [data as ContactFile, ...prev]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext  = file.name.split(".").pop()?.toLowerCase() ?? "";
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const path = `${user.id}/${contactId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("contact-files").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("contact-files").getPublicUrl(path);
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
    await createClient().from("contact_files").delete().eq("id", id);
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  function fileIcon(type: string | null) {
    if (!type) return <Link2 size={14} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />;
    if (["jpg","jpeg","png","gif","webp","svg"].includes(type)) return <span style={{ fontSize: 14 }}>🖼</span>;
    if (type === "pdf") return <span style={{ fontSize: 14 }}>📄</span>;
    if (["doc","docx"].includes(type)) return <span style={{ fontSize: 14 }}>📝</span>;
    return <FolderOpen size={14} strokeWidth={1.5} style={{ color: "var(--color-grey)" }} />;
  }

  function fmtSize(bytes: number | null) {
    if (!bytes) return null;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <input ref={fileInputRef} type="file" style={{ display: "none" }} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={handleFileUpload} />
        <button onClick={() => { setAddMode(addMode === "upload" ? null : "upload"); fileInputRef.current?.click(); }} disabled={uploading}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", opacity: uploading ? 0.6 : 1 }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v10M4 6l4-4 4 4"/><path d="M2 14h12"/></svg>
          {uploading ? "Uploading…" : "Upload file"}
        </button>
        <button onClick={() => setAddMode(m => m === "link" ? null : "link")}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: addMode === "link" ? "var(--color-surface-sunken)" : "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit" }}
          onMouseEnter={e => { if (addMode !== "link") e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
          onMouseLeave={e => { if (addMode !== "link") e.currentTarget.style.background = "transparent"; }}>
          <Link2 size={12} strokeWidth={2} />
          Add link
        </button>
      </div>
      {addMode === "link" && (
        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, background: "var(--color-surface-sunken)" }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name"
            style={{ fontSize: 12, padding: "5px 9px", border: "0.5px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-raised)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="URL — Google Drive, Dropbox, Figma…"
            onKeyDown={e => { if (e.key === "Enter") addLink(); if (e.key === "Escape") { setAddMode(null); setNewName(""); setNewUrl(""); } }}
            style={{ fontSize: 12, padding: "5px 9px", border: "0.5px solid var(--color-border)", borderRadius: 6, background: "var(--color-surface-raised)", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addLink} disabled={!newName.trim() || !newUrl.trim()}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", opacity: (!newName.trim() || !newUrl.trim()) ? 0.5 : 1 }}>Save</button>
            <button onClick={() => { setAddMode(null); setNewName(""); setNewUrl(""); }}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "transparent", color: "var(--color-grey)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {loading && <p style={{ fontSize: 12, color: "var(--color-grey)", textAlign: "center", padding: "32px 0" }}>Loading…</p>}
        {!loading && files.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 6, color: "var(--color-grey)" }}>
            <FolderOpen size={28} strokeWidth={1.25} style={{ opacity: 0.35 }} />
            <p style={{ fontSize: 12 }}>No files yet</p>
            <p style={{ fontSize: 11 }}>Upload portfolios, contracts, reference images</p>
          </div>
        )}
        {files.map(f => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, marginBottom: 4, border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--color-cream)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{fileIcon(f.file_type)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--color-sage)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--color-charcoal)"}>{f.name}</a>
              {f.size_bytes && <p style={{ fontSize: 10, color: "var(--color-grey)", marginTop: 1 }}>{fmtSize(f.size_bytes)}</p>}
            </div>
            <button onClick={() => deleteFile(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-grey)", padding: 0, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}>
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ContactAshStrip ───────────────────────────────────────────────────────────

function ContactAshStrip({ contact }: { contact: Contact }) {
  const name = contact.first_name;
  const isLead = contact.is_lead;

  function generateContent(): { prompt: string; action: string; buttonLabel: string } {
    if (isLead) {
      const stage = contact.lead_stage ?? "new";
      if (stage === "new") return {
        prompt:      `${name} is a new lead. I can help you craft a strong opener.`,
        action:      `Write a personalized first-touch message to ${name}. Keep it genuine and short — no fluff.`,
        buttonLabel: "Draft opener",
      };
      if (stage === "reached_out") return {
        prompt:      `You've reached out to ${name}. I can draft a follow-up if there's been no reply.`,
        action:      `Draft a brief, non-pushy follow-up to ${name}. Reference the first message and give them a clear, easy next step.`,
        buttonLabel: "Draft follow-up",
      };
      if (stage === "in_conversation") return {
        prompt:      `You're in conversation with ${name}. Want help moving things forward?`,
        action:      `Help me advance my conversation with ${name}. What's the best move to get to a clear yes or no?`,
        buttonLabel: "Move forward",
      };
      return {
        prompt:      `I can help you think through your next move with ${name}.`,
        action:      `What's the best next step with ${name} as a lead? Give me a concrete action and the message to send.`,
        buttonLabel: "Next step",
      };
    }
    const days = contact.last_contacted_at
      ? Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / 86400000)
      : null;
    if (days === null || days > 60) return {
      prompt:      `It's been a while since you connected with ${name}. I can draft a check-in.`,
      action:      `Draft a warm, genuine check-in message to ${name}. Keep it natural — no selling.`,
      buttonLabel: "Draft check-in",
    };
    if (days > 30) return {
      prompt:      `You last spoke with ${name} ${days} days ago. Good time for a follow-up?`,
      action:      `Draft a follow-up to ${name} that picks up naturally from where you left off.`,
      buttonLabel: "Draft follow-up",
    };
    return {
      prompt:      `I can help you prepare for your next interaction with ${name}.`,
      action:      `What should I know about ${name} before my next conversation? Give me key context and one thing to bring up.`,
      buttonLabel: "Prep for chat",
    };
  }

  const { prompt, action, buttonLabel } = generateContent();
  const contactDetail = { name: `${contact.first_name} ${contact.last_name}`, is_lead: contact.is_lead };

  function handleContextual() {
    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: action, contact: contactDetail } }));
  }
  function handleOpenAsh() {
    window.dispatchEvent(new CustomEvent("open-ash", { detail: { contact: contactDetail } }));
  }

  return (
    <div style={{
      flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
      padding: "0 18px", height: 56,
      background: "linear-gradient(135deg, #7a9a55 0%, #5a7a38 45%, #3a5228 100%)",
    }}>
      <img src="/Ash-Logomak.svg" alt="" style={{ width: 16, height: 16, flexShrink: 0, filter: "brightness(0) invert(1)", opacity: 0.9, animation: "ash-shimmer 4s ease-in-out infinite" }} />
      <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.88)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {prompt}
      </span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={handleContextual} style={{ fontSize: 11, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.22)", border: "0.5px solid rgba(255,255,255,0.35)", borderRadius: 9999, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.32)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}>
          {buttonLabel} →
        </button>
        <button onClick={handleOpenAsh} style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.75)", background: "transparent", border: "0.5px solid rgba(255,255,255,0.25)", borderRadius: 9999, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", lineHeight: 1 }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}>
          Ask Ash
        </button>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  contact:    Contact;
  onClose:    () => void;
  onUpdated:  (contact: Contact) => void;
  onArchived: (id: string) => void;
}

type SectionTab = "canvas" | "activity" | "tasks" | "notes" | "files";

// ── Main component ────────────────────────────────────────────────────────────

export default function ContactDetailPanel({ contact: initialContact, onClose, onUpdated, onArchived }: Props) {
  const supabase = createClient();

  const [contact,        setContact]        = useState(initialContact);
  const [activities,     setActivities]     = useState<ContactActivity[]>([]);
  const [linkedProjects, setLinkedProjects] = useState<Project[]>([]);
  const [tasks,          setTasks]          = useState<Task[]>([]);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [canvasHtml,     setCanvasHtml]     = useState<string | null | undefined>(undefined);
  const [activeTab,      setActiveTab]      = useState<SectionTab>("canvas");
  const [maximized,      setMaximized]      = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [invoiceData,    setInvoiceData]    = useState<{ count: number; total: number } | null>(null);

  // Status/stage pickers
  const [statusOpen, setStatusOpen] = useState(false);
  const [stageOpen,  setStageOpen]  = useState(false);
  const statusRef    = useRef<HTMLDivElement>(null);
  const stageRef     = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Tags
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput,    setTagInput]    = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Project picker
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [availableProjects, setAvailableProjects]  = useState<Project[]>([]);
  const [projectSearch,     setProjectSearch]      = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  // Hide the floating Ash button in scrim mode; broadcast contact context for Ash
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("set-contact-context", {
      detail: { name: `${initialContact.first_name} ${initialContact.last_name}`, is_lead: initialContact.is_lead },
    }));
    if (!maximized) {
      const style = document.createElement("style");
      style.id = "contact-panel-ash-hide";
      style.textContent = ".ash-fab { opacity: 0 !important; pointer-events: none !important; }";
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById("contact-panel-ash-hide")?.remove();
    };
  }, [maximized, initialContact.first_name, initialContact.last_name, initialContact.is_lead]);

  // Clear contact context when panel unmounts
  useEffect(() => {
    return () => { window.dispatchEvent(new CustomEvent("clear-contact-context")); };
  }, []);

  useEffect(() => {
    setContact(initialContact);
    setActiveTab("canvas");
    setSettingsOpen(false);
    setCanvasHtml(undefined);

    const s = createClient();
    Promise.all([
      s.from("contact_activities").select("*").eq("contact_id", initialContact.id).order("occurred_at", { ascending: false }),
      s.from("project_contacts").select("project:projects(*)").eq("contact_id", initialContact.id),
      s.from("tasks").select("*, project:projects(id,title)").eq("contact_id", initialContact.id).order("created_at", { ascending: false }),
      s.from("notes").select("*").eq("contact_id", initialContact.id).order("updated_at", { ascending: false }),
      s.from("contacts").select("canvas_html").eq("id", initialContact.id).single(),
      s.from("invoices").select("id, line_items:invoice_line_items(amount)").eq("client_contact_id", initialContact.id),
    ]).then(([{ data: a }, { data: pr }, { data: t }, { data: n }, { data: c }, { data: inv }]) => {
      if (a)  setActivities(a as ContactActivity[]);
      if (pr) setLinkedProjects(pr.map((r: { project: Project | Project[] }) => Array.isArray(r.project) ? r.project[0] : r.project).filter(Boolean) as Project[]);
      if (t)  setTasks(t as Task[]);
      if (n)  setNotes(n as Note[]);
      setCanvasHtml(c?.canvas_html ?? null);
      if (inv && inv.length > 0) {
        type Inv = { id: string; line_items: { amount: number }[] };
        const invs = inv as unknown as Inv[];
        const total = invs.reduce((s, i) => s + i.line_items.reduce((ss, l) => ss + Number(l.amount), 0), 0);
        setInvoiceData({ count: invs.length, total });
      }
    });
  }, [initialContact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (showProjectPicker) { setShowProjectPicker(false); return; }
        if (statusOpen)        { setStatusOpen(false); return; }
        if (stageOpen)         { setStageOpen(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, showProjectPicker, statusOpen, stageOpen]);

  useEffect(() => {
    if (!showProjectPicker) return;
    function h(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowProjectPicker(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showProjectPicker]);

  useEffect(() => {
    if (!statusOpen) return;
    function h(e: MouseEvent) { if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [statusOpen]);

  useEffect(() => {
    if (!stageOpen) return;
    function h(e: MouseEvent) { if (stageRef.current && !stageRef.current.contains(e.target as Node)) setStageOpen(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [stageOpen]);

  // ── Field save ──────────────────────────────────────────────────────────────

  async function saveField(updates: Partial<Contact>) {
    const { data } = await supabase.from("contacts").update(updates).eq("id", contact.id).select("*, company:companies(*)").single();
    if (data) { const c = data as Contact; setContact(c); onUpdated(c); }
  }

  async function saveCompany(name: string | null) {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    let company_id = contact.company_id;
    if (!name?.trim()) { company_id = null; }
    else if (name.trim() !== (contact.company?.name ?? "")) {
      const { data: ex } = await supabase.from("companies").select("id").eq("user_id", user.id).ilike("name", name.trim()).maybeSingle();
      company_id = ex?.id ?? (await supabase.from("companies").insert({ user_id: user.id, name: name.trim() }).select("id").single()).data?.id ?? null;
    }
    const { data } = await supabase.from("contacts").update({ company_id }).eq("id", contact.id).select("*, company:companies(*)").single();
    if (data) { setContact(data as Contact); onUpdated(data as Contact); }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/avatars/${contact.id}.${ext}`;
    const { error } = await supabase.storage.from("contact-files").upload(path, file, { contentType: file.type, upsert: true });
    if (error) { console.error("Avatar upload error:", error); return; }
    const { data: urlData } = supabase.storage.from("contact-files").getPublicUrl(path);
    await saveField({ avatar_url: urlData.publicUrl + `?t=${Date.now()}` });
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  async function addTag(raw: string) {
    const tag = raw.trim(); setTagInput("");
    if (!tag || contact.tags.includes(tag)) return;
    await saveField({ tags: [...contact.tags, tag] });
  }
  async function removeTag(tag: string) { await saveField({ tags: contact.tags.filter(t => t !== tag) }); }
  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
    if (e.key === "Backspace" && tagInput === "" && contact.tags.length > 0) removeTag(contact.tags[contact.tags.length - 1]);
    if (e.key === "Escape") { setEditingTags(false); setTagInput(""); }
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async function openProjectPicker() {
    const { data } = await supabase.from("projects").select("*").order("title");
    if (data) { const linked = new Set(linkedProjects.map(p => p.id)); setAvailableProjects((data as Project[]).filter(p => !linked.has(p.id))); }
    setProjectSearch(""); setShowProjectPicker(true);
  }
  async function linkProject(project: Project) {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    await supabase.from("project_contacts").insert({ project_id: project.id, contact_id: contact.id, user_id: user.id });
    setLinkedProjects(prev => [...prev, project]);
    setAvailableProjects(prev => prev.filter(p => p.id !== project.id));
    setShowProjectPicker(false);
  }
  async function unlinkProject(projectId: string) {
    await supabase.from("project_contacts").delete().eq("project_id", projectId).eq("contact_id", contact.id);
    setLinkedProjects(prev => prev.filter(p => p.id !== projectId));
  }

  // ── Archive / Convert ───────────────────────────────────────────────────────

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);

  async function performArchive() {
    await supabase.from("contacts").update({ archived: true }).eq("id", contact.id);
    setConfirmArchive(false);
    onArchived(contact.id); onClose();
  }

  async function performConvertToContact() {
    const { data } = await supabase.from("contacts").update({ is_lead: false, status: "active", lead_stage: null }).eq("id", contact.id).select("*, company:companies(*)").single();
    if (data) { setContact(data as Contact); onUpdated(data as Contact); }
    setConfirmConvert(false);
  }

  function handleArchive() { setConfirmArchive(true); }
  function convertToContact() { setConfirmConvert(true); }

  // ── Ash ─────────────────────────────────────────────────────────────────────

  function openAsh(message: string) { window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } })); }

  // ── Nav items ───────────────────────────────────────────────────────────────

  const NAV_ITEMS: { key: SectionTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "canvas",   label: "Canvas",   icon: <FileText    size={13} strokeWidth={1.75} /> },
    { key: "activity", label: "Activity", icon: <Calendar    size={13} strokeWidth={1.75} />, count: activities.length },
    { key: "tasks",    label: "Tasks",    icon: <CheckSquare size={13} strokeWidth={1.75} />, count: tasks.filter(t => !t.completed).length },
    { key: "notes",    label: "Notes",    icon: <FileText    size={13} strokeWidth={1.75} />, count: notes.length },
    { key: "files",    label: "Files",    icon: <FolderOpen  size={13} strokeWidth={1.75} /> },
  ];

  const lastC  = lastContactedDisplay(contact.last_contacted_at);
  const status = contact.is_lead
    ? { dot: LEAD_STAGE_CONFIG[contact.lead_stage ?? "new"]?.color ?? "#9a9690", label: LEAD_STAGE_CONFIG[contact.lead_stage ?? "new"]?.label ?? "New" }
    : STATUS_CONFIG[contact.status];
  const pickerFiltered = availableProjects.filter(p => p.title.toLowerCase().includes(projectSearch.toLowerCase()));

  // ── Ash banner prompts ──────────────────────────────────────────────────────
  const ASH_PROMPTS = contact.is_lead
    ? [`What's a good opener to send ${contact.first_name}?`, `How should I qualify ${contact.first_name} as a lead?`, `Draft a follow-up for ${contact.first_name}.`]
    : [`What should I know about ${contact.first_name}?`, `Draft a follow-up to ${contact.first_name}.`, `Summarize my history with ${contact.first_name}.`];

  return (
    <>
      {/* Scrim */}
      {!maximized && (
        <div className="fixed inset-0 z-10 cursor-pointer"
          style={{ background: "rgba(20,18,16,0.52)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
          onClick={onClose} />
      )}

      {/* Panel */}
      <div className="fixed z-20 flex overflow-hidden" style={{
        top:    maximized ? 0 : "52px",
        bottom: maximized ? 0 : "32px",
        left:   maximized ? 0 : "calc(56px + 32px)",
        right:  maximized ? 0 : "32px",
        background:   "var(--color-off-white)",
        borderRadius: maximized ? 0 : 12,
        boxShadow:    "0 8px 40px rgba(0,0,0,0.22)",
        border:       "0.5px solid var(--color-border)",
        transition:   "top 0.2s ease, bottom 0.2s ease, left 0.2s ease, right 0.2s ease, border-radius 0.2s ease",
      }}>

        {/* ── Left sidebar (252px) ── */}
        <div style={{
          width: 252, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          borderRadius: maximized ? 0 : "12px 0 0 12px",
        }}>
          {/* Scrollable top */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 12px" }}>

            {/* Identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  title="Upload photo"
                  style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, flexShrink: 0, background: contact.is_lead ? "rgba(184,134,11,0.12)" : "var(--color-cream)", border: "0.5px solid var(--color-border)", color: contact.is_lead ? "#b8860b" : "#6b6860", cursor: "pointer", overflow: "hidden" }}>
                  {contact.avatar_url
                    ? <img src={contact.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initials(contact)}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarUpload} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1.2, marginBottom: 2 }}>
                  <EditableField label="" value={`${contact.first_name} ${contact.last_name}`} placeholder="Name" onSave={v => {
                    const parts = (v ?? "").trim().split(" "); const first = parts[0] ?? ""; const last = parts.slice(1).join(" ") || first;
                    if (first) saveField({ first_name: first, last_name: last });
                  }} />
                </div>
                {contact.is_lead && <span style={{ fontSize: 10, fontWeight: 600, color: "#b8860b", background: "rgba(184,134,11,0.12)", border: "0.5px solid #b8860b55", padding: "1px 6px", borderRadius: 9999 }}>Lead</span>}
              </div>
            </div>

            {/* Status / Stage */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>
                {contact.is_lead ? "Lead stage" : "Status"}
              </p>

              {contact.is_lead ? (
                <div ref={stageRef} style={{ position: "relative" }}>
                  <PickerTag label={status.label} color={status.dot} dot={status.dot} onClick={() => setStageOpen(v => !v)} />
                  {stageOpen && (
                    <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 10, minWidth: 160, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                      {LEAD_STAGE_OPTIONS.map(s => (
                        <button key={s} onClick={() => { saveField({ lead_stage: s }); setStageOpen(false); }}
                          style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12, color: LEAD_STAGE_CONFIG[s].color, fontWeight: contact.lead_stage === s ? 600 : 400, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: LEAD_STAGE_CONFIG[s].color, flexShrink: 0 }} />
                          {LEAD_STAGE_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div ref={statusRef} style={{ position: "relative" }}>
                  <PickerTag label={status.label} color={status.dot} dot={status.dot} onClick={() => setStatusOpen(v => !v)} />
                  {statusOpen && (
                    <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 10, minWidth: 140, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                      {STATUS_OPTIONS.map(s => (
                        <button key={s} onClick={() => { saveField({ status: s }); setStatusOpen(false); }}
                          style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12, color: STATUS_CONFIG[s].dot, fontWeight: contact.status === s ? 600 : 400, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_CONFIG[s].dot, flexShrink: 0 }} />
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Properties */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Details</p>
              <EditableField label="Email"    value={contact.email}   placeholder="—" onSave={v => saveField({ email: v })} />
              <EditableField label="Phone"    value={contact.phone}   placeholder="—" onSave={v => saveField({ phone: v })} />
              <EditableField label="Company"  value={contact.company?.name ?? null} placeholder="—" onSave={saveCompany} />
              <EditableField label="Title"    value={contact.title}   placeholder="—" onSave={v => saveField({ title: v })} />
              <EditableField label="Website"  value={contact.website} placeholder="—" onSave={v => saveField({ website: v })} />
              <EditableField label="Location" value={contact.location} placeholder="—" onSave={v => saveField({ location: v })} />
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 11, color: "var(--color-grey)", width: 68, flexShrink: 0 }}>Last seen</span>
                <span style={{ fontSize: 12, color: lastC.color }}>{lastC.label}</span>
              </div>
            </div>

            {/* Tags */}
            <div data-tour-target="contacts.detail-tags" style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Tags</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {contact.tags.map(tag => {
                  const s = tagStyle(tag);
                  return (
                    <span key={tag} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 9999, background: s.bg, color: s.color }}>
                      {tag}
                      <button onClick={() => removeTag(tag)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", lineHeight: 1, padding: 0 }}><X size={8} /></button>
                    </span>
                  );
                })}
                {editingTags
                  ? <input ref={tagInputRef} type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={onTagKeyDown}
                      onBlur={() => { if (tagInput.trim()) addTag(tagInput); setEditingTags(false); }}
                      autoFocus placeholder="Add tag…" style={{ fontSize: 10, background: "transparent", border: "0.5px solid var(--color-sage)", borderRadius: 9999, outline: "none", padding: "2px 6px", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
                  : <button onClick={() => { setEditingTags(true); setTimeout(() => tagInputRef.current?.focus(), 0); }}
                      style={{ fontSize: 10, color: "#2563ab", background: "transparent", border: "0.5px dashed var(--color-border)", borderRadius: 9999, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit" }}>+ Tag</button>
                }
              </div>
              {editingTags && tagInput === "" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {PRESET_TAGS.filter(t => !contact.tags.includes(t)).map(t => (
                    <button key={t} onClick={() => addTag(t)} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 9999, background: "var(--color-cream)", color: "#9a9690", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Linked projects */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", flex: 1, margin: 0 }}>Projects</p>
                <div ref={pickerRef} style={{ position: "relative" }}>
                  <button onClick={openProjectPicker} style={{ fontSize: 10, color: "#2563ab", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>+ Link</button>
                  {showProjectPicker && (
                    <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 10, width: 200, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                      <div style={{ padding: "6px 10px", borderBottom: "0.5px solid var(--color-border)" }}>
                        <input type="text" value={projectSearch} onChange={e => setProjectSearch(e.target.value)} placeholder="Search…" autoFocus style={{ width: "100%", fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
                      </div>
                      <div style={{ maxHeight: 180, overflowY: "auto" }}>
                        {pickerFiltered.length === 0
                          ? <p style={{ fontSize: 12, textAlign: "center", padding: "12px", color: "var(--color-grey)" }}>No matches</p>
                          : pickerFiltered.map(p => (
                            <button key={p.id} onClick={() => linkProject(p)}
                              style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--color-charcoal)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: "0.5px solid var(--color-border)" }}
                              onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <div style={{ fontWeight: 500 }}>{p.title}</div>
                              <div style={{ fontSize: 10, color: "var(--color-grey)", marginTop: 1 }}>{p.status?.replace("_", " ")}</div>
                            </button>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {linkedProjects.map((p, i) => (
                <div key={p.id} className="group" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: i < linkedProjects.length - 1 ? "0.5px solid var(--color-border)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                    <div style={{ fontSize: 10, color: "var(--color-grey)" }}>{p.status?.replace("_", " ")}</div>
                  </div>
                  <button onClick={() => unlinkProject(p.id)} style={{ opacity: 0, color: "var(--color-grey)", border: "none", background: "transparent", cursor: "pointer", flexShrink: 0 }}
                    className="group-hover:opacity-100"><X size={11} /></button>
                </div>
              ))}
              {linkedProjects.length === 0 && <p style={{ fontSize: 11, color: "var(--color-grey)" }}>—</p>}
            </div>

            {/* Finance cross-module */}
            {invoiceData && invoiceData.count > 0 && (
              <div style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Finance</p>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                  <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Invoices</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#6b6860" }}>{invoiceData.count}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Total invoiced</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#6b6860" }}>${invoiceData.total.toLocaleString()}</span>
                </div>
                <button
                  onClick={() => window.location.href = "/finance?tab=invoices"}
                  style={{ marginTop: 6, fontSize: 10, color: "var(--color-sage)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                >
                  View invoices →
                </button>
              </div>
            )}

            {/* Navigation */}
            <div data-tour-target="contacts.detail-workspace" style={{ marginTop: 16, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Workspace</p>
              {NAV_ITEMS.map(item => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    data-tour-target={item.key === "activity" ? "contacts.detail-activity" : undefined}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                      borderRadius: 7, border: "none", background: active ? "var(--color-surface-raised)" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", marginBottom: 1,
                    }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: active ? "#5a7040" : "var(--color-grey)" }}>{item.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, textAlign: "left", color: active ? "#5a7040" : "var(--color-grey)", fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {item.count !== undefined && item.count > 0 && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{item.count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Ash prompts */}
            <div style={{ marginTop: 16, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Ask Ash</p>
              {ASH_PROMPTS.map(prompt => (
                <button key={prompt} onClick={() => openAsh(prompt)} style={{
                  width: "100%", textAlign: "left", fontSize: 11, padding: "5px 8px", borderRadius: 7,
                  background: "transparent", border: "none", cursor: "pointer", color: "#6b6860", fontFamily: "inherit",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(155,163,122,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Settings (bottom) */}
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 8px 8px", flexShrink: 0 }}>
            {settingsOpen && (
              <div style={{ paddingBottom: 4 }}>
                {contact.is_lead && (
                  <button onClick={convertToContact} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "#3d6b4f" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(61,107,79,0.07)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Users size={13} strokeWidth={1.75} />
                    <span style={{ fontSize: 12 }}>Convert to contact</span>
                  </button>
                )}
                <button onClick={handleArchive} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "#b8860b" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(184,134,11,0.07)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Trash2 size={13} strokeWidth={1.75} />
                  <span style={{ fontSize: 12 }}>Archive {contact.is_lead ? "lead" : "contact"}</span>
                </button>
              </div>
            )}
            <button onClick={() => setSettingsOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: settingsOpen ? "var(--color-surface-raised)" : "transparent", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { if (!settingsOpen) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (!settingsOpen) e.currentTarget.style.background = "transparent"; }}>
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
              <button onClick={() => setMaximized(v => !v)}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {maximized ? <Minimize2 size={13} strokeWidth={1.75} /> : <Maximize2 size={13} strokeWidth={1.75} />}
              </button>
              <button onClick={onClose}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {activeTab === "canvas" && (
              canvasHtml === undefined
                ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--color-grey)" }}>Loading…</div>
                : <ContactCanvasEditor key={contact.id} contactId={contact.id} initialHtml={canvasHtml} />
            )}
            {activeTab === "activity" && (
              <ActivityTab contactId={contact.id} activities={activities} setActivities={setActivities} contact={contact}
                onContactUpdated={c => { setContact(c); onUpdated(c); }} />
            )}
            {activeTab === "tasks" && (
              <TasksTab contactId={contact.id} tasks={tasks} setTasks={setTasks} />
            )}
            {activeTab === "notes" && (
              <NotesTab contactId={contact.id} notes={notes} setNotes={setNotes} />
            )}
            {activeTab === "files" && (
              <ContactFilesTab key={contact.id} contactId={contact.id} />
            )}
          </div>
          {!maximized && <ContactAshStrip contact={contact} />}
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${contact.first_name} ${contact.last_name}?`}
        body={contact.is_lead
          ? `${contact.first_name} will be removed from your active leads list. Any activity and notes you've logged stay attached if you restore them later.`
          : `${contact.first_name} ${contact.last_name} will be removed from your active contacts. Their activity, notes, and linked projects stay — restore them later from settings if needed.`}
        confirmLabel="Archive"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={performArchive}
        onCancel={() => setConfirmArchive(false)}
      />

      <ConfirmDialog
        open={confirmConvert}
        title={`Convert ${contact.first_name} to a contact?`}
        body={`${contact.first_name} ${contact.last_name} will move out of your leads pipeline and into your active contacts. Their stage history stays in their activity log so you don't lose the context of how the relationship started.`}
        confirmLabel="Convert to contact"
        cancelLabel="Keep as lead"
        tone="primary"
        onConfirm={performConvertToContact}
        onCancel={() => setConfirmConvert(false)}
      />
    </>
  );
}
