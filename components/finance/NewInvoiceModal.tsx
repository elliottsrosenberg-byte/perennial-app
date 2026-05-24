"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, Project, Contact, Organization } from "@/types/database";
import { X } from "lucide-react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  nextNumber: number;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

type SearchResult = (Contact & { _type: "contact" }) | (Organization & { _type: "organization" });

export default function NewInvoiceModal({ projects, nextNumber, onClose, onCreated }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [search, setSearch]                   = useState("");
  const [searchResults, setSearchResults]     = useState<SearchResult[]>([]);
  const [searching, setSearching]             = useState(false);
  const [showSearch, setShowSearch]           = useState(false);
  const [clientContact, setClientContact]           = useState<Contact | null>(null);
  const [clientOrganization, setClientOrganization] = useState<Organization | null>(null);
  const [projectId, setProjectId]             = useState("");
  const [issuedAt, setIssuedAt]               = useState(today);
  const [dueAt, setDueAt]                     = useState("");
  const [paymentTerms, setPaymentTerms]       = useState("Net 30");
  const [paymentMethod, setPaymentMethod]     = useState("");
  const [notes, setNotes]                     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => runSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function runSearch(q: string) {
    setSearching(true);
    const supabase = createClient();
    const [{ data: contacts }, { data: organizations }] = await Promise.all([
      supabase.from("contacts").select("*").eq("archived", false).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
      supabase.from("organizations").select("*").ilike("name", `%${q}%`).limit(4),
    ]);
    setSearchResults([
      ...(contacts ?? []).map((c: Contact) => ({ ...c, _type: "contact" as const })),
      ...(organizations ?? []).map((c: Organization) => ({ ...c, _type: "organization" as const })),
    ]);
    setSearching(false);
  }

  function selectClient(item: SearchResult) {
    if (item._type === "contact") {
      setClientContact(item);
      setClientOrganization(null);
    } else {
      setClientOrganization(item);
      setClientContact(null);
    }
    setSearch(""); setSearchResults([]); setShowSearch(false);
  }

  function clearClient() { setClientContact(null); setClientOrganization(null); }

  const clientLabel = clientContact
    ? `${clientContact.first_name} ${clientContact.last_name}`
    : clientOrganization?.name ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientLabel) { setError("Select a client."); return; }
    setLoading(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }
    const { data, error: dbErr } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        number: nextNumber,
        status: "draft",
        client_contact_id: clientContact?.id ?? null,
        client_organization_id: clientOrganization?.id ?? null,
        project_id: projectId || null,
        issued_at: issuedAt,
        due_at: dueAt || null,
        payment_terms: paymentTerms || null,
        payment_method: paymentMethod || null,
        notes: notes.trim() || null,
      })
      .select("*, client_contact:contacts(id, first_name, last_name), client_organization:organizations(id, name), project:projects(id, title, rate), line_items:invoice_line_items(*)")
      .single();
    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    onCreated(data as Invoice);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>New invoice</h2>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>#{nextNumber}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Client */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Client *</label>
            {clientLabel ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
                <span className="flex-1 text-[13px]" style={{ color: "var(--color-charcoal)" }}>{clientLabel}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(31,33,26,0.07)", color: "var(--color-grey)" }}>
                  {clientContact ? "Contact" : "Organization"}
                </span>
                <button type="button" onClick={clearClient} style={{ color: "var(--color-grey)" }}><X size={12} /></button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="Search contacts and organizations…"
                  className={inputCls} style={inputStyle} />
                {showSearch && search.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl z-20 overflow-hidden"
                    style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
                    {searching ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>Searching…</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>No results</p>
                    ) : searchResults.map((item, i) => {
                      const label = item._type === "contact" ? `${item.first_name} ${item.last_name}` : item.name;
                      return (
                        <button key={i} type="button" onClick={() => selectClient(item)}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-2.5"
                          style={{ borderBottom: i < searchResults.length - 1 ? "0.5px solid var(--color-border)" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: item._type === "contact" ? "var(--color-cream)" : "rgba(37,99,171,0.1)", color: item._type === "contact" ? "#6b6860" : "#2563ab" }}>
                            {item._type === "contact" ? "Contact" : "Organization"}
                          </span>
                          <span className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Project</label>
            <Select
              value={projectId}
              onChange={setProjectId}
              options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]}
              placeholder="None"
            />
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Issue date</label>
              <DatePicker
                value={issuedAt ? new Date(issuedAt + "T12:00:00") : null}
                onChange={(d) => {
                  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                  setIssuedAt(`${y}-${m}-${day}`);
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Due date</label>
              <DatePicker
                value={dueAt ? new Date(dueAt + "T12:00:00") : null}
                onChange={(d) => {
                  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                  setDueAt(`${y}-${m}-${day}`);
                }}
                placeholder="Pick a due date…"
              />
            </div>
          </div>

          {/* Terms + method */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Payment terms</label>
              <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Net 30" className={inputCls} style={inputStyle} />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Payment method</label>
              <input type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Bank transfer" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for this invoice…" rows={2}
              className={inputCls} style={{ ...inputStyle, resize: "none" }} />
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Cancel</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !clientLabel}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-charcoal)" }}>
            {loading ? "Creating…" : "Create invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
