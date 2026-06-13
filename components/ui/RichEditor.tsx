"use client";

import { useState, useEffect, useRef } from "react";
import {
  useEditor, useEditorState, EditorContent,
  Extension, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DOMSerializer } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, FileText, Image as ImageIcon } from "lucide-react";
import {
  uploadEditorImage,
  isUploadableImageType,
  type EditorImageUploader,
  type UploadedEditorImage,
} from "@/lib/uploads/editor-image";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AshPromptState = {
  pos:    number;
  anchor: { top: number; left: number; bottom: number };
} | null;

/** Where the user is when they press Space to open inline Ash. The route
 *  uses this to: (1) auto-link any new tasks/notes/activities to the right
 *  entity, and (2) build a View → href that stays inside the panel the user
 *  is already in.
 *
 *  Every inline-Ash surface in the app should pass one of these. New
 *  surfaces only need to be added here + handled in the inline route's
 *  system prompt + VIEW_FOR_TOOL routing. */
export interface InlineAshSurface {
  type:            "canvas-contact" | "canvas-project" | "note" | "outreach-target";
  contact_id?:     string;
  contact_name?:   string;
  project_id?:     string;
  project_title?:  string;
  /** For "note" surface — useful in the prompt to ground Ash. */
  note_id?:        string;
  note_title?:     string;
  /** For "outreach-target" surface — useful in the prompt. */
  target_id?:      string;
  target_name?:    string;
}

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

// ─── Image upload (paste / drop) ──────────────────────────────────────────────
//
// Adds a ProseMirror plugin to the editor that intercepts paste + drop of
// image files, inserts a tiny placeholder where the cursor / drop point is,
// uploads each file through `uploadEditorImage` (override-able for tests),
// then swaps the placeholder for a real <img> on success — or an error chip
// on failure that the user can click to dismiss.

type UploadStatus = "uploading" | "error";

interface ImageUploadPluginState {
  placeholders: Map<string, { from: number; status: UploadStatus; message?: string }>;
}

const imageUploadPluginKey = new PluginKey<ImageUploadPluginState>("perennialImageUpload");

