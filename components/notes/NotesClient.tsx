"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Note, NoteFolder, NoteFolderItem } from "@/types/database";
import { useEditor, EditorContent } from "@tiptap/react";
import { Pin, Search, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, MoreHorizontal, Upload, NotebookPen, Image as ImageIcon, FolderPlus, Folder, Plus, Trash2, Check, ChevronLeft } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import {
  getRichExtensions,
  InlineAshPopover,
  submitInlineAsh,
  insertEditorImageFromFile,
} from "@/components/ui/RichEditor";
import NotesIntroModal from "@/components/tour/notes/NotesIntroModal";
import NotesTooltipTour from "@/components/tour/notes/NotesTooltipTour";
import NotesOptionsMenu from "./NotesOptionsMenu";
import ImportNoteModal from "./ImportNoteModal";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDatetime(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function countWords(html: string) {
  const text = stripHtml(html);
  return text ? text.split(" ").length : 0;
}

function htmlToMarkdown(html: string): string {
  let md = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "```\n$1\n```\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/ul>|<\/ol>/gi, "\n")
    .replace(/<ul[^>]*>|<ol[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return md.trim();
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function toISODate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function dueLabelText(iso: string): string {
  const diff = Math.round(
    (new Date(iso + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000
  );
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 14) return `${diff} days`;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type FilterId =
  | "all"
  | "pinned"
  | `project:${string}`
  | `contact:${string}`
  | `opportunity:${string}`
  | `folder:${string}`;

type ContactOpt     = { id: string; first_name: string; last_name: string };
type OpportunityOpt = { id: string; title: string; category: string };

type LinkState = {
  projectId:     string | null;
  contactId:     string | null;
  opportunityId: string | null;
};

type SuggestedTask = { title: string; dueDate: string | null; selected: boolean };

// ToggleBlock, InlineAsh extension, and InlineAshPopover all live in
// components/ui/RichEditor.tsx so every inline-Ash surface uses the same
// implementation. getRichExtensions wires the toggle + Space-trigger; the
// shared InlineAshPopover renders the prompt UI.


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
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) { setOpen(false); setSearch(""); }
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
        supabase.from("opportunities").select("id, title, category").order("title"),
      ]).then(([{ data: c }, { data: o }]) => {
        if (c) setContacts(c as ContactOpt[]);
        if (o) setOpps(o as OpportunityOpt[]);
        setLoaded(true);
      });
    }
  }

  const hasLinks   = links.projectId || links.contactId || links.opportunityId;
  const q          = search.toLowerCase();
  const fProjects  = projects.filter(p => p.title.toLowerCase().includes(q));
  const fContacts  = contacts.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q));
  const fOpps      = opps.filter(o => o.title.toLowerCase().includes(q));

  const labelParts = [
    links.projectId     ? projects.find(p => p.id === links.projectId)?.title : null,
    links.contactId     ? contacts.find(c => c.id === links.contactId) ? `${contacts.find(c => c.id === links.contactId)!.first_name} ${contacts.find(c => c.id === links.contactId)!.last_name}` : null : null,
    links.opportunityId ? opps.find(o => o.id === links.opportunityId)?.title : null,
  ].filter(Boolean) as string[];

  const TABS: { key: LinkTab; label: string }[] = [
    { key: "projects",      label: "Projects"      },
    { key: "contacts",      label: "Contacts"      },
    { key: "opportunities", label: "Opportunities" },
  ];

  function row(key: string, label: React.ReactNode, selected: boolean, onToggle: () => void) {
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
        {selected ? <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#5a7040" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <div style={{ width: 9 }} />}
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
          display: "flex", alignItems: "center", gap: 5, fontSize: 11,
          padding: "3px 8px", borderRadius: 9999,
          border: `0.5px solid ${open ? "var(--color-border-strong)" : hasLinks ? "rgba(155,163,122,0.3)" : "var(--color-border)"}`,
          background: hasLinks ? "rgba(155,163,122,0.12)" : "transparent",
          color: hasLinks ? "#5a7040" : "var(--color-text-tertiary)",
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", maxWidth: 220,
          transition: "all 0.1s ease",
        }}
        onMouseEnter={e => { if (!hasLinks) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { if (!hasLinks) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 3l4 4-4 4M7 13l-4-4 4-4"/>
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {labelParts.length > 0 ? labelParts.join(", ") : "Link to…"}
        </span>
      </button>

      {open && (
        <div style={{
          position: "absolute", [align === "right" ? "right" : "left"]: 0,
          top: "calc(100% + 5px)", zIndex: 200, width: 300,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 12, boxShadow: "var(--shadow-overlay)",
          display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: 360,
        }}>
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border)", padding: "0 4px", flexShrink: 0 }}>
            {TABS.map(t => (
              <button type="button" key={t.key} onClick={() => { setTab(t.key); setSearch(""); }} style={{
                padding: "7px 10px", fontSize: 11, fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                borderBottom: `2px solid ${tab === t.key ? "var(--color-sage)" : "transparent"}`,
                background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ padding: "6px 8px", flexShrink: 0, borderBottom: "0.5px solid var(--color-border)" }}>
            <input
              autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${tab}…`}
              style={{
                width: "100%", padding: "5px 8px", fontSize: 11,
                border: "0.5px solid var(--color-border)", borderRadius: 6,
                background: "var(--color-surface-sunken)", outline: "none",
                color: "var(--color-text-primary)", fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "4px" }}>
            {!loaded && <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>Loading…</div>}
            {loaded && tab === "projects" && (fProjects.length === 0
              ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No projects</div>
              : <>{links.projectId && row("_clr", <span style={{ color: "var(--color-text-tertiary)" }}>No project</span>, false, () => onChange({ ...links, projectId: null }))}
                  {fProjects.map(p => row(p.id, p.title, links.projectId === p.id, () => onChange({ ...links, projectId: links.projectId === p.id ? null : p.id })))}</>
            )}
            {loaded && tab === "contacts" && (fContacts.length === 0
              ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No contacts</div>
              : <>{links.contactId && row("_clr", <span style={{ color: "var(--color-text-tertiary)" }}>No contact</span>, false, () => onChange({ ...links, contactId: null }))}
                  {fContacts.map(c => row(c.id, `${c.first_name} ${c.last_name}`, links.contactId === c.id, () => onChange({ ...links, contactId: links.contactId === c.id ? null : c.id })))}</>
            )}
            {loaded && tab === "opportunities" && (fOpps.length === 0
              ? <div style={{ padding: "14px 8px", fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>No opportunities</div>
              : <>{links.opportunityId && row("_clr", <span style={{ color: "var(--color-text-tertiary)" }}>No opportunity</span>, false, () => onChange({ ...links, opportunityId: null }))}
                  {fOpps.map(o => row(o.id,
                    <div><div>{o.title}</div><div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>{o.category}</div></div>,
                    links.opportunityId === o.id,
                    () => onChange({ ...links, opportunityId: links.opportunityId === o.id ? null : o.id }),
                  ))}</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FormatToolbar ────────────────────────────────────────────────────────────

function FormatToolbar({
  editor, onGenerateTasks, suggesting,
}: {
  editor:            ReturnType<typeof useEditor> | null;
  onGenerateTasks?:  () => void;
  suggesting?:       boolean;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  async function pickImages(files: FileList | null) {
    if (!files || files.length === 0 || !editor) return;
    for (const f of Array.from(files)) {
      await insertEditorImageFromFile(editor, f);
    }
  }

  function btn(label: React.ReactNode, action: () => void, active?: boolean, title?: string) {
    return (
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); action(); }}
        title={title}
        style={{
          width: 26, height: 26, borderRadius: 5, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? "var(--color-surface-sunken)" : "transparent",
          color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          cursor: "pointer", flexShrink: 0, transition: "all 0.08s ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = active ? "var(--color-surface-sunken)" : "transparent"; }}
      >{label}</button>
    );
  }

  function sep() {
    return <div style={{ width: "0.5px", height: 14, background: "var(--color-border)", margin: "0 2px", flexShrink: 0 }} />;
  }

  return (
    <div data-tour-target="notes.format-toolbar" style={{
      display: "flex", alignItems: "center", gap: 2, padding: "6px 20px", flexShrink: 0,
      borderBottom: "0.5px solid var(--color-border)", background: "var(--color-surface-raised)",
    }}>
      {btn(<Bold size={12} />,          () => editor.chain().focus().toggleBold().run(),          editor.isActive("bold"),      "Bold")}
      {btn(<Italic size={12} />,        () => editor.chain().focus().toggleItalic().run(),        editor.isActive("italic"),    "Italic")}
      {btn(<UnderlineIcon size={12} />, () => editor.chain().focus().toggleUnderline().run(),     editor.isActive("underline"), "Underline")}
      {btn(<Strikethrough size={12} />, () => editor.chain().focus().toggleStrike().run(),        editor.isActive("strike"),    "Strikethrough")}
      {sep()}
      {btn(<span style={{ fontSize: 11, fontWeight: 700 }}>H1</span>, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }), "Heading 1")}
      {btn(<span style={{ fontSize: 11, fontWeight: 700 }}>H2</span>, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }), "Heading 2")}
      {sep()}
      {btn(<List size={12} />,        () => editor.chain().focus().toggleBulletList().run(),  editor.isActive("bulletList"),  "Bullet list")}
      {btn(<ListOrdered size={12} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"), "Numbered list")}
      {sep()}
      {btn(
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 4l4 4-4 4"/><path d="M9 8h5"/>
        </svg>,
        () => editor.chain().focus().insertContent({
          type: "toggleBlock",
          attrs: { summary: "", open: false },
          content: [{ type: "paragraph" }],
        }).run(),
        false,
        "Toggle block",
      )}
      {sep()}
      <button
        type="button"
        title="Insert image"
        onMouseDown={(e) => {
          e.preventDefault();
          const input = imageInputRef.current;
          if (input) input.click();
        }}
        style={{
          width: 26, height: 26, borderRadius: 5, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", color: "var(--color-text-secondary)",
          cursor: "pointer", flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <ImageIcon size={12} />
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          void pickImages(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Generate tasks — Ash gradient border */}
      {onGenerateTasks && (
        <button
          type="button"
          data-tour-target="notes.generate-tasks"
          onClick={onGenerateTasks}
          disabled={suggesting}
          title="Generate tasks from this note"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6,
            background: "linear-gradient(#fffefc, #fffefc) padding-box, linear-gradient(135deg, #a8b886 0%, #4a6232 100%) border-box",
            border: "1px solid transparent",
            color: "#4a6232",
            cursor: suggesting ? "not-allowed" : "pointer",
            opacity: suggesting ? 0.5 : 1, fontFamily: "inherit", flexShrink: 0,
            transition: "opacity 0.1s ease",
          }}
        >
          <svg width="9" height="9" viewBox="0 0 16 16" fill="#4a6232">
            <path d="M8 1l1.2 4.2L14 7l-4.8 1.8L8 14l-1.2-5.2L2 7l4.8-1.8L8 1z"/>
          </svg>
          {suggesting ? "Thinking…" : "Generate tasks"}
        </button>
      )}
    </div>
  );
}

// ─── SuggestTasksModal ────────────────────────────────────────────────────────

function SuggestTasksModal({
  tasks, projectId, projects, onClose, onCreated,
}: {
  tasks:     string[];
  projectId: string | null;
  projects:  { id: string; title: string }[];
  onClose:   () => void;
  onCreated: (count: number) => void;
}) {
  const [items,   setItems]   = useState<SuggestedTask[]>(() => tasks.map(t => ({ title: t, dueDate: null, selected: true })));
  const [loading, setLoading] = useState(false);

  function updateItem(i: number, changes: Partial<SuggestedTask>) {
    setItems(prev => prev.map((item, j) => j === i ? { ...item, ...changes } : item));
  }

  async function create() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const toCreate = items.filter(t => t.selected && t.title.trim());
    await Promise.all(toCreate.map(t =>
      supabase.from("tasks").insert({ user_id: user.id, title: t.title.trim(), completed: false, project_id: projectId, due_date: t.dueDate })
    ));
    onCreated(toCreate.length);
    setLoading(false);
    onClose();
  }

  const selectedCount = items.filter(t => t.selected).length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 460, background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)", borderRadius: 14,
        boxShadow: "var(--shadow-overlay)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "0.5px solid var(--color-border)" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>Suggested tasks</p>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Edit titles, set due dates, and select which to add{projectId ? ` · ${projects.find(p => p.id === projectId)?.title ?? "project"}` : ""}
          </p>
        </div>

        {/* Task rows */}
        <div style={{ padding: "6px 12px", maxHeight: 360, overflowY: "auto" }}>
          {items.length === 0
            ? <p style={{ padding: "16px 8px", fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" }}>No tasks found in this note.</p>
            : items.map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "8px",
                borderRadius: 8, marginBottom: 2,
                background: item.selected ? "rgba(155,163,122,0.06)" : "transparent",
                borderBottom: "0.5px solid var(--color-border)",
              }}>
                {/* Checkbox */}
                <button onClick={() => updateItem(i, { selected: !item.selected })} style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                  background: item.selected ? "var(--color-sage)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", border: item.selected ? "none" : "1.5px solid var(--color-border-strong)",
                }}>
                  {item.selected && <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {!item.selected && <div style={{ width: "100%", height: "100%", borderRadius: 4, border: "1.5px solid var(--color-border-strong)", background: "transparent" }} />}
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={item.title}
                    onChange={e => updateItem(i, { title: e.target.value })}
                    style={{
                      width: "100%", border: "none", outline: "none", background: "transparent",
                      fontSize: 13, color: "var(--color-text-primary)", fontFamily: "inherit",
                      lineHeight: 1.4, marginBottom: 4,
                      textDecoration: item.selected ? "none" : "line-through",
                      opacity: item.selected ? 1 : 0.5,
                    }}
                  />
                  {/* Quick due date */}
                  {item.selected && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      {item.dueDate
                        ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 10, padding: "2px 7px", borderRadius: 9999,
                            background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
                            color: "var(--color-text-secondary)", fontWeight: 500,
                          }}>
                            {dueLabelText(item.dueDate)}
                            <button onClick={() => updateItem(i, { dueDate: null })} style={{
                              border: "none", background: "transparent", cursor: "pointer",
                              color: "var(--color-text-tertiary)", padding: 0, lineHeight: 1, fontSize: 12,
                              display: "flex", alignItems: "center",
                            }}>×</button>
                          </span>
                        )
                        : (
                          <>
                            {[{ label: "Today", offset: 0 }, { label: "Tomorrow", offset: 1 }, { label: "Next week", offset: 7 }].map(s => (
                              <button key={s.label} onClick={() => updateItem(i, { dueDate: toISODate(s.offset) })} style={{
                                fontSize: 10, padding: "2px 7px", borderRadius: 9999,
                                background: "transparent", border: "0.5px solid var(--color-border)",
                                color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit",
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >{s.label}</button>
                            ))}
                          </>
                        )
                      }
                    </div>
                  )}
                </div>
              </div>
            ))
          }
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "0.5px solid var(--color-border)" }}>
          <button onClick={onClose} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12,
            border: "0.5px solid var(--color-border)", background: "transparent",
            color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit",
          }}>Cancel</button>
          <button onClick={create} disabled={loading || selectedCount === 0} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: "var(--color-sage)", color: "white", border: "none",
            cursor: loading || selectedCount === 0 ? "not-allowed" : "pointer",
            opacity: loading || selectedCount === 0 ? 0.6 : 1, fontFamily: "inherit",
          }}>
            {loading ? "Adding…" : `Add ${selectedCount} task${selectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

function NoteEditor({
  note, projects, onUpdate, onGenerateTasks, suggesting,
}: {
  note:             Note;
  projects:         { id: string; title: string }[];
  onUpdate:         (id: string, fields: Partial<Note>) => void;
  onGenerateTasks?: () => void;
  suggesting?:      boolean;
}) {
  const [title,     setTitle]     = useState(note.title ?? "");
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [wordCount, setWordCount] = useState(countWords(note.content ?? ""));
  const [ashPrompt, setAshPrompt] = useState<{ pos: number; anchor: { top: number; left: number; bottom: number } } | null>(null);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase   = createClient();

  const handleAshTrigger = useCallback(
    (pos: number, coords: { top: number; left: number; bottom: number }) => {
      setAshPrompt({ pos, anchor: coords });
    },
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: getRichExtensions({ onAshTrigger: handleAshTrigger }),
    content: note.content ?? "",
    onUpdate({ editor }) {
      const html = editor.getHTML();
      setWordCount(countWords(html));
      scheduleSave({ content: html || null });
    },
    editorProps: {
      attributes: {
        style: "outline: none; min-height: 240px;",
      },
    },
  }, [note.id]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(note.content ?? "");
      setWordCount(countWords(note.content ?? ""));
    }
    setTitle(note.title ?? "");
    setSaving(false);
    setSaved(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  function scheduleSave(fields: Partial<Note>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    setSaved(false);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("notes").update(fields).eq("id", note.id);
      onUpdate(note.id, fields);
      setSaving(false);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    }, 800);
  }

  useEffect(() => {
    if (title === (note.title ?? "")) return;
    scheduleSave({ title: title || null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function handleLinkChange(links: LinkState) {
    const fields = { project_id: links.projectId, contact_id: links.contactId, opportunity_id: links.opportunityId };
    await supabase.from("notes").update(fields).eq("id", note.id);
    onUpdate(note.id, fields);
  }

  function handleAshSubmit(prompt: string) {
    return submitInlineAsh({
      prompt, editor, ashPrompt,
      surface: {
        type:        "note",
        note_id:     note.id,
        note_title:  note.title ?? undefined,
        // Forward any entities the note links to so inline-Ash actions
        // (tasks, activities, etc.) auto-link to the right thing.
        project_id:  note.project_id ?? undefined,
        contact_id:  note.contact_id ?? undefined,
      },
      clearPrompt: () => setAshPrompt(null),
    });
  }

  return (
    <div data-tour-target="notes.editor" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <FormatToolbar editor={editor ?? null} onGenerateTasks={onGenerateTasks} suggesting={suggesting} />

      <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)" }}>
        <div style={{ maxWidth: 720, padding: "40px 64px 80px", margin: "0 auto" }}>
          <input
            data-tour-target="notes.title-input"
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Untitled"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontWeight: 700, lineHeight: 1.25, display: "block", marginBottom: 12,
              fontSize: 24, letterSpacing: "-0.02em", color: "var(--color-text-primary)", fontFamily: "inherit",
            }}
          />

          <div data-tour-target="notes.link-picker" style={{ marginBottom: 12 }}>
            <InlineLinkPicker
              links={{ projectId: note.project_id, contactId: note.contact_id, opportunityId: note.opportunity_id }}
              projects={projects}
              onChange={handleLinkChange}
            />
          </div>

          <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
            {[{ label: "Created", value: fmtDatetime(note.created_at) }, { label: "Modified", value: timeAgo(note.updated_at) }].map(m => (
              <div key={m.label}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 1, color: "var(--color-text-tertiary)" }}>{m.label}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "0.5px solid var(--color-border)", marginBottom: 20 }} />

          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Bottom bar — just status */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        padding: "6px 20px", flexShrink: 0,
        borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)",
        gap: 12,
      }}>
        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginRight: "auto" }}>{wordCount} words</span>
        {saving && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Saving…</span>}
        {!saving && saved && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--color-sage)" }}>
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Saved
          </span>
        )}
      </div>

      {ashPrompt && (
        <InlineAshPopover
          anchor={ashPrompt.anchor}
          onSubmit={handleAshSubmit}
          onClose={() => setAshPrompt(null)}
        />
      )}
    </div>
  );
}

