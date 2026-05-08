"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/types/database";
import { useEditor, EditorContent, Extension, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { Pin, Search, Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered } from "lucide-react";
import Button from "@/components/ui/Button";

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
  | `opportunity:${string}`;

type ContactOpt     = { id: string; first_name: string; last_name: string };
type OpportunityOpt = { id: string; title: string; category: string };

type LinkState = {
  projectId:     string | null;
  contactId:     string | null;
  opportunityId: string | null;
};

type SuggestedTask = { title: string; dueDate: string | null; selected: boolean };

// ─── Toggle Node ──────────────────────────────────────────────────────────────

function ToggleNodeView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const open    = node.attrs.open as boolean;
  const summary = node.attrs.summary as string;
  const [hovered, setHovered] = useState(false);
  const summaryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (summary === "") {
      const t = setTimeout(() => summaryRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function deleteBlock() {
    const pos = getPos();
    if (typeof pos === "number") {
      editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    }
  }

  return (
    <NodeViewWrapper
      as="div"
      style={{ margin: "4px 0" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <button
          contentEditable={false}
          onClick={() => updateAttributes({ open: !open })}
          style={{
            flexShrink: 0, width: 18, height: 18, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: 3, color: "var(--color-text-tertiary)", padding: 0,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M2 1l4 3-4 3V1z"/>
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              ref={summaryRef}
              contentEditable={false}
              value={summary}
              placeholder="Toggle heading…"
              onChange={e => updateAttributes({ summary: e.target.value })}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  updateAttributes({ open: true });
                  setTimeout(() => editor.chain().focus().run(), 10);
                }
              }}
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontFamily: "inherit", fontSize: 14, fontWeight: 600, lineHeight: "1.8",
                color: "var(--color-text-primary)", padding: 0, cursor: "text", minWidth: 0,
              }}
            />
            {hovered && (
              <button
                contentEditable={false}
                onClick={deleteBlock}
                title="Delete toggle"
                style={{
                  flexShrink: 0, width: 16, height: 16, border: "none", background: "transparent",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--color-text-tertiary)", borderRadius: 3, padding: 0,
                  fontSize: 15, lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--color-red-orange)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
              >×</button>
            )}
          </div>

          {open && (
            <div style={{ marginTop: 2, paddingLeft: 4, borderLeft: "2px solid var(--color-border)" }}>
              <NodeViewContent />
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const ToggleBlock = TiptapNode.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      summary: { default: "", parseHTML: el => el.getAttribute("data-summary") ?? "", renderHTML: attrs => ({ "data-summary": attrs.summary }) },
      open:    { default: false, parseHTML: el => el.getAttribute("data-open") !== "false", renderHTML: attrs => ({ "data-open": String(attrs.open) }) },
    };
  },
  parseHTML()  { return [{ tag: 'div[data-type="toggle"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle" }), 0]; },
  addNodeView() { return ReactNodeViewRenderer(ToggleNodeView); },
});

// ─── InlineAsh extension ──────────────────────────────────────────────────────

const InlineAsh = Extension.create<{
  onTrigger: (pos: number, coords: { top: number; left: number; bottom: number }) => void;
}>({
  name: "inlineAsh",
  addKeyboardShortcuts() {
    return {
      Space: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parentOffset === 0 && $from.parent.textContent === "") {
          const coords = editor.view.coordsAtPos(editor.state.selection.from);
          this.options.onTrigger(editor.state.selection.from, coords);
          return true;
        }
        return false;
      },
    };
  },
});

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
        supabase.from("contacts").select("id, first_name, last_name").order("first_name"),
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
  if (!editor) return null;

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
    <div style={{
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

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Generate tasks — Ash gradient border */}
      {onGenerateTasks && (
        <button
          type="button"
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

// ─── InlineAshPopover ─────────────────────────────────────────────────────────

function InlineAshPopover({
  anchor, onSubmit, onClose,
}: {
  anchor:   { top: number; left: number; bottom: number };
  onSubmit: (prompt: string) => Promise<void>;
  onClose:  () => void;
}) {
  const [value,   setValue]   = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    await onSubmit(value.trim());
    setLoading(false);
  }

  return (
    <div ref={ref} style={{
      position: "fixed", top: anchor.bottom + 4, left: anchor.left, zIndex: 500,
      background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
      borderRadius: 10, boxShadow: "var(--shadow-overlay)", width: 340, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "0.5px solid var(--color-border)" }}>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="var(--color-sage)"><circle cx="10" cy="10" r="10"/><path d="M6 10.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/><circle cx="10" cy="14" r="1" fill="white"/></svg>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>Ask Ash</span>
        <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 2 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
        <input
          ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") onClose(); }}
          placeholder="Write me a paragraph about…"
          disabled={loading}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 12, color: "var(--color-text-primary)", fontFamily: "inherit" }}
        />
        {loading
          ? <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Thinking…</span>
          : value.trim() && (
            <button type="submit" style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Insert</button>
          )
        }
      </form>
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
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Start writing…" }),
      ToggleBlock,
      InlineAsh.configure({ onTrigger: handleAshTrigger }),
    ],
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

  async function handleAshSubmit(prompt: string) {
    if (!editor || !ashPrompt) return;
    const noteText = editor.getText().slice(0, 800);
    const res = await fetch("/api/notes/ash-inline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, noteContext: noteText }),
    });
    const { text } = await res.json() as { text: string };
    if (text) {
      editor.chain().focus().setTextSelection(ashPrompt.pos).insertContent(text).run();
    }
    setAshPrompt(null);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <FormatToolbar editor={editor ?? null} onGenerateTasks={onGenerateTasks} suggesting={suggesting} />

      <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)" }}>
        <div style={{ maxWidth: 720, padding: "40px 64px 80px", margin: "0 auto" }}>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Untitled"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontWeight: 700, lineHeight: 1.25, display: "block", marginBottom: 12,
              fontSize: 24, letterSpacing: "-0.02em", color: "var(--color-text-primary)", fontFamily: "inherit",
            }}
          />

          <div style={{ marginBottom: 12 }}>
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
  initialSelectedId?: string;
}

