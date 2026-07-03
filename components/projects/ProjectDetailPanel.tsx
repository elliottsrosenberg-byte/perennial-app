"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Project, Task, Note, Contact } from "@/types/database";
import { Maximize2, Minimize2, X, Settings, FileText, CheckSquare, FolderOpen, Trash2, Pencil, Plus, Link2, ExternalLink, Users, Mail, Phone } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DetailPanelShell from "@/components/ui/DetailPanelShell";
import SharedEditableField from "@/components/ui/EditableField";
import DatePillField from "@/components/ui/DatePillField";
import AshPromptsModule, { type AshPrompt } from "@/components/ui/AshPromptsModule";
import { useProjectOptions, type ProjectOption } from "@/lib/projects/options";
import EntityTasksTab from "@/components/detail/EntityTasksTab";
import EntityNotesTab from "@/components/detail/EntityNotesTab";
import EntityFilesTab from "@/components/detail/EntityFilesTab";

// ── Convert a stored color into a soft chip background ─────────────────────
function chipBg(color: string): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (!Number.isNaN(r)) return `rgba(${r},${g},${b},0.12)`;
  }
  if (color === "var(--color-sage)")        return "rgba(var(--color-sage-rgb),0.16)";
  if (color === "var(--color-warm-yellow)") return "rgba(var(--color-amber-rgb),0.15)";
  if (color === "var(--color-red-orange)")  return "rgba(var(--color-red-rgb),0.10)";
  if (color === "var(--color-green)")       return "rgba(var(--color-green-rgb),0.12)";
  if (color === "var(--color-grey)")        return "rgba(var(--color-grey-rgb),0.14)";
  return "rgba(var(--color-charcoal-rgb),0.06)";
}

function optionTagStyle(opt: ProjectOption): { bg: string; color: string } {
  return { bg: chipBg(opt.color), color: opt.color === "var(--color-grey)" ? "var(--color-text-secondary)" : opt.color };
}
import { useEditor, EditorContent } from "@tiptap/react";
import { getRichExtensions, RichToolbar, InlineAshPopover, SelectionBubble, submitInlineAsh } from "@/components/ui/RichEditor";
import type { AshPromptState } from "@/components/ui/RichEditor";
import CanvasAshHint from "@/components/ui/CanvasAshHint";
import { fmtDateShort as fmt } from "@/lib/format/date";

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionTab = "canvas" | "tasks" | "notes" | "files" | "contacts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(due: string | null) {
  return !!due && new Date(due + "T23:59:59") < new Date();
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


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
          style={{ color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-sage)", maxWidth: "130px", minWidth: "60px" }}
          placeholder={placeholder}
        />
      ) : (
        <div className="flex items-center gap-1.5 cursor-text" onClick={() => setEditing(true)}>
          <span
            className="text-[11px] font-medium text-right"
            style={{ color: alert ? "var(--color-red-orange)" : display === "—" ? "var(--color-grey)" : "var(--color-text-secondary)", fontWeight: display === "—" ? 400 : 500 }}
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
          style={{ color: "var(--color-text-secondary)", border: "0.5px solid var(--color-sage)", borderRadius: "6px", padding: "5px 7px" }}
        />
      ) : (
        <div onClick={() => setEditing(true)} className="cursor-text">
          {value
            ? <p className="text-[11px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{value}</p>
            : <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Add a description…</p>
          }
        </div>
      )}
    </div>
  );
}

// ── CanvasEditor ──────────────────────────────────────────────────────────────

