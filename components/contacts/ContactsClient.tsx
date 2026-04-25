"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactStatus } from "@/types/database";
import ContactDetailPanel from "./ContactDetailPanel";
import NewContactModal from "./NewContactModal";

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

function initials(c: Contact) {
  return (c.first_name[0] + c.last_name[0]).toUpperCase();
}

function lastContactedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today",         color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`,  color: "var(--color-sage)" };
  if (days < 14) return { label: `${Math.floor(days / 7)}w ago`, color: "var(--color-charcoal)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: "#b8860b" };
  const months = Math.floor(days / 30);
  return { label: `${months}mo ago`, color: "var(--color-red-orange)" };
}

const GRID = "32px 2.6fr 1.6fr 1.2fr 0.9fr 1.1fr 0.8fr";

interface Props {
  initialContacts: Contact[];
}

export default function ContactsClient({ initialContacts }: Props) {
  const [contacts, setContacts]         = useState<Contact[]>(initialContacts);
  const [search, setSearch]             = useState("");
  const [tagFilter, setTagFilter]       = useState<string | null>(null);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [openContact, setOpenContact]   = useState<Contact | null>(null);
  const [showModal, setShowModal]       = useState(false);

  // Derive all unique tags across all contacts
  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered contacts
  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return contacts.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (!q) return true;
      const full = `${c.first_name} ${c.last_name}`.toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      const co = (c.company?.name ?? "").toLowerCase();
      return full.includes(q) || email.includes(q) || co.includes(q);
    });
  }, [contacts, search, tagFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((c) => c.id)));
    }
  }

  function handleCreated(contact: Contact) {
    setContacts((prev) => [contact, ...prev]);
  }

  function handleUpdated(contact: Contact) {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
    if (openContact?.id === contact.id) setOpenContact(contact);
  }

  function handleDeleted(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} contact${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    const supabase = createClient();
    await supabase.from("contacts").delete().in("id", Array.from(selected));
    setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
    setSelected(new Set());
  }

  const allChecked = visible.length > 0 && selected.size === visible.length;

  return (
    <div className="flex flex-col overflow-hidden" style={{ flex: 1 }}>
      {/* ── Action bar ── */}
      <div
        className="flex items-center gap-2 px-6 py-3 shrink-0"
        style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}
      >
        <span className="text-[12px]" style={{ color: "var(--color-grey)" }}>
          {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 rounded-lg"
          style={{
            background: "var(--color-cream)",
            border: "0.5px solid var(--color-border)",
            height: "30px", width: "200px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
          </svg>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent border-none outline-none text-[12px]"
            style={{ color: "var(--color-charcoal)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--color-grey)" }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l10 10M13 3L3 13"/>
              </svg>
            </button>
          )}
        </div>
        {/* New contact */}
        <button
          onClick={() => setShowModal(true)}
          className="px-3.5 py-1.5 text-[12px] font-medium rounded-lg text-white shrink-0 transition-opacity hover:opacity-90"
          style={{ background: "var(--color-sage)", height: "30px" }}
        >
          + New contact
        </button>
      </div>

      {/* ── Tag filter strip ── */}
      <div
        className="flex items-center gap-1.5 px-6 py-2 shrink-0 overflow-x-auto"
        style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}
      >
        <button
          onClick={() => setTagFilter(null)}
          className="px-3 py-1 rounded-full text-[11px] font-medium shrink-0 transition-colors"
          style={{
            background: tagFilter === null ? "var(--color-charcoal)" : "transparent",
            color: tagFilter === null ? "var(--color-off-white)" : "#6b6860",
            border: "0.5px solid var(--color-border)",
          }}
        >
          All
        </button>
        {allTags.map((tag) => {
          const s = tagStyle(tag);
          const active = tagFilter === tag;
          return (
            <button
              key={tag}
              onClick={() => setTagFilter(active ? null : tag)}
              className="px-3 py-1 rounded-full text-[11px] font-medium shrink-0 transition-colors"
              style={{
                background: active ? s.color : "transparent",
                color: active ? "white" : s.color,
                border: `0.5px solid ${active ? s.color : s.color + "55"}`,
              }}
            >
              {tag}
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-[11px] shrink-0" style={{ color: "var(--color-grey)" }}>
          {visible.length} shown
        </span>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-warm-white)" }}>
        {/* Table header */}
        <div
          className="grid items-center px-6 py-2 sticky top-0 z-10 shrink-0"
          style={{
            gridTemplateColumns: GRID,
            background: "var(--color-cream)",
            borderBottom: "0.5px solid var(--color-border)",
          }}
        >
          {/* Checkbox */}
          <div className="flex items-center">
            <Checkbox checked={allChecked} onChange={toggleSelectAll} />
          </div>
          {["Name", "Company", "Tags", "Status", "Last contact", "Location"].map((h) => (
            <div key={h} className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-grey)" }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              {search || tagFilter ? "No contacts match" : "No contacts yet"}
            </p>
            <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>
              {search || tagFilter ? "Try adjusting your search or filters." : "Create your first contact to get started."}
            </p>
            {!search && !tagFilter && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 px-4 py-1.5 text-[12px] font-medium rounded-lg text-white"
                style={{ background: "var(--color-sage)" }}
              >
                + New contact
              </button>
            )}
          </div>
        ) : visible.map((c) => {
          const isSelected = selected.has(c.id);
          const status = STATUS_CONFIG[c.status];
          const lc = lastContactedDisplay(c.last_contacted_at);

          return (
            <div
              key={c.id}
              className="group grid items-center px-6 cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: GRID,
                borderBottom: "0.5px solid var(--color-border)",
                background: isSelected ? "rgba(61,107,79,0.06)" : "var(--color-off-white)",
                minHeight: "48px",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--color-warm-white)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--color-off-white)"; }}
              onClick={(e) => {
                // Don't open panel if clicking checkbox area
                const target = e.target as HTMLElement;
                if (target.closest("[data-checkbox]")) return;
                setOpenContact(c);
              }}
            >
              {/* Checkbox */}
              <div data-checkbox className="flex items-center" onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}>
                <Checkbox checked={isSelected} onChange={() => toggleSelect(c.id)} />
              </div>

              {/* Name */}
              <div className="flex items-center gap-2.5 py-2.5 pr-4">
                <div
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                  style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "#6b6860" }}
                >
                  {initials(c)}
                </div>
                <div>
                  <div className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>
                    {c.first_name} {c.last_name}
                  </div>
                  {c.email && (
                    <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>{c.email}</div>
                  )}
                </div>
              </div>

              {/* Company */}
              <div className="pr-4">
                {c.company?.name ? (
                  <>
                    <div className="text-[12px]" style={{ color: "#6b6860" }}>{c.company.name}</div>
                    {c.title && <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>{c.title}</div>}
                  </>
                ) : c.title ? (
                  <div className="text-[12px]" style={{ color: "#6b6860" }}>{c.title}</div>
                ) : (
                  <span className="text-[12px]" style={{ color: "var(--color-grey)" }}>—</span>
                )}
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1 flex-wrap pr-4">
                {c.tags.length > 0 ? c.tags.slice(0, 2).map((tag) => {
                  const s = tagStyle(tag);
                  return (
                    <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: s.bg, color: s.color }}>
                      {tag}
                    </span>
                  );
                }) : <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>—</span>}
                {c.tags.length > 2 && (
                  <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>+{c.tags.length - 2}</span>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-1.5 pr-4">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                <span className="text-[11px]" style={{ color: "#6b6860" }}>{status.label}</span>
              </div>

              {/* Last contact */}
              <div className="text-[11px] pr-4" style={{ color: lc.color }}>{lc.label}</div>

              {/* Location */}
              <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                {c.location ?? "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-xl px-4 py-2.5 z-50"
          style={{ background: "var(--color-charcoal)", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
        >
          <span className="text-[12px] font-semibold mr-3 pr-3 text-white" style={{ borderRight: "0.5px solid rgba(255,255,255,0.2)" }}>
            {selected.size} selected
          </span>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => {}} title="Tag — coming soon">
            Tag
          </button>
          <div style={{ width: "0.5px", height: "16px", background: "rgba(255,255,255,0.15)", margin: "0 2px" }} />
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,62,13,0.3)", e.currentTarget.style.color = "#ff9b8c")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent", e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onClick={bulkDelete}
          >
            Delete
          </button>
          <button
            className="px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ml-1"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {showModal && (
        <NewContactModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}

      {openContact && (
        <ContactDetailPanel
          contact={openContact}
          onClose={() => setOpenContact(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="w-[15px] h-[15px] rounded flex items-center justify-center cursor-pointer shrink-0 transition-colors"
      style={{
        background: checked ? "var(--color-sage)" : "transparent",
        border: checked ? "1.5px solid var(--color-sage)" : "1.5px solid rgba(31,33,26,0.2)",
      }}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}
