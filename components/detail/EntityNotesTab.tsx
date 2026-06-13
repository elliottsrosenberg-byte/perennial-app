"use client";

// ── EntityNotesTab ────────────────────────────────────────────────────────────
// Entity-agnostic Notes tab, extracted from ProjectDetailPanel's NotesTab +
// InlineNoteEditor. Per-entity differences are only the foreign-key column the
// `notes` row is filed under and the DOM-id prefix for highlight scroll-to.
//
// Behavior is reproduced EXACTLY from the Project version: header with count +
// "New note", inline rich-text editor with debounced auto-save, note cards with
// snippet + timeAgo, optimistic insert + delete, sage highlight.
//
// State can be uncontrolled (the tab loads + owns `notes`) or controlled (parent
// passes `notes` + `setNotes`, e.g. Projects). When uncontrolled it fetches on
// mount.

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/types/database";
import { FileText, Plus, ExternalLink } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { getRichExtensions, RichToolbar } from "@/components/ui/RichEditor";
import { timeAgo } from "@/lib/format/date";

export type NoteFkColumn = "project_id" | "contact_id" | "organization_id" | "target_id";

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

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!note.title && !note.content) titleRef.current?.focus();
  }, [note.title, note.content]);

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

// ── EntityNotesTab ────────────────────────────────────────────────────────────

export default function EntityNotesTab({
  fkColumn, id, highlightedNoteId, idPrefix = "entity",
  notes: controlledNotes, setNotes: setControlledNotes,
}: {
  fkColumn:           NoteFkColumn;
  id:                 string;
  highlightedNoteId?: string | null;
  /** DOM-id prefix for highlight scroll-to: `${idPrefix}-note-${note.id}`. */
  idPrefix?:          string;
  /** Optional controlled state. When omitted the tab owns + loads its own. */
  notes?:             Note[];
  setNotes?:          React.Dispatch<React.SetStateAction<Note[]>>;
}) {
  const isControlled = controlledNotes !== undefined && setControlledNotes !== undefined;
  const [ownNotes, setOwnNotes] = useState<Note[]>([]);
  const notes    = isControlled ? controlledNotes! : ownNotes;
  const setNotes = (isControlled ? setControlledNotes! : setOwnNotes) as React.Dispatch<React.SetStateAction<Note[]>>;

  const [editingId, setEditingId] = useState<string | null>(null);

  // Self-load only when uncontrolled.
  useEffect(() => {
    if (isControlled) return;
    createClient().from("notes").select("*").eq(fkColumn, id).order("updated_at", { ascending: false })
      .then(({ data }) => { if (data) setOwnNotes(data as Note[]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fkColumn, id, isControlled]);

  async function createNote() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("notes")
      .insert({ user_id: user.id, [fkColumn]: id, title: null, content: null })
      .select()
      .single();
    if (data) {
      const fresh = data as Note;
      setNotes(prev => [fresh, ...prev]);
      setEditingId(fresh.id);
    }
  }

  function handleDirtyChange(noteId: string, patch: Partial<Note>) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...patch } : n));
  }

  async function handleDelete(noteId: string) {
    await createClient().from("notes").delete().eq("id", noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
    if (editingId === noteId) setEditingId(null);
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

          const hi = highlightedNoteId === note.id;
          return (
            <div
              key={note.id}
              id={`${idPrefix}-note-${note.id}`}
              onClick={() => setEditingId(note.id)}
              style={{
                padding: "12px 14px", marginBottom: 8, borderRadius: 10,
                background: hi ? "rgba(155,163,122,0.18)" : "var(--color-off-white)",
                border: `0.5px solid ${hi ? "rgba(155,163,122,0.46)" : "var(--color-border)"}`,
                cursor: "pointer",
                transition: "background 0.6s ease, border-color 0.6s ease",
              }}
              onMouseEnter={e => { if (!hi) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}
              onMouseLeave={e => { if (!hi) e.currentTarget.style.borderColor = "var(--color-border)"; }}
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