function nextPlaceholderId(): string {
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function insertPlaceholderNode(editor: Editor, pos: number, id: string, status: UploadStatus, message?: string) {
  const node = editor.schema.nodes.imageUploadPlaceholder?.create({ id, status, message });
  if (!node) return;
  editor.view.dispatch(editor.state.tr.insert(pos, node));
}

function replacePlaceholderWithImage(editor: Editor, id: string, attrs: { src: string; width?: number; height?: number }) {
  let target: { from: number; to: number } | null = null;
  editor.state.doc.descendants((n, p) => {
    if (n.type.name === "imageUploadPlaceholder" && n.attrs.id === id) {
      target = { from: p, to: p + n.nodeSize };
      return false;
    }
    return true;
  });
  if (!target) return;
  const t = target as { from: number; to: number };
  const imageNode = editor.schema.nodes.image?.create(attrs);
  if (!imageNode) return;
  editor.view.dispatch(editor.state.tr.replaceWith(t.from, t.to, imageNode));
}

function markPlaceholderError(editor: Editor, id: string, message: string) {
  let target: { from: number; node: { nodeSize: number; attrs: Record<string, unknown> } } | null = null;
  editor.state.doc.descendants((n, p) => {
    if (n.type.name === "imageUploadPlaceholder" && n.attrs.id === id) {
      target = { from: p, node: { nodeSize: n.nodeSize, attrs: n.attrs as Record<string, unknown> } };
      return false;
    }
    return true;
  });
  if (!target) return;
  const t = target as { from: number; node: { nodeSize: number; attrs: Record<string, unknown> } };
  const node = editor.schema.nodes.imageUploadPlaceholder?.create({
    ...t.node.attrs, status: "error", message,
  });
  if (!node) return;
  editor.view.dispatch(editor.state.tr.replaceWith(t.from, t.from + t.node.nodeSize, node));
}

async function processImageFile(editor: Editor, uploader: EditorImageUploader, file: File, insertAt: number) {
  if (!isUploadableImageType(file.type)) {
    // Skip silently — paste/drop events often include non-image attachments
    // we don't want to noisily reject. Toolbar button surfaces errors.
    return;
  }
  const id = nextPlaceholderId();
  insertPlaceholderNode(editor, insertAt, id, "uploading");
  try {
    const result: UploadedEditorImage = await uploader(file);
    replacePlaceholderWithImage(editor, id, {
      src: result.url, width: result.width, height: result.height,
    });
  } catch (err) {
    markPlaceholderError(editor, id, err instanceof Error ? err.message : "Upload failed.");
  }
}

function ImagePlaceholderView({ node, getPos, editor }: NodeViewProps) {
  const id      = node.attrs.id      as string;
  const status  = node.attrs.status  as UploadStatus;
  const message = node.attrs.message as string | undefined;
  const isError = status === "error";

  function dismiss() {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
  }

  return (
    <NodeViewWrapper as="div" data-image-upload-placeholder={id} style={{ margin: "8px 0" }}>
      <div
        contentEditable={false}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderRadius: 8,
          border: `1px dashed ${isError ? "var(--color-red-orange)" : "var(--color-border-strong)"}`,
          background: isError ? "rgba(220,90,60,0.06)" : "var(--color-surface-sunken)",
          color: isError ? "var(--color-red-orange)" : "var(--color-text-tertiary)",
          fontSize: 11, fontFamily: "inherit",
        }}
      >
        {isError ? (
          <>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/>
            </svg>
            <span>{message ?? "Upload failed."}</span>
            <button
              type="button"
              onClick={dismiss}
              style={{
                marginLeft: 4, border: "none", background: "transparent",
                color: "inherit", cursor: "pointer", fontFamily: "inherit",
                fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
              }}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <span
              style={{
                width: 11, height: 11, borderRadius: "50%",
                border: "1.5px solid currentColor", borderTopColor: "transparent",
                display: "inline-block",
                animation: "perennial-img-upload-spin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes perennial-img-upload-spin { to { transform: rotate(360deg); } }`}</style>
            <span>Uploading image…</span>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ImageUploadPlaceholder = TiptapNode.create({
  name: "imageUploadPlaceholder",
  group: "block",
  atom: true,
  selectable: false,
  // These are transient — never persisted. parseHTML left out on purpose so
  // a stale placeholder never round-trips back into a saved doc.
  addAttributes() {
    return {
      id:      { default: "" },
      status:  { default: "uploading" },
      message: { default: "" },
    };
  },
  renderHTML() { return ["div", { "data-type": "image-upload-placeholder" }]; },
  addNodeView() { return ReactNodeViewRenderer(ImagePlaceholderView); },
});

function createImageUploadExtension(uploader: EditorImageUploader) {
  return Extension.create({
    name: "perennialImageUpload",
    addProseMirrorPlugins() {
      const editorRef = this.editor as Editor;
      return [
        new Plugin({
          key: imageUploadPluginKey,
          props: {
            handlePaste(view, event) {
              const items = event.clipboardData?.items;
              if (!items || items.length === 0) return false;
              const files: File[] = [];
              for (const item of Array.from(items)) {
                if (item.kind === "file") {
                  const f = item.getAsFile();
                  if (f && isUploadableImageType(f.type)) files.push(f);
                }
              }
              if (files.length === 0) return false;
              event.preventDefault();
              const insertAt = view.state.selection.from;
              // Insert sequentially so order of pasted screenshots is
              // preserved.
              (async () => {
                for (let i = 0; i < files.length; i++) {
                  await processImageFile(editorRef, uploader, files[i], insertAt + i);
                }
              })();
              return true;
            },
            handleDrop(view, event) {
              const dt = (event as DragEvent).dataTransfer;
              if (!dt || !dt.files || dt.files.length === 0) return false;
              const files = Array.from(dt.files).filter(f => isUploadableImageType(f.type));
              if (files.length === 0) return false;
              event.preventDefault();
              const coords = { left: (event as DragEvent).clientX, top: (event as DragEvent).clientY };
              const posAt = view.posAtCoords(coords);
              const insertAt = posAt?.pos ?? view.state.selection.from;
              (async () => {
                for (let i = 0; i < files.length; i++) {
                  await processImageFile(editorRef, uploader, files[i], insertAt + i);
                }
              })();
              return true;
            },
          },
        }),
      ];
    },
  });
}

/** Exposed so non-paste/drop callers (toolbar picker, future drag-from-explorer
 *  flows) can run the exact same placeholder → upload → swap pipeline. */
export async function insertEditorImageFromFile(
  editor: Editor,
  file: File,
  uploader: EditorImageUploader = uploadEditorImage,
) {
  const pos = editor.state.selection.from;
  await processImageFile(editor, uploader, file, pos);
}

// ─── Extension factory ────────────────────────────────────────────────────────

export function getRichExtensions(opts: {
  placeholder?: string;
  onAshTrigger?: (pos: number, coords: { top: number; left: number; bottom: number }) => void;
  /** Override for tests. Defaults to the Supabase-backed `uploadEditorImage`. */
  imageUploadHandler?: EditorImageUploader;
} = {}) {
  const uploader = opts.imageUploadHandler ?? uploadEditorImage;
  return [
    StarterKit,
    Underline,
    Placeholder.configure({ placeholder: opts.placeholder ?? "Start writing…" }),
    ToggleBlock,
    Image.configure({
      inline:      false,
      allowBase64: false,
      // Built-in resize was added to @tiptap/extension-image — corner +
      // edge drag handles, with aspect-ratio preserved. We keep the same
      // minWidth/Height defaults Notion-style editors use.
      resize: {
        enabled:                   true,
        minWidth:                  80,
        minHeight:                 60,
        alwaysPreserveAspectRatio: true,
      },
      HTMLAttributes: {
        // Saved content goes back through the editor on load; this class
        // lets the editor stylesheet (or the surfaces that render saved
        // HTML read-only) constrain images to the content column.
        class: "perennial-editor-image",
      },
    }),
    ImageUploadPlaceholder,
    createImageUploadExtension(uploader),
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
  editor, onGenerateTasks, suggesting, imageUploadHandler, tourTarget, generateTasksTourTarget,
}: {
  editor:              ReturnType<typeof useEditor> | null;
  onGenerateTasks?:    () => void;
  suggesting?:         boolean;
  /** Optional override; defaults to the same handler `getRichExtensions`
   *  installs into the editor instance (Supabase upload). Lets tests + the
   *  Notes Import preview swap in a no-op or in-memory uploader. */
  imageUploadHandler?: EditorImageUploader;
  /** `data-tour-target` for the toolbar container (Notes' tour points here). */
  tourTarget?:              string;
  /** `data-tour-target` for the Generate-tasks button (Notes' tour). */
  generateTasksTourTarget?: string;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to every editor transaction (not just content changes) so the
  // active-state highlights stay in sync when a mark is toggled with the
  // cursor collapsed (a stored-mark transaction that doesn't change the doc)
  // or when the selection moves. Reading isActive(...) during render alone
  // only re-runs when the parent re-renders (content updates), leaving the
  // highlight stale until the next keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold:       ed?.isActive("bold")                     ?? false,
      italic:     ed?.isActive("italic")                   ?? false,
      underline:  ed?.isActive("underline")                ?? false,
      strike:     ed?.isActive("strike")                   ?? false,
      h1:         ed?.isActive("heading", { level: 1 })    ?? false,
      h2:         ed?.isActive("heading", { level: 2 })    ?? false,
      bulletList: ed?.isActive("bulletList")               ?? false,
      orderedList:ed?.isActive("orderedList")              ?? false,
    }),
  });

  if (!editor || !active) return null;

  async function pickImages(files: FileList | null) {
    if (!files || files.length === 0 || !editor) return;
    for (const f of Array.from(files)) {
      await insertEditorImageFromFile(editor, f, imageUploadHandler);
    }
  }

  function btn(label: React.ReactNode, action: () => void, active?: boolean, title?: string) {
    return (
      <button type="button" onMouseDown={e => { e.preventDefault(); action(); }} title={title} style={{
        width: 26, height: 26, borderRadius: 5, border: "none", display: "flex",
        alignItems: "center", justifyContent: "center",
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
    <div data-tour-target={tourTarget} style={{
      display: "flex", alignItems: "center", gap: 2, padding: "6px 20px", flexShrink: 0,
      borderBottom: "0.5px solid var(--color-border)", background: "var(--color-surface-raised)",
    }}>
      {btn(<Bold size={12} />,          () => editor.chain().focus().toggleBold().run(),          active.bold,      "Bold")}
      {btn(<Italic size={12} />,        () => editor.chain().focus().toggleItalic().run(),        active.italic,    "Italic")}
      {btn(<UnderlineIcon size={12} />, () => editor.chain().focus().toggleUnderline().run(),     active.underline, "Underline")}
      {btn(<Strikethrough size={12} />, () => editor.chain().focus().toggleStrike().run(),        active.strike,    "Strikethrough")}
      {sep()}
      {btn(<span style={{ fontSize: 11, fontWeight: 700 }}>H1</span>, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active.h1, "Heading 1")}
      {btn(<span style={{ fontSize: 11, fontWeight: 700 }}>H2</span>, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active.h2, "Heading 2")}
      {sep()}
      {btn(<List size={12} />,        () => editor.chain().focus().toggleBulletList().run(),  active.bulletList,  "Bullet list")}
      {btn(<ListOrdered size={12} />, () => editor.chain().focus().toggleOrderedList().run(), active.orderedList, "Numbered list")}
      {sep()}
      {btn(
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 4l4 4-4 4"/><path d="M9 8h5"/>
        </svg>,
        () => editor.chain().focus().insertContent({ type: "toggleBlock", attrs: { summary: "", open: false }, content: [{ type: "paragraph" }] }).run(),
        false, "Toggle block",
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
          width: 26, height: 26, borderRadius: 5, border: "none", display: "flex",
          alignItems: "center", justifyContent: "center",
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
      <div style={{ flex: 1 }} />
      {onGenerateTasks && (
        <button type="button" data-tour-target={generateTasksTourTarget} onClick={onGenerateTasks} disabled={suggesting} title="Generate tasks from this note" style={{
          display: "flex", alignItems: "center", gap: 5, padding: "3px 10px",
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          background: "linear-gradient(#fffefc, #fffefc) padding-box, linear-gradient(135deg, #a8b886 0%, #4a6232 100%) border-box",
          border: "1px solid transparent", color: "var(--color-sage-text)",
          cursor: suggesting ? "not-allowed" : "pointer",
          opacity: suggesting ? 0.5 : 1, fontFamily: "inherit", flexShrink: 0,
        }}>
          <svg width="9" height="9" viewBox="0 0 16 16" fill="var(--color-sage-text)"><path d="M8 1l1.2 4.2L14 7l-4.8 1.8L8 14l-1.2-5.2L2 7l4.8-1.8L8 1z"/></svg>
          {suggesting ? "Thinking…" : "Generate tasks"}
        </button>
      )}
    </div>
  );
}

// ─── InlineAshPopover ────────────────────────────────────────────────────────
//
// Inline Ash entry point. Triggered by pressing Space on a blank line in the
// canvas. Two response shapes from the caller's onSubmit:
//
//   - returning nothing / void  → text was inserted; the popover closes.
//   - returning an action object → a write tool ran (task / reminder / note /
//                                  …). The popover transitions to a success
//                                  state with a "View →" link.

export interface InlineAshAction {
  summary:    string;
  viewHref?:  string;
  viewLabel?: string;
}

export function InlineAshPopover({
  anchor, onSubmit, onClose,
}: {
  anchor:   { top: number; left: number; bottom: number };
  /** Returns an `InlineAshAction` when a write tool ran (popover stays open
   *  with a confirmation), or void when text was inserted (popover closes). */
  onSubmit: (prompt: string) => Promise<InlineAshAction | void>;
  onClose:  () => void;
}) {
  const [value,   setValue]   = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState<InlineAshAction | null>(null);
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
    const result = await onSubmit(value.trim());
    setLoading(false);
    if (result && result.summary) {
      setDone(result);
    }
    // If void/undefined the parent will call onClose() once it inserts text.
  }

  return (
    <div ref={ref} style={{
      position: "fixed", top: anchor.bottom + 4, left: anchor.left, zIndex: 500,
      background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
      borderRadius: 10, boxShadow: "var(--shadow-overlay)", width: 360, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "0.5px solid var(--color-border)" }}>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="var(--color-sage)"><circle cx="10" cy="10" r="10"/><path d="M6 10.5c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/><circle cx="10" cy="14" r="1" fill="white"/></svg>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)" }}>Ask Ash</span>
        <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-tertiary)", padding: 2 }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
      </div>

      {done ? (
        <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 99, flexShrink: 0,
              background: "rgba(155,163,122,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-sage)", marginTop: 1,
            }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8l3.5 3.5L13 4.5" />
              </svg>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-primary)", flex: 1 }}>
              {done.summary}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            {done.viewHref && done.viewLabel && (
              <a
                href={done.viewHref}
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: "4px 10px", borderRadius: 6,
                  background: "var(--color-sage)", color: "white",
                  border: "none", textDecoration: "none", fontFamily: "inherit",
                }}
              >
                {done.viewLabel} →
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)",
                background: "transparent", border: "none", cursor: "pointer",
                padding: "4px 6px", fontFamily: "inherit",
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
          <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") onClose(); }}
            placeholder="Ask, draft, or create…" disabled={loading}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 12, color: "var(--color-text-primary)", fontFamily: "inherit" }}
          />
          {loading
            ? <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Thinking…</span>
            : value.trim() && <button type="submit" style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Send</button>
          }
        </form>
      )}
    </div>
  );
}

