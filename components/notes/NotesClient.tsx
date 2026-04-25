"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/types/database";
import { Search, Pin, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function fmtDatetime(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function countWords(html: string) {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

// ── ProjectPicker ──────────────────────────────────────────────────────────────

function ProjectPicker({
  projectId, projects, onChange,
}: {
  projectId: string | null;
  projects: { id: string; title: string }[];
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref    = useRef<HTMLDivElement>(null);
  const linked = projects.find((p) => p.id === projectId);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium rounded-full px-[9px] py-[3px] transition-colors"
        style={linked ? {
          background: "rgba(155,163,122,0.14)",
          color: "#5a7040",
          border: "0.5px solid rgba(155,163,122,0.25)",
        } : {
          background: "transparent",
          color: "var(--color-grey)",
          border: "0.5px dashed var(--color-border)",
        }}
      >
        {linked ? linked.title : "+ Link project"}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-20"
          style={{
            minWidth: "180px",
            background: "var(--color-off-white)",
            border: "0.5px solid var(--color-border)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          }}
        >
          <button
            className="w-full text-left px-4 py-[8px] text-[12px] transition-colors"
            style={{ color: "var(--color-grey)" }}
            onClick={() => { onChange(null); setOpen(false); }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            No project
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-4 py-[8px] text-[12px] transition-colors"
              style={{ color: "#6b6860", fontWeight: p.id === projectId ? 600 : 400 }}
              onClick={() => { onChange(p.id); setOpen(false); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FormatToolbar ──────────────────────────────────────────────────────────────

function FormatToolbar() {
  function cmd(command: string, value?: string) {
    document.execCommand(command, false, value);
  }

  function handleLink() {
    const url = window.prompt("Enter URL:");
    if (url) cmd("createLink", url);
  }

  const tools: { icon: React.ReactNode; action: () => void; title: string }[] = [
    { icon: <Bold size={12} />,          action: () => cmd("bold"),                title: "Bold"          },
    { icon: <Italic size={12} />,        action: () => cmd("italic"),              title: "Italic"        },
    { icon: <Underline size={12} />,     action: () => cmd("underline"),           title: "Underline"     },
    { icon: <Strikethrough size={12} />, action: () => cmd("strikeThrough"),       title: "Strikethrough" },
    { icon: <List size={12} />,          action: () => cmd("insertUnorderedList"), title: "Bullet list"   },
    { icon: <ListOrdered size={12} />,   action: () => cmd("insertOrderedList"),   title: "Numbered list" },
    { icon: <Link size={12} />,          action: handleLink,                        title: "Hyperlink"     },
  ];

  return (
    <div
      className="flex items-center gap-[2px] px-6 py-[6px] shrink-0"
      style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}
    >
      {tools.map((t, i) => (
        <button
          key={i}
          onMouseDown={(e) => { e.preventDefault(); t.action(); }}
          title={t.title}
          className="w-[26px] h-[26px] flex items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-cream)"; e.currentTarget.style.color = "var(--color-charcoal)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

// ── NoteEditor ─────────────────────────────────────────────────────────────────

function NoteEditor({
  note, projects, onUpdate, onDelete, onPin,
}: {
  note: Note;
  projects: { id: string; title: string }[];
  onUpdate: (id: string, fields: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
}) {
  const [title,     setTitle]     = useState(note.title ?? "");
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [wordCount, setWordCount] = useState(countWords(note.content ?? ""));
  const bodyRef    = useRef<HTMLDivElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase   = createClient();

  useEffect(() => {
    setTitle(note.title ?? "");
    setSaving(false);
    setSaved(false);
    setWordCount(countWords(note.content ?? ""));
  }, [note.id]);

  useEffect(() => {
    if (title === (note.title ?? "")) return;
    scheduleSave({ title: title || null });
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleBodyInput() {
    if (!bodyRef.current) return;
    const html = bodyRef.current.innerHTML;
    setWordCount(countWords(html));
    scheduleSave({ content: html || null });
  }

  async function handleProjectChange(projectId: string | null) {
    await supabase.from("notes").update({ project_id: projectId }).eq("id", note.id);
    onUpdate(note.id, { project_id: projectId });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <FormatToolbar />

      <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-off-white)" }}>
        <div style={{ maxWidth: "720px", padding: "44px 64px 80px" }}>
          {/* Title */}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            className="w-full bg-transparent focus:outline-none font-bold leading-tight block mb-3"
            style={{ fontSize: "24px", letterSpacing: "-0.02em", color: "var(--color-charcoal)" }}
          />

          {/* Project link */}
          <div className="mb-4">
            <ProjectPicker projectId={note.project_id} projects={projects} onChange={handleProjectChange} />
          </div>

          {/* Metadata */}
          <div className="flex gap-6 mb-4">
            {[
              { label: "Created",  value: fmtDatetime(note.created_at) },
              { label: "Modified", value: timeAgo(note.updated_at)     },
            ].map((m) => (
              <div key={m.label}>
                <div className="text-[9px] font-semibold uppercase tracking-widest mb-[2px]" style={{ color: "var(--color-grey)" }}>{m.label}</div>
                <div className="text-[11px] font-medium" style={{ color: "#6b6860" }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="mb-5" style={{ borderTop: "0.5px solid var(--color-border)" }} />

          {/* Rich text body */}
          <div
            key={note.id}
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleBodyInput}
            className="focus:outline-none min-h-64"
            style={{ fontSize: "14px", lineHeight: "1.8", color: "#6b6860" }}
            dangerouslySetInnerHTML={{ __html: note.content ?? "" }}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center justify-between px-6 py-[10px] shrink-0"
        style={{ borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}
      >
        <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{wordCount} words</span>
        <div className="flex items-center gap-4">
          {saving && <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>Saving…</span>}
          {!saving && saved && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--color-sage)" }}>
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Saved
            </span>
          )}
          <button
            onClick={() => { if (window.confirm("Delete this note?")) onDelete(note.id); }}
            className="text-[10px] transition-colors"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-red-orange)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-grey)")}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── NotesClient ────────────────────────────────────────────────────────────────

interface Props {
  initialNotes: Note[];
  projects: { id: string; title: string }[];
}

export default function NotesClient({ initialNotes, projects }: Props) {
  const [notes,          setNotes]          = useState<Note[]>(initialNotes);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialNotes[0]?.id ?? null);
  const [search,         setSearch]         = useState("");

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;

  const filteredNotes = notes
    .filter((n) => !search
      || n.title?.toLowerCase().includes(search.toLowerCase())
      || n.content?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function createNote() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("notes").insert({ user_id: user.id }).select().single();
    if (data) {
      setNotes((prev) => [data as Note, ...prev]);
      setSelectedNoteId(data.id);
    }
  }

  function handleNoteUpdate(id: string, fields: Partial<Note>) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...fields, updated_at: new Date().toISOString() } : n));
  }

  async function deleteNote(id: string) {
    const supabase = createClient();
    await supabase.from("notes").delete().eq("id", id);
    const remaining = notes.filter((n) => n.id !== id);
    setNotes(remaining);
    setSelectedNoteId(remaining[0]?.id ?? null);
  }

  async function togglePin(id: string, pinned: boolean) {
    const supabase = createClient();
    await supabase.from("notes").update({ pinned }).eq("id", id);
    handleNoteUpdate(id, { pinned });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "var(--color-off-white)" }}>

      {/* Topbar */}
      <div
        className="flex items-stretch shrink-0"
        style={{ height: "44px", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}
      >
        <div className="flex items-center px-4">
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Notes</span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 shrink-0">
          {selectedNote && (
            <>
              <button
                onClick={() => togglePin(selectedNote.id, !selectedNote.pinned)}
                className="flex items-center gap-1.5 px-3 py-[5px] text-[11px] rounded-md transition-colors"
                style={{
                  color: selectedNote.pinned ? "var(--color-sage)" : "var(--color-grey)",
                  background: selectedNote.pinned ? "rgba(155,163,122,0.10)" : "transparent",
                  border: "0.5px solid var(--color-border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = selectedNote.pinned ? "rgba(155,163,122,0.10)" : "transparent")}
              >
                <Pin size={11} strokeWidth={1.75} />
                {selectedNote.pinned ? "Pinned" : "Pin"}
              </button>
              <div style={{ width: "0.5px", height: "16px", background: "var(--color-border)" }} />
            </>
          )}
          <button
            onClick={createNote}
            className="px-3 py-[5px] text-[11px] font-medium rounded-md text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--color-sage)" }}
          >
            + New note
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Notes list panel */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{ width: "220px", borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-[10px] shrink-0"
            style={{ borderBottom: "0.5px solid var(--color-border)" }}
          >
            <span className="text-[12px] font-semibold" style={{ color: "var(--color-charcoal)" }}>All notes</span>
            <span
              className="text-[10px] px-[7px] py-[1px] rounded-full"
              style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
            >
              {notes.length}
            </span>
          </div>

          {/* Search */}
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
            <div
              className="flex items-center gap-2 rounded-md px-3 py-[6px]"
              style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}
            >
              <Search size={10} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="flex-1 bg-transparent text-[11px] focus:outline-none"
                style={{ color: "var(--color-charcoal)" }}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 && (
              <div className="flex items-center justify-center h-20">
                <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                  {search ? "No matches." : "No notes yet."}
                </p>
              </div>
            )}
            {filteredNotes.map((note) => {
              const active = note.id === selectedNoteId;
              return (
                <button
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className="w-full text-left px-4 py-[10px] transition-colors"
                  style={{
                    background: active ? "var(--color-off-white)" : "transparent",
                    borderBottom: "0.5px solid var(--color-border)",
                    borderLeft: `2px solid ${active ? "var(--color-sage)" : "transparent"}`,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(239,240,231,0.5)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <p className="text-[12px] font-semibold truncate mb-[2px]" style={{ color: "var(--color-charcoal)" }}>
                    {note.title || "Untitled"}
                  </p>
                  {note.content && (
                    <p className="text-[10px] truncate mb-[3px]" style={{ color: "var(--color-grey)" }}>
                      {note.content.replace(/<[^>]*>/g, " ").trim()}
                    </p>
                  )}
                  <p className="text-[9px]" style={{ color: "var(--color-grey)" }}>{timeAgo(note.updated_at)}</p>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 shrink-0" style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <button
              onClick={createNote}
              className="w-full text-[11px] py-[6px] rounded-md transition-colors"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-off-white)"; e.currentTarget.style.color = "#6b6860"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
            >
              + New note
            </button>
          </div>
        </div>

        {/* Editor */}
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            projects={projects}
            onUpdate={handleNoteUpdate}
            onDelete={deleteNote}
            onPin={togglePin}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ background: "var(--color-off-white)" }}>
            <p className="text-[14px] font-medium" style={{ color: "var(--color-charcoal)" }}>No note selected</p>
            <p className="text-[12px] mb-3" style={{ color: "var(--color-grey)" }}>Select a note or create a new one</p>
            <button
              onClick={createNote}
              className="px-4 py-2 text-[12px] font-medium rounded-lg text-white"
              style={{ background: "var(--color-sage)" }}
            >
              + New note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
