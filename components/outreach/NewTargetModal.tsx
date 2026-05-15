"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, OutreachTarget, Contact, Company } from "@/types/database";
import { X } from "lucide-react";

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

  // Contact/company search
  const [search, setSearch]             = useState("");
  const [searchResults, setSearchResults] = useState<(Contact | Company)[]>([]);
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);
  const [linkedCompany, setLinkedCompany] = useState<Company | null>(null);
  const [searching, setSearching]       = useState(false);
  const [showSearch, setShowSearch]     = useState(false);

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
    const [{ data: contacts }, { data: companies }] = await Promise.all([
      supabase.from("contacts").select("*, company:companies(*)").eq("archived", false).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
      supabase.from("companies").select("*").ilike("name", `%${q}%`).limit(5),
    ]);
    const results: (Contact | Company)[] = [
      ...(contacts ?? []).map((c: Contact) => ({ ...c, _type: "contact" as const })),
      ...(companies ?? []).map((c: Company) => ({ ...c, _type: "company" as const })),
    ];
    setSearchResults(results);
    setSearching(false);
  }

  function selectResult(item: (Contact | Company) & { _type?: string }) {
    if (item._type === "contact" || "first_name" in item) {
      const c = item as Contact;
      setLinkedContact(c);
      setLinkedCompany(null);
      setName(`${c.first_name} ${c.last_name}`);
    } else {
      const co = item as Company;
      setLinkedCompany(co);
      setLinkedContact(null);
      setName(co.name);
    }
    setSearch("");
    setSearchResults([]);
    setShowSearch(false);
  }

  function clearLink() {
    setLinkedContact(null);
    setLinkedCompany(null);
    setName("");
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
      contact_id:   linkedContact?.id   ?? null,
      company_id:   linkedCompany?.id   ?? null,
      last_touched_at: new Date().toISOString(),
    };

    const { data, error: dbErr } = await supabase
      .from("outreach_targets")
      .insert(payload)
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, company:companies(*)), company:companies(*)")
      .single();

    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    onCreated(data as OutreachTarget);
    onClose();
  }

  const linked = linkedContact ?? linkedCompany;

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
              Link to contact or company
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
                  placeholder="Search contacts and companies…"
                  className={inputCls} style={inputStyle}
                />
                {showSearch && (search.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-20"
                    style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
                    {searching ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>Searching…</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>No results</p>
                    ) : searchResults.map((item, i) => {
                      const isContact = "first_name" in item;
                      const label = isContact ? `${(item as Contact).first_name} ${(item as Contact).last_name}` : item.name;
                      const sub   = isContact ? ((item as Contact).title ?? "") : "Company";
                      return (
                        <button key={i} type="button" onClick={() => selectResult(item as (Contact | Company) & { _type?: string })}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors"
                          style={{ borderBottom: i < searchResults.length - 1 ? "0.5px solid var(--color-border)" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: isContact ? "var(--color-cream)" : "rgba(37,99,171,0.1)", color: isContact ? "#6b6860" : "#2563ab" }}>
                            {isContact ? "Contact" : "Company"}
                          </span>
                          <div>
                            <div className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{label}</div>
                            {sub && <div className="text-[10px]" style={{ color: "var(--color-grey)" }}>{sub}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Target name * {linked ? <span className="font-normal" style={{ color: "var(--color-grey)" }}>(auto-filled)</span> : null}
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              required placeholder="e.g. The Parlour Gallery" className={inputCls} style={inputStyle} />
          </div>

          {/* Location + Description */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="New York, NY" className={inputCls} style={inputStyle} />
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