// ─── Selection bubble ────────────────────────────────────────────────────────
//
// Floating context menu anchored to the current text selection. Currently
// exposes a single "Convert to note" action; future actions (Ask Ash on
// selection, link, etc.) can slot in alongside it. Built on Tiptap's
// BubbleMenu which handles positioning + show/hide logic for us.

export function SelectionBubble({
  editor, onConvertToNote, convertingToNote,
}: {
  editor:            Editor | null;
  onConvertToNote:   (selection: { text: string; html: string }) => void | Promise<void>;
  convertingToNote?: boolean;
}) {
  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      // Only show when there's a non-empty selection (the default), and not
      // when the selection is inside a NodeView control like our ToggleBlock.
      shouldShow={({ editor: ed, from, to }) => {
        if (from === to) return false;
        if (!ed.isFocused && !ed.isEditable) return false;
        return true;
      }}
      options={{ placement: "top", offset: 8 }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: 4, borderRadius: 10,
          background: "var(--color-charcoal)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        }}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const sel = getSelectionExtract(editor);
            if (sel) onConvertToNote(sel);
          }}
          disabled={convertingToNote}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px", fontSize: 11, fontWeight: 500,
            borderRadius: 7, border: "none",
            background: "transparent",
            color: "rgba(245,241,233,0.92)",
            cursor: convertingToNote ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: convertingToNote ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!convertingToNote) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <FileText size={11} strokeWidth={1.75} />
          {convertingToNote ? "Creating…" : "Convert to note"}
        </button>
      </div>
    </BubbleMenu>
  );
}