function CanvasEditor({
  projectId, projectTitle, initialHtml, onSaved,
}: {
  projectId:    string;
  projectTitle: string;
  initialHtml:  string | null;
  onSaved:      (html: string | null) => void;
}) {
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [convertingNote, setConvertingNote] = useState(false);
  const [noteCreated,   setNoteCreated]   = useState(false);
  const [ashPrompt,     setAshPrompt]     = useState<AshPromptState>(null);
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of the latest HTML the editor produced, kept in a ref so the
  // unmount cleanup doesn't have to read from a possibly torn-down editor.
  // Seeded with initialHtml so a "no edits" tab toggle preserves the input.
  const latestHtml   = useRef<string>(initialHtml ?? "");
  // Always-fresh onSaved reference so cleanup uses the latest parent
  // callback (the prop is recreated on each parent render).
  const onSavedRef   = useRef(onSaved);
  onSavedRef.current = onSaved;

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
      const html = editor.getHTML();
      latestHtml.current = html;
      scheduleSave(html);
    },
    editorProps: {
      attributes: { style: "outline: none; min-height: 300px; font-size: 14px; line-height: 1.8; color: var(--color-text-secondary);" },
    },
  }, [projectId]);

  // On unmount: flush any pending save with the ref-tracked HTML (the editor
  // may already be torn down by Tiptap's own cleanup at this point, so
  // reading editor.getHTML() can return empty and clobber the parent's
  // canvasHtml state — that's exactly what was making the canvas blank out
  // on a tab toggle. Using the ref keeps the last known content stable.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const html = latestHtml.current;
        createClient().from("projects").update({ canvas_html: html || null }).eq("id", projectId);
        onSavedRef.current(html || null);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function scheduleSave(html: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true); setSaved(false);
    saveTimer.current = setTimeout(async () => {
      await createClient().from("projects").update({ canvas_html: html || null }).eq("id", projectId);
      onSavedRef.current(html || null);
      saveTimer.current = null;
      setSaving(false); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }

  function handleAshSubmit(prompt: string) {
    return submitInlineAsh({
      prompt, editor, ashPrompt,
      surface: { type: "canvas-project", project_id: projectId, project_title: projectTitle },
      clearPrompt: () => setAshPrompt(null),
    });
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
      project_id: projectId,
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

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "5px 20px", borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)", flexShrink: 0 }}>
        {noteCreated && <span style={{ fontSize: 10, color: "var(--color-sage-text)", fontWeight: 600 }}>✓ Note created</span>}
        {saving  && <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Saving…</span>}
        {!saving && saved && <span style={{ fontSize: 10, color: "var(--color-sage)" }}>✓ Saved</span>}
      </div>

      {ashPrompt && (
        <InlineAshPopover anchor={ashPrompt.anchor} onSubmit={handleAshSubmit} onClose={() => setAshPrompt(null)} />
      )}
    </div>
  );
}

// ── ContactsTab ───────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  active: "var(--color-sage)", lead: "var(--color-gold)", inactive: "var(--color-grey)",
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
                    background: "rgba(var(--color-sage-rgb),0.06)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--color-sage-rgb),0.12)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(var(--color-sage-rgb),0.06)"}
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
            onMouseEnter={e => e.currentTarget.style.color = "var(--color-text-secondary)"}
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

// ── Ash prompt builder ────────────────────────────────────────────────────────
//
// Picks the most useful contextual action for the project (status, due-date
// proximity, open task count) and appends a small list of always-relevant
// generic prompts. Mirrors the intelligence that used to live in the removed
// bottom AshStrip — now surfaced as a left-rail module.

interface ProjectAshPrompts {
  headline: string;
  primary:  AshPrompt;
  prompts:  AshPrompt[];
}

