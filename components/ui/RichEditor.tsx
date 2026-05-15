"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useEditor, EditorContent,
  Extension, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer,
} from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, FileText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AshPromptState = {
  pos:    number;
  anchor: { top: number; left: number; bottom: number };
} | null;

// ─── ToggleBlock extension ────────────────────────────────────────────────────

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
    <NodeViewWrapper as="div" style={{ margin: "4px 0" }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <button contentEditable={false} onClick={() => updateAttributes({ open: !open })}
          style={{
            flexShrink: 0, width: 18, height: 18, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: 3, color: "var(--color-text-tertiary)", padding: 0,
            transition: "transform 0.15s ease", transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3V1z"/></svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input ref={summaryRef} contentEditable={false}
              value={summary} placeholder="Toggle heading…"
              onChange={e => updateAttributes({ summary: e.target.value })}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); updateAttributes({ open: true }); setTimeout(() => editor.chain().focus().run(), 10); }
              }}
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontFamily: "inherit", fontSize: 14, fontWeight: 600, lineHeight: "1.8",
                color: "var(--color-text-primary)", padding: 0, cursor: "text", minWidth: 0,
              }}
            />
            {hovered && (
              <button contentEditable={false} onClick={deleteBlock} title="Delete toggle"
                style={{ flexShrink: 0, width: 16, height: 16, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", borderRadius: 3, padding: 0, fontSize: 15, lineHeight: 1 }}
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

export const ToggleBlock = TiptapNode.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      summary: { default: "", parseHTML: el => el.getAttribute("data-summary") ?? "", renderHTML: a => ({ "data-summary": a.summary }) },
      open:    { default: false, parseHTML: el => el.getAttribute("data-open") !== "false", renderHTML: a => ({ "data-open": String(a.open) }) },
    };
  },
  parseHTML()  { return [{ tag: 'div[data-type="toggle"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle" }), 0]; },
  addNodeView() { return ReactNodeViewRenderer(ToggleNodeView); },
});

// ─── InlineAsh extension ──────────────────────────────────────────────────────

export const InlineAsh = Extension.create<{
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

// ─── Extension factory ────────────────────────────────────────────────────────

export function getRichExtensions(opts: {
  placeholder?: string;
  onAshTrigger?: (pos: number, coords: { top: number; left: number; bottom: number }) => void;
} = {}) {
  return [
    StarterKit,
    Underline,
    Placeholder.configure({ placeholder: opts.placeholder ?? "Start writing…" }),
    ToggleBlock,
    InlineAsh.configure({ onTrigger: opts.onAshTrigger ?? (() => {}) }),
  ];
}

// ─── RichToolbar ──────────────────────────────────────────────────────────────

/** Pulls the current selection from a TipTap editor as both plain text and
 *  serialized HTML. Returns null if the selection is empty. */
export function getSelectionExtract(editor: Editor): { text: string; html: string } | null {
  const { from, to } = editor.state.selection;
  if (from === to) return null;
  const text = editor.state.doc.textBetween(from, to, "\n\n");
  const slice = editor.state.doc.slice(from, to);
  const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content);
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return { text, html: wrapper.innerHTML };
}

export function RichToolbar({
  editor, onGenerateTasks, suggesting, onConvertToNote, convertingToNote,
}: {
  editor:            ReturnType<typeof useEditor> | null;
  onGenerateTasks?:  () => void;
  suggesting?:       boolean;
  /** Called when the user clicks the "Convert to note" button while a range
   *  is selected. The caller is responsible for creating the note record. */
  onConvertToNote?:  (selection: { text: string; html: string }) => void | Promise<void>;
  convertingToNote?: boolean;
}) {
  if (!editor) return null;

  const hasSelection = !editor.state.selection.empty;

  function btn(label: React.ReactNode, action: () => void, active?: boolean, title?: string) {
    return (
      <button type="button" onMouseDown={e => { e.preventDefault(); action(); }} title={title} style={{
        width: 26, height: 26, borderRadius: 5, border: "none", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: active ? "var(--color-surface-sunken)" : "transparent",
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        cursor: "pointer", flexShrink: 0,
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
        () => editor.chain().focus().insertContent({ type: "toggleBlock", attrs: { summary: "", open: false }, content: [{ type: "paragraph" }] }).run(),
        false, "Toggle block",
      )}
      <div style={{ flex: 1 }} />
      {onConvertToNote && (
        <button
          type="button"
          onMouseDown={(e) => {
            // Prevent the editor from losing its selection on mousedown — we
            // need the selection range intact when the click handler reads it.
            e.preventDefault();
          }}
          onClick={() => {
            const sel = getSelectionExtract(editor);
            if (sel) onConvertToNote(sel);
          }}
          disabled={!hasSelection || convertingToNote}
          title={hasSelection ? "Convert selection to a linked note" : "Select text to convert to a note"}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", fontSize: 11, fontWeight: 500, borderRadius: 6,
            border: "0.5px solid var(--color-border)",
            background: hasSelection ? "rgba(155,163,122,0.14)" : "transparent",
            color: hasSelection ? "#4a5630" : "var(--color-text-tertiary)",
            cursor: hasSelection && !convertingToNote ? "pointer" : "not-allowed",
            opacity: convertingToNote ? 0.6 : 1,
            fontFamily: "inherit", flexShrink: 0, marginRight: 6,
          }}
        >
          <FileText size={11} strokeWidth={1.75} />
          {convertingToNote ? "Creating…" : "→ Note"}
        </button>
      )}
      {onGenerateTasks && (
        <button type="button" onClick={onGenerateTasks} disabled={suggesting} title="Generate tasks from this note" style={{
          display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          background: "linear-gradient(#fffefc, #fffefc) padding-box, linear-gradient(135deg, #a8b886 0%, #4a6232 100%) border-box",
          border: "1px solid transparent", color: "#4a6232",
          cursor: suggesting ? "not-allowed" : "pointer",
          opacity: suggesting ? 0.5 : 1, fontFamily: "inherit", flexShrink: 0,
        }}>
          <svg width="9" height="9" viewBox="0 0 16 16" fill="#4a6232"><path d="M8 1l1.2 4.2L14 7l-4.8 1.8L8 14l-1.2-5.2L2 7l4.8-1.8L8 1z"/></svg>
          {suggesting ? "Thinking…" : "Generate tasks"}
        </button>
      )}
    </div>
  );
}

// ─── InlineAshPopover ────────────────────────────────────────────────────────

export function InlineAshPopover({
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
        <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") onClose(); }}
          placeholder="Write me a paragraph about…" disabled={loading}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 12, color: "var(--color-text-primary)", fontFamily: "inherit" }}
        />
        {loading
          ? <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Thinking…</span>
          : value.trim() && <button type="submit" style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Insert</button>
        }
      </form>
    </div>
  );
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export { useEditor, EditorContent };
