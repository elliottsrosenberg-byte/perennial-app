"use client";

import type { Contact } from "@/types/database";

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

function ContactCard({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const lc = lastContactedDisplay(contact.last_contacted_at);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6,
        borderRadius: 10, border: "0.5px solid var(--color-border)",
        background: "var(--color-off-white)", cursor: "pointer", fontFamily: "inherit",
        transition: "border-color 0.1s ease, box-shadow 0.1s ease",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "var(--color-border-strong)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, background: "var(--color-cream)", color: "#6b6860" }}>
          {initials(contact)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {contact.first_name} {contact.last_name}
          </div>
        </div>
      </div>
      {(contact.company?.name || contact.title) && (
        <p style={{ fontSize: 10, color: "var(--color-grey)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[contact.title, contact.company?.name].filter(Boolean).join(" · ")}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: lc.color }}>{lc.label}</span>
        {contact.email && (
          <span style={{ fontSize: 10, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
            {contact.email}
          </span>
        )}
      </div>
    </button>
  );
}

interface Props {
  contacts: Contact[];
  onOpen: (c: Contact) => void;
}

export default function FollowUpsBoard({ contacts, onOpen }: Props) {
  const now = Date.now();
  function daysSince(c: Contact) {
    return c.last_contacted_at
      ? (now - new Date(c.last_contacted_at).getTime()) / 86400000
      : Infinity;
  }

  const columns: { label: string; dot: string; items: Contact[] }[] = [
    { label: "Never contacted", dot: "var(--color-grey)",       items: contacts.filter(c => !c.last_contacted_at) },
    { label: "60+ days",        dot: "var(--color-red-orange)", items: contacts.filter(c => daysSince(c) >= 60 && daysSince(c) < Infinity) },
    { label: "30–60 days",      dot: "#b8860b",                 items: contacts.filter(c => daysSince(c) >= 30 && daysSince(c) < 60) },
  ];

  return (
    <div style={{ display: "flex", gap: 12, padding: "16px 20px", flex: 1, overflowX: "auto", overflowY: "hidden", alignItems: "flex-start", background: "var(--color-warm-white)" }}>
      {columns.map(col => (
        <div key={col.label} style={{ minWidth: 240, width: 260, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "0 2px" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)" }}>{col.label}</span>
            <span style={{ fontSize: 10, color: "var(--color-grey)", marginLeft: "auto" }}>{col.items.length}</span>
          </div>
          <div style={{ overflowY: "auto", maxHeight: "100%" }}>
            {col.items.length === 0
              ? <div style={{ padding: "16px 12px", borderRadius: 10, border: "0.5px dashed var(--color-border)", textAlign: "center", fontSize: 11, color: "var(--color-grey)" }}>Empty</div>
              : col.items.map(c => <ContactCard key={c.id} contact={c} onClick={() => onOpen(c)} />)
            }
          </div>
        </div>
      ))}
    </div>
  );
}