// ─── submitInlineAsh ─────────────────────────────────────────────────────────
//
// The one-and-only path for fulfilling an InlineAshPopover submit. Every
// surface in the app (project canvas, contact canvas, note editor, outreach
// target canvas, …) routes through this — so behavior changes (new tool,
// new response shape, telemetry, etc.) only need to land here.
//
// Returns the action result when a write tool ran (caller passes it back
// from `onSubmit` so the popover can show the success state), or void when
// text was inserted (popover closes via the parent setting its prompt state
// to null).

export async function submitInlineAsh({
  prompt, editor, ashPrompt, surface, clearPrompt,
}: {
  prompt:      string;
  editor:      Editor | null;
  ashPrompt:   AshPromptState;
  surface:     InlineAshSurface;
  clearPrompt: () => void;
}): Promise<InlineAshAction | void> {
  if (!editor || !ashPrompt) return;
  const noteContext = editor.getText().slice(0, 800);
  const res = await fetch("/api/notes/ash-inline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, noteContext, surface }),
  });
  const data = await res.json() as {
    text?:   string;
    action?: InlineAshAction;
  };

  if (data.action) {
    // Broadcast for any listeners (e.g. background refetches of tasks/notes
    // so panels stay in sync after Ash writes).
    window.dispatchEvent(new CustomEvent("ash:write-tool-ran", { detail: { tools: ["inline"] } }));
    return data.action;
  }

  if (data.text) {
    editor.chain().focus().setTextSelection(ashPrompt.pos).insertContent(data.text).run();
  }
  clearPrompt();
}

// ─── Re-exports for convenience ───────────────────────────────────────────────

export { useEditor, EditorContent };