function buildProjectAshPrompts(project: Project, activeTasks: number): ProjectAshPrompts {
  const t = project.title;
  const n = activeTasks;
  const tasks = `${n} open task${n !== 1 ? "s" : ""}`;

  let headline: string;
  let primary:  AshPrompt;

  if (project.due_date) {
    const days = Math.round((new Date(project.due_date + "T00:00:00").getTime() - Date.now()) / 86400000);
    if (days < 0 && n > 0) {
      headline = `"${t}" is overdue with ${tasks} still open.`;
      primary  = { label: "Triage tasks", message: `Triage "${t}" — it's overdue with ${tasks}. Tell me what needs to move, what to drop, and the single most important next step.` };
    } else if (days >= 0 && days <= 7 && n > 0) {
      headline = `"${t}" is due ${days === 0 ? "today" : `in ${days} day${days !== 1 ? "s" : ""}`} with ${tasks} open.`;
      primary  = { label: "Build a plan", message: `Build a focused plan for "${t}" — it's due ${days === 0 ? "today" : `in ${days} days`} with ${tasks} still open. Prioritize ruthlessly.` };
    } else if (project.status === "on_hold") {
      headline = `"${t}" is on hold. I can help figure out what's blocking it.`;
      primary  = { label: "Unblock it", message: `Think through what's blocking "${t}" (currently on hold) and suggest a concrete path to get it moving again.` };
    } else if (project.status === "planning") {
      headline = `"${t}" is in planning — I can map out the key tasks and what to tackle first.`;
      primary  = { label: "Map it out", message: `Plan "${t}" from scratch — give me the key tasks, a rough timeline, and the single best place to start building momentum.` };
    } else if (n > 3) {
      headline = `${n} open tasks on "${t}" — I can prioritise and flag what's at risk.`;
      primary  = { label: "Prioritize tasks", message: `Prioritize the ${n} open tasks for "${t}". Flag anything overdue or at risk, then give me a clear focus order.` };
    } else {
      headline = `"${t}" has ${tasks}. I can give you a clear view of where things stand.`;
      primary  = { label: "Where things stand", message: `Give me a focused view of "${t}" — open tasks, timeline pressure, and what I should do next.` };
    }
  } else if (project.status === "on_hold") {
    headline = `"${t}" is on hold. I can help figure out what's blocking it.`;
    primary  = { label: "Unblock it", message: `Think through what's blocking "${t}" (currently on hold) and suggest a concrete path to get it moving again.` };
  } else if (project.status === "planning") {
    headline = `"${t}" is in planning — I can map out the key tasks and what to tackle first.`;
    primary  = { label: "Map it out", message: `Plan "${t}" from scratch — give me the key tasks, a rough timeline, and the single best place to start building momentum.` };
  } else if (project.status === "complete") {
    headline = `"${t}" is complete. Want a quick wrap-up before moving on?`;
    primary  = { label: "Wrap it up", message: `Quick retrospective on "${t}" — what was accomplished, what to document, and any loose ends to tie off.` };
  } else if (n > 3) {
    headline = `${n} open tasks on "${t}" — I can prioritise and flag what's at risk.`;
    primary  = { label: "Prioritize tasks", message: `Prioritize the ${n} open tasks for "${t}". Flag anything overdue or at risk, then give me a clear focus order.` };
  } else if (n > 0) {
    headline = `"${t}" has ${tasks} — want a clear view of where things stand?`;
    primary  = { label: "Where things stand", message: `Give me a focused view of "${t}" — open tasks, timeline pressure, and what I should do next.` };
  } else {
    headline = `I can pull together a full picture of where "${t}" stands right now.`;
    primary  = { label: "Full rundown", message: `Give me a full rundown of "${t}" — status, what's in flight, any risks, and the clearest next move.` };
  }

  const prompts: AshPrompt[] = [
    { label: "Summarize this project",       message: `Summarize "${t}" in 3–5 sentences. Status, what's done, what's in flight, the next big thing.` },
    { label: "Draft an update for a client", message: `Draft a brief, professional update on "${t}" I could send to a client. Highlight progress and what's next.` },
    { label: "What's the next move?",        message: `Looking at "${t}" today, what's the single most useful thing I could do next?` },
    ...(n > 0
      ? [{ label: "Suggest tasks I'm missing", message: `Look at the open tasks for "${t}" — what's missing that a project like this usually needs at this stage?` }]
      : [{ label: "Draft a starter task list",  message: `Draft a starter task list for "${t}" — what does a project like this typically need at this stage?` }]),
  ];

  return { headline, primary, prompts };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  project:    Project;
  onClose:    () => void;
  onUpdated?: (p: Project) => void;
  onDeleted?: (id: string) => void;
  /** Deep-link inputs from ProjectsClient: which tab to land on and which
   *  row to briefly tint (used by Ash inline "View task →" affordances). */
  initialTab?:             string | null;
  initialHighlightTaskId?: string | null;
  initialHighlightNoteId?: string | null;
}

