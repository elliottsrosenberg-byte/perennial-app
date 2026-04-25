"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Contact, ContactActivity, ContactActivityType,
  ContactStatus, Project,
} from "@/types/database";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  gallery:  { bg: "rgba(37,99,171,0.10)",   color: "#2563ab" },
  client:   { bg: "rgba(61,107,79,0.10)",   color: "#3d6b4f" },
  supplier: { bg: "rgba(184,134,11,0.10)",  color: "#b8860b" },
  press:    { bg: "rgba(109,79,163,0.10)",  color: "#6d4fa3" },
  lead:     { bg: "rgba(154,150,144,0.10)", color: "#6b6860" },
  event:    { bg: "rgba(20,140,140,0.10)",  color: "#148c8c" },
};
const FALLBACK_COLORS = [
  { bg: "rgba(37,99,171,0.10)",  color: "#2563ab" },
  { bg: "rgba(109,79,163,0.10)", color: "#6d4fa3" },
  { bg: "rgba(20,140,140,0.10)", color: "#148c8c" },
  { bg: "rgba(61,107,79,0.10)",  color: "#3d6b4f" },
  { bg: "rgba(184,134,11,0.10)", color: "#b8860b" },
];
function tagStyle(tag: string) {
  const key = tag.toLowerCase().trim();
  if (TAG_COLORS[key]) return TAG_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

const STATUS_CONFIG: Record<ContactStatus, { dot: string; label: string }> = {
  active:   { dot: "var(--color-sage)",  label: "Active"   },
  lead:     { dot: "#b8860b",           label: "Lead"     },
  inactive: { dot: "var(--color-grey)", label: "Inactive" },
};

const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: "active",   label: "Active"   },
  { value: "lead",     label: "Lead"     },
  { value: "inactive", label: "Inactive" },
];

