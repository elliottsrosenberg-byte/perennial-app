"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, MetaStage } from "@/types/database";
import { X, GripVertical, Plus } from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import Modal from "@/components/ui/Modal";

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
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [color,       setColor]       = useState(COLORS[0]);
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

  // Reorder within a single list (active or outcome). The two lists are
  // logically separate but live in the same `stages` array, so we splice
  // back into the right positions after reordering the slice.
  function reorderList(droppableId: "active" | "outcome", srcIdx: number, dstIdx: number) {
    setStages(prev => {
      const want = droppableId === "outcome";
      const slice = prev.filter(s => s.is_outcome === want);
      const others = prev.map((s, i) => ({ s, i })).filter(x => x.s.is_outcome !== want);
      const [moved] = slice.splice(srcIdx, 1);
      slice.splice(dstIdx, 0, moved);
      // Interleave: walk the original positions, preserving the "other" list
      // order, filling the matching-kind slots with the reordered slice.
      const result: EditableStage[] = [];
      let sliceI = 0;
      let otherI = 0;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].is_outcome === want) {
          result.push(slice[sliceI++]);
        } else {
          result.push(others[otherI++].s);
        }
      }
      return result;
    });
  }

  // Cross-section drag: the item is moving from "active" ↔ "outcome". Flip
  // is_outcome on the moved stage and place it at the destination index
  // within the destination list, preserving the order of every other stage.
  function moveBetweenLists(srcList: "active" | "outcome", srcIdx: number, dstIdx: number) {
    setStages(prev => {
      const srcWant = srcList === "outcome";
      const sourceSlice = prev.filter(s => s.is_outcome === srcWant);
      const movedOriginal = sourceSlice[srcIdx];
      if (!movedOriginal) return prev;

      // Apply the flip + a sensible default meta_stage for the new section.
      const moved: EditableStage = {
        ...movedOriginal,
        is_outcome: !srcWant,
        meta_stage: !srcWant ? "closed" : "submit",
      };

      // Build the two destination lists with the moved item inserted.
      const destSlice = prev.filter(s => s.is_outcome !== srcWant && s.id !== moved.id);
      destSlice.splice(dstIdx, 0, moved);
      const newSourceSlice = sourceSlice.filter((_, i) => i !== srcIdx);

      // Re-interleave: walk the original positions, but now item kinds may
      // have shifted. Simpler to just concat — active first, then outcomes —
      // which matches the UI's visual order anyway.
      const newActive  = !srcWant ? destSlice : newSourceSlice;
      const newOutcome =  srcWant ? destSlice : newSourceSlice;
      return [...newActive, ...newOutcome];
    });
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const srcId = result.source.droppableId as "active" | "outcome";
    const dstId = result.destination.droppableId as "active" | "outcome";
    if (srcId === dstId) {
      reorderList(srcId, result.source.index, result.destination.index);
    } else {
      moveBetweenLists(srcId, result.source.index, result.destination.index);
    }
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
      .insert({ user_id: user.id, name: name.trim(), description: description.trim() || null, color, position: nextPos })
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
    <Modal
      onClose={onClose}
      size="md"
      title="New pipeline"
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
            disabled={loading || !name.trim() || activeStages.length === 0}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: color }}>
            {loading ? "Creating…" : "Create pipeline"}
          </button>
        </>
      }
    >
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

            {/* Name */}
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                required placeholder="e.g. Gallery outreach" autoFocus
                className="w-full px-3 py-2 text-[13px] rounded-lg border focus:outline-none"
                style={inputStyle} />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
                Description <span className="font-normal" style={{ color: "var(--color-grey)" }}>(shown under the pipeline title — priorities, criteria, reminders)</span>
              </label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Mid-sized galleries in the Northeast. Prioritize spaces that have shown peers in the last 18 months."
                rows={2}
                className="w-full px-3 py-2 text-[13px] rounded-lg border focus:outline-none"
                style={{ ...inputStyle, resize: "vertical" }} />
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
                      color: template === key ? color : "var(--color-text-secondary)",
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

              <DragDropContext onDragEnd={handleDragEnd}>
                {/* Active stages — pipeline. Header is always visible so the
                    drop zone reads clearly even when the section is empty
                    (e.g. user dragged the last stage into Outcomes). */}
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-grey)" }}>Pipeline</p>
                <Droppable droppableId="active">
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      style={{
                        minHeight: activeStages.length === 0 ? 36 : undefined,
                        borderRadius: 8,
                        border: activeStages.length === 0
                          ? `0.5px dashed ${snapshot.isDraggingOver ? "var(--color-sage)" : "var(--color-border)"}`
                          : "none",
                        background: snapshot.isDraggingOver && activeStages.length === 0 ? "rgba(125,148,86,0.06)" : "transparent",
                        display: activeStages.length === 0 ? "flex" : undefined,
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: activeStages.length === 0 ? 2 : 0,
                        transition: "background 0.15s ease, border 0.15s ease",
                      }}>
                      {activeStages.length === 0 && !snapshot.isDraggingOver && (
                        <span style={{ fontSize: 10, color: "var(--color-grey)" }}>Drag an outcome here to make it an active stage</span>
                      )}
                      {activeStages.map((stage, index) => (
                        <Draggable key={stage.id} draggableId={stage.id} index={index}>
                          {(dragProvided, dragSnap) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              style={{
                                ...dragProvided.draggableProps.style,
                                opacity: dragSnap.isDragging ? 0.92 : 1,
                              }}
                            >
                              <StageRow
                                stage={stage}
                                color={color}
                                dragHandleProps={dragProvided.dragHandleProps}
                                onNameChange={updateStageName}
                                onToggleOutcome={toggleOutcome}
                                onDelete={deleteStage}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>

                {/* Outcome stages — header always visible so the drop zone
                    reads clearly even when empty. */}
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 mt-3" style={{ color: "var(--color-grey)" }}>Outcomes</p>
                <Droppable droppableId="outcome">
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      style={{
                        minHeight: outcomeStages.length === 0 ? 36 : undefined,
                        borderRadius: 8,
                        border: outcomeStages.length === 0
                          ? `0.5px dashed ${snapshot.isDraggingOver ? "var(--color-sage)" : "var(--color-border)"}`
                          : "none",
                        background: snapshot.isDraggingOver && outcomeStages.length === 0 ? "rgba(125,148,86,0.06)" : "transparent",
                        display: outcomeStages.length === 0 ? "flex" : undefined,
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: outcomeStages.length === 0 ? 2 : 0,
                        transition: "background 0.15s ease, border 0.15s ease",
                      }}>
                      {outcomeStages.length === 0 && !snapshot.isDraggingOver && (
                        <span style={{ fontSize: 10, color: "var(--color-grey)" }}>Drag a stage here to mark it an outcome</span>
                      )}
                      {outcomeStages.map((stage, index) => (
                        <Draggable key={stage.id} draggableId={stage.id} index={index}>
                          {(dragProvided, dragSnap) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              style={{
                                ...dragProvided.draggableProps.style,
                                opacity: dragSnap.isDragging ? 0.92 : 1,
                              }}
                            >
                              <StageRow
                                stage={stage}
                                color={color}
                                dragHandleProps={dragProvided.dragHandleProps}
                                onNameChange={updateStageName}
                                onToggleOutcome={toggleOutcome}
                                onDelete={deleteStage}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

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
                  style={{ background: "var(--color-cream)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border)" }}>
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>

            {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
          </form>
    </Modal>
  );
}

// ── Stage row ─────────────────────────────────────────────────────────────────

function StageRow({ stage, color, dragHandleProps, onNameChange, onToggleOutcome, onDelete }: {
  stage: EditableStage;
  color: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement> | null;
  onNameChange: (id: string, val: string) => void;
  onToggleOutcome: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <div {...(dragHandleProps ?? {})} style={{ color: "var(--color-grey)", cursor: "grab", flexShrink: 0, opacity: 0.55, display: "flex", alignItems: "center" }} title="Drag to reorder">
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
          background: stage.is_outcome ? "rgba(var(--color-charcoal-rgb),0.10)" : color + "18",
          color:      stage.is_outcome ? "var(--color-text-secondary)" : color,
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
