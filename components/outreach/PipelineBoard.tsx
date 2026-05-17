"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, OutreachTarget, MetaStage, ContactActivityType } from "@/types/database";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, X, Send } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

// ── Follow-up modal ───────────────────────────────────────────────────────────

const ACTIVITY_TYPES: { key: ContactActivityType; label: string }[] = [
  { key: "email",   label: "Email"   },
  { key: "call",    label: "Call"    },
  { key: "meeting", label: "Meeting" },
  { key: "note",    label: "Note"    },
];

function FollowUpModal({ target, onClose, onLogged }: {
  target: OutreachTarget;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [actType, setActType] = useState<ContactActivityType>("email");
  const [note,    setNote]    = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const now = new Date().toISOString();

    await supabase.from("outreach_targets")
      .update({ last_touched_at: now })
      .eq("id", target.id);

    if (target.contact_id) {
      await supabase.from("contact_activities").insert({
        user_id:     user.id,
        contact_id:  target.contact_id,
        type:        actType,
        content:     note.trim() || `Follow-up on ${target.name}`,
        occurred_at: now,
      });
      await supabase.from("contacts")
        .update({ last_contacted_at: now })
        .eq("id", target.contact_id);
    }

    setLoading(false);
    onLogged();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Log follow-up</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>{target.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <X size={14} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Type</p>
            <div className="flex gap-1.5 flex-wrap">
              {ACTIVITY_TYPES.map(t => (
                <button key={t.key} type="button" onClick={() => setActType(t.key)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: actType === t.key ? "var(--color-sage)" : "var(--color-cream)",
                    color: actType === t.key ? "white" : "#6b6860",
                    border: `0.5px solid ${actType === t.key ? "var(--color-sage)" : "var(--color-border)"}`,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>
              Notes <span style={{ color: "var(--color-grey)", fontWeight: 400 }}>(optional)</span>
            </p>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="What happened, what's next…"
              rows={3}
              className="w-full px-3 py-2 text-[12px] rounded-lg focus:outline-none resize-none"
              style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }}
            />
          </div>
        </form>
        <div className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[12px] rounded-lg transition-colors"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={loading}
            className="px-4 py-2 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}>
            {loading ? "Logging…" : "Log follow-up"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  pipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  selectedPipeline: (OutreachPipeline & { stages: PipelineStage[] }) | null;
  targets: OutreachTarget[];
  onTargetClick: (target: OutreachTarget) => void;
  onNewTarget: (pipelineId?: string, stageId?: string) => void;
  onStageChange: (targetId: string, newStageId: string) => void;
  onFollowUp: (targetId: string) => void;
}

const META_LABELS: Record<MetaStage, string> = {
  identify:    "Identify",
  submit:      "Submit",
  discuss:     "Discuss",
  make_happen: "Make It Happen",
  closed:      "Closed",
};
const META_ORDER: MetaStage[] = ["identify", "submit", "discuss", "make_happen", "closed"];

function fmtLastTouch(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Target card ───────────────────────────────────────────────────────────────

function TargetCard({
  target,
  pipelineBadge,
  isDragging,
  isOutcome,
  isFollowedUp,
  onClick,
  onOpenFollowUp,
}: {
  target: OutreachTarget;
  pipelineBadge?: { name: string; color: string };
  isDragging: boolean;
  isOutcome: boolean;
  isFollowedUp: boolean;
  onClick: () => void;
  onOpenFollowUp?: () => void;
}) {
  const [cardHov, setCardHov] = useState(false);
  const [barHov,  setBarHov]  = useState(false);

  const linkedLabel = target.contact
    ? `${target.contact.first_name} ${target.contact.last_name}`
    : target.company?.name ?? null;

  const recentlyTouched = Math.floor((Date.now() - new Date(target.last_touched_at).getTime()) / 86400000) === 0;
  const showGreen = isFollowedUp || recentlyTouched;

  // Follow-up bar colors
  const barColor = showGreen
    ? "rgba(61,107,79,0.22)"
    : cardHov
      ? barHov ? "rgba(184,134,11,0.38)" : "rgba(184,134,11,0.15)"
      : "transparent";
  const barWidth = barHov && !showGreen ? 12 : 6;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!isDragging) onClick(); }}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isDragging) onClick(); } }}
      onMouseEnter={() => setCardHov(true)}
      onMouseLeave={() => { setCardHov(false); setBarHov(false); }}
      style={{
        position: "relative",
        width: "100%",
        textAlign: "left",
        borderRadius: 10,
        padding: "10px 12px",
        paddingRight: 16,
        marginLeft: isFollowedUp ? 20 : 0,
        background: isDragging ? "var(--color-cream)" : "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        boxShadow: isDragging ? "0 8px 24px rgba(31,33,26,0.18)" : cardHov ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        cursor: "inherit",
        transition: "box-shadow 0.1s ease, background 0.1s ease, margin-left 0.25s ease",
        userSelect: "none",
        outline: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, flex: 1, color: "var(--color-charcoal)" }}>
          {target.name}
        </p>
        {pipelineBadge && (
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 9999, fontWeight: 500, flexShrink: 0, marginTop: 1, background: pipelineBadge.color + "20", color: pipelineBadge.color }}>
            {pipelineBadge.name}
          </span>
        )}
      </div>
      {linkedLabel && (
        <p style={{ fontSize: 11, color: "var(--color-grey)", marginBottom: 2 }}>{linkedLabel}</p>
      )}
      {target.location && (
        <p style={{ fontSize: 11, color: "var(--color-grey)" }}>{target.location}</p>
      )}
      <p style={{ fontSize: 10, marginTop: 6, color: "var(--color-grey)" }}>
        {fmtLastTouch(target.last_touched_at)}
      </p>

      {/* Follow-up bar — right edge, active stages only */}
      {!isOutcome && onOpenFollowUp && (
        <div
          onClick={e => { e.stopPropagation(); onOpenFollowUp(); }}
          onMouseEnter={e => { e.stopPropagation(); setBarHov(true); }}
          onMouseLeave={e => { e.stopPropagation(); setBarHov(false); }}
          title={showGreen ? "Followed up — log another" : "Log follow-up"}
          style={{
            position: "absolute",
            right: 0, top: 0, bottom: 0,
            width: barWidth,
            borderRadius: "0 10px 10px 0",
            background: barColor,
            cursor: "pointer",
            transition: "background 0.15s ease, width 0.18s ease",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Tooltip */}
          {barHov && !showGreen && (
            <span style={{
              position: "absolute",
              right: "calc(100% + 8px)",
              top: "50%",
              transform: "translateY(-50%)",
              background: "var(--color-charcoal)",
              color: "var(--color-warm-white)",
              fontSize: 10,
              padding: "4px 8px",
              borderRadius: 5,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              pointerEvents: "none",
            }}>
              Log follow-up
            </span>
          )}
          {showGreen && (
            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" style={{ opacity: 0.7 }}>
              <path d="M1 3L3 5L7 1" stroke="#3d6b4f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

// ── Droppable column ──────────────────────────────────────────────────────────

function DroppableColumn({
  stage,
  targets,
  pipelineColor,
  isOutcome,
  showPipelineBadge,
  allPipelines,
  onTargetClick,
  onNewTarget,
  onOpenFollowUp,
  followedUpIds,
}: {
  stage: PipelineStage;
  targets: OutreachTarget[];
  pipelineColor: string;
  isOutcome: boolean;
  showPipelineBadge: boolean;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  onTargetClick: (t: OutreachTarget) => void;
  onNewTarget: () => void;
  onOpenFollowUp: (t: OutreachTarget) => void;
  followedUpIds: Set<string>;
}) {
  return (
    <Droppable droppableId={stage.id}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          style={{ display: "flex", flexDirection: "column", width: 210, flexShrink: 0 }}
        >
          {/* Column header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: isOutcome ? "rgba(31,33,26,0.25)" : pipelineColor, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: isOutcome ? "var(--color-grey)" : "var(--color-charcoal)" }}>
                {stage.name}
              </span>
              {targets.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{targets.length}</span>
              )}
            </div>
            {!isOutcome && (
              <button type="button" onClick={onNewTarget}
                style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-grey)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--color-charcoal)"; e.currentTarget.style.background = "var(--color-cream)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--color-grey)"; e.currentTarget.style.background = "transparent"; }}>
                <Plus size={12} />
              </button>
            )}
          </div>

          {/* Cards drop zone */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 56,
              borderRadius: 10,
              padding: snapshot.isDraggingOver ? "6px" : "0",
              background: snapshot.isDraggingOver
                ? isOutcome ? "rgba(31,33,26,0.05)" : pipelineColor + "10"
                : "transparent",
              border: snapshot.isDraggingOver
                ? `1px dashed ${isOutcome ? "rgba(31,33,26,0.2)" : pipelineColor + "55"}`
                : "1px solid transparent",
              transition: "background 0.15s ease, border 0.15s ease, padding 0.15s ease",
            }}
          >
            {targets.map((t, index) => {
              const tp = allPipelines.find(p => p.id === t.pipeline_id);
              return (
                <Draggable key={t.id} draggableId={t.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      data-tour-target={index === 0 ? "outreach.first-card" : undefined}
                      style={{
                        ...dragProvided.draggableProps.style,
                        cursor: dragSnapshot.isDragging ? "grabbing" : "grab",
                        opacity: dragSnapshot.isDragging ? 0.9 : 1,
                      }}
                    >
                      <TargetCard
                        target={t}
                        pipelineBadge={showPipelineBadge && tp ? { name: tp.name, color: tp.color } : undefined}
                        isDragging={dragSnapshot.isDragging}
                        isOutcome={isOutcome}
                        isFollowedUp={followedUpIds.has(t.id)}
                        onClick={() => onTargetClick(t)}
                        onOpenFollowUp={isOutcome ? undefined : () => onOpenFollowUp(t)}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
            {targets.length === 0 && !snapshot.isDraggingOver && (
              <div style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--color-grey)" }}>—</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}

// ── Static column (All-pipelines view, no drag) ───────────────────────────────

function StaticColumn({
  label,
  targets,
  showPipelineBadge,
  allPipelines,
  onTargetClick,
  onAdd,
}: {
  label: string;
  targets: OutreachTarget[];
  showPipelineBadge: boolean;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  onTargetClick: (t: OutreachTarget) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 210, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-charcoal)" }}>
            {label}
          </span>
          {targets.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{targets.length}</span>
          )}
        </div>
        <button type="button" onClick={onAdd}
          style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-grey)" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--color-charcoal)"; e.currentTarget.style.background = "var(--color-cream)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--color-grey)"; e.currentTarget.style.background = "transparent"; }}>
          <Plus size={12} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {targets.map((t, index) => {
          const tp = allPipelines.find(p => p.id === t.pipeline_id);
          return (
            <div key={t.id} data-tour-target={index === 0 ? "outreach.first-card" : undefined}>
              <TargetCard
                target={t}
                pipelineBadge={showPipelineBadge && tp ? { name: tp.name, color: tp.color } : undefined}
                isDragging={false}
                isOutcome={false}
                isFollowedUp={false}
                onClick={() => onTargetClick(t)}
              />
            </div>
          );
        })}
        {targets.length === 0 && (
          <div style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "var(--color-grey)" }}>Empty</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PipelineBoard({ pipelines, selectedPipeline, targets, onTargetClick, onNewTarget, onStageChange, onFollowUp }: Props) {
  const [followUpTarget,  setFollowUpTarget]  = useState<OutreachTarget | null>(null);
  const [followedUpIds,   setFollowedUpIds]   = useState<Set<string>>(new Set());

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStageId = destination.droppableId;
    const target = targets.find(t => t.id === draggableId);
    if (!target || target.stage_id === newStageId) return;
    onStageChange(draggableId, newStageId);
  }

  function handleLogged(targetId: string) {
    onFollowUp(targetId);
    setFollowedUpIds(prev => new Set(prev).add(targetId));
  }

  if (selectedPipeline) {
    const activeStages  = selectedPipeline.stages.filter(s => !s.is_outcome);
    const outcomeStages = selectedPipeline.stages.filter(s =>  s.is_outcome);

    return (
      <>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
            <div style={{ display: "flex", gap: 0, padding: "20px", minHeight: "100%", minWidth: "max-content", alignItems: "flex-start" }}>

              {/* Active stage columns */}
              <div style={{ display: "flex", gap: 14 }}>
                {activeStages.map(stage => (
                  <DroppableColumn
                    key={stage.id}
                    stage={stage}
                    targets={targets.filter(t => t.stage_id === stage.id)}
                    pipelineColor={selectedPipeline.color}
                    isOutcome={false}
                    showPipelineBadge={false}
                    allPipelines={pipelines}
                    onTargetClick={onTargetClick}
                    onNewTarget={() => onNewTarget(selectedPipeline.id, stage.id)}
                    onOpenFollowUp={setFollowUpTarget}
                    followedUpIds={followedUpIds}
                  />
                ))}
              </div>

              {/* Outcome columns — separated by a vertical rule */}
              {outcomeStages.length > 0 && (
                <>
                  <div style={{ width: 1, background: "var(--color-border)", margin: "0 20px", alignSelf: "stretch", flexShrink: 0 }} />
                  <div style={{ display: "flex", gap: 14 }}>
                    {outcomeStages.map(stage => (
                      <DroppableColumn
                        key={stage.id}
                        stage={stage}
                        targets={targets.filter(t => t.stage_id === stage.id)}
                        pipelineColor={selectedPipeline.color}
                        isOutcome={true}
                        showPipelineBadge={false}
                        allPipelines={pipelines}
                        onTargetClick={onTargetClick}
                        onNewTarget={() => onNewTarget(selectedPipeline.id, stage.id)}
                        onOpenFollowUp={setFollowUpTarget}
                        followedUpIds={followedUpIds}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </DragDropContext>

        {followUpTarget && (
          <FollowUpModal
            target={followUpTarget}
            onClose={() => setFollowUpTarget(null)}
            onLogged={() => handleLogged(followUpTarget.id)}
          />
        )}
      </>
    );
  }

  // All pipelines — no pipelines yet
  if (pipelines.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EmptyState
          icon={<Send size={22} strokeWidth={1.5} color="var(--color-sage)" />}
          heading="Create your first pipeline"
          body="Outreach pipelines track your gallery submissions, press pitches, fair applications, and client pursuits — from first contact to closed deal. Each pipeline has its own stages you define."
          ashPrompt="I'm setting up outreach in Perennial. What pipelines should a furniture/object designer have? Walk me through how to set up a gallery outreach pipeline."
          tips={[
            "Create a pipeline for each type of outreach — e.g. 'Gallery submissions', 'Press pitches', 'Fair applications'.",
            "Each pipeline has stages you define (e.g. Identified → Reached out → In conversation → Proposal sent → Closed).",
            "Perennial tracks when you last touched each target so nothing slips through the cracks.",
          ]}
        />
      </div>
    );
  }

  // All pipelines — meta-stage columns (static, no drag)
  return (
    <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
      <div style={{ display: "flex", gap: 14, padding: "20px", minWidth: "max-content", minHeight: "100%", alignItems: "flex-start" }}>
        {META_ORDER.map(meta => {
          const metaTargets = targets.filter(t => {
            const tp = pipelines.find(p => p.id === t.pipeline_id);
            const stage = tp?.stages.find(s => s.id === t.stage_id);
            return stage?.meta_stage === meta;
          });
          return (
            <StaticColumn
              key={meta}
              label={META_LABELS[meta]}
              targets={metaTargets}
              showPipelineBadge={true}
              allPipelines={pipelines}
              onTargetClick={onTargetClick}
              onAdd={() => onNewTarget()}
            />
          );
        })}
      </div>
    </div>
  );
}
