"use client";

import { useState, useEffect, useMemo, useRef, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactStatus, LeadStage, Organization, Project, Task, Note } from "@/types/database";
import { X, Maximize2, Minimize2, FileText, CheckSquare, FolderOpen, Calendar, Settings, Trash2, Users, Link2 } from "lucide-react";
import Canvas from "@/components/canvas/Canvas";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AshPromptsModule, { type AshPrompt } from "@/components/ui/AshPromptsModule";
import EntityActivityTab, { type EntityActivity } from "@/components/detail/EntityActivityTab";
import { hexToRgba, paletteColorForKey } from "@/lib/ui/palette";
import SharedEditableField from "@/components/ui/EditableField";
import DetailPanelShell from "@/components/ui/DetailPanelShell";

// Network rows open blank fields directly into the input ("Add <label>…"),
// so preset `openWhenEmpty` here and keep the existing call sites unchanged.
function EditableField(props: { label: string; value: string | null; placeholder?: string; onSave: (v: string | null) => void }) {
  return <SharedEditableField {...props} openWhenEmpty />;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Tags are user-created labels — colored deterministically from the shared
// 10-color palette so the same tag reads the same color across every module.
function tagStyle(tag: string): { bg: string; color: string } {
  const { hex } = paletteColorForKey(tag);
  return { bg: hexToRgba(hex, 0.12), color: hex };
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


const PRESET_TAGS = ["Gallery", "Client", "Supplier", "Press", "Event"];

function initials(c: Contact) { return (c.first_name[0] + (c.last_name[0] ?? "")).toUpperCase(); }

function lastContactedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never contacted", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today", color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`, color: "var(--color-sage)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: days < 14 ? "var(--color-charcoal)" : "var(--color-gold)" };
  return { label: `${Math.floor(days / 30)}mo ago`, color: "var(--color-red-orange)" };
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

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ contactId, tasks, setTasks, highlightedTaskId }: {
  contactId:          string;
  tasks:              Task[];
  setTasks:           React.Dispatch<React.SetStateAction<Task[]>>;
  highlightedTaskId?: string | null;
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
            {openTasks.map(task => {
              const hi = highlightedTaskId === task.id;
              return (
              <div
                key={task.id}
                id={`contact-task-${task.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 8px", marginLeft: -8, marginRight: -8, borderRadius: 6,
                  borderBottom: "0.5px solid var(--color-border)",
                  background: hi ? "rgba(var(--color-sage-rgb),0.18)" : "transparent",
                  transition: "background 0.6s ease",
                }}
              >
                <button onClick={() => toggleTask(task.id, true)}
                  style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--color-border-strong)", background: "transparent", cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-sage)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-strong)"} />
                <span style={{ flex: 1, fontSize: 13, color: "var(--color-charcoal)" }}>{task.title}</span>
                {task.due_date && <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              </div>
              );
            })}
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

