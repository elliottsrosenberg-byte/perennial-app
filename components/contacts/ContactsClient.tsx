"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactStatus } from "@/types/database";
import ContactDetailPanel from "./ContactDetailPanel";
import NewContactModal from "./NewContactModal";
import Button from "@/components/ui/Button";
import Topbar from "@/components/layout/Topbar";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ImportContactsModal from "./ImportContactsModal";
import ContactsIntroModal from "@/components/tour/contacts/ContactsIntroModal";
import ContactsTooltipTour from "@/components/tour/contacts/ContactsTooltipTour";
import ContactsOptionsMenu from "./ContactsOptionsMenu";
import FilterTabs from "@/components/ui/FilterTabs";
import { Users, Upload, MoreHorizontal, ArrowUpDown } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  gallery:  { bg: "rgba(37,99,171,0.10)",   color: "#2563ab" },
  client:   { bg: "rgba(61,107,79,0.10)",   color: "#3d6b4f" },
  supplier: { bg: "rgba(184,134,11,0.10)",  color: "#b8860b" },
  press:    { bg: "rgba(109,79,163,0.10)",  color: "#6d4fa3" },
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
  active:        { dot: "var(--color-sage)", label: "Active"        },
  inactive:      { dot: "var(--color-grey)", label: "Inactive"      },
  former_client: { dot: "#6d4fa3",          label: "Former client" },
};

function initials(c: Contact) {
  return (c.first_name[0] + (c.last_name[0] ?? "")).toUpperCase();
}

function lastContactedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today",        color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`,  color: "var(--color-sage)" };
  if (days < 14) return { label: `${Math.floor(days / 7)}w ago`, color: "var(--color-charcoal)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: "#b8860b" };
  return { label: `${Math.floor(days / 30)}mo ago`, color: "var(--color-red-orange)" };
}

type SortKey = "name" | "last_contact" | "status" | "added";

const GRID = "32px 2.6fr 1.6fr 1.2fr 0.9fr 1.1fr 0.8fr";

interface Props { initialContacts: Contact[] }

