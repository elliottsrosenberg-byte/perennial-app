"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, OutreachTarget, Contact, Organization } from "@/types/database";
import { X, UserPlus } from "lucide-react";

interface Props {
  pipelines: OutreachPipeline[];
  defaultPipelineId?: string;
  defaultStageId?: string;
  onClose: () => void;
  onCreated: (target: OutreachTarget) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function NewTargetModal({ pipelines, defaultPipelineId, defaultStageId, onClose, onCreated }: Props) {
  const firstPipeline = pipelines.find((p) => p.id === defaultPipelineId) ?? pipelines[0];
  const [pipelineId, setPipelineId] = useState(firstPipeline?.id ?? "");
  const [stageId, setStageId]       = useState(defaultStageId ?? "");
  const [name, setName]             = useState("");
  const [location, setLocation]     = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink]             = useState("");
  const [resultsDeadline, setResultsDeadline] = useState(""); // yyyy-mm-dd

  // Contact/company search
  const [search, setSearch]             = useState("");
  const [searchResults, setSearchResults] = useState<(Contact | Organization)[]>([]);
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);
  const [linkedOrganization, setLinkedOrganization] = useState<Organization | null>(null);
  const [searching, setSearching]       = useState(false);
  const [showSearch, setShowSearch]     = useState(false);

  // Inline "create new contact" flow — surfaces when the search query has no
  // contact match. The optional fields expand once the user commits to
  // creating; we keep them out of the way until then so the modal doesn't
  // grow for the common case.
  const [creatingContact,    setCreatingContact]    = useState(false);
  const [newContactEmail,    setNewContactEmail]    = useState("");
  const [newContactOrganization, setNewContactOrganization] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = selectedPipeline?.stages ?? [];
  const activeStages = stages.filter((s) => !s.is_outcome);

  // Default stage when pipeline changes
  useEffect(() => {
    if (!defaultStageId && activeStages.length > 0) {
      setStageId(activeStages[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => runSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function runSearch(q: string) {
    setSearching(true);
    const supabase = createClient();
    const [{ data: contacts }, { data: organizations }] = await Promise.all([
      supabase.from("contacts").select("*, organization:organizations(*)").eq("archived", false).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
      supabase.from("organizations").select("*").ilike("name", `%${q}%`).limit(5),
    ]);
    const results: (Contact | Organization)[] = [
      ...(contacts ?? []).map((c: Contact) => ({ ...c, _type: "contact" as const })),
      ...(organizations ?? []).map((c: Organization) => ({ ...c, _type: "organization" as const })),
    ];
    setSearchResults(results);
    setSearching(false);
  }

  function selectResult(item: (Contact | Organization) & { _type?: string }) {
    if (item._type === "contact" || "first_name" in item) {
      const c = item as Contact;
      setLinkedContact(c);
      setLinkedOrganization(null);
      setName(`${c.first_name} ${c.last_name}`);
    } else {
      const co = item as Organization;
      setLinkedOrganization(co);
      setLinkedContact(null);
      setName(co.name);
    }
    setSearch("");
    setSearchResults([]);
    setShowSearch(false);
  }

  function clearLink() {
    setLinkedContact(null);
    setLinkedOrganization(null);
    setName("");
    setCreatingContact(false);
    setNewContactEmail("");
    setNewContactOrganization("");
  }

  // Splits "First Last" or "First Middle Last" — last token is the last name,
  // the rest is the first name. Single-token inputs become first_name with
  // empty last_name, matching how contacts are stored elsewhere.
  function splitName(s: string): { first: string; last: string } {
    const parts = s.trim().split(/\s+/);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
  }

  // Creates a new contact (is_lead=true) plus optional company, then sets it
  // as the linked contact and pre-fills the target name. Called from the
  // "+ Create contact" affordance in the search results.
  async function createAndLinkContact() {
    const q = search.trim();
    if (!q) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); return; }

    let organizationId: string | null = null;
    const organizationName = newContactOrganization.trim();
    if (organizationName) {
      // Try to match an existing organization first to avoid duplicates.
      const { data: existing } = await supabase.from("organizations")
        .select("*").ilike("name", organizationName).limit(1);
      if (existing && existing.length > 0) {
        organizationId = existing[0].id;
      } else {
        const { data: newOrg } = await supabase.from("organizations")
          .insert({ user_id: user.id, name: organizationName })
          .select("*").single();
        if (newOrg) organizationId = newOrg.id;
      }
    }

    const { first, last } = splitName(q);
    const { data: contact, error: cErr } = await supabase.from("contacts")
      .insert({
        user_id:         user.id,
        first_name:      first,
        last_name:       last,
        email:           newContactEmail.trim() || null,
        organization_id: organizationId,
        is_lead:         true,
        lead_stage:      "new",
        archived:        false,
      })
      .select("*, organization:organizations(*)")
      .single();
    if (cErr || !contact) { setError(cErr?.message ?? "Failed to create contact."); return; }

    setLinkedContact(contact as Contact);
    setLinkedOrganization(null);
    setName(`${first} ${last}`.trim());
    setCreatingContact(false);
    setSearch("");
    setSearchResults([]);
    setShowSearch(false);
    setNewContactEmail("");
    setNewContactOrganization("");
  }

  // Returns true when the search query looks like a person's name (single or
  // multi-token) AND doesn't exactly match any existing contact. Drives the
  // visibility of the inline-create affordance.
  function canOfferCreate(): boolean {
    const q = search.trim();
    if (q.length < 2) return false;
    const ql = q.toLowerCase();
    const hasExactContact = searchResults.some(item => {
      if ("first_name" in item) {
        return `${item.first_name} ${item.last_name}`.toLowerCase() === ql;
      }
      return false;
    });
    return !hasExactContact;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !pipelineId || !stageId) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    const payload = {
      user_id:      user.id,
      pipeline_id:  pipelineId,
      stage_id:     stageId,
      name:         name.trim(),
      location:     location.trim()     || null,
      description:  description.trim()  || null,
      link:         link.trim()         || null,
      results_deadline: resultsDeadline ? new Date(`${resultsDeadline}T12:00:00`).toISOString() : null,
      contact_id:      linkedContact?.id      ?? null,
      organization_id: linkedOrganization?.id ?? null,
      last_touched_at: new Date().toISOString(),
    };

    const { data, error: dbErr } = await supabase
      .from("outreach_targets")
      .insert(payload)
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, organization:organizations(*)), organization:organizations(*)")
      .single();

    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    onCreated(data as OutreachTarget);
    onClose();
  }

  const linked = linkedContact ?? linkedOrganization;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>New target</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name — first thing the user types. */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Target name * {linked ? <span className="font-normal" style={{ color: "var(--color-grey)" }}>(auto-filled)</span> : null}
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              required autoFocus placeholder="e.g. The Parlour Gallery" className={inputCls} style={inputStyle} />
          </div>

          {/* Pipeline + Stage */}
          {!defaultPipelineId && (
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Pipeline *</label>
              <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className={inputCls} style={inputStyle}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Stage *</label>
            <div className="flex flex-wrap gap-1.5">
              {stages.filter((s) => !s.is_outcome).map((s) => (
                <button key={s.id} type="button" onClick={() => setStageId(s.id)}
                  className="px-3 py-1 rounded-full text-[11px] transition-colors"
                  style={{
                    background: stageId === s.id ? (selectedPipeline?.color ?? "var(--color-sage)") : "var(--color-cream)",
                    color: stageId === s.id ? "white" : "#6b6860",
                    border: "0.5px solid var(--color-border)",
                  }}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Link to contact / company */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Link to contact or organization
            </label>
            {linked ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)" }}>
                <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold"
                  style={{ background: (selectedPipeline?.color ?? "#9BA37A") + "20", color: selectedPipeline?.color ?? "#9BA37A" }}>
                  {"first_name" in linked ? (linked.first_name[0] + linked.last_name[0]) : linked.name[0]}
                </div>
                <span className="flex-1 text-[12px]" style={{ color: "var(--color-charcoal)" }}>
                  {"first_name" in linked ? `${linked.first_name} ${linked.last_name}` : linked.name}
                </span>
                <button type="button" onClick={clearLink} style={{ color: "var(--color-grey)" }}><X size={12} /></button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text" value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="Search contacts and organizations…"
                  className={inputCls} style={inputStyle}
                />
                {showSearch && (search.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
                    {searching && (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>Searching…</p>
                    )}
                    {!searching && searchResults.map((item, i) => {
                      const isContact = "first_name" in item;
                      const label = isContact ? `${(item as Contact).first_name} ${(item as Contact).last_name}` : item.name;
                      const sub   = isContact ? ((item as Contact).title ?? "") : "Organization";
                      return (
                        <button key={i} type="button" onClick={() => selectResult(item as (Contact | Organization) & { _type?: string })}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
                          style={{ borderBottom: "0.5px solid var(--color-border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: isContact ? "var(--color-cream)" : "rgba(37,99,171,0.1)", color: isContact ? "#6b6860" : "#2563ab" }}>
                            {isContact ? "Contact" : "Organization"}
                          </span>
                          <div>
                            <div className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{label}</div>
                            {sub && <div className="text-[10px]" style={{ color: "var(--color-grey)" }}>{sub}</div>}
                          </div>
                        </button>
                      );
                    })}
                    {!searching && searchResults.length === 0 && (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>No results</p>
                    )}
                    {/* Inline create: surfaces whenever the query doesn't
                        exactly match an existing contact. Clicking expands
                        the optional email/company fields below the dropdown
                        rather than creating immediately, so the user can add
                        context before committing. */}
                    {!searching && canOfferCreate() && (
                      <button type="button"
                        onClick={() => { setCreatingContact(true); setShowSearch(false); }}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
                        style={{ background: "rgba(184,134,11,0.06)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(184,134,11,0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(184,134,11,0.06)")}>
                        <span className="flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 9999, background: "rgba(184,134,11,0.18)", color: "#b8860b" }}>
                          <UserPlus size={10} strokeWidth={2} />
                        </span>
                        <div>
                          <div className="text-[12px] font-medium" style={{ color: "#b8860b" }}>+ Create contact for &ldquo;{search.trim()}&rdquo;</div>
                          <div className="text-[10px]" style={{ color: "var(--color-grey)" }}>Will also appear as a Lead</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
                {/* Expanded inline-create panel — optional email + company
                    fields before the actual create. */}
                {creatingContact && !linkedContact && (
                  <div className="mt-2 rounded-xl p-3"
                    style={{ background: "rgba(184,134,11,0.06)", border: "0.5px solid rgba(184,134,11,0.25)" }}>
                    <p className="text-[11px] font-medium mb-2" style={{ color: "#b8860b" }}>
                      New contact: {search.trim() || "—"}
                    </p>
                    <input type="email" value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      placeholder="Email (optional)"
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-md border focus:outline-none mb-2"
                      style={inputStyle} />
                    <input type="text" value={newContactOrganization}
                      onChange={(e) => setNewContactOrganization(e.target.value)}
                      placeholder="Organization (optional — created if new)"
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-md border focus:outline-none"
                      style={inputStyle} />
                    <div className="flex justify-end gap-1.5 mt-2">
                      <button type="button"
                        onClick={() => { setCreatingContact(false); setNewContactEmail(""); setNewContactOrganization(""); }}
                        className="px-2.5 py-1 text-[11px] rounded-md"
                        style={{ background: "transparent", color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
                        Cancel
                      </button>
                      <button type="button"
                        onClick={createAndLinkContact}
                        disabled={!search.trim()}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-md disabled:opacity-50"
                        style={{ background: "#b8860b", color: "white", border: "none" }}>
                        Create &amp; link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Location + Description */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="New York, NY" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Link <span className="font-normal" style={{ color: "var(--color-grey)" }}>(submission form, listing, press page…)</span>
            </label>
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)}
              placeholder="https://" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Results deadline <span className="font-normal" style={{ color: "var(--color-grey)" }}>(when you expect to hear back)</span>
            </label>
            <input type="date" value={resultsDeadline} onChange={(e) => setResultsDeadline(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Notes</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, background, or next steps…" rows={2}
              className={inputCls} style={{ ...inputStyle, resize: "none" }} />
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg transition-colors"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !name.trim() || !pipelineId || !stageId}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: selectedPipeline?.color ?? "var(--color-sage)" }}>
            {loading ? "Adding…" : "Add target"}
          </button>
        </div>
      </div>
    </div>
  );
}