function NotesTab({ contactId, notes, setNotes, highlightedNoteId }: {
  contactId:          string;
  notes:              Note[];
  setNotes:           React.Dispatch<React.SetStateAction<Note[]>>;
  /** When set, the matching note is briefly tinted sage — used by the
   *  "View note →" affordance after a convert-to-note. */
  highlightedNoteId?: string | null;
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
          : notes.map(note => {
            const hi = highlightedNoteId === note.id;
            return (
            <a key={note.id} href={`/notes?id=${note.id}`}
              id={`contact-note-${note.id}`}
              style={{
                display: "block", padding: "12px 14px", marginBottom: 8, borderRadius: 10,
                background: hi ? "rgba(var(--color-sage-rgb),0.18)" : "var(--color-off-white)",
                border: `0.5px solid ${hi ? "rgba(var(--color-sage-rgb),0.46)" : "var(--color-border)"}`,
                textDecoration: "none", cursor: "pointer",
                transition: "background 0.6s ease, border-color 0.6s ease",
              }}
              onMouseEnter={e => { if (!hi) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
              onMouseLeave={e => { if (!hi) e.currentTarget.style.borderColor = "var(--color-border)"; }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 2 }}>{note.title || "Untitled"}</p>
              {note.content && <p style={{ fontSize: 11, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.content.replace(/<[^>]*>/g, " ").trim().slice(0, 100)}</p>}
              <p style={{ fontSize: 10, color: "var(--color-grey)", marginTop: 4 }}>{new Date(note.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </a>
            );
          })
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

// ── Ash prompt builder ────────────────────────────────────────────────────────
//
// Picks the most useful contextual action for the contact (lead stage,
// freshness of last contact) and appends a small list of always-relevant
// generic prompts. Mirrors the intelligence that used to live in the
// removed ContactAshStrip, now surfaced as a left-rail module.

interface ContactAshPrompts {
  headline:      string;
  primary:       AshPrompt;
  prompts:       AshPrompt[];
}

function buildContactAshPrompts(contact: Contact): ContactAshPrompts {
  const name = contact.first_name;

  let headline: string;
  let primary:  AshPrompt;

  if (contact.is_lead) {
    const stage = contact.lead_stage ?? "new";
    if (stage === "new") {
      headline = `${name} is a new lead. I can help you craft a strong opener.`;
      primary  = { label: "Draft an opener", message: `Write a personalized first-touch message to ${name}. Keep it genuine and short — no fluff.` };
    } else if (stage === "reached_out") {
      headline = `You've reached out to ${name}. I can draft a follow-up if there's been no reply.`;
      primary  = { label: "Draft a follow-up", message: `Draft a brief, non-pushy follow-up to ${name}. Reference the first message and give them a clear, easy next step.` };
    } else if (stage === "in_conversation") {
      headline = `You're in conversation with ${name}. Want help moving things forward?`;
      primary  = { label: "Move it forward", message: `Help me advance my conversation with ${name}. What's the best move to get to a clear yes or no?` };
    } else {
      headline = `I can help you think through your next move with ${name}.`;
      primary  = { label: "Plan the next move", message: `What's the best next step with ${name} as a lead? Give me a concrete action and the message to send.` };
    }
  } else {
    const days = contact.last_contacted_at
      ? Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / 86400000)
      : null;
    if (days === null || days > 60) {
      headline = days === null
        ? `You haven't logged any contact with ${name} yet. I can draft a check-in.`
        : `It's been ${Math.floor(days / 30)} months since you connected with ${name}. I can draft a check-in.`;
      primary  = { label: "Draft a check-in", message: `Draft a warm, genuine check-in message to ${name}. Keep it natural — no selling.` };
    } else if (days > 30) {
      headline = `You last spoke with ${name} ${days} days ago. Good time for a follow-up?`;
      primary  = { label: "Draft a follow-up", message: `Draft a follow-up to ${name} that picks up naturally from where you left off.` };
    } else {
      headline = `I can help you prepare for your next interaction with ${name}.`;
      primary  = { label: "Prep for chat", message: `What should I know about ${name} before my next conversation? Give me key context and one thing to bring up.` };
    }
  }

  const prompts: AshPrompt[] = contact.is_lead
    ? [
        { label: `What's a good opener for ${name}?`,        message: `What's the strongest opener I could send ${name}? Suggest 2 angles.` },
        { label: `How should I qualify ${name}?`,            message: `Help me qualify ${name} as a lead — what questions should I be answering before I invest more time?` },
        { label: "Summarize what I know",                    message: `Summarize everything I have on ${name} — activity, notes, tags. Pull the relevant signals into one paragraph.` },
      ]
    : [
        { label: `What should I know about ${name}?`,        message: `What should I know about ${name} based on the activity, notes, and tags I have on file?` },
        { label: `Summarize my history with ${name}`,        message: `Summarize my full history with ${name} — every logged activity and note. Highlight anything I should bring up next time.` },
        { label: "Draft a message to send next",             message: `Suggest the next message I should send ${name}. Match the tone of how we've communicated before.` },
      ];

  return { headline, primary, prompts };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  contact:    Contact;
  onClose:    () => void;
  onUpdated:  (contact: Contact) => void;
  onArchived: (id: string) => void;
  /** When the panel is opened via a deep-link (e.g. Ash inline action that
   *  created a contact-linked task), these steer the initial tab + which
   *  row to briefly tint. */
  initialTab?:              string | null;
  initialHighlightTaskId?:  string | null;
  initialHighlightNoteId?:  string | null;
}

type SectionTab = "canvas" | "activity" | "tasks" | "notes" | "files";
const SECTION_TABS = new Set<SectionTab>(["canvas", "activity", "tasks", "notes", "files"]);

// ── Main component ────────────────────────────────────────────────────────────

export default function ContactDetailPanel({
  contact: initialContact, onClose, onUpdated, onArchived,
  initialTab, initialHighlightTaskId, initialHighlightNoteId,
}: Props) {
  const supabase = createClient();

  const [contact,        setContact]        = useState(initialContact);
  const [activities,     setActivities]     = useState<EntityActivity[]>([]);
  const [linkedProjects, setLinkedProjects] = useState<Project[]>([]);
  const [tasks,          setTasks]          = useState<Task[]>([]);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [activeTab,      setActiveTab]      = useState<SectionTab>(
    initialTab && SECTION_TABS.has(initialTab as SectionTab) ? (initialTab as SectionTab) : "canvas",
  );
  const [maximized,      setMaximized]      = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [invoiceData,    setInvoiceData]    = useState<{ count: number; total: number } | null>(null);
  // Briefly tints a row in the Tasks / Notes tab — used by the "View note →"
  // affordance after a convert-to-note, and by deep-links from Ash inline
  // actions ("View task →" landing on the contact's Tasks subtab).
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(initialHighlightNoteId ?? null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(initialHighlightTaskId ?? null);

  // Clear initial highlights after a beat so the tint settles back to neutral.
  useEffect(() => {
    if (!initialHighlightNoteId && !initialHighlightTaskId) return;
    const t = setTimeout(() => {
      setHighlightedNoteId(null);
      setHighlightedTaskId(null);
    }, 2400);
    return () => clearTimeout(t);
  }, [initialHighlightNoteId, initialHighlightTaskId]);

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

  // Organization picker — the contact↔org link is a real relationship, so
  // surface the user's existing orgs as a searchable dropdown (with a "create"
  // affordance) rather than a blind free-text field.
  const [allOrgs,       setAllOrgs]       = useState<Organization[]>([]);
  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [orgSearch,     setOrgSearch]     = useState("");
  const orgPickerRef = useRef<HTMLDivElement>(null);

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

  // Load the user's organizations once — feeds the org-link picker.
  useEffect(() => {
    createClient()
      .from("organizations")
      .select("*")
      .eq("archived", false)
      .order("name")
      .then(({ data }) => { if (data) setAllOrgs(data as Organization[]); });
  }, []);

  // Skip the per-contact-change tab reset on the very first mount, so a
  // deep-link `initialTab` survives. Subsequent contact changes (opening a
  // different contact's panel without unmounting) still reset to Canvas.
  const firstLoadRef = useRef(true);

  useEffect(() => {
    setContact(initialContact);
    if (!firstLoadRef.current) {
      setActiveTab("canvas");
    }
    firstLoadRef.current = false;
    setSettingsOpen(false);

    const s = createClient();
    Promise.all([
      s.from("contact_activities").select("*").eq("contact_id", initialContact.id).order("occurred_at", { ascending: false }),
      s.from("project_contacts").select("project:projects(*)").eq("contact_id", initialContact.id),
      s.from("tasks").select("*, project:projects(id,title)").eq("contact_id", initialContact.id).order("created_at", { ascending: false }),
      s.from("notes").select("*").eq("contact_id", initialContact.id).order("updated_at", { ascending: false }),
      s.from("invoices").select("id, line_items:invoice_line_items(amount)").eq("client_contact_id", initialContact.id),
    ]).then(([{ data: a }, { data: pr }, { data: t }, { data: n }, { data: inv }]) => {
      if (a)  setActivities(a as EntityActivity[]);
      if (pr) setLinkedProjects(pr.map((r: { project: Project | Project[] }) => Array.isArray(r.project) ? r.project[0] : r.project).filter(Boolean) as Project[]);
      if (t)  setTasks(t as Task[]);
      if (n)  setNotes(n as Note[]);
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
        if (showOrgPicker)     { setShowOrgPicker(false); return; }
        if (showProjectPicker) { setShowProjectPicker(false); return; }
        if (statusOpen)        { setStatusOpen(false); return; }
        if (stageOpen)         { setStageOpen(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, showProjectPicker, showOrgPicker, statusOpen, stageOpen]);

  useEffect(() => {
    if (!showProjectPicker) return;
    function h(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowProjectPicker(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showProjectPicker]);

  useEffect(() => {
    if (!showOrgPicker) return;
    function h(e: MouseEvent) { if (orgPickerRef.current && !orgPickerRef.current.contains(e.target as Node)) setShowOrgPicker(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showOrgPicker]);

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
    const { data } = await supabase.from("contacts").update(updates).eq("id", contact.id).select("*, organization:organizations(*)").single();
    if (data) { const c = data as Contact; setContact(c); onUpdated(c); }
  }

  // Persist an org link by id (null clears it). Used by the picker.
  async function linkOrganizationId(organization_id: string | null) {
    const { data } = await supabase.from("contacts").update({ organization_id }).eq("id", contact.id).select("*, organization:organizations(*)").single();
    if (data) { setContact(data as Contact); onUpdated(data as Contact); }
    setShowOrgPicker(false);
    setOrgSearch("");
  }

  // Create a brand-new org from typed text, link the contact to it, and seed
  // it into the picker list so it's selectable straight away.
  async function createAndLinkOrganization(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    // Reuse an existing org with the same name (case-insensitive) if present.
    const { data: ex } = await supabase.from("organizations").select("*").eq("user_id", user.id).ilike("name", trimmed).maybeSingle();
    let org = ex as Organization | null;
    if (!org) {
      const { data: created } = await supabase.from("organizations").insert({ user_id: user.id, name: trimmed }).select("*").single();
      org = (created as Organization) ?? null;
    }
    if (!org) return;
    setAllOrgs(prev => prev.some(o => o.id === org!.id) ? prev : [...prev, org!].sort((a, b) => a.name.localeCompare(b.name)));
    await linkOrganizationId(org.id);
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
    const { data } = await supabase.from("contacts").update({ is_lead: false, status: "active", lead_stage: null }).eq("id", contact.id).select("*, organization:organizations(*)").single();
    if (data) { setContact(data as Contact); onUpdated(data as Contact); }
    setConfirmConvert(false);
  }

  function handleArchive() { setConfirmArchive(true); }
  function convertToContact() { setConfirmConvert(true); }

  // ── Ash ─────────────────────────────────────────────────────────────────────

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

  const orgQuery = orgSearch.trim().toLowerCase();
  const orgFiltered = allOrgs.filter(o => o.name.toLowerCase().includes(orgQuery));
  // Offer "Create" when the typed name doesn't exactly match an existing org.
  const orgExactMatch = allOrgs.some(o => o.name.toLowerCase() === orgQuery);

  // ── Ash prompts (left-rail module — replaces the bottom strip) ──────────────
  // The "primary" prompt is the one most worth doing right now given who
  // this contact is and how recently you've connected. The rest are
  // generic asks that always apply.
  const ashContext = useMemo(() => buildContactAshPrompts(contact), [contact]);

  return (
    <>
      <DetailPanelShell maximized={maximized} onClose={onClose}>

        {/* ── Left sidebar (252px) ── */}
        <div style={{
          width: 252, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          borderRadius: maximized ? 0 : "12px 0 0 12px",
        }}>
          {/* Scrollable top. overflowX is locked to hidden — when only
              overflowY is set to "auto", browsers resolve overflowX to "auto"
              too, which exposes horizontal scroll the moment any child
              (e.g. an EditableField input) overflows. */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "18px 16px 12px" }}>

            {/* Identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  title="Upload photo"
                  style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, flexShrink: 0, background: contact.is_lead ? "rgba(var(--color-gold-rgb),0.12)" : "var(--color-cream)", border: "0.5px solid var(--color-border)", color: contact.is_lead ? "var(--color-gold)" : "var(--color-text-secondary)", cursor: "pointer", overflow: "hidden" }}>
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
                {contact.is_lead && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-gold)", background: "rgba(var(--color-gold-rgb),0.12)", border: "0.5px solid #b8860b55", padding: "1px 6px", borderRadius: 9999 }}>Lead</span>}
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

              {/* Organization — searchable picker over the user's orgs, with a
                  create-on-the-fly affordance. An empty link reads as an open
                  "Link an organization…" field that opens the list on focus. */}
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--color-border)", minWidth: 0 }}>
                <span style={{ fontSize: 11, color: "var(--color-grey)", width: 68, flexShrink: 0 }}>Organization</span>
                <div ref={orgPickerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  {contact.organization ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <button onClick={() => { setShowOrgPicker(true); setOrgSearch(""); }}
                        style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 12, color: "var(--color-blue)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: 0 }}
                        title="Change organization">
                        {contact.organization.name}
                      </button>
                      <button onClick={() => linkOrganizationId(null)} title="Unlink organization"
                        style={{ color: "var(--color-grey)", border: "none", background: "transparent", cursor: "pointer", flexShrink: 0, display: "flex", padding: 0 }}>
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <input
                      value={orgSearch}
                      onChange={e => { setOrgSearch(e.target.value); setShowOrgPicker(true); }}
                      onFocus={() => setShowOrgPicker(true)}
                      placeholder="Link an organization…"
                      style={{ width: "100%", minWidth: 0, fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }}
                    />
                  )}
                  {showOrgPicker && (
                    <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 10, width: 220, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                      <div style={{ padding: "6px 10px", borderBottom: "0.5px solid var(--color-border)" }}>
                        <input type="text" value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Search organizations…" autoFocus
                          onKeyDown={e => { if (e.key === "Enter" && orgQuery && !orgExactMatch) { e.preventDefault(); createAndLinkOrganization(orgSearch); } }}
                          style={{ width: "100%", fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
                      </div>
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {orgFiltered.map(o => (
                          <button key={o.id} onClick={() => linkOrganizationId(o.id)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--color-charcoal)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: "0.5px solid var(--color-border)", display: "flex", alignItems: "center", gap: 6 }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <Link2 size={11} style={{ color: "var(--color-blue)", flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                          </button>
                        ))}
                        {orgQuery && !orgExactMatch && (
                          <button onClick={() => createAndLinkOrganization(orgSearch)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, color: "var(--color-blue)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            + Create “{orgSearch.trim()}”
                          </button>
                        )}
                        {orgFiltered.length === 0 && !orgQuery && (
                          <p style={{ fontSize: 12, textAlign: "center", padding: "12px", color: "var(--color-grey)" }}>No organizations yet</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

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
                      style={{ fontSize: 10, color: "var(--color-blue)", background: "transparent", border: "0.5px dashed var(--color-border)", borderRadius: 9999, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit" }}>+ Tag</button>
                }
              </div>
              {editingTags && tagInput === "" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {PRESET_TAGS.filter(t => !contact.tags.includes(t)).map(t => (
                    <button key={t} onClick={() => addTag(t)} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 9999, background: "var(--color-cream)", color: "var(--color-grey)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Linked projects */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", flex: 1, margin: 0 }}>Projects</p>
                <div ref={pickerRef} style={{ position: "relative" }}>
                  <button onClick={openProjectPicker} style={{ fontSize: 10, color: "var(--color-blue)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>+ Link</button>
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
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>{invoiceData.count}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Total invoiced</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>${invoiceData.total.toLocaleString()}</span>
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
                    <span style={{ color: active ? "var(--color-sage-deep)" : "var(--color-grey)" }}>{item.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, textAlign: "left", color: active ? "var(--color-sage-deep)" : "var(--color-grey)", fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {item.count !== undefined && item.count > 0 && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{item.count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Ash module — context-aware prompts in a sage-tinted card */}
            <AshPromptsModule
              headline={ashContext.headline}
              primaryPrompt={ashContext.primary}
              prompts={ashContext.prompts}
              context={{ contact: { name: `${contact.first_name} ${contact.last_name}`, is_lead: contact.is_lead } }}
              placeholder={`Ask Ash about ${contact.first_name}…`}
            />
          </div>

          {/* Settings (bottom) */}
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 8px 8px", flexShrink: 0 }}>
            {settingsOpen && (
              <div style={{ paddingBottom: 4 }}>
                {contact.is_lead && (
                  <button onClick={convertToContact} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "var(--color-green-deep)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--color-green-deep-rgb),0.07)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Users size={13} strokeWidth={1.75} />
                    <span style={{ fontSize: 12 }}>Convert to contact</span>
                  </button>
                )}
                <button onClick={handleArchive} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "var(--color-gold)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--color-gold-rgb),0.07)"}
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
              <Canvas key={contact.id} scope="contact" entityId={contact.id} />
            )}
            {activeTab === "activity" && (
              <EntityActivityTab
                activitiesTable="contact_activities"
                fkColumn="contact_id"
                id={contact.id}
                activities={activities}
                setActivities={setActivities}
                parent={{
                  table: "contacts",
                  bumpColumn: "last_contacted_at",
                  currentValue: contact.last_contacted_at,
                  onBumped: iso => { const next = { ...contact, last_contacted_at: iso }; setContact(next); onUpdated(next); },
                }}
              />
            )}
            {activeTab === "tasks" && (
              <TasksTab contactId={contact.id} tasks={tasks} setTasks={setTasks} highlightedTaskId={highlightedTaskId} />
            )}
            {activeTab === "notes" && (
              <NotesTab contactId={contact.id} notes={notes} setNotes={setNotes} highlightedNoteId={highlightedNoteId} />
            )}
            {activeTab === "files" && (
              <ContactFilesTab key={contact.id} contactId={contact.id} />
            )}
          </div>
        </div>
      </DetailPanelShell>

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
