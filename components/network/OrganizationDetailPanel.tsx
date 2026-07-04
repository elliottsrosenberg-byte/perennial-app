"use client";

import { useState, useEffect, useMemo, useRef, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization, OrganizationFile, Contact, OutreachTarget, Task, Note } from "@/types/database";
import { X, Maximize2, Minimize2, FileText, CheckSquare, FolderOpen, Calendar, Settings, Trash2, Link2 } from "lucide-react";
import Canvas from "@/components/canvas/Canvas";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AshPromptsModule, { type AshPrompt } from "@/components/ui/AshPromptsModule";
import EntityActivityTab, { type EntityActivity } from "@/components/detail/EntityActivityTab";
import { hexToRgba, paletteColorForKey } from "@/lib/ui/palette";
import SharedEditableField from "@/components/ui/EditableField";
import DetailPanelShell from "@/components/ui/DetailPanelShell";

// ── Constants ─────────────────────────────────────────────────────────────────

// Tags are user-created labels — colored deterministically from the shared
// 10-color palette so the same tag reads the same color across every module.
function tagStyle(tag: string): { bg: string; color: string } {
  const { hex } = paletteColorForKey(tag);
  return { bg: hexToRgba(hex, 0.12), color: hex };
}


const PRESET_TAGS = ["Gallery", "Brand", "Publication", "Press", "Fair"];

function initials(org: Organization) {
  const n = org.name.trim();
  if (!n) return "—";
  return n.slice(0, 2).toUpperCase();
}

function lastTouchedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today", color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`, color: "var(--color-sage)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: days < 14 ? "var(--color-charcoal)" : "var(--color-gold)" };
  return { label: `${Math.floor(days / 30)}mo ago`, color: "var(--color-red-orange)" };
}

// ── Editable fields (shared primitive, Network presets) ──────────────────────
//
// Both Network detail panels open blank fields directly into the input
// ("Add <label>…"), so preset `openWhenEmpty` here and keep the call sites
// unchanged. Bio / Description use the multiline textarea variant.

function EditableField(props: { label: string; value: string | null; placeholder?: string; onSave: (v: string | null) => void }) {
  return <SharedEditableField {...props} openWhenEmpty />;
}