export default function NotesClient({ initialNotes, projects, initialSelectedId }: Props) {
  const [notes,          setNotes]          = useState<Note[]>(initialNotes);
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

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filteredNotes = useMemo(() => {
    let list = notes;
    if      (filter === "pinned")               list = notes.filter(n => n.pinned);
    else if (filter.startsWith("project:"))     list = notes.filter(n => n.project_id     === filter.slice(8));
    else if (filter.startsWith("contact:"))     list = notes.filter(n => n.contact_id     === filter.slice(8));
    else if (filter.startsWith("opportunity:")) list = notes.filter(n => n.opportunity_id === filter.slice(12));

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [notes, filter, search]);

  const pinnedNotes  = useMemo(() => filteredNotes.filter(n => n.pinned),  [filteredNotes]);
  const regularNotes = useMemo(() => filteredNotes.filter(n => !n.pinned), [filteredNotes]);

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function createNote() {
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
      setNotes(prev => [data as Note, ...prev]);
      setSelectedNoteId((data as Note).id);
    }
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

    const showActions = hovered || confirming;

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

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasFilters = sidebarProjects.length > 0 || Object.keys(contactCounts).length > 0 || Object.keys(oppCounts).length > 0;

  function toggleFilter(id: FilterId) {
    setFilter(prev => prev === id ? "all" : id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: "var(--color-off-white)", position: "relative" }}>

      {/* Topbar */}
      <div style={{
        height: 44, display: "flex", alignItems: "center", flexShrink: 0,
        borderBottom: "0.5px solid var(--color-border)", background: "var(--color-surface-raised)",
        padding: "0 16px", gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", flex: 1 }}>Notes</span>

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
          <div ref={shareRef} style={{ position: "relative" }}>
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

        <Button onClick={createNote}>+ New note</Button>
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
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>Your notes live here</p>
                  <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--color-text-tertiary)", marginBottom: 14 }}>
                    Use notes for anything — ideas, meeting notes, sketches, research, or drafts. Notes can be linked to projects and shared with collaborators.
                  </p>
                  <button
                    onClick={createNote}
                    style={{ fontSize: 11, padding: "6px 12px", borderRadius: 6, background: "var(--color-charcoal)", color: "var(--color-warm-white)", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    + New note
                  </button>
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

          {/* Footer */}
          <div style={{ flexShrink: 0, padding: "8px 10px", borderTop: "0.5px solid var(--color-border)" }}>
            <button
              onClick={createNote}
              style={{ width: "100%", fontSize: 11, padding: "6px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-text-tertiary)", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
            >+ New note</button>
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
        ) : (
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
    </div>
  );
}