const ACTIVITY_CONFIG: Record<ContactActivityType, { bg: string; color: string; icon: React.ReactNode; label: string }> = {
  email:   { bg: "rgba(37,99,171,0.10)",  color: "#2563ab", label: "Email",   icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l6 5 6-5"/><rect x="1" y="3" width="14" height="10" rx="2"/></svg> },
  call:    { bg: "rgba(61,107,79,0.10)",  color: "#3d6b4f", label: "Call",    icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2a1 1 0 0 0-1 1v2c0 .38.22.72.55.89.4.2.6.64.45 1.06A8 8 0 0 0 13.05 12c.42.15.86-.05 1.06-.45.17-.33.45-.55.45-.55h2a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2"/></svg> },
  note:    { bg: "rgba(184,134,11,0.10)", color: "#b8860b", label: "Note",    icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h12v9H2z"/><path d="M5 6h6M5 9h4"/></svg> },
  meeting: { bg: "rgba(109,79,163,0.10)", color: "#6d4fa3", label: "Meeting", icon: <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/></svg> },
};

const PRESET_TAGS = ["Gallery", "Client", "Supplier", "Press", "Lead", "Event"];

function initials(c: Contact) {
  return (c.first_name[0] + c.last_name[0]).toUpperCase();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest  = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString())  return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function lastContactedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never contacted", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today",        color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`,  color: "var(--color-sage)" };
  if (days < 14) return { label: `${Math.floor(days / 7)}w ago`, color: "var(--color-charcoal)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: "#b8860b" };
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  contact: Contact;
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
  onDeleted: (id: string) => void;
}

export default function ContactDetailPanel({ contact: initialContact, onClose, onUpdated, onDeleted }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [contact, setContact]           = useState(initialContact);
  const [activities, setActivities]     = useState<ContactActivity[]>([]);
  const [linkedProjects, setLinked]     = useState<Project[]>([]);
  const [activeTab, setActiveTab]       = useState<"activity" | "notes">("activity");
  const [actInput, setActInput]         = useState("");
  const [actType, setActType]           = useState<ContactActivityType>("note");
  const [loadingAct, setLoadingAct]     = useState(false);

  // ── Edit mode state ─────────────────────────────────────────────────────────
  const [editing, setEditing]           = useState(false);
  const [editFirst, setEditFirst]       = useState("");
  const [editLast, setEditLast]         = useState("");
  const [editEmail, setEditEmail]       = useState("");
  const [editPhone, setEditPhone]       = useState("");
  const [editCompany, setEditCompany]   = useState("");
  const [editTitle, setEditTitle]       = useState("");
  const [editBio, setEditBio]           = useState("");
  const [editStatus, setEditStatus]     = useState<ContactStatus>("lead");
  const [editTags, setEditTags]         = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [editWebsite, setEditWebsite]   = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [saving, setSaving]             = useState(false);

  // ── Project linker state ────────────────────────────────────────────────────
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [availableProjects, setAvailable]          = useState<Project[]>([]);
  const [projectSearch, setProjectSearch]          = useState("");
  const [linkingProject, setLinkingProject]        = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchActivities();
    fetchLinkedProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (showProjectPicker) { setShowProjectPicker(false); return; }
        if (editing) { setEditing(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, showProjectPicker, editing]);

  // Close project picker on outside click
  useEffect(() => {
    if (!showProjectPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowProjectPicker(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showProjectPicker]);

  async function fetchActivities() {
    const { data } = await supabase
      .from("contact_activities")
      .select("*")
      .eq("contact_id", contact.id)
      .order("occurred_at", { ascending: false });
    if (data) setActivities(data as ContactActivity[]);
  }

  async function fetchLinkedProjects() {
    const { data } = await supabase
      .from("project_contacts")
      .select("project:projects(*)")
      .eq("contact_id", contact.id);
    if (data) {
      const projects = data
        .map((r: { project: Project | Project[] }) => Array.isArray(r.project) ? r.project[0] : r.project)
        .filter(Boolean) as Project[];
      setLinked(projects);
    }
  }

  // ── Activity logging ────────────────────────────────────────────────────────

  async function logActivity() {
    if (!actInput.trim()) return;
    setLoadingAct(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingAct(false); return; }

    const now = new Date().toISOString();
    const { data } = await supabase
      .from("contact_activities")
      .insert({ user_id: user.id, contact_id: contact.id, type: actType, content: actInput.trim(), occurred_at: now })
      .select("*")
      .single();

    if (data) {
      setActivities((prev) => [data as ContactActivity, ...prev]);
      await supabase.from("contacts").update({ last_contacted_at: now }).eq("id", contact.id);
      const updated = { ...contact, last_contacted_at: now };
      setContact(updated);
      onUpdated(updated);
    }
    setActInput("");
    setLoadingAct(false);
  }

  // ── Edit mode ───────────────────────────────────────────────────────────────

  function startEdit() {
    setEditFirst(contact.first_name);
    setEditLast(contact.last_name);
    setEditEmail(contact.email ?? "");
    setEditPhone(contact.phone ?? "");
    setEditCompany(contact.company?.name ?? "");
    setEditTitle(contact.title ?? "");
    setEditBio(contact.bio ?? "");
    setEditStatus(contact.status);
    setEditTags([...contact.tags]);
    setEditTagInput("");
    setEditWebsite(contact.website ?? "");
    setEditLocation(contact.location ?? "");
    setEditing(true);
  }

  function addEditTag(raw: string) {
    const tag = raw.trim();
    if (!tag || editTags.includes(tag)) { setEditTagInput(""); return; }
    setEditTags((prev) => [...prev, tag]);
    setEditTagInput("");
  }

  function onEditTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEditTag(editTagInput); }
    if (e.key === "Backspace" && editTagInput === "" && editTags.length > 0)
      setEditTags((prev) => prev.slice(0, -1));
  }

  async function saveEdits() {
    if (!editFirst.trim() || !editLast.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    let company_id = contact.company_id;

    if (editCompany.trim() !== (contact.company?.name ?? "")) {
      if (!editCompany.trim()) {
        company_id = null;
      } else {
        const { data: existing } = await supabase
          .from("companies").select("id").eq("user_id", user.id).ilike("name", editCompany.trim()).maybeSingle();
        if (existing) {
          company_id = existing.id;
        } else {
          const { data: created } = await supabase
            .from("companies").insert({ user_id: user.id, name: editCompany.trim() }).select("id").single();
          company_id = created?.id ?? null;
        }
      }
    }

    const { data } = await supabase
      .from("contacts")
      .update({
        first_name: editFirst.trim(),
        last_name:  editLast.trim(),
        email:      editEmail.trim()    || null,
        phone:      editPhone.trim()    || null,
        company_id,
        title:      editTitle.trim()    || null,
        bio:        editBio.trim()      || null,
        status:     editStatus,
        tags:       editTags,
        website:    editWebsite.trim()  || null,
        location:   editLocation.trim() || null,
      })
      .eq("id", contact.id)
      .select("*, company:companies(*)")
      .single();

    if (data) {
      const updated = data as Contact;
      setContact(updated);
      onUpdated(updated);
    }
    setSaving(false);
    setEditing(false);
  }

  // ── Project linking ─────────────────────────────────────────────────────────

  async function openProjectPicker() {
    const { data } = await supabase.from("projects").select("*").order("title");
    if (data) {
      const linkedIds = new Set(linkedProjects.map((p) => p.id));
      setAvailable((data as Project[]).filter((p) => !linkedIds.has(p.id)));
    }
    setProjectSearch("");
    setShowProjectPicker(true);
  }

  async function linkProject(project: Project) {
    setLinkingProject(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLinkingProject(false); return; }
    await supabase.from("project_contacts").insert({
      project_id: project.id, contact_id: contact.id, user_id: user.id,
    });
    setLinked((prev) => [...prev, project]);
    setAvailable((prev) => prev.filter((p) => p.id !== project.id));
    setShowProjectPicker(false);
    setLinkingProject(false);
  }

  async function unlinkProject(projectId: string) {
    await supabase.from("project_contacts")
      .delete().eq("project_id", projectId).eq("contact_id", contact.id);
    setLinked((prev) => prev.filter((p) => p.id !== projectId));
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm(`Delete ${contact.first_name} ${contact.last_name}? This cannot be undone.`)) return;
    await supabase.from("contacts").delete().eq("id", contact.id);
    onDeleted(contact.id);
    onClose();
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredActivities = activeTab === "notes"
    ? activities.filter((a) => a.type === "note")
    : activities;
  const grouped     = groupByDate(filteredActivities);
  const lastContact = lastContactedDisplay(contact.last_contacted_at);
  const status      = STATUS_CONFIG[contact.status];
  const pickerFiltered = availableProjects.filter((p) =>
    p.title.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-40 flex" style={{ left: "56px" }}>
      {/* Scrim */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(20,18,16,0.52)", backdropFilter: "blur(5px)" }}
        onClick={() => { if (!editing) onClose(); }}
      />

      {/* Floating panel */}
      <div
        className="absolute flex flex-col overflow-hidden"
        style={{
          top: "48px", bottom: "48px", left: "48px", right: "48px",
          background: "var(--color-off-white)",
          border: "0.5px solid rgba(31,33,26,0.15)",
          borderRadius: "12px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
          zIndex: 1,
        }}
      >
        {/* ── Panel header ── */}
        <div style={{ borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
          {/* Action row */}
          <div className="flex items-center justify-end gap-2 px-5 pt-3">
            {!editing ? (
              <>
                <button
                  onClick={() => { setActType("call"); setActiveTab("activity"); setTimeout(() => document.getElementById("act-input")?.focus(), 50); }}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-[5px] rounded-lg transition-colors"
                  style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2a1 1 0 0 0-1 1v2c0 .38.22.72.55.89.4.2.6.64.45 1.06A8 8 0 0 0 13.05 12c.42.15.86-.05 1.06-.45.17-.33.45-.55.45-.55h2a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2"/></svg>
                  Log call
                </button>
                <button
                  onClick={() => { setActType("note"); setActiveTab("activity"); setTimeout(() => document.getElementById("act-input")?.focus(), 50); }}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-[5px] rounded-lg transition-colors"
                  style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h12v9H2z"/><path d="M5 6h6M5 9h4"/></svg>
                  Add note
                </button>
                <div style={{ width: "0.5px", height: "16px", background: "var(--color-border)" }} />
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-[5px] rounded-lg transition-colors"
                  style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2l3 3-9 9H2v-3L11 2z"/></svg>
                  Edit
                </button>
                <div style={{ width: "0.5px", height: "16px", background: "var(--color-border)" }} />
                <button
                  onClick={handleDelete}
                  className="text-[11px] px-3 py-[5px] rounded-lg transition-colors"
                  style={{ color: "var(--color-red-orange)", border: "0.5px solid var(--color-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,62,13,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(false)} className="text-[11px] px-3 py-[5px] rounded-lg"
                  style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
                  Cancel
                </button>
                <button
                  onClick={saveEdits}
                  disabled={saving || !editFirst.trim() || !editLast.trim()}
                  className="text-[11px] px-3 py-[5px] rounded-lg font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--color-sage)" }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg ml-1 transition-colors"
              style={{ color: "var(--color-grey)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <X size={13} />
            </button>
          </div>

          {/* Identity row */}
          <div className="flex items-center gap-3.5 px-5 py-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-semibold shrink-0"
              style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "#6b6860" }}
            >
              {editing ? (editFirst[0] ?? "?") + (editLast[0] ?? "?") : initials(contact)}
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)}
                      placeholder="First name"
                      className="flex-1 text-[16px] font-semibold bg-transparent border-b outline-none pb-0.5"
                      style={{ color: "var(--color-charcoal)", borderColor: "var(--color-border)" }} />
                    <input value={editLast} onChange={(e) => setEditLast(e.target.value)}
                      placeholder="Last name"
                      className="flex-1 text-[16px] font-semibold bg-transparent border-b outline-none pb-0.5"
                      style={{ color: "var(--color-charcoal)", borderColor: "var(--color-border)" }} />
                  </div>
                  <div className="flex gap-2">
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title / Role"
                      className="flex-1 text-[12px] bg-transparent border-b outline-none pb-0.5"
                      style={{ color: "#6b6860", borderColor: "var(--color-border)" }} />
                    <input value={editCompany} onChange={(e) => setEditCompany(e.target.value)}
                      placeholder="Company"
                      className="flex-1 text-[12px] bg-transparent border-b outline-none pb-0.5"
                      style={{ color: "#6b6860", borderColor: "var(--color-border)" }} />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-[17px] font-semibold mb-1" style={{ color: "var(--color-charcoal)" }}>
                    {contact.first_name} {contact.last_name}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(contact.title || contact.company?.name) && (
                      <span className="text-[12px]" style={{ color: "#6b6860" }}>
                        {[contact.title, contact.company?.name].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {contact.tags.length > 0 && (
                      <>
                        <span style={{ color: "rgba(31,33,26,0.25)", fontSize: "10px" }}>·</span>
                        <div className="flex items-center gap-1">
                          {contact.tags.map((tag) => {
                            const s = tagStyle(tag);
                            return <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{tag}</span>;
                          })}
                        </div>
                      </>
                    )}
                    <span style={{ color: "rgba(31,33,26,0.25)", fontSize: "10px" }}>·</span>
                    <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: status.dot }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: status.dot }} />
                      {status.label}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick facts bar (hidden in edit mode — use fields below instead) */}
          {!editing && (
            <div className="flex items-center px-5 overflow-x-auto" style={{ borderTop: "0.5px solid var(--color-border)" }}>
              {[
                contact.email   && { icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l6 5 6-5"/><rect x="1" y="3" width="14" height="10" rx="2"/></svg>, text: contact.email,   link: `mailto:${contact.email}` },
                contact.phone   && { icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 2a1 1 0 0 0-1 1v2c0 .38.22.72.55.89.4.2.6.64.45 1.06A8 8 0 0 0 13.05 12c.42.15.86-.05 1.06-.45.17-.33.45-.55.45-.55h2a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-2"/></svg>, text: contact.phone, link: `tel:${contact.phone}` },
                contact.website && { icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2c-2 2-3 4-3 6s1 4 3 6"/><path d="M2 8h12"/></svg>, text: contact.website, link: `https://${contact.website.replace(/^https?:\/\//, "")}` },
                { icon: <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/></svg>, text: lastContact.label, color: lastContact.color },
              ].filter(Boolean).map((fact, i, arr) => fact && (
                <div key={i} className="flex items-center gap-1.5 py-2 mr-4 pr-4 shrink-0"
                  style={{ borderRight: i < arr.length - 1 ? "0.5px solid var(--color-border)" : "none" }}>
                  <span style={{ opacity: 0.4, color: "var(--color-charcoal)" }}>{fact.icon}</span>
                  {fact.link ? (
                    <a href={fact.link} className="text-[11px]" style={{ color: "#2563ab" }}
                      target={fact.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                      {fact.text}
                    </a>
                  ) : (
                    <span className="text-[11px]" style={{ color: fact.color ?? "#6b6860" }}>{fact.text}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Panel body ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left column */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "18px 18px 18px 20px" }}>

            {/* About card */}
            <div className="rounded-xl overflow-hidden mb-4" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
              <div className="flex items-center px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <span className="text-[12px] font-semibold" style={{ color: "#6b6860" }}>About</span>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {editing ? (
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Add a note about this contact — how you met, their interests, context…"
                    rows={3}
                    className="w-full text-[12px] leading-relaxed bg-transparent border rounded-lg px-3 py-2 outline-none resize-none"
                    style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)" }}
                  />
                ) : contact.bio ? (
                  <p className="text-[12px] leading-relaxed" style={{ color: "#6b6860" }}>{contact.bio}</p>
                ) : (
                  <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>
                    No description yet.{" "}
                    <button onClick={startEdit} className="underline" style={{ color: "#2563ab" }}>Add one</button>
                  </p>
                )}
                {!editing && (
                  <>
                    {contact.company?.name && <FieldRow label="Company" value={contact.company.name} />}
                    {contact.title         && <FieldRow label="Title"   value={contact.title}         />}
                    {contact.location      && <FieldRow label="Location" value={contact.location}     />}
                  </>
                )}
              </div>
            </div>

            {/* Activity card */}
            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
              <div className="flex gap-0.5 px-4 pt-2" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                {(["activity", "notes"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className="px-3 py-1.5 text-[11px] mb-[-0.5px]"
                    style={{
                      color: activeTab === tab ? "var(--color-charcoal)" : "var(--color-grey)",
                      fontWeight: activeTab === tab ? 600 : 400,
                      borderBottom: activeTab === tab ? "2px solid var(--color-sage)" : "2px solid transparent",
                    }}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35">
                  <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
                </svg>
                <input
                  id="act-input" type="text" value={actInput}
                  onChange={(e) => setActInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); logActivity(); } }}
                  placeholder={`Log a ${actType}…`}
                  className="flex-1 bg-transparent border-none outline-none text-[12px]"
                  style={{ color: "var(--color-charcoal)" }}
                />
                <div className="flex items-center gap-1">
                  {(["note", "call", "meeting"] as ContactActivityType[]).map((t) => (
                    <button key={t} onClick={() => setActType(t)}
                      className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                      style={{
                        background: actType === t ? "var(--color-sage)" : "var(--color-cream)",
                        color: actType === t ? "white" : "#6b6860",
                        border: "0.5px solid var(--color-border)",
                      }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                  <button onClick={logActivity} disabled={!actInput.trim() || loadingAct}
                    className="text-[10px] px-2 py-0.5 rounded-full transition-opacity disabled:opacity-40"
                    style={{ background: "var(--color-charcoal)", color: "white" }}>
                    Log
                  </button>
                </div>
              </div>

              <div className="px-4 py-3">
                {grouped.length === 0 ? (
                  <p className="text-[12px] py-4 text-center" style={{ color: "var(--color-grey)" }}>
                    No {activeTab === "notes" ? "notes" : "activity"} yet.
                  </p>
                ) : grouped.map(({ label, items }) => (
                  <div key={label}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider py-2" style={{ color: "var(--color-grey)" }}>{label}</div>
                    {items.map((act) => {
                      const cfg = ACTIVITY_CONFIG[act.type];
                      return (
                        <div key={act.id} className="flex gap-2.5 mb-3">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: cfg.bg, color: cfg.color, border: "0.5px solid var(--color-border)" }}>
                            {cfg.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-baseline gap-1.5 mb-0.5">
                              <span className="text-[11px] font-semibold" style={{ color: "#6b6860" }}>{cfg.label}</span>
                              <span className="text-[10px] ml-auto" style={{ color: "var(--color-grey)" }}>{fmtTime(act.occurred_at)}</span>
                            </div>
                            {act.content && <p className="text-[12px] leading-relaxed" style={{ color: "#6b6860" }}>{act.content}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3.5 overflow-y-auto shrink-0"
            style={{ width: "248px", borderLeft: "0.5px solid var(--color-border)", padding: "18px" }}>

            {/* Properties card */}
            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <span className="text-[12px] font-semibold flex-1" style={{ color: "#6b6860" }}>Properties</span>
                {!editing && (
                  <button onClick={startEdit} className="text-[11px]" style={{ color: "#2563ab" }}>Edit</button>
                )}
              </div>
              <div className="px-4 py-1">
                {/* Status */}
                <div className="flex items-center justify-between py-2" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>Status</span>
                  {editing ? (
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as ContactStatus)}
                      className="text-[12px] bg-transparent border-none outline-none text-right" style={{ color: "var(--color-charcoal)" }}>
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: STATUS_CONFIG[contact.status].dot }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_CONFIG[contact.status].dot }} />
                      {STATUS_CONFIG[contact.status].label}
                    </span>
                  )}
                </div>

                {/* Tags */}
                <div className="flex items-start justify-between gap-2 py-2" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[11px] shrink-0 mt-1" style={{ color: "var(--color-grey)" }}>Tags</span>
                  {editing ? (
                    <div className="flex flex-col items-end gap-1 flex-1">
                      <div className="flex flex-wrap justify-end gap-1">
                        {editTags.map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ background: "var(--color-cream)", color: "#6b6860" }}>
                            {tag}
                            <button type="button" onClick={() => setEditTags((p) => p.filter((t) => t !== tag))}><X size={8} /></button>
                          </span>
                        ))}
                      </div>
                      <input ref={tagInputRef} type="text" value={editTagInput}
                        onChange={(e) => setEditTagInput(e.target.value)}
                        onKeyDown={onEditTagKeyDown}
                        onBlur={() => { if (editTagInput.trim()) addEditTag(editTagInput); }}
                        placeholder="Add tag…"
                        className="text-[11px] bg-transparent border-none outline-none text-right w-full"
                        style={{ color: "var(--color-charcoal)" }} />
                      {editTagInput === "" && (
                        <div className="flex flex-wrap justify-end gap-1 mt-0.5">
                          {PRESET_TAGS.filter((t) => !editTags.includes(t)).slice(0, 4).map((t) => (
                            <button key={t} type="button" onClick={() => addEditTag(t)}
                              className="text-[9px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--color-cream)", color: "#9a9690", border: "0.5px solid var(--color-border)" }}>
                              + {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1">
                      {contact.tags.length > 0 ? contact.tags.map((tag) => {
                        const s = tagStyle(tag);
                        return <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{tag}</span>;
                      }) : <span className="text-[12px]" style={{ color: "var(--color-grey)" }}>—</span>}
                    </div>
                  )}
                </div>

                {/* Email */}
                <InlinePropRow label="Email" value={contact.email} editValue={editEmail} onEdit={setEditEmail} editing={editing} link="mailto" />
                {/* Phone */}
                <InlinePropRow label="Phone" value={contact.phone} editValue={editPhone} onEdit={setEditPhone} editing={editing} />
                {/* Website */}
                <InlinePropRow label="Website" value={contact.website} editValue={editWebsite} onEdit={setEditWebsite} editing={editing} link="url" />
                {/* Location */}
                <InlinePropRow label="Location" value={contact.location} editValue={editLocation} onEdit={setEditLocation} editing={editing} />
                {/* Added */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>Added</span>
                  <span className="text-[12px]" style={{ color: "#6b6860" }}>
                    {new Date(contact.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </div>
              </div>
            </div>

            {/* Linked projects */}
            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <span className="text-[12px] font-semibold flex-1" style={{ color: "#6b6860" }}>Linked projects</span>
                {linkedProjects.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--color-cream)", color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>
                    {linkedProjects.length}
                  </span>
                )}
                <div className="relative" ref={pickerRef}>
                  <button onClick={openProjectPicker} className="text-[11px]" style={{ color: "#2563ab" }}>
                    + Link
                  </button>
                  {showProjectPicker && (
                    <div className="absolute right-0 mt-1 rounded-xl overflow-hidden z-20"
                      style={{
                        width: "220px", top: "100%",
                        background: "var(--color-off-white)",
                        border: "0.5px solid var(--color-border)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                      }}>
                      <div className="px-3 py-2" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                        <input
                          type="text" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
                          placeholder="Search projects…" autoFocus
                          className="w-full text-[12px] bg-transparent border-none outline-none"
                          style={{ color: "var(--color-charcoal)" }}
                        />
                      </div>
                      <div className="max-h-[200px] overflow-y-auto">
                        {pickerFiltered.length === 0 ? (
                          <p className="text-[12px] text-center py-4" style={{ color: "var(--color-grey)" }}>
                            {availableProjects.length === 0 ? "All projects linked." : "No matches."}
                          </p>
                        ) : pickerFiltered.map((p) => (
                          <button key={p.id} onClick={() => linkProject(p)} disabled={linkingProject}
                            className="w-full text-left px-4 py-2.5 text-[12px] transition-colors"
                            style={{ color: "var(--color-charcoal)", borderBottom: "0.5px solid var(--color-border)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <div className="font-medium">{p.title}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: "var(--color-grey)" }}>
                              {p.status?.replace("_", " ")}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-4 py-1">
                {linkedProjects.length === 0 ? (
                  <p className="text-[11px] py-3 text-center" style={{ color: "var(--color-grey)" }}>No projects linked yet.</p>
                ) : linkedProjects.map((p, i) => (
                  <div key={p.id} className="group flex items-start gap-2 py-2.5"
                    style={{ borderBottom: i < linkedProjects.length - 1 ? "0.5px solid var(--color-border)" : "none" }}>
                    <button
                      onClick={() => router.push("/projects")}
                      className="flex-1 text-left"
                      title="Opens Projects page — cross-module navigation coming soon"
                    >
                      <div className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{p.title}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--color-grey)" }}>{p.status?.replace("_", " ")}</div>
                    </button>
                    <button onClick={() => unlinkProject(p.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                      style={{ color: "var(--color-grey)" }} title="Unlink">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick notes */}
            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <span className="text-[12px] font-semibold flex-1" style={{ color: "#6b6860" }}>Notes</span>
                <button onClick={() => { setActType("note"); setActiveTab("notes"); setTimeout(() => document.getElementById("act-input")?.focus(), 50); }}
                  className="text-[11px]" style={{ color: "#2563ab" }}>+ Add</button>
              </div>
              <div className="px-4 py-1">
                {activities.filter((a) => a.type === "note").length === 0 ? (
                  <p className="text-[11px] py-3 text-center" style={{ color: "var(--color-grey)" }}>No notes yet.</p>
                ) : activities.filter((a) => a.type === "note").slice(0, 3).map((note, i, arr) => (
                  <div key={note.id} className="py-2.5"
                    style={{ borderBottom: i < arr.length - 1 ? "0.5px solid var(--color-border)" : "none" }}>
                    <p className="text-[12px] leading-relaxed mb-0.5" style={{ color: "#6b6860" }}>{note.content}</p>
                    <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                      {new Date(note.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-2.5">
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--color-grey)" }}>{label}</div>
        <div className="text-[12px]" style={{ color: "#6b6860" }}>{value}</div>
      </div>
    </div>
  );
}

function InlinePropRow({
  label, value, editValue, onEdit, editing, link,
}: {
  label: string;
  value: string | null;
  editValue: string;
  onEdit: (v: string) => void;
  editing: boolean;
  link?: "mailto" | "url";
}) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
      <span className="text-[11px] shrink-0" style={{ color: "var(--color-grey)" }}>{label}</span>
      {editing ? (
        <input type="text" value={editValue} onChange={(e) => onEdit(e.target.value)}
          className="text-[12px] bg-transparent border-none outline-none text-right max-w-[140px] ml-2"
          style={{ color: "var(--color-charcoal)" }} />
      ) : value ? (
        link ? (
          <a href={link === "mailto" ? `mailto:${value}` : `https://${value.replace(/^https?:\/\//, "")}`}
            target={link === "url" ? "_blank" : undefined} rel="noreferrer"
            className="text-[12px] ml-2 truncate max-w-[140px]" style={{ color: "#2563ab" }}>
            {value}
          </a>
        ) : (
          <span className="text-[12px] ml-2 truncate max-w-[140px]" style={{ color: "#6b6860" }}>{value}</span>
        )
      ) : (
        <span className="text-[12px]" style={{ color: "var(--color-grey)" }}>—</span>
      )}
    </div>
  );
}
