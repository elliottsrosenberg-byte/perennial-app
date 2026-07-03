"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage } from "@/types/database";
import Modal from "@/components/ui/Modal";

interface Props {
  pipeline: OutreachPipeline & { stages: PipelineStage[] };
  onClose: () => void;
  onUpdated: (pipeline: OutreachPipeline & { stages: PipelineStage[] }) => void;
}

// Same palette as NewPipelineModal so a re-colored pipeline can land back on
// the same swatch the user originally chose. Keep these in sync if you ever
// adjust the brand palette.
const COLORS = [
  "#9BA37A", "#6d4fa3", "#2563ab", "#3b8fc4",
  "#2a8a8a", "#b8860b", "#dc3e0d", "#c93a6a",
];

const inputStyle = {
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  color: "var(--color-charcoal)",
};

// Edits the pipeline-level fields only (name, description, color). Stage
// editing is intentionally out of scope here — adding / renaming / removing
// stages touches FK-bearing rows on outreach_targets, which we handle on the
// board itself (column header + delete affordance) rather than smuggling it
// into this lightweight settings sheet.
export default function EditPipelineModal({ pipeline, onClose, onUpdated }: Props) {
  const [name,        setName]        = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? "");
  const [color,       setColor]       = useState(pipeline.color);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const dirty =
    name.trim() !== pipeline.name
    || (description.trim() || null) !== (pipeline.description ?? null)
    || color !== pipeline.color;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dirty) return;
    setLoading(true); setError(null);

    const { data, error: dbErr } = await createClient()
      .from("outreach_pipelines")
      .update({
        name:        name.trim(),
        description: description.trim() || null,
        color,
      })
      .eq("id", pipeline.id)
      .select("*").single();

    if (dbErr || !data) { setError(dbErr?.message ?? "Failed to save."); setLoading(false); return; }
    onUpdated({ ...(data as OutreachPipeline), stages: pipeline.stages });
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      title="Edit pipeline"
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg transition-colors"
            style={{ color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !name.trim() || !dirty}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: color }}>
            {loading ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              required autoFocus
              className="w-full px-3 py-2 text-[13px] rounded-lg border focus:outline-none"
              style={inputStyle} />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
              Description <span className="font-normal" style={{ color: "var(--color-grey)" }}>(shown under the pipeline title)</span>
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What this pipeline is for — priorities, criteria, who you're chasing…"
              rows={3}
              className="w-full px-3 py-2 text-[13px] rounded-lg border focus:outline-none"
              style={{ ...inputStyle, resize: "vertical" }} />
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

          <div className="pt-2" style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              To rename, add, or remove stages, use the column header controls on the board itself.
            </p>
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>
    </Modal>
  );
}