function EditableTextarea(props: { label: string; value: string | null; placeholder?: string; onSave: (v: string | null) => void }) {
  return <SharedEditableField {...props} openWhenEmpty multiline />;
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

function TasksTab({ organizationId, tasks, setTasks, highlightedTaskId }: {
  organizationId:     string;
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
    const { data } = await supabase.from("tasks").insert({ user_id: user.id, organization_id: organizationId, title: taskInput.trim(), completed: false }).select("*, project:projects(id,title)").single();
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
                id={`organization-task-${task.id}`}
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

function NotesTab({ organizationId, notes, setNotes, highlightedNoteId }: {
  organizationId:     string;
  notes:              Note[];
  setNotes:           React.Dispatch<React.SetStateAction<Note[]>>;
  highlightedNoteId?: string | null;
}) {
  async function createNote() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const { data } = await supabase.from("notes").insert({ user_id: user.id, organization_id: organizationId }).select().single();
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
              id={`organization-note-${note.id}`}
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

// ── Files tab ─────────────────────────────────────────────────────────────────

type FileAddMode = "upload" | "link" | null;

function OrganizationFilesTab({ organizationId }: { organizationId: string }) {
  const [files,     setFiles]     = useState<OrganizationFile[]>([]);
  const [addMode,   setAddMode]   = useState<FileAddMode>(null);
  const [newName,   setNewName]   = useState("");
  const [newUrl,    setNewUrl]    = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient().from("organization_files").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setFiles(data as OrganizationFile[]); setLoading(false); });
  }, [organizationId]);

  async function saveToDb(name: string, url: string, fileType: string | null, sizeBytes: number | null) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("organization_files")
      .insert({ organization_id: organizationId, user_id: user.id, name, url, file_type: fileType, size_bytes: sizeBytes })
      .select().single();
    if (data) setFiles(prev => [data as OrganizationFile, ...prev]);
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
      // Reuse the `contact-files` bucket; org assets live under an org-files
      // subpath so they're contained and easy to query.
      const path = `${user.id}/org-files/${organizationId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
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
    await createClient().from("organization_files").delete().eq("id", id);
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
            <p style={{ fontSize: 11 }}>Upload portfolios, decks, reference images</p>
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

interface OrgAshPrompts {
  headline: string;
  primary:  AshPrompt;
  prompts:  AshPrompt[];
}

function buildOrgAshPrompts(org: Organization): OrgAshPrompts {
  const name = org.name;
  const days = org.last_touched_at
    ? Math.floor((Date.now() - new Date(org.last_touched_at).getTime()) / 86400000)
    : null;

  let headline: string;
  let primary:  AshPrompt;
  if (days === null || days > 60) {
    headline = `Help me prepare to reach out to ${name}.`;
    primary  = { label: "Prep an outreach", message: `Help me prepare to reach out to ${name}. Give me a clear angle and the kind of opener that would land.` };
  } else if (days > 30) {
    headline = `It's been a while since you touched base with ${name}. Want help re-engaging?`;
    primary  = { label: "Draft a follow-up", message: `Draft a follow-up to ${name} that picks up naturally from our last interaction.` };
  } else {
    headline = `I can help you think through your next move with ${name}.`;
    primary  = { label: "Plan the next move", message: `What's the best next step with ${name} right now? Give me a concrete action.` };
  }

  const prompts: AshPrompt[] = [
    { label: `Research ${name}`,                       message: `Research ${name} — what should I know about who they represent, what they do, and how they work?` },
    { label: `What should I know about ${name}?`,      message: `What should I know about ${name} based on the activity, notes, and tags I have on file?` },
    { label: `What might ${name} be open to?`,         message: `Given everything I know about ${name}, what kinds of work or proposals might they be open to right now?` },
  ];

  return { headline, primary, prompts };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  organization: Organization;
  onClose:      () => void;
  onUpdated:    (org: Organization) => void;
  onArchived:   (id: string) => void;
  initialTab?:              string | null;
  initialHighlightTaskId?:  string | null;
  initialHighlightNoteId?:  string | null;
}

type SectionTab = "canvas" | "activity" | "tasks" | "notes" | "files";
const SECTION_TABS = new Set<SectionTab>(["canvas", "activity", "tasks", "notes", "files"]);

// ── Linked outreach target row type (compact join shape) ──────────────────────

type LinkedTarget = Pick<OutreachTarget, "id" | "name" | "pipeline_id" | "stage_id"> & {
  pipeline?: { id: string; name: string; color: string } | null;
  stage?:    { id: string; name: string } | null;
};

// ── Main component ────────────────────────────────────────────────────────────

