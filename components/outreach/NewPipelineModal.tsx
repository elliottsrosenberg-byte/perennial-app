"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, MetaStage } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreated: (pipeline: OutreachPipeline & { stages: PipelineStage[] }) => void;
}

const COLORS = [
  "#2563ab", "#6d4fa3", "#148c8c", "#3d6b4f",
  "#b8860b", "#dc3e0d", "#9BA37A", "#6b6860",
];

type StageTemplate = { name: string; meta_stage: MetaStage; is_outcome: boolean };

const TEMPLATES: Record<string, StageTemplate[]> = {
  gallery: [
    { name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { name: "Intro Sent",   meta_stage: "submit",      is_outcome: false },
    { name: "Meeting",      meta_stage: "discuss",     is_outcome: false },
    { name: "Represented",  meta_stage: "closed",      is_outcome: true  },
    { name: "Ether",        meta_stage: "closed",      is_outcome: true  },
    { name: "Wrong Fit",    meta_stage: "closed",      is_outcome: true  },
  ],
  press: [
    { name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { name: "Pitched",      meta_stage: "submit",      is_outcome: false },
    { name: "Under Review", meta_stage: "discuss",     is_outcome: false },
    { name: "Published",    meta_stage: "closed",      is_outcome: true  },
    { name: "Passed",       meta_stage: "closed",      is_outcome: true  },
  ],
  events: [
    { name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { name: "Applied",      meta_stage: "submit",      is_outcome: false },
    { name: "Accepted",     meta_stage: "discuss",     is_outcome: false },
    { name: "Planning",     meta_stage: "make_happen", is_outcome: false },
    { name: "Completed",    meta_stage: "closed",      is_outcome: true  },
    { name: "Declined",     meta_stage: "closed",      is_outcome: true  },
  ],
  sales: [
    { name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { name: "Quoted",       meta_stage: "submit",      is_outcome: false },
    { name: "Negotiating",  meta_stage: "discuss",     is_outcome: false },
    { name: "Sold",         meta_stage: "closed",      is_outcome: true  },
    { name: "Lost",         meta_stage: "closed",      is_outcome: true  },
  ],
  custom: [
    { name: "Identified",   meta_stage: "identify",    is_outcome: false },
    { name: "In Progress",  meta_stage: "submit",      is_outcome: false },
    { name: "Won",          meta_stage: "closed",      is_outcome: true  },
    { name: "Lost",         meta_stage: "closed",      is_outcome: true  },
  ],
};

const TEMPLATE_LABELS: Record<string, string> = {
  gallery: "Gallery",
  press:   "Press",
  events:  "Events",
  sales:   "Sales",
  custom:  "Custom (blank)",
};

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function NewPipelineModal({ onClose, onCreated }: Props) {
  const [name, setName]         = useState("");
  const [color, setColor]       = useState(COLORS[0]);
  const [template, setTemplate] = useState<string>("gallery");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }

    // Get current max position
    const { data: existing } = await supabase
      .from("outreach_pipelines").select("position").eq("user_id", user.id).order("position", { ascending: false }).limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;

    const { data: pipeline, error: pErr } = await supabase
      .from("outreach_pipelines")
      .insert({ user_id: user.id, name: name.trim(), color, position: nextPos })
      .select("*").single();

    if (pErr || !pipeline) { setError(pErr?.message ?? "Failed to create pipeline."); setLoading(false); return; }

    const stageRows = TEMPLATES[template].map((s, i) => ({
      pipeline_id: pipeline.id, user_id: user.id,
      name: s.name, position: i, is_outcome: s.is_outcome, meta_stage: s.meta_stage,
    }));

    const { data: stages, error: sErr } = await supabase
      .from("pipeline_stages").insert(stageRows).select("*");

    if (sErr || !stages) { setError(sErr?.message ?? "Failed to create stages."); setLoading(false); return; }

    onCreated({ ...(pipeline as OutreachPipeline), stages: stages as PipelineStage[] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>New pipeline</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              required placeholder="e.g. Collectors" autoFocus className={inputCls} style={inputStyle} />
          </div>

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

          <div>
            <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Stage template</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setTemplate(key)}
                  className="px-3 py-2 rounded-lg text-[12px] transition-colors text-left"
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
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TEMPLATES[template].map((s) => (
                <span key={s.name} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: s.is_outcome ? "rgba(31,33,26,0.06)" : color + "15",
                    color: s.is_outcome ? "var(--color-grey)" : color,
                  }}>
                  {s.name}
                </span>
              ))}
            </div>
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
            disabled={loading || !name.trim()}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: color }}>
            {loading ? "Creating…" : "Create pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}
