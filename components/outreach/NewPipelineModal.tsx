"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, MetaStage } from "@/types/database";
import { X, GripVertical, Plus } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreated: (pipeline: OutreachPipeline & { stages: PipelineStage[] }) => void;
}

const COLORS = [
  "#2563ab", "#6d4fa3", "#148c8c", "#3d6b4f",
  "#b8860b", "#dc3e0d", "#9BA37A", "#6b6860",
];

type EditableStage = { id: string; name: string; meta_stage: MetaStage; is_outcome: boolean };

function makeId() { return Math.random().toString(36).slice(2); }

const TEMPLATES: Record<string, EditableStage[]> = {
  gallery: [
    { id: makeId(), name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { id: makeId(), name: "Intro Sent",   meta_stage: "submit",      is_outcome: false },
    { id: makeId(), name: "Meeting",      meta_stage: "discuss",     is_outcome: false },
    { id: makeId(), name: "Represented",  meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "No Response",  meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Wrong Fit",    meta_stage: "closed",      is_outcome: true  },
  ],
  press: [
    { id: makeId(), name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { id: makeId(), name: "Pitched",      meta_stage: "submit",      is_outcome: false },
    { id: makeId(), name: "Under Review", meta_stage: "discuss",     is_outcome: false },
    { id: makeId(), name: "Published",    meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Passed",       meta_stage: "closed",      is_outcome: true  },
  ],
  events: [
    { id: makeId(), name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { id: makeId(), name: "Applied",      meta_stage: "submit",      is_outcome: false },
    { id: makeId(), name: "Accepted",     meta_stage: "discuss",     is_outcome: false },
    { id: makeId(), name: "Planning",     meta_stage: "make_happen", is_outcome: false },
    { id: makeId(), name: "Completed",    meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Declined",     meta_stage: "closed",      is_outcome: true  },
  ],
  sales: [
    { id: makeId(), name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { id: makeId(), name: "Quoted",       meta_stage: "submit",      is_outcome: false },
    { id: makeId(), name: "Negotiating",  meta_stage: "discuss",     is_outcome: false },
    { id: makeId(), name: "Sold",         meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Lost",         meta_stage: "closed",      is_outcome: true  },
  ],
  client: [
    { id: makeId(), name: "Prospecting",  meta_stage: "identify",    is_outcome: false },
    { id: makeId(), name: "Intro Call",   meta_stage: "submit",      is_outcome: false },
    { id: makeId(), name: "Proposal",     meta_stage: "discuss",     is_outcome: false },
    { id: makeId(), name: "Contract",     meta_stage: "make_happen", is_outcome: false },
    { id: makeId(), name: "Active",       meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Closed",       meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Lost",         meta_stage: "closed",      is_outcome: true  },
  ],
  custom: [
    { id: makeId(), name: "Stage 1",      meta_stage: "identify",    is_outcome: false },
    { id: makeId(), name: "Stage 2",      meta_stage: "submit",      is_outcome: false },
    { id: makeId(), name: "Won",          meta_stage: "closed",      is_outcome: true  },
    { id: makeId(), name: "Lost",         meta_stage: "closed",      is_outcome: true  },
  ],
};

const TEMPLATE_LABELS: Record<string, string> = {
  gallery: "Gallery",
  press:   "Press",
  events:  "Events",
  sales:   "Sales",
  client:  "Client",
  custom:  "Custom",
};

// Maps position in active/outcome list to MetaStage
const ACTIVE_META: MetaStage[] = ["identify", "submit", "discuss", "make_happen"];
function inferMeta(stages: EditableStage[], index: number): MetaStage {
  if (stages[index]?.is_outcome) return "closed";
  const activeCount = stages.filter(s => !s.is_outcome).length;
  const activeIndex = stages.slice(0, index + 1).filter(s => !s.is_outcome).length - 1;
  if (activeCount <= 1) return "identify";
  const ratio = activeIndex / (activeCount - 1);
  if (ratio < 0.25) return "identify";
  if (ratio < 0.55) return "submit";
  if (ratio < 0.85) return "discuss";
  return "make_happen";
}

const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function NewPipelineModal({ onClose, onCreated }: Props) {
  const [name,      setName]      = useState("");
  const [color,     setColor]     = useState(COLORS[0]);
  const [template,  setTemplate]  = useState<string>("gallery");
  const [stages,    setStages]    = useState<EditableStage[]>(() =>
    TEMPLATES.gallery.map(s => ({ ...s, id: makeId() }))
  );
  const [newStage,  setNewStage]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  function selectTemplate(key: string) {
    setTemplate(key);
    setStages(TEMPLATES[key].map(s => ({ ...s, id: makeId() })));
  }

  function updateStageName(id: string, val: string) {
    setStages(prev => prev.map(s => s.id === id ? { ...s, name: val } : s));
  }

  function toggleOutcome(id: string) {
    setStages(prev => prev.map(s => s.id === id
      ? { ...s, is_outcome: !s.is_outcome, meta_stage: !s.is_outcome ? "closed" : "submit" }
      : s
    ));
  }

  function deleteStage(id: string) {
    setStages(prev => prev.filter(s => s.id !== id));
  }

  function addStage() {
    const n = newStage.trim();
    if (!n) return;
    setStages(prev => [...prev, { id: makeId(), name: n, meta_stage: "submit", is_outcome: false }]);
    setNewStage("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || stages.filter(s => !s.is_outcome).length === 0) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    const { data: existing } = await supabase
      .from("outreach_pipelines").select("position").eq("user_id", user.id).order("position", { ascending: false }).limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;

    const { data: pipeline, error: pErr } = await supabase
      .from("outreach_pipelines")
      .insert({ user_id: user.id, name: name.trim(), color, position: nextPos })
      .select("*").single();

    if (pErr || !pipeline) { setError(pErr?.message ?? "Failed to create pipeline."); setLoading(false); return; }

    const stageRows = stages.filter(s => s.name.trim()).map((s, i) => ({
      pipeline_id: pipeline.id, user_id: user.id,
      name: s.name.trim(), position: i,
      is_outcome: s.is_outcome,
      meta_stage: inferMeta(stages, i),
    }));

    const { data: createdStages, error: sErr } = await supabase
      .from("pipeline_stages").insert(stageRows).select("*");

    if (sErr || !createdStages) { setError(sErr?.message ?? "Failed to create stages."); setLoading(false); return; }

    onCreated({ ...(pipeline as OutreachPipeline), stages: createdStages as PipelineStage[] });
    onClose();
  }

  const activeStages  = stages.filter(s => !s.is_outcome);
  const outcomeStages = stages.filter(s =>  s.is_outcome);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>New pipeline</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ flex: 1 }}>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

            {/* Name */}
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                required placeholder="e.g. Gallery outreach" autoFocus
                className="w-full px-3 py-2 text-[13px] rounded-lg border focus:outline-none"
                style={inputStyle} />
            </div>

            {/* Color */}
            <div>
              <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Color</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className="w-6 h-6 rounded-full transition-transform"
                    style={{
                      background: c,
                      outline: color === c ? `2.5px solid ${c}` : "none",
                      outlineOffset: "2px",
                      transform: color === c ? "scale(1.15)" : "scale(1)",
                    }} />
                ))}
              </div>
            </div>

            {/* Template */}
            <div>
              <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Start from template</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => selectTemplate(key)}
                    className="px-3 py-1.5 rounded-lg text-[12px] transition-colors"
                    style={{
                      background: template === key ? color + "18" : "var(--color-cream)",
                      color: template === key ? color : "#6b6860",
                      border: `0.5px solid ${template === key ? color + "55" : "var(--color-border)"}`,
                      fontWeight: template === key ? 500 : 400,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stages editor */}
            <div>
              <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Stages</label>

              {/* Active stages */}
              {activeStages.length > 0 && (
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-grey)" }}>Pipeline</p>
              )}
              {stages.filter(s => !s.is_outcome).map((stage) => (
                <StageRow key={stage.id} stage={stage} color={color}
                  onNameChange={updateStageName} onToggleOutcome={toggleOutcome} onDelete={deleteStage} />
              ))}

              {/* Outcome stages */}
              {outcomeStages.length > 0 && (
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 mt-3" style={{ color: "var(--color-grey)" }}>Outcomes</p>
              )}
              {stages.filter(s => s.is_outcome).map((stage) => (
                <StageRow key={stage.id} stage={stage} color={color}
                  onNameChange={updateStageName} onToggleOutcome={toggleOutcome} onDelete={deleteStage} />
              ))}

              {/* Add stage */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text" value={newStage} onChange={e => setNewStage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addStage(); } }}
                  placeholder="Add a stage…"
                  className="flex-1 px-3 py-1.5 text-[12px] rounded-lg border focus:outline-none"
                  style={inputStyle}
                />
                <button type="button" onClick={addStage} disabled={!newStage.trim()}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] flex items-center gap-1 disabled:opacity-40"
                  style={{ background: "var(--color-cream)", color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>

            {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg transition-colors"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !name.trim() || activeStages.length === 0}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: color }}>
            {loading ? "Creating…" : "Create pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stage row ─────────────────────────────────────────────────────────────────

function StageRow({ stage, color, onNameChange, onToggleOutcome, onDelete }: {
  stage: EditableStage;
  color: string;
  onNameChange: (id: string, val: string) => void;
  onToggleOutcome: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <div style={{ color: "var(--color-grey)", cursor: "grab", flexShrink: 0, opacity: 0.4 }}>
        <GripVertical size={13} />
      </div>
      <input
        type="text" value={stage.name}
        onChange={e => onNameChange(stage.id, e.target.value)}
        className="flex-1 px-2 py-1 text-[12px] rounded-md border focus:outline-none"
        style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}
      />
      <button
        type="button"
        onClick={() => onToggleOutcome(stage.id)}
        className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors"
        style={{
          background: stage.is_outcome ? "rgba(31,33,26,0.10)" : color + "18",
          color:      stage.is_outcome ? "#6b6860" : color,
          border:     `0.5px solid ${stage.is_outcome ? "var(--color-border)" : color + "44"}`,
          whiteSpace: "nowrap",
        }}
        title={stage.is_outcome ? "Move to pipeline" : "Mark as outcome"}>
        {stage.is_outcome ? "Outcome" : "Stage"}
      </button>
      <button type="button" onClick={() => onDelete(stage.id)}
        style={{ color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 0, lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.color = "var(--color-red-orange)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}>
        <X size={13} />
      </button>
    </div>
  );
}