export default function OrganizationDetailPanel({
  organization: initialOrg, onClose, onUpdated, onArchived,
  initialTab, initialHighlightTaskId, initialHighlightNoteId,
}: Props) {
  const supabase = createClient();

  const [org,            setOrg]            = useState(initialOrg);
  const [activities,     setActivities]     = useState<EntityActivity[]>([]);
  const [people,         setPeople]         = useState<Contact[]>([]);
  const [linkedTargets,  setLinkedTargets]  = useState<LinkedTarget[]>([]);
  const [tasks,          setTasks]          = useState<Task[]>([]);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [activeTab,      setActiveTab]      = useState<SectionTab>(
    initialTab && SECTION_TABS.has(initialTab as SectionTab) ? (initialTab as SectionTab) : "canvas",
  );
  const [maximized,      setMaximized]      = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [invoiceData,    setInvoiceData]    = useState<{ count: number; total: number } | null>(null);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(initialHighlightNoteId ?? null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(initialHighlightTaskId ?? null);

  useEffect(() => {
    if (!initialHighlightNoteId && !initialHighlightTaskId) return;
    const t = setTimeout(() => {
      setHighlightedNoteId(null);
      setHighlightedTaskId(null);
    }, 2400);
    return () => clearTimeout(t);
  }, [initialHighlightNoteId, initialHighlightTaskId]);

  // Avatar
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Tags
  const [editingTags, setEditingTags] = useState(false);
  const [tagInput,    setTagInput]    = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // ── Ash context broadcast + hide floating Ash button in scrim mode ──────────

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("set-organization-context", {
      detail: { name: initialOrg.name },
    }));
    if (!maximized) {
      const style = document.createElement("style");
      style.id = "organization-panel-ash-hide";
      style.textContent = ".ash-fab { opacity: 0 !important; pointer-events: none !important; }";
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById("organization-panel-ash-hide")?.remove();
    };
  }, [maximized, initialOrg.name]);

  useEffect(() => {
    return () => { window.dispatchEvent(new CustomEvent("clear-organization-context")); };
  }, []);

  // ── Load data ───────────────────────────────────────────────────────────────

  // Skip the per-org tab reset on first mount so a deep-link `initialTab`
  // survives. Subsequent org changes (opening a different org without
  // unmounting) still reset to Canvas.
  const firstLoadRef = useRef(true);

  useEffect(() => {
    setOrg(initialOrg);
    if (!firstLoadRef.current) {
      setActiveTab("canvas");
    }
    firstLoadRef.current = false;
    setSettingsOpen(false);

    const s = createClient();
    Promise.all([
      s.from("organization_activities").select("*").eq("organization_id", initialOrg.id).order("occurred_at", { ascending: false }),
      s.from("contacts").select("*").eq("organization_id", initialOrg.id).eq("archived", false).order("first_name"),
      s.from("outreach_targets").select("id, name, pipeline_id, stage_id, pipeline:outreach_pipelines(id,name,color), stage:pipeline_stages(id,name)").eq("organization_id", initialOrg.id),
      s.from("tasks").select("*, project:projects(id,title)").eq("organization_id", initialOrg.id).order("created_at", { ascending: false }),
      s.from("notes").select("*").eq("organization_id", initialOrg.id).order("updated_at", { ascending: false }),
      s.from("invoices").select("id, line_items:invoice_line_items(amount)").eq("client_organization_id", initialOrg.id),
    ]).then(([{ data: a }, { data: c }, { data: ot }, { data: t }, { data: n }, { data: inv }]) => {
      if (a)  setActivities(a as EntityActivity[]);
      if (c)  setPeople(c as Contact[]);
      if (ot) {
        // Supabase typings flatten the join through `unknown`; the select
        // is shape-locked, so this cast is safe.
        const rows = ot as unknown as Array<{
          id: string; name: string; pipeline_id: string; stage_id: string | null;
          pipeline: { id: string; name: string; color: string } | { id: string; name: string; color: string }[] | null;
          stage:    { id: string; name: string } | { id: string; name: string }[] | null;
        }>;
        setLinkedTargets(rows.map(r => ({
          id: r.id, name: r.name, pipeline_id: r.pipeline_id, stage_id: r.stage_id,
          pipeline: Array.isArray(r.pipeline) ? r.pipeline[0] ?? null : r.pipeline,
          stage:    Array.isArray(r.stage)    ? r.stage[0]    ?? null : r.stage,
        })));
      }
      if (t)  setTasks(t as Task[]);
      if (n)  setNotes(n as Note[]);
      if (inv && inv.length > 0) {
        type Inv = { id: string; line_items: { amount: number }[] };
        const invs = inv as unknown as Inv[];
        const total = invs.reduce((s, i) => s + i.line_items.reduce((ss, l) => ss + Number(l.amount), 0), 0);
        setInvoiceData({ count: invs.length, total });
      }
    });
  }, [initialOrg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Field save ──────────────────────────────────────────────────────────────

  async function saveField(updates: Partial<Organization>) {
    const { data } = await supabase.from("organizations").update(updates).eq("id", org.id).select("*").single();
    if (data) { const o = data as Organization; setOrg(o); onUpdated(o); }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    // Same `contact-files` bucket as Contact avatars; org avatars live under
    // an `org-avatars/` subpath so the two don't collide.
    const path = `${user.id}/org-avatars/${org.id}.${ext}`;
    const { error } = await supabase.storage.from("contact-files").upload(path, file, { contentType: file.type, upsert: true });
    if (error) { console.error("Avatar upload error:", error); return; }
    const { data: urlData } = supabase.storage.from("contact-files").getPublicUrl(path);
    await saveField({ avatar_url: urlData.publicUrl + `?t=${Date.now()}` });
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  async function addTag(raw: string) {
    const tag = raw.trim(); setTagInput("");
    if (!tag || org.tags.includes(tag)) return;
    await saveField({ tags: [...org.tags, tag] });
  }
  async function removeTag(tag: string) { await saveField({ tags: org.tags.filter(t => t !== tag) }); }
  function onTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
    if (e.key === "Backspace" && tagInput === "" && org.tags.length > 0) removeTag(org.tags[org.tags.length - 1]);
    if (e.key === "Escape") { setEditingTags(false); setTagInput(""); }
  }

  // ── Archive ─────────────────────────────────────────────────────────────────

  const [confirmArchive, setConfirmArchive] = useState(false);

  async function performArchive() {
    await supabase.from("organizations").update({ archived: true }).eq("id", org.id);
    setConfirmArchive(false);
    onArchived(org.id); onClose();
  }

  function handleArchive() { setConfirmArchive(true); }

  // ── Open linked entities via custom events ──────────────────────────────────
  //
  // Avoid mounting a ContactDetailPanel inside this panel — the parent
  // (Network module shell, PR 4) will listen for these and swap panels.

  function openContact(contactId: string) {
    window.dispatchEvent(new CustomEvent("network:open-contact", { detail: { contact_id: contactId } }));
  }
  function openTarget(targetId: string, pipelineId: string) {
    window.dispatchEvent(new CustomEvent("outreach:open-target", {
      detail: { target_id: targetId, pipeline_id: pipelineId },
    }));
  }

  // ── Nav items ───────────────────────────────────────────────────────────────

  const NAV_ITEMS: { key: SectionTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "canvas",   label: "Canvas",   icon: <FileText    size={13} strokeWidth={1.75} /> },
    { key: "activity", label: "Activity", icon: <Calendar    size={13} strokeWidth={1.75} />, count: activities.length },
    { key: "tasks",    label: "Tasks",    icon: <CheckSquare size={13} strokeWidth={1.75} />, count: tasks.filter(t => !t.completed).length },
    { key: "notes",    label: "Notes",    icon: <FileText    size={13} strokeWidth={1.75} />, count: notes.length },
    { key: "files",    label: "Files",    icon: <FolderOpen  size={13} strokeWidth={1.75} /> },
  ];

  const lastT = lastTouchedDisplay(org.last_touched_at);

  const ashContext = useMemo(() => buildOrgAshPrompts(org), [org]);

  return (
    <>
      <DetailPanelShell maximized={maximized} onClose={onClose}>

        {/* ── Left sidebar (252px) ── */}
        <div style={{
          width: 252, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          borderRadius: maximized ? 0 : "12px 0 0 12px",
        }}>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "18px 16px 12px" }}>

            {/* Identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  title="Upload photo"
                  style={{ width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0, background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-text-secondary)", cursor: "pointer", overflow: "hidden" }}>
                  {org.avatar_url
                    ? <img src={org.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initials(org)}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarUpload} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1.2, marginBottom: 2 }}>
                  <EditableField label="" value={org.name} placeholder="Organization name" onSave={v => {
                    const name = (v ?? "").trim();
                    if (name) saveField({ name });
                  }} />
                </div>
              </div>
            </div>

            {/* Properties */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Details</p>
              <EditableField label="Website"  value={org.website}  placeholder="—" onSave={v => saveField({ website: v })} />
              <EditableField label="Location" value={org.location} placeholder="—" onSave={v => saveField({ location: v })} />
              <EditableField label="Email"    value={org.email}    placeholder="—" onSave={v => saveField({ email: v })} />
              <EditableField label="Phone"    value={org.phone}    placeholder="—" onSave={v => saveField({ phone: v })} />
              <EditableTextarea label="Bio"         value={org.bio}         placeholder="—" onSave={v => saveField({ bio: v })} />
              <EditableTextarea label="Description" value={org.description} placeholder="—" onSave={v => saveField({ description: v })} />
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 11, color: "var(--color-grey)", width: 68, flexShrink: 0 }}>Last touch</span>
                <span style={{ fontSize: 12, color: lastT.color }}>{lastT.label}</span>
              </div>
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Tags</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {org.tags.map(tag => {
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
                  {PRESET_TAGS.filter(t => !org.tags.includes(t)).map(t => (
                    <button key={t} onClick={() => addTag(t)} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 9999, background: "var(--color-cream)", color: "var(--color-grey)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
                  ))}
                </div>
              )}
            </div>

            {/* People at this organization */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>People</p>
              {people.length === 0
                ? <p style={{ fontSize: 11, color: "var(--color-grey)" }}>—</p>
                : people.map((p, i) => (
                  <button key={p.id} onClick={() => openContact(p.id)}
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: i < people.length - 1 ? "0.5px solid var(--color-border)" : "none", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.first_name} {p.last_name}</div>
                      {p.title && <div style={{ fontSize: 10, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>}
                    </div>
                  </button>
                ))
              }
            </div>

            {/* Linked outreach targets */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Outreach</p>
              {linkedTargets.length === 0
                ? <p style={{ fontSize: 11, color: "var(--color-grey)" }}>—</p>
                : linkedTargets.map((t, i) => (
                  <button key={t.id} onClick={() => openTarget(t.id, t.pipeline_id)}
                    style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: i < linkedTargets.length - 1 ? "0.5px solid var(--color-border)" : "none", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {t.pipeline && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.pipeline.color, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.pipeline?.name ?? "Pipeline"}</div>
                      <div style={{ fontSize: 10, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.stage?.name ?? "—"}</div>
                    </div>
                  </button>
                ))
              }
            </div>

            {/* TODO: "Projects involving this org" — projects link to orgs
                transitively via contacts and outreach targets, not directly.
                Defer until we settle the cross-module derived view shape. */}

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
            <div style={{ marginTop: 16, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Workspace</p>
              {NAV_ITEMS.map(item => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
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
              context={{ organization: { name: org.name } }}
              placeholder={`Ask Ash about ${org.name}…`}
            />
          </div>

          {/* Settings (bottom) */}
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 8px 8px", flexShrink: 0 }}>
            {settingsOpen && (
              <div style={{ paddingBottom: 4 }}>
                <button onClick={handleArchive} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "var(--color-gold)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--color-gold-rgb),0.07)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Trash2 size={13} strokeWidth={1.75} />
                  <span style={{ fontSize: 12 }}>Archive organization</span>
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
              <Canvas key={org.id} scope="organization" entityId={org.id} />
            )}
            {activeTab === "activity" && (
              <EntityActivityTab
                activitiesTable="organization_activities"
                fkColumn="organization_id"
                id={org.id}
                activities={activities}
                setActivities={setActivities}
                parent={{
                  table: "organizations",
                  bumpColumn: "last_touched_at",
                  currentValue: org.last_touched_at,
                  onBumped: iso => { const next = { ...org, last_touched_at: iso }; setOrg(next); onUpdated(next); },
                }}
              />
            )}
            {activeTab === "tasks" && (
              <TasksTab organizationId={org.id} tasks={tasks} setTasks={setTasks} highlightedTaskId={highlightedTaskId} />
            )}
            {activeTab === "notes" && (
              <NotesTab organizationId={org.id} notes={notes} setNotes={setNotes} highlightedNoteId={highlightedNoteId} />
            )}
            {activeTab === "files" && (
              <OrganizationFilesTab key={org.id} organizationId={org.id} />
            )}
          </div>
        </div>
      </DetailPanelShell>

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${org.name}?`}
        body={`${org.name} will be removed from your active organizations. People, activity, notes, files, and linked outreach stay attached if you restore it later.`}
        confirmLabel="Archive"
        cancelLabel="Keep"
        tone="danger"
        onConfirm={performArchive}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  );
}
