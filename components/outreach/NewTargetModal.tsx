"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, OutreachTarget, Contact, Organization } from "@/types/database";
import { X, User, Building2, UserPlus, Plus } from "lucide-react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Modal from "@/components/ui/Modal";

interface Props {
  pipelines: OutreachPipeline[];
  defaultPipelineId?: string;
  defaultStageId?: string;
  onClose: () => void;
  onCreated: (target: OutreachTarget) => void;
}

type TargetKind = "organization" | "person" | "unlinked";

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

// A target ALWAYS wraps either a Lead (person, is_lead=true) or an Organization.
// The kind toggle at the top decides which — no other state can produce a
// "naked" target with no linked entity. target.name is the wrapped entity's
// display name; we keep it on the row as a denormalised convenience.
export default function NewTargetModal({ pipelines, defaultPipelineId, defaultStageId, onClose, onCreated }: Props) {
  const firstPipeline = pipelines.find(p => p.id === defaultPipelineId) ?? pipelines[0];
  const [pipelineId, setPipelineId] = useState(firstPipeline?.id ?? "");
  const [stageId, setStageId]       = useState(defaultStageId ?? "");

  // Default to Organization — galleries / fairs / publications are the
  // dominant case for the target audience (furniture / objects designers).
  const [kind, setKind] = useState<TargetKind>("organization");

  // Linked entity. Mutually exclusive — switching kind clears the other side.
  const [linkedContact,      setLinkedContact]      = useState<Contact | null>(null);
  const [linkedOrganization, setLinkedOrganization] = useState<Organization | null>(null);

  // Name for a bare ("unlinked") target — a card with no Contact/Organization
  // yet. Opening it in the scrim later prompts to link or create one.
  const [unlinkedName, setUnlinkedName] = useState("");

  const [search, setSearch] = useState("");
  const [searchContacts,      setSearchContacts]      = useState<Contact[]>([]);
  const [searchOrganizations, setSearchOrganizations] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);

  // Optional context the user can add when creating a new entity inline,
  // shown only after they commit to "+ Create".
  const [createOpen,            setCreateOpen]            = useState(false);
  const [newPersonEmail,        setNewPersonEmail]        = useState("");
  const [newPersonOrganization, setNewPersonOrganization] = useState("");
  const [newOrgWebsite,         setNewOrgWebsite]         = useState("");
  const [newOrgLocation,        setNewOrgLocation]        = useState("");

  // Per-target extras
  const [link,            setLink]            = useState("");
  const [resultsDeadline, setResultsDeadline] = useState(""); // yyyy-mm-dd
  const [description,     setDescription]     = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const selectedPipeline = pipelines.find(p => p.id === pipelineId);
  const stages           = selectedPipeline?.stages ?? [];
  const activeStages     = stages.filter(s => !s.is_outcome);

  useEffect(() => {
    if (!defaultStageId && activeStages.length > 0) setStageId(activeStages[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId]);

  useEffect(() => {
    if (!search.trim()) { setSearchContacts([]); setSearchOrganizations([]); return; }
    const timer = setTimeout(() => runSearch(search.trim()), 220);
    return () => clearTimeout(timer);
  }, [search, kind]);

  async function runSearch(q: string) {
    setSearching(true);
    const supabase = createClient();
    if (kind === "person") {
      const { data } = await supabase
        .from("contacts")
        .select("*, organization:organizations(*)")
        .eq("archived", false)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(6);
      setSearchContacts((data ?? []) as Contact[]);
      setSearchOrganizations([]);
    } else {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("archived", false)
        .ilike("name", `%${q}%`)
        .limit(6);
      setSearchOrganizations((data ?? []) as Organization[]);
      setSearchContacts([]);
    }
    setSearching(false);
  }

  function switchKind(next: TargetKind) {
    if (next === kind) return;
    setKind(next);
    setLinkedContact(null);
    setLinkedOrganization(null);
    setSearch("");
    setSearchContacts([]);
    setSearchOrganizations([]);
    setCreateOpen(false);
    setError(null);
  }

  function pickContact(c: Contact) {
    setLinkedContact(c);
    setLinkedOrganization(null);
    setSearch(""); setSearchContacts([]); setCreateOpen(false);
  }
  function pickOrg(o: Organization) {
    setLinkedOrganization(o);
    setLinkedContact(null);
    setSearch(""); setSearchOrganizations([]); setCreateOpen(false);
  }
  function clearLink() {
    setLinkedContact(null);
    setLinkedOrganization(null);
    setCreateOpen(false);
    setNewPersonEmail(""); setNewPersonOrganization("");
    setNewOrgWebsite("");  setNewOrgLocation("");
  }

  function splitName(s: string): { first: string; last: string } {
    const parts = s.trim().split(/\s+/);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
  }

  async function createAndLinkPerson() {
    const q = search.trim();
    if (!q) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); return; }

    let organizationId: string | null = null;
    const orgName = newPersonOrganization.trim();
    if (orgName) {
      const { data: existing } = await supabase
        .from("organizations").select("*").ilike("name", orgName).limit(1);
      if (existing && existing.length > 0) organizationId = existing[0].id;
      else {
        const { data: newOrg } = await supabase
          .from("organizations")
          .insert({ user_id: user.id, name: orgName })
          .select("*").single();
        if (newOrg) organizationId = newOrg.id;
      }
    }

    const { first, last } = splitName(q);
    const { data: contact, error: cErr } = await supabase.from("contacts")
      .insert({
        user_id: user.id,
        first_name: first, last_name: last,
        email: newPersonEmail.trim() || null,
        organization_id: organizationId,
        is_lead: true, lead_stage: "new", archived: false,
      })
      .select("*, organization:organizations(*)")
      .single();
    if (cErr || !contact) { setError(cErr?.message ?? "Failed to create lead."); return; }
    pickContact(contact as Contact);
  }

  async function createAndLinkOrg() {
    const q = search.trim();
    if (!q) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); return; }

    const { data: org, error: oErr } = await supabase.from("organizations")
      .insert({
        user_id: user.id,
        name: q,
        website:  newOrgWebsite.trim()  || null,
        location: newOrgLocation.trim() || null,
      })
      .select("*").single();
    if (oErr || !org) { setError(oErr?.message ?? "Failed to create organization."); return; }
    pickOrg(org as Organization);
  }

  // Person targets ride on a Lead — disallow searching for non-lead contacts?
  // No — a target can wrap any contact (a contact you already know but want
  // to chase for a new project). The lead-vs-contact distinction is a
  // contact-side facet, not a target-side facet.

  function canOfferCreatePerson(): boolean {
    const q = search.trim();
    if (q.length < 2) return false;
    const ql = q.toLowerCase();
    const exact = searchContacts.some(c => `${c.first_name} ${c.last_name}`.toLowerCase() === ql);
    return !exact;
  }
  function canOfferCreateOrg(): boolean {
    const q = search.trim();
    if (q.length < 2) return false;
    const exact = searchOrganizations.some(o => o.name.toLowerCase() === q.toLowerCase());
    return !exact;
  }

  const linked = linkedContact ?? linkedOrganization;
  const derivedName = kind === "unlinked"
    ? unlinkedName.trim()
    : linkedContact
      ? `${linkedContact.first_name} ${linkedContact.last_name}`.trim()
      : linkedOrganization?.name ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const hasTarget = kind === "unlinked" ? !!derivedName : !!linked;
    if (!hasTarget || !pipelineId || !stageId) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    const payload = {
      user_id:         user.id,
      pipeline_id:     pipelineId,
      stage_id:        stageId,
      name:            derivedName,
      description:     description.trim() || null,
      link:            link.trim()        || null,
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

  // Submit-disabled rule: must have a pipeline, a stage, and either a linked
  // entity or (for a bare card) a name.
  const canSubmit = !loading && !!pipelineId && !!stageId
    && (kind === "unlinked" ? !!unlinkedName.trim() : !!linked);

  return (
    <Modal
      onClose={onClose}
      size="md"
      title="New target"
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg transition-colors"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={!canSubmit}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: selectedPipeline?.color ?? "var(--color-sage)" }}>
            {loading ? "Adding…" : "Add target"}
          </button>
        </>
      }
    >
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Kind toggle — the first thing the user picks. */}
          <div>
            <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>
              This target is…
            </label>
            <div className="grid grid-cols-3 gap-2">
              <KindButton
                active={kind === "organization"}
                onClick={() => switchKind("organization")}
                icon={<Building2 size={13} strokeWidth={1.75} />}
                label="Organization"
                hint="Gallery, brand, fair"
              />
              <KindButton
                active={kind === "person"}
                onClick={() => switchKind("person")}
                icon={<User size={13} strokeWidth={1.75} />}
                label="Person"
                hint="Adds a lead too"
              />
              <KindButton
                active={kind === "unlinked"}
                onClick={() => switchKind("unlinked")}
                icon={<Plus size={13} strokeWidth={1.75} />}
                label="Just a name"
                hint="Link later"
              />
            </div>
          </div>

          {/* Pipeline (only when not pre-selected) */}
          {!defaultPipelineId && (
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Pipeline *</label>
              <Select
                value={pipelineId}
                onChange={setPipelineId}
                options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          )}

          {/* Stage */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Stage *</label>
            <div className="flex flex-wrap gap-1.5">
              {activeStages.map((s) => (
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

          {/* Linked entity — search-or-create, conditional on kind. For a bare
              "Just a name" target we collect only a name and link a record later. */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              {kind === "person" ? "Person *" : kind === "organization" ? "Organization *" : "Name *"}
            </label>

            {kind === "unlinked" ? (
              <>
                <input
                  type="text" value={unlinkedName}
                  onChange={(e) => setUnlinkedName(e.target.value)}
                  placeholder="e.g. Spring open call, that gallery in Berlin…"
                  className={inputCls} style={inputStyle}
                />
                <p className="text-[10px] mt-1" style={{ color: "var(--color-grey)" }}>
                  Adds a card with no contact or organization yet. Open it later to link or create one.
                </p>
              </>
            ) : linked ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)" }}>
                <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-semibold"
                  style={{
                    background: (selectedPipeline?.color ?? "#9BA37A") + "20",
                    color:       selectedPipeline?.color ?? "#9BA37A",
                    borderRadius: kind === "person" ? 9999 : 6,
                  }}>
                  {linkedContact
                    ? (linkedContact.first_name[0] ?? "") + (linkedContact.last_name[0] ?? "")
                    : (linkedOrganization?.name[0] ?? "").toUpperCase()}
                </div>
                <span className="flex-1 text-[12px]" style={{ color: "var(--color-charcoal)" }}>{derivedName}</span>
                <button type="button" onClick={clearLink} style={{ color: "var(--color-grey)" }}><X size={12} /></button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={kind === "person" ? "Search by name or email…" : "Search by name…"}
                  className={inputCls} style={inputStyle}
                />

                {search.trim().length > 0 && !createOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
                    {searching && (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>Searching…</p>
                    )}

                    {!searching && kind === "person" && searchContacts.map(c => (
                      <ResultRow key={c.id}
                        kind="person"
                        title={`${c.first_name} ${c.last_name}`.trim()}
                        sub={c.title ?? c.organization?.name ?? (c.is_lead ? "Lead" : "Contact")}
                        onClick={() => pickContact(c)}
                      />
                    ))}
                    {!searching && kind === "organization" && searchOrganizations.map(o => (
                      <ResultRow key={o.id}
                        kind="organization"
                        title={o.name}
                        sub={o.location ?? o.website ?? "Organization"}
                        onClick={() => pickOrg(o)}
                      />
                    ))}

                    {!searching
                      && kind === "person"
                      && searchContacts.length === 0
                      && (
                        <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>No matching people</p>
                      )}
                    {!searching
                      && kind === "organization"
                      && searchOrganizations.length === 0
                      && (
                        <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>No matching organizations</p>
                      )}

                    {!searching && kind === "person" && canOfferCreatePerson() && (
                      <CreateRow
                        label={`+ Create lead for "${search.trim()}"`}
                        hint="Adds them to your Leads board"
                        icon={<UserPlus size={10} strokeWidth={2} />}
                        onClick={() => setCreateOpen(true)}
                      />
                    )}
                    {!searching && kind === "organization" && canOfferCreateOrg() && (
                      <CreateRow
                        label={`+ Create organization "${search.trim()}"`}
                        hint="A new gallery, brand, publication, or fair"
                        icon={<Plus size={10} strokeWidth={2} />}
                        onClick={() => setCreateOpen(true)}
                      />
                    )}
                  </div>
                )}

                {createOpen && kind === "person" && (
                  <div className="mt-2 rounded-xl p-3"
                    style={{ background: "rgba(184,134,11,0.06)", border: "0.5px solid rgba(184,134,11,0.25)" }}>
                    <p className="text-[11px] font-medium mb-2" style={{ color: "#b8860b" }}>
                      New lead: {search.trim() || "—"}
                    </p>
                    <input type="email" value={newPersonEmail}
                      onChange={(e) => setNewPersonEmail(e.target.value)}
                      placeholder="Email (optional)"
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-md border focus:outline-none mb-2"
                      style={inputStyle} />
                    <input type="text" value={newPersonOrganization}
                      onChange={(e) => setNewPersonOrganization(e.target.value)}
                      placeholder="Organization (optional — created if new)"
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-md border focus:outline-none"
                      style={inputStyle} />
                    <CreateActions
                      onCancel={() => { setCreateOpen(false); setNewPersonEmail(""); setNewPersonOrganization(""); }}
                      onCreate={createAndLinkPerson}
                      disabled={!search.trim()}
                    />
                  </div>
                )}

                {createOpen && kind === "organization" && (
                  <div className="mt-2 rounded-xl p-3"
                    style={{ background: "rgba(37,99,171,0.06)", border: "0.5px solid rgba(37,99,171,0.25)" }}>
                    <p className="text-[11px] font-medium mb-2" style={{ color: "#2563ab" }}>
                      New organization: {search.trim() || "—"}
                    </p>
                    <input type="url" value={newOrgWebsite}
                      onChange={(e) => setNewOrgWebsite(e.target.value)}
                      placeholder="Website (optional)"
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-md border focus:outline-none mb-2"
                      style={inputStyle} />
                    <input type="text" value={newOrgLocation}
                      onChange={(e) => setNewOrgLocation(e.target.value)}
                      placeholder="Location (optional)"
                      className="w-full px-2.5 py-1.5 text-[12px] rounded-md border focus:outline-none"
                      style={inputStyle} />
                    <CreateActions
                      accent="#2563ab"
                      onCancel={() => { setCreateOpen(false); setNewOrgWebsite(""); setNewOrgLocation(""); }}
                      onCreate={createAndLinkOrg}
                      disabled={!search.trim()}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Per-target extras — link, deadline, notes. */}
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
            <DatePicker
              value={resultsDeadline ? new Date(resultsDeadline + "T12:00:00") : null}
              onChange={(d) => {
                const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                setResultsDeadline(`${y}-${m}-${day}`);
              }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Notes</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, background, or next steps…" rows={2}
              className={inputCls} style={{ ...inputStyle, resize: "none" }} />
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>
    </Modal>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function KindButton({ active, onClick, icon, label, hint }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-2.5 rounded-xl text-left transition-colors"
      style={{
        background: active ? "var(--color-cream)" : "var(--color-warm-white)",
        border: active ? "0.5px solid var(--color-charcoal)" : "0.5px solid var(--color-border)",
        color: "var(--color-charcoal)",
      }}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium">
        {icon} {label}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--color-grey)" }}>{hint}</div>
    </button>
  );
}

function ResultRow({ kind, title, sub, onClick }: {
  kind: TargetKind; title: string; sub: string; onClick: () => void;
}) {
  const tagBg = kind === "person" ? "var(--color-cream)" : "rgba(37,99,171,0.10)";
  const tagFg = kind === "person" ? "#6b6860" : "#2563ab";
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
      style={{ borderBottom: "0.5px solid var(--color-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: tagBg, color: tagFg }}>
        {kind === "person" ? "Person" : "Organization"}
      </span>
      <div>
        <div className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{title}</div>
        {sub && <div className="text-[10px]" style={{ color: "var(--color-grey)" }}>{sub}</div>}
      </div>
    </button>
  );
}

function CreateRow({ label, hint, icon, onClick }: {
  label: string; hint: string; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
      style={{ background: "rgba(184,134,11,0.06)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(184,134,11,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(184,134,11,0.06)")}>
      <span className="flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 9999, background: "rgba(184,134,11,0.18)", color: "#b8860b" }}>
        {icon}
      </span>
      <div>
        <div className="text-[12px] font-medium" style={{ color: "#b8860b" }}>{label}</div>
        <div className="text-[10px]" style={{ color: "var(--color-grey)" }}>{hint}</div>
      </div>
    </button>
  );
}

function CreateActions({ accent = "#b8860b", onCancel, onCreate, disabled }: {
  accent?: string; onCancel: () => void; onCreate: () => void; disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-1.5 mt-2">
      <button type="button" onClick={onCancel}
        className="px-2.5 py-1 text-[11px] rounded-md"
        style={{ background: "transparent", color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
        Cancel
      </button>
      <button type="button" onClick={onCreate} disabled={disabled}
        className="px-2.5 py-1 text-[11px] font-medium rounded-md disabled:opacity-50"
        style={{ background: accent, color: "white", border: "none" }}>
        Create &amp; link
      </button>
    </div>
  );
}