// ─── Filter sidebar item ──────────────────────────────────────────────────────

function FilterItem({
  id, label, count, active, onSelect,
}: {
  id: FilterId; label: string; count?: number;
  active: boolean; onSelect: (id: FilterId) => void;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      style={{
        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 7,
        padding: "5px 10px", borderRadius: 6, border: "none",
        background: active ? "var(--color-surface-raised)" : "transparent",
        cursor: "pointer", fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flex: 1, fontSize: 12, color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: active ? 500 : 400 }}>{label}</span>
      {count !== undefined && count > 0 && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{count}</span>}
    </button>
  );
}

// ─── NotesClient (main) ───────────────────────────────────────────────────────

interface Props {
  initialNotes:      Note[];
  projects:          { id: string; title: string }[];
  initialFolders?:   NoteFolder[];
  initialFolderItems?: NoteFolderItem[];
  initialSelectedId?: string;
}

export default function NotesClient({ initialNotes, projects, initialFolders = [], initialFolderItems = [], initialSelectedId }: Props) {
  const [notes,          setNotes]          = useState<Note[]>(initialNotes);
  const [folders,        setFolders]        = useState<NoteFolder[]>(initialFolders);
  const [folderItems,    setFolderItems]    = useState<NoteFolderItem[]>(initialFolderItems);
  const [newFolder,      setNewFolder]      = useState<string | null>(null); // null = not creating
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialSelectedId ?? initialNotes[0]?.id ?? null
  );
  const [filter,         setFilter]         = useState<FilterId>("all");
  const [search,         setSearch]         = useState("");
  const [suggesting,     setSuggesting]     = useState(false);
  const [suggestModal,   setSuggestModal]   = useState<string[] | null>(null);
  const [toast,          setToast]          = useState<string | null>(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);
  const [shareOpen,      setShareOpen]      = useState(false);
  const [linkCopied,     setLinkCopied]     = useState(false);
  const [optionsOpen,    setOptionsOpen]    = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showImport,     setShowImport]     = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const selectedNote = notes.find(n => n.id === selectedNoteId) ?? null;

  // Reset delete confirm and share panel when note changes
  useEffect(() => { setDeleteConfirm(false); setShareOpen(false); }, [selectedNoteId]);

  // Dismiss share popover on outside click
  useEffect(() => {
    if (!shareOpen) return;
    function handler(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as globalThis.Node)) setShareOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareOpen]);

  // ── Sidebar counts ──────────────────────────────────────────────────────────

  const pinnedCount = useMemo(() => notes.filter(n => n.pinned).length, [notes]);

  const projectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    notes.forEach(n => { if (n.project_id) map[n.project_id] = (map[n.project_id] ?? 0) + 1; });
    return map;
  }, [notes]);

  const contactCounts = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    notes.forEach(n => {
      if (n.contact_id && n.contact) {
        const name = `${n.contact.first_name} ${n.contact.last_name}`;
        map[n.contact_id] = { name, count: (map[n.contact_id]?.count ?? 0) + 1 };
      }
    });
    return map;
  }, [notes]);

  const oppCounts = useMemo(() => {
    const map: Record<string, { title: string; count: number }> = {};
    notes.forEach(n => {
      if (n.opportunity_id && n.opportunity) {
        map[n.opportunity_id] = { title: n.opportunity.title, count: (map[n.opportunity_id]?.count ?? 0) + 1 };
      }
    });
    return map;
  }, [notes]);

  const sidebarProjects = useMemo(() => projects.filter(p => projectCounts[p.id] > 0), [projects, projectCounts]);

  // ── Folders ──────────────────────────────────────────────────────────────────
  const folderCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of folderItems) m[it.folder_id] = (m[it.folder_id] ?? 0) + 1;
    return m;
  }, [folderItems]);
  const foldersForNote = useCallback(
    (noteId: string) => new Set(folderItems.filter(it => it.note_id === noteId).map(it => it.folder_id)),
    [folderItems],
  );

  async function createFolder(name: string): Promise<string | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("note_folders")
      .insert({ user_id: user.id, name: name.trim() || "New folder", position: folders.length })
      .select().single();
    if (data) { setFolders(prev => [...prev, data as NoteFolder]); return (data as NoteFolder).id; }
    return null;
  }
  async function renameFolder(id: string, name: string) {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    await createClient().from("note_folders").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function deleteFolder(id: string) {
    setFolders(prev => prev.filter(f => f.id !== id));
    setFolderItems(prev => prev.filter(it => it.folder_id !== id));
    setFilter(prev => prev === `folder:${id}` ? "all" : prev);
    await createClient().from("note_folders").delete().eq("id", id);
  }
  async function addNoteToFolder(noteId: string, fid: string) {
    if (folderItems.some(it => it.folder_id === fid && it.note_id === noteId)) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("note_folder_items")
      .insert({ folder_id: fid, note_id: noteId, user_id: user.id }).select().single();
    if (data) setFolderItems(prev => [...prev, data as NoteFolderItem]);
  }
  async function removeNoteFromFolder(noteId: string, fid: string) {
    setFolderItems(prev => prev.filter(it => !(it.folder_id === fid && it.note_id === noteId)));
    await createClient().from("note_folder_items").delete().eq("folder_id", fid).eq("note_id", noteId);
  }
  async function addNoteToNewFolder(noteId: string, name: string) {
    const fid = await createFolder(name);
    if (fid) await addNoteToFolder(noteId, fid);
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filteredNotes = useMemo(() => {
    let list = notes;
    if      (filter === "pinned")               list = notes.filter(n => n.pinned);
    else if (filter.startsWith("project:"))     list = notes.filter(n => n.project_id     === filter.slice(8));
    else if (filter.startsWith("contact:"))     list = notes.filter(n => n.contact_id     === filter.slice(8));
    else if (filter.startsWith("opportunity:")) list = notes.filter(n => n.opportunity_id === filter.slice(12));
    else if (filter.startsWith("folder:")) {
      const fid = filter.slice(7);
      const ids = new Set(folderItems.filter(it => it.folder_id === fid).map(it => it.note_id));
      list = notes.filter(n => ids.has(n.id));
    }

    if (showPinnedOnly) list = list.filter(n => n.pinned);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [notes, filter, search, showPinnedOnly, folderItems]);

  const pinnedNotes  = useMemo(() => filteredNotes.filter(n => n.pinned),  [filteredNotes]);
  const regularNotes = useMemo(() => filteredNotes.filter(n => !n.pinned), [filteredNotes]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function createNote() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("notes:create-clicked"));
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const projectId = filter.startsWith("project:") ? filter.slice(8) : null;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: user.id, project_id: projectId })
      .select("*, project:projects(id,title), contact:contacts(id,first_name,last_name), opportunity:opportunities(id,title,category)")
      .single();
    if (data) {
      const created = data as Note;
      setNotes(prev => [created, ...prev]);
      setSelectedNoteId(created.id);
      // If a folder is the active filter, drop the new note straight into it.
      if (filter.startsWith("folder:")) await addNoteToFolder(created.id, filter.slice(7));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("notes:created", {
          detail: { id: created.id, title: created.title ?? "" },
        }));
      }
    }
  }

  // Deep links — stripped from the URL after consume:
  //   ?new=1     → create a fresh note (home banner CTA)
  //   ?import=1  → open the file-import modal
  //   ?noteId=X  → focus an existing note (Ash inline "Created note … View →")
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const newFlag    = searchParams.get("new");
    const importFlag = searchParams.get("import");
    const noteId     = searchParams.get("noteId");
    if (newFlag === "1") {
      createNote();
      router.replace("/notes");
    } else if (importFlag === "1") {
      setShowImport(true);
      router.replace("/notes");
    } else if (noteId) {
      if (notes.some((n) => n.id === noteId)) setSelectedNoteId(noteId);
      router.replace("/notes");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  function handleImported(note: Note) {
    setNotes(prev => [note, ...prev]);
    setSelectedNoteId(note.id);
  }

  function handleNoteUpdate(id: string, fields: Partial<Note>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...fields, updated_at: new Date().toISOString() } : n));
  }

  async function deleteNote(id: string) {
    const supabase = createClient();
    await supabase.from("notes").delete().eq("id", id);
    const remaining = notes.filter(n => n.id !== id);
    setNotes(remaining);
    setSelectedNoteId(remaining[0]?.id ?? null);
    setDeleteConfirm(false);
  }

  async function togglePin(id: string, pinned: boolean) {
    const supabase = createClient();
    await supabase.from("notes").update({ pinned }).eq("id", id);
    handleNoteUpdate(id, { pinned });
  }

  async function handleGenerateTasks() {
    if (!selectedNote || suggesting) return;
    setSuggesting(true);
    const content = stripHtml(selectedNote.content ?? "");
    const res = await fetch("/api/notes/suggest-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: selectedNote.title ?? "", content }),
    });
    const { tasks } = await res.json() as { tasks: string[] };
    setSuggesting(false);
    setSuggestModal(tasks);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // ── Share & Export ──────────────────────────────────────────────────────────

  async function handleGetLink() {
    if (!selectedNote) return;
    let token = selectedNote.share_token;
    if (!token) {
      token = crypto.randomUUID();
      const supabase = createClient();
      await supabase.from("notes").update({ share_token: token }).eq("id", selectedNote.id);
      handleNoteUpdate(selectedNote.id, { share_token: token });
    }
    navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleRevokeLink() {
    if (!selectedNote) return;
    const supabase = createClient();
    await supabase.from("notes").update({ share_token: null }).eq("id", selectedNote.id);
    handleNoteUpdate(selectedNote.id, { share_token: null });
    setShareOpen(false);
    showToast("Share link revoked");
  }

  function handleDownloadMd() {
    if (!selectedNote) return;
    const title   = selectedNote.title ?? "Untitled";
    const content = htmlToMarkdown(selectedNote.content ?? "");
    const md      = selectedNote.title ? `# ${title}\n\n${content}` : content;
    downloadFile(md, `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`, "text/markdown");
    setShareOpen(false);
  }

  function handleCopyPlainText() {
    if (!selectedNote) return;
    const title   = selectedNote.title ? `${selectedNote.title}\n\n` : "";
    navigator.clipboard.writeText(title + stripHtml(selectedNote.content ?? ""));
    setShareOpen(false);
    showToast("Copied as plain text");
  }

  // ── Filter label ────────────────────────────────────────────────────────────

  function filterLabel() {
    if (filter === "all")    return "All Notes";
    if (filter === "pinned") return "Pinned";
    if (filter.startsWith("folder:"))      return folders.find(f => f.id === filter.slice(7))?.name ?? "Folder";
    if (filter.startsWith("project:"))     return projects.find(p => p.id === filter.slice(8))?.title ?? "Project";
    if (filter.startsWith("contact:"))     return contactCounts[filter.slice(8)]?.name ?? "Contact";
    if (filter.startsWith("opportunity:")) return oppCounts[filter.slice(12)]?.title ?? "Opportunity";
    return "Notes";
  }

  // ── Note list item ──────────────────────────────────────────────────────────

  function NoteItem({ note }: { note: Note }) {
    const active = note.id === selectedNoteId;
    const [hovered,    setHovered]    = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [folderMenuOpen, setFolderMenuOpen] = useState(false);
    const itemRef = useRef<HTMLDivElement>(null);

    // Dismiss confirm when clicking outside this item
    useEffect(() => {
      if (!confirming) return;
      function handler(e: MouseEvent) {
        if (itemRef.current && !itemRef.current.contains(e.target as globalThis.Node)) setConfirming(false);
      }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [confirming]);

    const showActions = hovered || confirming || folderMenuOpen;

    return (
      <div
        ref={itemRef}
        onClick={() => { if (!confirming) setSelectedNoteId(note.id); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          width: "100%", textAlign: "left", padding: "10px 14px",
          borderBottom: "0.5px solid var(--color-border)",
          borderLeft: `3px solid ${active ? "var(--color-sage)" : "transparent"}`,
          background: active ? "rgba(155,163,122,0.10)" : hovered ? "rgba(239,240,231,0.5)" : "transparent",
          cursor: "pointer", fontFamily: "inherit",
          transition: "background 0.08s ease", userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1, paddingRight: showActions ? 28 : 0 }}>
          {note.pinned && (
            <svg width="8" height="8" viewBox="0 0 16 16" fill="var(--color-sage)" style={{ flexShrink: 0 }}>
              <path d="M9.5 1.5L14.5 6.5L10 11L9 14L6 11L2 7L5 6L9.5 1.5Z"/>
            </svg>
          )}
          <p style={{ fontSize: 12, fontWeight: 600, color: active ? "#4a6232" : "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
            {note.title || "Untitled"}
          </p>
        </div>
        {note.content && (
          <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 1, paddingRight: showActions ? 28 : 0 }}>
            {stripHtml(note.content)}
          </p>
        )}
        <p style={{ fontSize: 9, color: "var(--color-text-tertiary)" }}>{timeAgo(note.updated_at)}</p>

        {/* Hover actions */}
        {showActions && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              display: "flex", alignItems: "center", gap: 3,
            }}
          >
            {confirming ? (
              <>
                <button
                  onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                  title="Confirm delete"
                  style={{
                    width: 22, height: 22, borderRadius: 5, border: "none",
                    background: "rgba(155,163,122,0.15)", color: "#4a6232",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(155,163,122,0.28)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(155,163,122,0.15)"}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setConfirming(false); }}
                  title="Cancel"
                  style={{
                    width: 22, height: 22, borderRadius: 5, border: "none",
                    background: "var(--color-surface-sunken)", color: "var(--color-text-tertiary)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                >
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </>
            ) : (
              <>
                <NoteFolderMenu noteId={note.id} onOpenChange={setFolderMenuOpen} />
                <button
                  onClick={e => { e.stopPropagation(); setConfirming(true); }}
                  title="Delete"
                  style={{
                    width: 22, height: 22, borderRadius: 5, border: "none",
                    background: "var(--color-surface-sunken)", color: "var(--color-text-tertiary)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,62,13,0.08)"; e.currentTarget.style.color = "var(--color-red-orange)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-sunken)"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // A folder row in the rail: selects to filter, with a hover ⋯ for rename /
  // delete. Kept deliberately small so the module stays simple.
  function FolderCard({ folder }: { folder: NoteFolder }) {
    const active = filter === `folder:${folder.id}`;
    const [hovered, setHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const count = folderCounts[folder.id] ?? 0;
    useEffect(() => {
      if (!menuOpen) return;
      function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setMenuOpen(false); }
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [menuOpen]);

    if (renaming !== null) {
      return (
        <input autoFocus value={renaming} onChange={e => setRenaming(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && renaming.trim()) { renameFolder(folder.id, renaming.trim()); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
          onBlur={() => { if (renaming.trim()) renameFolder(folder.id, renaming.trim()); setRenaming(null); }}
          style={{ minHeight: 56, fontSize: 11.5, padding: "6px 8px", borderRadius: 9, border: "0.5px solid var(--color-sage)", background: "var(--color-off-white)", color: "var(--color-text-primary)", outline: "none", fontFamily: "inherit" }} />
      );
    }
    return (
      <div ref={ref} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ position: "relative" }}>
        <button onClick={() => toggleFilter(`folder:${folder.id}`)}
          style={{
            width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 4, minHeight: 56,
            padding: "9px 10px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
            border: active ? "1px solid var(--color-sage)" : "0.5px solid var(--color-border)",
            background: active ? "rgba(155,163,122,0.12)" : "var(--color-off-white)",
            boxShadow: active ? "0 0 0 2px var(--color-focus-ring)" : "none",
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--color-cream)"; }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.background = "var(--color-off-white)"; }}>
          <Folder size={13} strokeWidth={1.75} style={{ flexShrink: 0, color: active ? "var(--color-sage)" : "var(--color-text-tertiary)" }} />
          <span style={{ fontSize: 11.5, fontWeight: active ? 600 : 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
          <span style={{ fontSize: 9.5, color: "var(--color-text-tertiary)" }}>{count} note{count === 1 ? "" : "s"}</span>
        </button>
        {(hovered || menuOpen) && (
          <button onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }} title="Folder options"
            style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 5, border: "none", background: "rgba(255,255,255,0.9)", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>⋯</button>
        )}
        {menuOpen && (
          <div style={{ position: "absolute", top: 26, right: 5, zIndex: 30, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", overflow: "hidden", minWidth: 120 }}>
            <button onClick={() => { setRenaming(folder.name); setMenuOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", fontSize: 11.5, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-primary)", fontFamily: "inherit" }}>Rename</button>
            <button onClick={() => { setFolderToDelete(folder); setMenuOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", fontSize: 11.5, background: "none", border: "none", cursor: "pointer", color: "var(--color-red-orange)", fontFamily: "inherit" }}>Delete folder</button>
          </div>
        )}
      </div>
    );
  }

  // Per-note "add to folder" mini menu (in the note's hover actions).
  function NoteFolderMenu({ noteId, onOpenChange }: { noteId: string; onOpenChange?: (open: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const memberOf = foldersForNote(noteId);
    // Tell the parent NoteItem so it keeps its hover actions mounted while the
    // dropdown is open (otherwise leaving the note unmounts the dropdown).
    useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
    useEffect(() => {
      if (!open) return;
      function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) { setOpen(false); setCreating(false); } }
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, [open]);
    const item: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", padding: "7px 11px", fontSize: 11.5, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-primary)", fontFamily: "inherit" };
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} title="Add to folder"
          style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "var(--color-surface-sunken)", color: "var(--color-text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(155,163,122,0.15)"; e.currentTarget.style.color = "#4a6232"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--color-surface-sunken)"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}>
          <FolderPlus size={11} strokeWidth={1.75} />
        </button>
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 40, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 8, boxShadow: "0 8px 28px rgba(0,0,0,0.16)", overflow: "hidden", minWidth: 170, maxHeight: 260, overflowY: "auto" }}>
            <div style={{ padding: "6px 11px 3px", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>Add to folder</div>
            {folders.length === 0 && !creating && <div style={{ padding: "3px 11px 7px", fontSize: 11, color: "var(--color-text-tertiary)" }}>No folders yet</div>}
            {folders.map(f => {
              const inIt = memberOf.has(f.id);
              return (
                <button key={f.id} onClick={() => { inIt ? removeNoteFromFolder(noteId, f.id) : addNoteToFolder(noteId, f.id); }} style={item}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                  <span style={{ width: 12, color: "var(--color-sage)" }}>{inIt ? <Check size={11} /> : null}</span>
                  <Folder size={11} strokeWidth={1.75} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                </button>
              );
            })}
            {creating ? (
              <div style={{ padding: "4px 9px 8px" }}>
                <input autoFocus value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && name.trim()) { addNoteToNewFolder(noteId, name.trim()); setName(""); setCreating(false); setOpen(false); } if (e.key === "Escape") setCreating(false); }}
                  placeholder="New folder name…" style={{ width: "100%", fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-sage)", background: "var(--color-warm-white)", color: "var(--color-text-primary)", outline: "none", fontFamily: "inherit" }} />
              </div>
            ) : (
              <button onClick={() => setCreating(true)} style={{ ...item, color: "var(--color-sage)", fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <Plus size={12} /> New folder…
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasFilters = sidebarProjects.length > 0 || Object.keys(contactCounts).length > 0 || Object.keys(oppCounts).length > 0;

  function toggleFilter(id: FilterId) {
    setFilter(prev => prev === id ? "all" : id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: "var(--color-off-white)", position: "relative" }}>

      {/* Topbar — matches the 52px height / 24px gutter of Projects + People */}
      <div style={{
        height: 52, display: "flex", alignItems: "center", flexShrink: 0,
        borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)",
        padding: "0 24px", gap: 8,
      }}>
        <h1 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-charcoal)", flex: 1 }}>Notes</h1>

        {/* Delete — inline confirm */}
        {selectedNote && (
          deleteConfirm ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Delete?</span>
              <button
                onClick={() => deleteNote(selectedNote.id)}
                style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "rgba(220,62,13,0.1)", color: "var(--color-red-orange)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(220,62,13,0.1)"}
              >
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "var(--color-surface-sunken)", color: "var(--color-text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-border)"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              <div style={{ width: "0.5px", height: 16, background: "var(--color-border)" }} />
            </div>
          ) : (
            <>
              <button
                onClick={() => setDeleteConfirm(true)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 11, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--color-red-orange)"; e.currentTarget.style.borderColor = "var(--color-red-orange)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-secondary)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 4h10M6 4V2h4v2M5 4l.5 9h5L11 4"/></svg>
                Delete
              </button>
              <button
                onClick={() => togglePin(selectedNote.id, !selectedNote.pinned)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 11, borderRadius: 6, border: "0.5px solid var(--color-border)", color: selectedNote.pinned ? "var(--color-sage)" : "var(--color-text-secondary)", background: selectedNote.pinned ? "rgba(155,163,122,0.10)" : "transparent", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = selectedNote.pinned ? "rgba(155,163,122,0.10)" : "transparent"}
              >
                <Pin size={11} strokeWidth={1.75} />
                {selectedNote.pinned ? "Pinned" : "Pin"}
              </button>
              <div style={{ width: "0.5px", height: 16, background: "var(--color-border)" }} />
            </>
          )
        )}

        {/* Share & Export */}
        {selectedNote && (
          <div ref={shareRef} data-tour-target="notes.share-button" style={{ position: "relative" }}>
            <button
              onClick={() => setShareOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                fontSize: 11, borderRadius: 6, border: "0.5px solid var(--color-border)",
                background: shareOpen ? "var(--color-surface-sunken)" : "transparent",
                color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              onMouseLeave={e => { if (!shareOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="4" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="12" r="1.5"/>
                <line x1="5.4" y1="7.1" x2="10.6" y2="4.9"/><line x1="5.4" y1="8.9" x2="10.6" y2="11.1"/>
              </svg>
              Share
            </button>

            {shareOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 300,
                width: 220, background: "var(--color-surface-raised)",
                border: "0.5px solid var(--color-border)", borderRadius: 10,
                boxShadow: "var(--shadow-overlay)", overflow: "hidden",
              }}>
                <div style={{ padding: "6px 4px" }}>
                  <div style={{ padding: "4px 10px 6px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", display: "flex", alignItems: "center", gap: 6 }}>
                    Share
                    {selectedNote.share_token && <span style={{ color: "#4a6232", background: "rgba(155,163,122,0.15)", padding: "1px 5px", borderRadius: 3 }}>Active</span>}
                  </div>
                  <button onClick={handleGetLink} style={{ width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 12, color: "var(--color-text-primary)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 8a2 2 0 0 1 2-2h4a2 2 0 1 1 0 4H8a2 2 0 0 1-2-2z"/><path d="M10 8a2 2 0 0 1-2 2H4a2 2 0 1 1 0-4h4a2 2 0 0 1 2 2z"/></svg>
                    {linkCopied ? "Copied!" : selectedNote.share_token ? "Copy link" : "Get shareable link"}
                  </button>
                  {selectedNote.share_token && (
                    <button onClick={handleRevokeLink} style={{ width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 12, color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,62,13,0.06)"; e.currentTarget.style.color = "var(--color-red-orange)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M10 6L6 10M6 6l4 4"/></svg>
                      Revoke link
                    </button>
                  )}
                </div>
                <div style={{ height: "0.5px", background: "var(--color-border)", margin: "0 4px" }} />
                <div style={{ padding: "6px 4px" }}>
                  <div style={{ padding: "4px 10px 6px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Export</div>
                  <button onClick={handleDownloadMd} style={{ width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 12, color: "var(--color-text-primary)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 2v9M5 8l3 3 3-3"/><path d="M3 13h10"/></svg>
                    Download as Markdown
                  </button>
                  <button onClick={handleCopyPlainText} style={{ width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none", background: "transparent", fontSize: 12, color: "var(--color-text-primary)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="5" width="9" height="10" rx="1.5"/><path d="M6 5V3.5A1.5 1.5 0 0 1 7.5 2h5A1.5 1.5 0 0 1 14 3.5v8A1.5 1.5 0 0 1 12.5 13H12"/></svg>
                    Copy as plain text
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Three-dot options menu — sits left of Import / New note */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setOptionsOpen(v => !v)}
            aria-label="Notes options"
            title="Notes options"
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
            <NotesOptionsMenu
              showPinnedOnly={showPinnedOnly}
              onTogglePinnedOnly={() => setShowPinnedOnly(v => !v)}
              pinnedCount={pinnedCount}
              onImport={() => setShowImport(true)}
              onClose={() => setOptionsOpen(false)}
            />
          )}
        </div>

        {/* Import note — secondary CTA, outlined */}
        <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
          <Upload size={11} strokeWidth={2} />
          Import note
        </Button>

        <span data-tour-target="notes.new-button">
          <Button onClick={createNote}>+ New note</Button>
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left panel */}
        <div style={{
          width: 250, flexShrink: 0, display: "flex", flexDirection: "column",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          overflow: "hidden",
        }}>
          {/* Search */}
          <div style={{ padding: "8px 10px", flexShrink: 0, borderBottom: "0.5px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 7 }}>
              <Search size={10} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11, color: "var(--color-text-primary)", fontFamily: "inherit" }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 0, lineHeight: 1, fontSize: 13 }}>×</button>
              )}
            </div>
          </div>

          {/* Current view title — "All Notes" or the active folder/filter, with
              a back arrow to return to all notes. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
            {filter !== "all" && (
              <button onClick={() => setFilter("all")} title="Back to all notes"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 0, display: "flex", flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-secondary)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-tertiary)"}>
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
            )}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filterLabel()}</span>
          </div>

          {/* Filters: projects / contacts / opps */}
          {hasFilters && (
            <div style={{ padding: "6px 8px 4px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
              {sidebarProjects.length > 0 && (
                <>
                  <div style={{ padding: "2px 6px 2px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Projects</div>
                  {sidebarProjects.map(p => (
                    <FilterItem key={p.id} id={`project:${p.id}` as FilterId} label={p.title} count={projectCounts[p.id]} active={filter === `project:${p.id}`} onSelect={toggleFilter} />
                  ))}
                </>
              )}
              {Object.keys(contactCounts).length > 0 && (
                <>
                  <div style={{ padding: "4px 6px 2px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Contacts</div>
                  {Object.entries(contactCounts).map(([id, { name, count }]) => (
                    <FilterItem key={id} id={`contact:${id}` as FilterId} label={name} count={count} active={filter === `contact:${id}`} onSelect={toggleFilter} />
                  ))}
                </>
              )}
              {Object.keys(oppCounts).length > 0 && (
                <>
                  <div style={{ padding: "4px 6px 2px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Opportunities</div>
                  {Object.entries(oppCounts).map(([id, { title, count }]) => (
                    <FilterItem key={id} id={`opportunity:${id}` as FilterId} label={title} count={count} active={filter === `opportunity:${id}`} onSelect={toggleFilter} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Note list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredNotes.length === 0 && (
              search ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 80 }}>
                  <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>No matches.</p>
                </div>
              ) : (
                <div style={{ padding: "20px 14px" }}>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--color-text-tertiary)" }}>
                    No notes yet — start one from the editor on the right, or import a file.
                  </p>
                </div>
              )
            )}

            {/* Pinned section */}
            {pinnedNotes.length > 0 && (
              <>
                <div style={{ padding: "6px 14px 3px", background: "var(--color-surface-sunken)", borderBottom: "0.5px solid var(--color-border)" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Pinned</span>
                </div>
                {pinnedNotes.map(n => <NoteItem key={n.id} note={n} />)}
              </>
            )}

            {/* Notes section */}
            {regularNotes.length > 0 && (
              <>
                {pinnedNotes.length > 0 && (
                  <div style={{ padding: "6px 14px 3px", background: "var(--color-surface-sunken)", borderBottom: "0.5px solid var(--color-border)", borderTop: "0.5px solid var(--color-border)" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Notes</span>
                  </div>
                )}
                {regularNotes.map(n => <NoteItem key={n.id} note={n} />)}
              </>
            )}
          </div>

          {/* Folders — bottom half of the rail, as 2-wide cards. */}
          <div style={{ flexShrink: 0, maxHeight: "46%", display: "flex", flexDirection: "column", borderTop: "0.5px solid var(--color-border)", background: "var(--color-surface-sunken)" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "8px 12px 4px", flexShrink: 0 }}>
              <span style={{ flex: 1, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)" }}>Folders</span>
            </div>
            <div style={{ overflowY: "auto", padding: "0 8px 8px" }}>
              {newFolder !== null && (
                <input autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newFolder.trim()) { createFolder(newFolder.trim()); setNewFolder(null); } if (e.key === "Escape") setNewFolder(null); }}
                  onBlur={() => { if (newFolder.trim()) createFolder(newFolder.trim()); setNewFolder(null); }}
                  placeholder="Folder name…"
                  style={{ width: "100%", fontSize: 11.5, padding: "6px 8px", borderRadius: 7, border: "0.5px solid var(--color-sage)", background: "var(--color-off-white)", color: "var(--color-text-primary)", outline: "none", fontFamily: "inherit", marginBottom: 6 }} />
              )}
              {folders.length === 0 && newFolder === null ? (
                <p style={{ padding: "2px 4px", fontSize: 10.5, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                  Group notes into folders — use New folder below, or a note&apos;s menu.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {folders.map(f => <FolderCard key={f.id} folder={f} />)}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: "8px 10px", borderTop: "0.5px solid var(--color-border)", display: "flex", gap: 6 }}>
            <button
              onClick={createNote}
              style={{ flex: 1, fontSize: 11, padding: "6px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
            >+ New note</button>
            <button
              onClick={() => setNewFolder("")}
              title="New folder"
              style={{ flex: 1, fontSize: 11, padding: "6px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
            ><FolderPlus size={11} strokeWidth={1.75} /> New folder</button>
          </div>
        </div>

        {/* Editor */}
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            projects={projects}
            onUpdate={handleNoteUpdate}
            onGenerateTasks={handleGenerateTasks}
            suggesting={suggesting}
          />
        ) : notes.length === 0 ? (
          // Zero notes total — rich onboarding empty state, matching the
          // Projects / People pattern.
          <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)", display: "flex", alignItems: "center" }}>
            <EmptyState
              icon={<NotebookPen size={24} strokeWidth={1.5} color="var(--color-sage)" />}
              heading="Start writing"
              body="Notes are your studio's thinking space — drafts, research, reactions, voice memos transcribed, half-formed pitches, anything you want Ash to be able to reference later."
              action={{ label: "+ New note", onClick: createNote }}
              secondaryAction={{
                label:   "Import note",
                onClick: () => setShowImport(true),
                icon:    <Upload size={11} strokeWidth={2} />,
              }}
              ashPrompt="Help me figure out what's worth writing down — what belongs in a note vs a task vs a calendar event?"
              tips={[
                "Write freely; we save as you go.",
                "Type a space at the start of a line to call Ash inline.",
                "Generate tasks turns any note into actionable to-dos.",
              ]}
            />
          </div>
        ) : (
          // Notes exist but none is selected (e.g. the active filter
          // emptied the visible list). Keep this lighter — the user has
          // notes; they just need to pick one.
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--color-off-white)" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>No note selected</p>
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 8 }}>Select a note or create a new one</p>
            <Button size="md" onClick={createNote}>+ New note</Button>
          </div>
        )}
      </div>

      {/* Task suggestion modal */}
      {suggestModal && (
        <SuggestTasksModal
          tasks={suggestModal}
          projectId={selectedNote?.project_id ?? null}
          projects={projects}
          onClose={() => setSuggestModal(null)}
          onCreated={count => showToast(`${count} task${count !== 1 ? "s" : ""} added`)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "var(--color-text-primary)", color: "var(--color-surface-app)",
          fontSize: 11, fontWeight: 500, padding: "6px 14px", borderRadius: 9999,
          boxShadow: "var(--shadow-md)", whiteSpace: "nowrap", pointerEvents: "none",
        }}>{toast}</div>
      )}

      {showImport && (
        <ImportNoteModal
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

      <ConfirmDialog
        open={!!folderToDelete}
        title="Delete this folder?"
        body="The folder is removed. Your notes are not deleted — they just leave the folder."
        confirmLabel="Delete folder"
        tone="danger"
        onConfirm={() => { if (folderToDelete) deleteFolder(folderToDelete.id); setFolderToDelete(null); }}
        onCancel={() => setFolderToDelete(null)}
      />

      <NotesIntroModal />
      <NotesTooltipTour />
    </div>
  );
}