export default function ContactsClient({ initialContacts }: Props) {
  const [contacts, setContacts]       = useState<Contact[]>(initialContacts);
  const [search,   setSearch]         = useState("");
  const [tagFilter, setTagFilter]     = useState<string | null>(null);
  const [showLeads, setShowLeads]     = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sortKey,  setSortKey]        = useState<SortKey>("name");
  const [sortAsc,  setSortAsc]        = useState(true);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [openContact, setOpenContact] = useState<Contact | null>(null);
  const [showModal, setShowModal]     = useState(false);
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Deep links — all stripped from the URL after consume:
  //   ?new=1                                       → open the new-contact modal
  //   ?import=1                                    → open the CSV importer
  //   ?contactId=X[&tab=tasks|notes|activity|…]    → open panel, set tab
  //   ?contactId=X&tab=tasks&taskId=Y              → also highlight that task
  //   ?contactId=X&tab=notes&noteId=Y              → also highlight that note
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [openTab,         setOpenTab]         = useState<string | null>(null);
  const [openTaskId,      setOpenTaskId]      = useState<string | null>(null);
  const [openNoteId,      setOpenNoteId]      = useState<string | null>(null);

  useEffect(() => {
    const newFlag    = searchParams.get("new");
    const importFlag = searchParams.get("import");
    const contactId  = searchParams.get("contactId");
    if (newFlag === "1") {
      setShowModal(true);
      window.dispatchEvent(new Event("contacts:modal-opened"));
      router.replace("/contacts");
    } else if (importFlag === "1") {
      setShowImport(true);
      router.replace("/contacts");
    } else if (contactId) {
      const found = contacts.find((c) => c.id === contactId);
      if (found) setOpenContact(found);
      setOpenTab(searchParams.get("tab"));
      setOpenTaskId(searchParams.get("taskId"));
      setOpenNoteId(searchParams.get("noteId"));
      router.replace("/contacts");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.filter(c => !c.is_lead && !c.archived).forEach(c => c.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = contacts.filter(c => {
      if (!showArchived && c.archived) return false;
      if (!showLeads && c.is_lead) return false;
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (q) {
        const full  = `${c.first_name} ${c.last_name}`.toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        const co    = (c.company?.name ?? "").toLowerCase();
        if (!full.includes(q) && !email.includes(q) && !co.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      } else if (sortKey === "last_contact") {
        const ta = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
        const tb = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
        cmp = tb - ta;
      } else if (sortKey === "status") {
        const order: Record<string, number> = { active: 0, inactive: 1 };
        cmp = (order[a.status] ?? 2) - (order[b.status] ?? 2);
      } else {
        cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [contacts, search, tagFilter, showLeads, sortKey, sortAsc]);

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelected(selected.size === visible.length ? new Set() : new Set(visible.map(c => c.id)));
  }

  function handleCreated(contact: Contact) {
    setContacts(prev => [contact, ...prev]);
    // Notify the contacts tooltip tour so the "in modal" step advances.
    window.dispatchEvent(new CustomEvent("contacts:created", {
      detail: { id: contact.id, first_name: contact.first_name, last_name: contact.last_name },
    }));
  }
  function handleUpdated(contact: Contact) {
    setContacts(prev => prev.map(c => c.id === contact.id ? contact : c));
    if (openContact?.id === contact.id) setOpenContact(contact);
  }

  function openNewContactModal() {
    setShowModal(true);
    window.dispatchEvent(new Event("contacts:modal-opened"));
  }
  function openDetail(contact: Contact) {
    setOpenContact(contact);
    window.dispatchEvent(new Event("contacts:detail-opened"));
  }
  function handleArchived(id: string) {
    // We keep archived contacts in state (the options menu can toggle them
    // back on); just flip the flag instead of dropping the row.
    setContacts(prev => prev.map(c => c.id === id ? { ...c, archived: true } : c));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (openContact?.id === id) setOpenContact(null);
  }

  async function performBulkArchive() {
    const ids = Array.from(selected);
    await createClient().from("contacts").update({ archived: true }).in("id", ids);
    setContacts(prev => prev.map(c => selected.has(c.id) ? { ...c, archived: true } : c));
    setSelected(new Set());
    setConfirmBulkArchive(false);
  }

  async function handleRestore(id: string) {
    await createClient().from("contacts").update({ archived: false }).eq("id", id);
    setContacts(prev => prev.map(c => c.id === id ? { ...c, archived: false } : c));
  }

  const allChecked = visible.length > 0 && selected.size === visible.length;
  const leadCount     = contacts.filter(c => c.is_lead).length;
  const archivedCount = contacts.filter(c => c.archived).length;

  function exportCSV() {
    const rows = visible.map(c => [
      c.first_name, c.last_name, c.email ?? "", c.phone ?? "",
      c.company?.name ?? "", c.title ?? "", c.location ?? "",
      c.website ?? "", c.tags.join("; "), c.status,
      c.is_lead ? "lead" : "contact", c.last_contacted_at ?? "",
    ]);
    const header = ["First Name","Last Name","Email","Phone","Company","Title","Location","Website","Tags","Status","Type","Last Contacted"];
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "contacts.csv"; a.click();
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "name",         label: "Name"         },
    { key: "last_contact", label: "Last contact" },
    { key: "status",       label: "Status"       },
    { key: "added",        label: "Added"        },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Contacts"
        actions={
          <>
            {/* 3-dot options menu — list-wide preferences + bulk actions. */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setOptionsOpen(v => !v)}
                aria-label="Contact options"
                title="Contact options"
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
                <ContactsOptionsMenu
                  showArchived={showArchived}
                  onToggleShowArchived={() => setShowArchived(v => !v)}
                  archivedCount={archivedCount}
                  onClose={() => setOptionsOpen(false)}
                />
              )}
            </div>
            <span data-tour-target="contacts.new-button">
              <Button onClick={openNewContactModal}>+ New contact</Button>
            </span>
          </>
        }
      />

      {/* ── Sort + filter bar (matches the Projects topbar visual language) ── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 24px", borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-surface-raised)", flexShrink: 0,
        }}
      >
        <FilterTabs
          tabs={SORT_OPTIONS.map(s => ({ key: s.key, label: s.label }))}
          active={sortKey}
          onSelect={(k) => setSortKey(k as SortKey)}
        />

        {/* Asc / desc */}
        <button
          onClick={() => setSortAsc(v => !v)}
          title={`Sort ${sortAsc ? "descending" : "ascending"}`}
          style={{
            width: 28, height: 28, borderRadius: 7,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--color-text-tertiary)",
            transition: "background 0.12s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowUpDown size={13} strokeWidth={1.75} style={{ transform: sortAsc ? "none" : "scaleY(-1)" }} />
        </button>

        <div style={{ flex: 1 }} />

        {/* Leads toggle */}
        {leadCount > 0 && (
          <button
            onClick={() => { setShowLeads(v => !v); if (showLeads) setTagFilter(null); }}
            title="Leads are people you're pursuing (lives in Outreach). Convert to a contact once the relationship starts."
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 500,
              background: showLeads ? "rgba(184,134,11,0.10)" : "transparent",
              color: showLeads ? "#b8860b" : "var(--color-text-tertiary)",
              border: `0.5px solid ${showLeads ? "#b8860b55" : "var(--color-border)"}`,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: showLeads ? "#b8860b" : "var(--color-grey)", display: "inline-block", flexShrink: 0 }} />
            Leads
          </button>
        )}

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", borderRadius: 7, height: 28, width: 200,
          background: "var(--color-surface-sunken)",
          border: "0.5px solid var(--color-border)",
        }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 11, color: "var(--color-text-primary)", fontFamily: "inherit" }} />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--color-grey)", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l10 10M13 3L3 13"/></svg>
            </button>
          )}
        </div>

        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {visible.length} contact{visible.length !== 1 ? "s" : ""}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 4, borderLeft: "0.5px solid var(--color-border)", paddingLeft: 8, marginLeft: 4 }}>
          <button onClick={exportCSV} title="Export visible contacts as CSV"
            style={{
              padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 7,
              color: "var(--color-text-tertiary)", border: "0.5px solid var(--color-border)",
              background: "transparent", cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-sunken)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}>
            Export
          </button>
          <button
            onClick={() => setShowImport(true)}
            title="Import contacts from CSV"
            style={{
              padding: "5px 10px", fontSize: 11, fontWeight: 500, borderRadius: 7,
              color: "var(--color-text-tertiary)", border: "0.5px solid var(--color-border)",
              background: "transparent", cursor: "pointer", fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-surface-sunken)"; e.currentTarget.style.color = "var(--color-text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-text-tertiary)"; }}>
            Import
          </button>
        </div>
      </div>

      {/* ── Tag filter ── */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 px-6 py-1.5 shrink-0 overflow-x-auto"
          style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
          <button onClick={() => setTagFilter(null)}
            className="px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
            style={{ background: tagFilter === null ? "var(--color-charcoal)" : "transparent", color: tagFilter === null ? "white" : "#6b6860", border: "0.5px solid var(--color-border)" }}>
            All
          </button>
          {allTags.map(tag => {
            const s = tagStyle(tag);
            const active = tagFilter === tag;
            return (
              <button key={tag} onClick={() => setTagFilter(active ? null : tag)}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                style={{ background: active ? s.color : "transparent", color: active ? "white" : s.color, border: `0.5px solid ${active ? s.color : s.color + "55"}` }}>
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-warm-white)" }}>
        {/* Header */}
        <div className="grid items-center px-6 py-2 sticky top-0 z-10"
          style={{ gridTemplateColumns: GRID, background: "var(--color-cream)", borderBottom: "0.5px solid var(--color-border)" }}>
          <div><Checkbox checked={allChecked} onChange={toggleSelectAll} /></div>
          {["Name", "Company", "Tags", "Status", "Last contact", "Location"].map(h => (
            <div key={h} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>{h}</div>
          ))}
        </div>

        {/* Empty state */}
        {visible.length === 0 ? (
          search || tagFilter ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No matches</p>
              <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>Try adjusting your search or filters.</p>
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={<Users size={24} strokeWidth={1.5} color="var(--color-sage)" />}
              heading="Build your network"
              body="Contacts holds your full relationship graph — galleries, collectors, press, clients, fabricators, and collaborators. Knowing who you know and how recently you've connected is one of the most undertracked assets in a creative practice."
              action={{ label: "+ Add contact", onClick: openNewContactModal }}
              secondaryAction={{
                label:   "Import contacts",
                onClick: () => setShowImport(true),
                icon:    <Upload size={11} strokeWidth={2} />,
              }}
              tips={[
                "Add galleries, collectors, press contacts, clients, and suppliers — anyone relevant to your practice.",
                "Tag contacts (e.g. 'gallery', 'press', 'client') to filter and segment your network quickly.",
                "Perennial tracks when you last connected with each person and surfaces who needs a follow-up.",
              ]}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>No contacts match this filter</p>
            </div>
          )
        ) : visible.map((c, idx) => {
          const isSelected = selected.has(c.id);
          const status = STATUS_CONFIG[c.status];
          const lc = lastContactedDisplay(c.last_contacted_at);
          return (
            <div key={c.id} className="group grid items-center px-6 cursor-pointer transition-colors"
              data-tour-target={idx === 0 ? "contacts.first-row" : undefined}
              style={{
                gridTemplateColumns: GRID, borderBottom: "0.5px solid var(--color-border)",
                background: isSelected ? "rgba(61,107,79,0.06)" : "var(--color-off-white)", minHeight: "48px",
                opacity: c.archived ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--color-warm-white)"; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "var(--color-off-white)"; }}
              onClick={e => { if ((e.target as HTMLElement).closest("[data-checkbox]")) return; openDetail(c); }}
            >
              <div data-checkbox onClick={e => { e.stopPropagation(); toggleSelect(c.id); }}>
                <Checkbox checked={isSelected} onChange={() => toggleSelect(c.id)} />
              </div>

              <div className="flex items-center gap-2.5 py-2.5 pr-4">
                <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                  style={{ background: c.is_lead ? "rgba(184,134,11,0.10)" : "var(--color-cream)", border: "0.5px solid var(--color-border)", color: c.is_lead ? "#b8860b" : "#6b6860", overflow: "hidden" }}>
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initials(c)}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>
                      {c.first_name} {c.last_name}
                    </div>
                    {c.is_lead && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: "rgba(184,134,11,0.10)", color: "#b8860b" }}>
                        Lead
                      </span>
                    )}
                  </div>
                  {c.email && <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>{c.email}</div>}
                </div>
              </div>

              <div className="pr-4">
                {c.company?.name
                  ? <><div className="text-[12px]" style={{ color: "#6b6860" }}>{c.company.name}</div>
                      {c.title && <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>{c.title}</div>}</>
                  : c.title
                    ? <div className="text-[12px]" style={{ color: "#6b6860" }}>{c.title}</div>
                    : <span className="text-[12px]" style={{ color: "var(--color-grey)" }}>—</span>
                }
              </div>

              <div className="flex items-center gap-1 flex-wrap pr-4">
                {c.tags.length > 0
                  ? c.tags.slice(0, 2).map(tag => { const s = tagStyle(tag); return <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{tag}</span>; })
                  : <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>—</span>}
                {c.tags.length > 2 && <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>+{c.tags.length - 2}</span>}
              </div>

              <div className="flex items-center gap-1.5 pr-4">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.archived ? "var(--color-grey)" : status.dot }} />
                <span className="text-[11px]" style={{ color: "#6b6860" }}>{c.archived ? "Archived" : status.label}</span>
              </div>

              <div className="text-[11px] pr-4" style={{ color: lc.color }}>{lc.label}</div>
              <div className="text-[11px] flex items-center gap-2" style={{ color: "var(--color-grey)" }}>
                {c.archived ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRestore(c.id); }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(155,163,122,0.16)",
                      color: "#4a5630",
                      border: "0.5px solid rgba(155,163,122,0.36)",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Restore
                  </button>
                ) : (
                  <span>{c.location ?? "—"}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bulk bar ── */}
      {selected.size > 0 && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-xl px-4 py-2.5 z-50"
          style={{ background: "var(--color-charcoal)", boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>
          <span className="text-[12px] font-semibold mr-3 pr-3 text-white" style={{ borderRight: "0.5px solid rgba(255,255,255,0.2)" }}>
            {selected.size} selected
          </span>
          <button className="px-2.5 py-1.5 rounded-lg text-[12px]"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(184,134,11,0.25)"; e.currentTarget.style.color = "#f5d478"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
            onClick={() => setConfirmBulkArchive(true)}>Archive</button>
          <button className="px-2.5 py-1.5 rounded-lg text-[12px] ml-1" style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {showModal && (
        <div data-tour-target="contacts.new-modal">
          <NewContactModal isLead={false} onClose={() => setShowModal(false)} onCreated={handleCreated} />
        </div>
      )}
      {openContact && (
        <ContactDetailPanel
          contact={openContact}
          onClose={() => { setOpenContact(null); setOpenTab(null); setOpenTaskId(null); setOpenNoteId(null); }}
          onUpdated={handleUpdated}
          onArchived={handleArchived}
          initialTab={openTab}
          initialHighlightTaskId={openTaskId}
          initialHighlightNoteId={openNoteId}
        />
      )}

      {showImport && (
        <ImportContactsModal
          onClose={() => setShowImport(false)}
          onImported={(imported) => setContacts(prev => [...imported, ...prev])}
        />
      )}

      <ConfirmDialog
        open={confirmBulkArchive}
        title={`Archive ${selected.size} contact${selected.size > 1 ? "s" : ""}?`}
        body="Archived contacts are removed from your active list. Their activity, notes, and linked projects stay — you can restore them later from settings if needed."
        confirmLabel={`Archive ${selected.size > 1 ? `${selected.size} contacts` : "contact"}`}
        cancelLabel="Keep"
        tone="danger"
        onConfirm={performBulkArchive}
        onCancel={() => setConfirmBulkArchive(false)}
      />

      <ContactsIntroModal />
      <ContactsTooltipTour />
    </div>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div onClick={e => { e.stopPropagation(); onChange(); }}
      className="w-[15px] h-[15px] rounded flex items-center justify-center cursor-pointer shrink-0"
      style={{ background: checked ? "var(--color-sage)" : "transparent", border: checked ? "1.5px solid var(--color-sage)" : "1.5px solid rgba(31,33,26,0.2)" }}>
      {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );
}
