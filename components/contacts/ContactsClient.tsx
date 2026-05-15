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
import { Users, Upload } from "lucide-react";

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
  const [sortKey,  setSortKey]        = useState<SortKey>("name");
  const [sortAsc,  setSortAsc]        = useState(true);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [openContact, setOpenContact] = useState<Contact | null>(null);
  const [showModal, setShowModal]     = useState(false);
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Deep links from the home dashboard: /contacts?new=1 opens the new-contact
  // modal, /contacts?import=1 opens the CSV importer. We clean the URL after
  // so a refresh doesn't re-trigger.
  const searchParams = useSearchParams();
  const router       = useRouter();
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setShowModal(true);
      window.dispatchEvent(new Event("contacts:modal-opened"));
      router.replace("/contacts");
    } else if (searchParams.get("import") === "1") {
      setShowImport(true);
      router.replace("/contacts");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.filter(c => !c.is_lead).forEach(c => c.tags.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = contacts.filter(c => {
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
    setContacts(prev => prev.filter(c => c.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (openContact?.id === id) setOpenContact(null);
  }

  async function performBulkArchive() {
    const ids = Array.from(selected);
    await createClient().from("contacts").update({ archived: true }).in("id", ids);
    setContacts(prev => prev.filter(c => !selected.has(c.id)));
    setSelected(new Set());
    setConfirmBulkArchive(false);
  }

  const allChecked = visible.length > 0 && selected.size === visible.length;
  const leadCount  = contacts.filter(c => c.is_lead).length;

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
          <span data-tour-target="contacts.new-button">
            <Button onClick={openNewContactModal}>+ New contact</Button>
          </span>
        }
      />

      {/* ── Action bar ── */}
      <div className="flex items-center gap-2 px-6 py-2 shrink-0"
        style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>

        <button onClick={() => setSortAsc(v => !v)}
          className="w-6 h-6 flex items-center justify-center rounded"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {sortAsc
              ? <><path d="M4 12V4M4 4L2 6M4 4l2 2"/><path d="M9 4h5M9 8h4M9 12h3"/></>
              : <><path d="M4 4v8M4 12l-2-2M4 12l2-2"/><path d="M9 4h5M9 8h4M9 12h3"/></>}
          </svg>
        </button>
        {SORT_OPTIONS.map(s => (
          <button key={s.key} onClick={() => setSortKey(s.key)}
            className="px-2 py-0.5 rounded text-[10px] transition-colors"
            style={{
              background: sortKey === s.key ? "var(--color-cream)" : "transparent",
              color: sortKey === s.key ? "var(--color-charcoal)" : "#9a9690",
              border: `0.5px solid ${sortKey === s.key ? "var(--color-border)" : "transparent"}`,
            }}>
            {s.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Leads toggle */}
        {leadCount > 0 && (
          <button
            onClick={() => { setShowLeads(v => !v); if (showLeads) setTagFilter(null); }}
            title="Leads are people you're pursuing (lives in Outreach). Convert to a contact once the relationship starts."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors"
            style={{
              background: showLeads ? "rgba(184,134,11,0.10)" : "transparent",
              color: showLeads ? "#b8860b" : "#9a9690",
              border: `0.5px solid ${showLeads ? "#b8860b55" : "var(--color-border)"}`,
            }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: showLeads ? "#b8860b" : "#9a9690", display: "inline-block", flexShrink: 0 }} />
            Leads
          </button>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 px-3 rounded-lg"
          style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", height: "28px", width: "200px" }}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
            <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 bg-transparent border-none outline-none text-[11px]"
            style={{ color: "var(--color-charcoal)" }} />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: "var(--color-grey)" }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l10 10M13 3L3 13"/></svg>
            </button>
          )}
        </div>
        <span className="text-[11px] shrink-0" style={{ color: "var(--color-grey)" }}>{visible.length}</span>
        <div className="flex items-center gap-1" style={{ borderLeft: "0.5px solid var(--color-border)", paddingLeft: 8, marginLeft: 4 }}>
          <button onClick={exportCSV} title="Export visible contacts as CSV"
            className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-cream)"; e.currentTarget.style.color = "var(--color-charcoal)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}>
            Export
          </button>
          <button
            onClick={() => setShowImport(true)}
            title="Import contacts from CSV"
            className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg transition-colors"
            style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--color-cream)"; e.currentTarget.style.color = "var(--color-charcoal)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}>
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
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.dot }} />
                <span className="text-[11px]" style={{ color: "#6b6860" }}>{status.label}</span>
              </div>

              <div className="text-[11px] pr-4" style={{ color: lc.color }}>{lc.label}</div>
              <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>{c.location ?? "—"}</div>
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
          onClose={() => setOpenContact(null)}
          onUpdated={handleUpdated}
          onArchived={handleArchived}
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