const SECTION_TABS = new Set<SectionTab>(["canvas", "tasks", "notes", "files", "contacts"]);

export default function ProjectDetailPanel({
  project: initialProject, onClose, onUpdated, onDeleted,
  initialTab, initialHighlightTaskId, initialHighlightNoteId,
}: Props) {
  const [localProject,   setLocalProject]   = useState<Project>(initialProject);
  const [tasks,          setTasks]          = useState<Task[]>(initialProject.tasks ?? []);
  const [notes,          setNotes]          = useState<Note[]>([]);
  const [canvasHtml,     setCanvasHtml]     = useState<string | null | undefined>(undefined);
  const [activeTab,      setActiveTab]      = useState<SectionTab>(
    initialTab && SECTION_TABS.has(initialTab as SectionTab) ? (initialTab as SectionTab) : "canvas",
  );
  const [maximized,      setMaximized]      = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [financeData,    setFinanceData]    = useState<{ hours: number; billableAmount: number; invoiceCount: number; invoiceTotal: number } | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(initialHighlightTaskId ?? null);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(initialHighlightNoteId ?? null);

  // Always-fresh refs so the task-sync effect below can notify the parent
  // without re-subscribing on every project-field edit.
  const onUpdatedRef    = useRef(onUpdated);    onUpdatedRef.current    = onUpdated;
  const localProjectRef = useRef(localProject); localProjectRef.current = localProject;

  useEffect(() => {
    if (!initialHighlightTaskId && !initialHighlightNoteId) return;
    const t = setTimeout(() => {
      setHighlightedTaskId(null);
      setHighlightedNoteId(null);
    }, 2400);
    return () => clearTimeout(t);
  }, [initialHighlightTaskId, initialHighlightNoteId]);

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

  // Skip the per-project-change tab reset on the very first mount, so a
  // deep-link `initialTab` survives.
  const firstLoadRef = useRef(true);

  // Fetch fresh data on open — including canvas_html which is not in the server-rendered snapshot
  useEffect(() => {
    setLocalProject(initialProject);
    setTasks(initialProject.tasks ?? []);
    if (!firstLoadRef.current) setActiveTab("canvas");
    firstLoadRef.current = false;
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

  // Keep the parent's project.tasks in sync whenever the local task list
  // changes (toggle / add / edit / delete). Without this, the dashboard
  // ProjectCard's "X/Y done" count is computed from the stale server
  // snapshot and doesn't reflect a task checked/unchecked in this panel.
  // Safe from loops: the open-reset effect above keys on initialProject.id,
  // so the parent re-passing a same-id project doesn't reset `tasks`.
  useEffect(() => {
    onUpdatedRef.current?.({ ...localProjectRef.current, tasks });
  }, [tasks]);

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

  const { options: projectOptions, resolve } = useProjectOptions();
  const statusStyle   = optionTagStyle(resolve("status",   localProject.status));
  const priorityStyle = optionTagStyle(resolve("priority", localProject.priority));
  const typeStyle     = localProject.type
    ? optionTagStyle(resolve("type", localProject.type))
    : { bg: "var(--color-cream)", color: "var(--color-text-secondary)" };
  const statusOptions   = projectOptions.status.map(o => ({ value: o.key, label: o.label }));
  const typeOptions     = projectOptions.type.map(o => ({ value: o.key, label: o.label }));
  const priorityOptions = projectOptions.priority.map(o => ({ value: o.key, label: o.label }));
  const isClient      = localProject.type === "client_project";
  const overdue       = isOverdue(localProject.due_date);

  const NAV_ITEMS: { key: SectionTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "canvas",   label: "Canvas",   icon: <FileText    size={13} strokeWidth={1.75} /> },
    { key: "tasks",    label: "Tasks",    icon: <CheckSquare size={13} strokeWidth={1.75} />, count: tasks.filter(t => !t.completed).length },
    { key: "contacts", label: "Contacts", icon: <Users       size={13} strokeWidth={1.75} /> },
    { key: "notes",    label: "Notes",    icon: <FileText    size={13} strokeWidth={1.75} />, count: notes.length },
    { key: "files",    label: "Files",    icon: <FolderOpen  size={13} strokeWidth={1.75} /> },
  ];

  const activeTaskCount = tasks.filter(t => !t.completed).length;
  const ashContext = useMemo(
    () => buildProjectAshPrompts(localProject, activeTaskCount),
    [localProject, activeTaskCount],
  );

  return (
    <>
      <DetailPanelShell maximized={maximized} onClose={onClose}>
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
              <CustomSelect<string>
                label="Status"   value={localProject.status}
                options={statusOptions} tagStyle={statusStyle}
                onSave={v => handleUpdate("status", v)}
              />
              {localProject.type && (
                <CustomSelect<string>
                  label="Type"   value={localProject.type}
                  options={typeOptions} tagStyle={typeStyle}
                  onSave={v => handleUpdate("type", v)}
                />
              )}
              <CustomSelect<string>
                label="Priority" value={localProject.priority}
                options={priorityOptions} tagStyle={priorityStyle}
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
                <SharedEditableField label="Dimensions" value={localProject.dimensions} onSave={v => handleUpdate("dimensions", v)} openWhenEmpty />
                <SharedEditableField label="Materials"  value={localProject.materials}  onSave={v => handleUpdate("materials",  v)} openWhenEmpty />
                <SharedEditableField label="Weight"     value={localProject.weight}     onSave={v => handleUpdate("weight",     v)} openWhenEmpty />
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
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>{financeData.hours}h</span>
                  </div>
                )}
                {localProject.type === "client_project" && financeData.billableAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                    <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Billable</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>${financeData.billableAmount.toLocaleString()}</span>
                  </div>
                )}
                {financeData.invoiceCount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Invoiced</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>{financeData.invoiceCount} · ${financeData.invoiceTotal.toLocaleString()}</span>
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
                      borderRadius: 7, border: "none", background: active ? "rgba(var(--color-sage-rgb),0.12)" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease", marginBottom: 1,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ color: active ? "var(--color-sage-deep)" : "var(--color-grey)" }}>{item.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, textAlign: "left", color: active ? "var(--color-sage-deep)" : "var(--color-grey)", fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Ash module — context-aware prompts in a sage-tinted card */}
            <AshPromptsModule
              headline={ashContext.headline}
              primaryPrompt={ashContext.primary}
              prompts={ashContext.prompts}
              context={{ project: { title: localProject.title, status: localProject.status, priority: localProject.priority } }}
              placeholder={`Ask Ash about ${localProject.title}…`}
            />
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
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(var(--color-red-rgb),0.07)"}
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
                : <CanvasEditor key={localProject.id} projectId={localProject.id} projectTitle={localProject.title} initialHtml={canvasHtml} onSaved={(h) => setCanvasHtml(h)} />
            )}
            {activeTab === "tasks" && (
              <EntityTasksTab fkColumn="project_id" id={localProject.id} idPrefix="project" tasks={tasks} setTasks={setTasks} highlightedTaskId={highlightedTaskId} />
            )}
            {activeTab === "contacts" && (
              <ContactsTab key={localProject.id} projectId={localProject.id} />
            )}
            {activeTab === "notes" && (
              <EntityNotesTab fkColumn="project_id" id={localProject.id} idPrefix="project" notes={notes} setNotes={setNotes} highlightedNoteId={highlightedNoteId} />
            )}
            {activeTab === "files" && (
              <EntityFilesTab key={localProject.id} filesTable="project_files" fkColumn="project_id" id={localProject.id} bucket="project-files" />
            )}
          </div>

        </div>
      </DetailPanelShell>

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
