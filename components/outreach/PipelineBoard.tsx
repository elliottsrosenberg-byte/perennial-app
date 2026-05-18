"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, OutreachTarget, MetaStage, ContactActivityType } from "@/types/database";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Send, Check, Clock } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

// Distinct follow-up colour. Intentionally NOT sage (overloaded with "healthy
// project" semantics) and NOT amber/red-orange (already used for lead/stale
// states). A warm copper signals "outreach touch" without echoing any other
// surface in the app.
const FOLLOWUP_COPPER        = "#c97a4a";
const FOLLOWUP_COPPER_TINT   = "rgba(201,122,74,0.16)";
const FOLLOWUP_COPPER_REVEAL = "rgba(201,122,74,0.22)";
const FOLLOWUP_COPPER_LOGGED = "rgba(201,122,74,0.28)";

const ACTIVITY_TYPES: { key: ContactActivityType; label: string }[] = [
  { key: "email",   label: "Email"   },
  { key: "call",    label: "Call"    },
  { key: "meeting", label: "Meeting" },
  { key: "note",    label: "Note"    },
];

interface Props {
  pipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  selectedPipeline: (OutreachPipeline & { stages: PipelineStage[] }) | null;
  targets: OutreachTarget[];
  onTargetClick: (target: OutreachTarget) => void;
  onNewTarget: (pipelineId?: string, stageId?: string) => void;
  onNewPipeline?: () => void;
  onStageChange: (targetId: string, newStageId: string) => void;
  /** Bumps last_followup_at on the target (NOT last_touched_at — that's a
   *  general "anything happened" marker). The board uses this for the "I've
   *  been followed up today" treatment. */
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

// Returns a small badge config when a results_deadline is within 14 days or
// already past. Past-due → red-orange; <=14 days → amber.
function deadlineBadge(iso: string | null): { label: string; color: string; bg: string } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d overdue`,
      color: "var(--color-red-orange)",
      bg:    "rgba(220,62,13,0.10)",
    };
  }
  if (days <= 14) {
    if (days === 0) return { label: "Due today",  color: "#b8860b", bg: "rgba(184,134,11,0.12)" };
    if (days === 1) return { label: "Due tomorrow", color: "#b8860b", bg: "rgba(184,134,11,0.12)" };
    return { label: `${days}d left`, color: "#b8860b", bg: "rgba(184,134,11,0.12)" };
  }
  return null;
}

// ── Target card ───────────────────────────────────────────────────────────────

function TargetCard({
  target,
  pipelineBadge,
  isDragging,
  isOutcome,
  isFollowedUp,
  onClick,
  onLogFollowUp,
}: {
  target: OutreachTarget;
  pipelineBadge?: { name: string; color: string };
  isDragging: boolean;
  isOutcome: boolean;
  isFollowedUp: boolean;
  onClick: () => void;
  /** Logs a follow-up of the given type with optional note. Resolves when
   *  the database round-trip completes; the parent uses success to flip the
   *  card into its "logged" appearance. */
  onLogFollowUp?: (type: ContactActivityType, note: string) => Promise<void>;
}) {
  const [cardHov,   setCardHov]   = useState(false);
  // True when the hover position is inside the right-edge zone (~25% width).
  const [zoneHov,   setZoneHov]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const [actType,   setActType]   = useState<ContactActivityType>("email");
  const [note,      setNote]      = useState("");
  const [logging,   setLogging]   = useState(false);
  // Brief flash after a successful log — drives a copper colour + check icon
  // and the "compressed to 80%" treatment kicks in via `isFollowedUp` once
  // the parent marks it.
  const [justLogged, setJustLogged] = useState(false);

  const linkedLabel = target.contact
    ? `${target.contact.first_name} ${target.contact.last_name}`
    : target.company?.name ?? null;

  // "Logged" is keyed off the dedicated `last_followup_at` timestamp — NOT
  // `last_touched_at`. Brand-new targets get last_touched_at set on insert,
  // which previously made every new card look "followed up" the moment it
  // landed. Follow-up is a specific action; the touch is general.
  const recentlyFollowedUp = useMemo(() => {
    if (!target.last_followup_at) return false;
    return Math.floor((Date.now() - new Date(target.last_followup_at).getTime()) / 86400000) === 0;
  }, [target.last_followup_at]);
  const showLogged = isFollowedUp || recentlyFollowedUp || justLogged;

  // The compressed "I've been touched" treatment — narrow + right-aligned —
  // only applies to active (non-outcome) cards. Outcome cards stay full
  // width because the gesture isn't available there.
  const compressed = showLogged && !isOutcome;

  const handleWidth = (zoneHov || open) && !showLogged ? 44 : 6;
  const handleColor = showLogged
    ? FOLLOWUP_COPPER_LOGGED
    : (zoneHov || open)
      ? FOLLOWUP_COPPER
      : FOLLOWUP_COPPER_TINT;

  async function submit() {
    if (!onLogFollowUp || logging) return;
    setLogging(true);
    try {
      await onLogFollowUp(actType, note);
      setJustLogged(true);
      setOpen(false);
      setNote("");
      // Keep the celebratory state long enough to see, then let the parent's
      // `isFollowedUp` carry the visual state.
      setTimeout(() => setJustLogged(false), 1400);
    } finally {
      setLogging(false);
    }
  }

  const badge = deadlineBadge(target.results_deadline);

  return (
    <div
      style={{
        position: "relative",
        width: compressed ? "80%" : "100%",
        marginLeft: compressed ? "auto" : 0,
        transition: "width 0.32s cubic-bezier(0.34, 1.4, 0.5, 1), margin-left 0.32s cubic-bezier(0.34, 1.4, 0.5, 1)",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          // Don't fire the open-detail click when the user clicks the right
          // zone (handled separately) or while the inline insert is open.
          if (zoneHov || open) return;
          if (!isDragging) onClick();
        }}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isDragging) onClick(); } }}
        onMouseEnter={() => setCardHov(true)}
        onMouseLeave={() => { setCardHov(false); setZoneHov(false); }}
        onMouseMove={(e) => {
          if (isOutcome || !onLogFollowUp || showLogged) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left;
          // Right ~25% of the card opens the affordance.
          setZoneHov(x > r.width * 0.75);
        }}
        style={{
          position: "relative",
          width: "100%",
          textAlign: "left",
          borderRadius: 10,
          padding: "10px 12px",
          paddingRight: 18,
          background: isDragging ? "var(--color-cream)" : showLogged ? "rgba(201,122,74,0.05)" : "var(--color-warm-white)",
          border: `0.5px solid ${showLogged ? "rgba(201,122,74,0.40)" : "var(--color-border)"}`,
          boxShadow: isDragging
            ? "0 8px 24px rgba(31,33,26,0.18)"
            : cardHov ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
          cursor: open ? "default" : "pointer",
          transition: "background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 6 }}>
          <p style={{
            fontSize: 10,
            color: showLogged ? FOLLOWUP_COPPER : "var(--color-grey)",
            fontWeight: showLogged ? 600 : 400,
            transition: "color 0.18s ease",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            {showLogged && <Check size={9} strokeWidth={2.4} />}
            {justLogged ? "Followed up · today" : fmtLastTouch(target.last_touched_at)}
          </p>
          {badge && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontSize: 9, fontWeight: 600,
              padding: "1px 6px", borderRadius: 9999,
              background: badge.bg, color: badge.color,
            }}>
              <Clock size={9} strokeWidth={2} />
              {badge.label}
            </span>
          )}
        </div>

        {/* Right-edge handle — expands on hover within the zone to make the
            click target obvious. Outcome cards skip this entirely. */}
        {!isOutcome && onLogFollowUp && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (showLogged) return;
              setOpen(v => !v);
            }}
            onMouseEnter={(e) => { e.stopPropagation(); setZoneHov(true); }}
            title={showLogged ? "Followed up today" : "Log follow-up"}
            style={{
              position: "absolute",
              right: 0, top: 0, bottom: 0,
              width: handleWidth,
              borderRadius: "0 10px 10px 0",
              background: handleColor,
              cursor: showLogged ? "default" : "pointer",
              transition: "width 0.18s ease, background 0.15s ease",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              color: "white",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {showLogged ? (
              <Check size={10} strokeWidth={2.6} color={FOLLOWUP_COPPER} />
            ) : (zoneHov || open) ? (
              <span style={{ paddingInline: 4 }}>Log follow-up</span>
            ) : (
              <span aria-hidden style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ width: 2, height: 2, borderRadius: 1, background: "white" }} />
                <span style={{ width: 2, height: 2, borderRadius: 1, background: "white" }} />
                <span style={{ width: 2, height: 2, borderRadius: 1, background: "white" }} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Inline insert — vertically expanding panel rendered as part of the
          card stack (not a centered modal overlay). Replaces the old
          FollowUpModal flow. */}
      <div
        style={{
          maxHeight: open ? 220 : 0,
          opacity:   open ? 1   : 0,
          overflow: "hidden",
          transition: "max-height 0.24s ease, opacity 0.18s ease, margin-top 0.18s ease",
          marginTop: open ? 6 : 0,
        }}
      >
        <div style={{
          background: "var(--color-off-white)",
          border: `0.5px solid ${FOLLOWUP_COPPER_REVEAL}`,
          borderRadius: 10,
          padding: 10,
          boxShadow: "0 4px 12px rgba(201,122,74,0.12)",
        }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {ACTIVITY_TYPES.map(t => (
              <button key={t.key} type="button"
                onClick={(e) => { e.stopPropagation(); setActType(t.key); }}
                style={{
                  padding: "3px 9px", borderRadius: 9999,
                  fontSize: 10, fontWeight: 500,
                  background: actType === t.key ? FOLLOWUP_COPPER : "var(--color-cream)",
                  color:      actType === t.key ? "white" : "#6b6860",
                  border: `0.5px solid ${actType === t.key ? FOLLOWUP_COPPER : "var(--color-border)"}`,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Note (optional)…"
            rows={2}
            style={{
              width: "100%", padding: "6px 8px",
              fontSize: 11, lineHeight: 1.4,
              background: "var(--color-warm-white)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 7,
              color: "var(--color-charcoal)",
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              marginBottom: 8,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); setNote(""); }}
              style={{
                padding: "4px 10px", fontSize: 11,
                background: "transparent",
                color: "#6b6860",
                border: "0.5px solid var(--color-border)",
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
              }}>
              Cancel
            </button>
            <button type="button"
              onClick={(e) => { e.stopPropagation(); submit(); }}
              disabled={logging}
              style={{
                padding: "4px 12px", fontSize: 11, fontWeight: 600,
                background: FOLLOWUP_COPPER, color: "white",
                border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                opacity: logging ? 0.6 : 1,
              }}>
              {logging ? "Logging…" : "Log follow-up"}
            </button>
          </div>
        </div>
      </div>
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
  onLogFollowUp,
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
  onLogFollowUp: (t: OutreachTarget, type: ContactActivityType, note: string) => Promise<void>;
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
                        onLogFollowUp={isOutcome ? undefined : (type, note) => onLogFollowUp(t, type, note)}
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
  onLogFollowUp,
  followedUpIds,
}: {
  label: string;
  targets: OutreachTarget[];
  showPipelineBadge: boolean;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  onTargetClick: (t: OutreachTarget) => void;
  onAdd: () => void;
  onLogFollowUp: (t: OutreachTarget, type: ContactActivityType, note: string) => Promise<void>;
  followedUpIds: Set<string>;
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
                isFollowedUp={followedUpIds.has(t.id)}
                onClick={() => onTargetClick(t)}
                onLogFollowUp={(type, note) => onLogFollowUp(t, type, note)}
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

// ── Empty-state illustration (reuses PipelineMaterialize from the tour) ──────
function EmptyIllustration() {
  // Small inline animation echoing PipelineMaterialize from the tour — column
  // pills fading in to suggest the shape of a pipeline. Kept lightweight so
  // the empty state stays calm.
  return (
    <div style={{
      width: "100%", maxWidth: 360, margin: "0 auto 20px",
      display: "flex", gap: 8, justifyContent: "center",
    }}>
      <style>{`
        @keyframes ot-empty-col {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .ot-empty-col-0 { animation: ot-empty-col 0.6s ease-out 0s both; }
        .ot-empty-col-1 { animation: ot-empty-col 0.6s ease-out 0.18s both; }
        .ot-empty-col-2 { animation: ot-empty-col 0.6s ease-out 0.36s both; }
      `}</style>
      {["Identify", "Submit", "Discuss"].map((label, i) => (
        <div key={label} className={`ot-empty-col-${i}`} style={{
          flex: 1,
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 8,
          padding: "8px 10px",
          minHeight: 86,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
            <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: "var(--color-grey)", letterSpacing: "0.06em" }}>{label}</span>
          </div>
          <div style={{ height: 18, borderRadius: 4, background: "var(--color-cream)", border: "0.5px dashed var(--color-border)" }} />
          {i === 1 && <div style={{ height: 18, borderRadius: 4, background: "var(--color-cream)", border: "0.5px dashed var(--color-border)" }} />}
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PipelineBoard({ pipelines, selectedPipeline, targets, onTargetClick, onNewTarget, onNewPipeline, onStageChange, onFollowUp }: Props) {
  const [followedUpIds, setFollowedUpIds] = useState<Set<string>>(new Set());

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStageId = destination.droppableId;
    const target = targets.find(t => t.id === draggableId);
    if (!target || target.stage_id === newStageId) return;
    // Moving to a new column is the new "touch" — the old column's follow-up
    // is no longer current. Drop the in-memory marker; the server-side clear
    // happens inside the OutreachClient `onStageChange` handler.
    setFollowedUpIds(prev => {
      if (!prev.has(draggableId)) return prev;
      const next = new Set(prev);
      next.delete(draggableId);
      return next;
    });
    onStageChange(draggableId, newStageId);
  }

  async function handleLogFollowUp(target: OutreachTarget, type: ContactActivityType, note: string) {
    onFollowUp(target.id);
    setFollowedUpIds(prev => new Set(prev).add(target.id));
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const now = new Date().toISOString();
    if (target.contact_id) {
      await supabase.from("contact_activities").insert({
        user_id:     user.id,
        contact_id:  target.contact_id,
        type,
        content:     note.trim() || `Follow-up on ${target.name}`,
        occurred_at: now,
      });
      await supabase.from("contacts").update({ last_contacted_at: now }).eq("id", target.contact_id);
    }
    window.dispatchEvent(new CustomEvent("outreach:followup-logged", { detail: { id: target.id, name: target.name } }));
  }

  if (selectedPipeline) {
    const activeStages  = selectedPipeline.stages.filter(s => !s.is_outcome);
    const outcomeStages = selectedPipeline.stages.filter(s =>  s.is_outcome);

    // Per-pipeline empty state — rich EmptyState with an animated illustration
    // and a single CTA to add the first target in this pipeline.
    if (targets.length === 0) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", padding: "24px" }}>
          <div style={{ width: "100%", maxWidth: 520 }}>
            <EmptyIllustration />
            <EmptyState
              icon={<Send size={22} strokeWidth={1.5} color={selectedPipeline.color} />}
              heading={`No targets in ${selectedPipeline.name} yet`}
              body="A target is a specific person, gallery, fair, or publication you're working in this pipeline. Add the first one to give yourself something to push forward."
              action={{
                label:           "+ New target",
                onClick:         () => onNewTarget(selectedPipeline.id, activeStages[0]?.id),
                background:      selectedPipeline.color,
                backgroundHover: selectedPipeline.color,
              }}
              ashPrompt={`Help me identify targets to add to my "${selectedPipeline.name}" pipeline based on my practice.`}
              tips={[
                "Start with one real opportunity — a single gallery, fair, or publication you'd like to work with.",
                "Drag cards between stages to advance them. Hover the right edge of a card to log a follow-up inline.",
                "Add a results deadline and a link (submission form, listing) so the card carries everything you need.",
              ]}
            />
          </div>
        </div>
      );
    }

    return (
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
                  onLogFollowUp={handleLogFollowUp}
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
                      onLogFollowUp={handleLogFollowUp}
                      followedUpIds={followedUpIds}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </DragDropContext>
    );
  }

  // All pipelines — no pipelines yet
  if (pipelines.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          <EmptyIllustration />
          <EmptyState
            icon={<Send size={22} strokeWidth={1.5} color="var(--color-sage)" />}
            heading="Create your first pipeline"
            body="Outreach pipelines track your gallery submissions, press pitches, fair applications, and client pursuits — from first contact to closed deal. Each pipeline has its own stages you define."
            action={onNewPipeline ? { label: "+ New pipeline", onClick: onNewPipeline } : undefined}
            ashPrompt="I'm setting up outreach in Perennial. What pipelines should a furniture/object designer have? Walk me through how to set up a gallery outreach pipeline."
            tips={[
              "Create a pipeline for each type of outreach — e.g. 'Gallery submissions', 'Press pitches', 'Fair applications'.",
              "Each pipeline has stages you define (e.g. Identified → Reached out → In conversation → Proposal sent → Closed).",
              "Perennial tracks when you last touched each target so nothing slips through the cracks.",
            ]}
          />
        </div>
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
              onLogFollowUp={handleLogFollowUp}
              followedUpIds={followedUpIds}
            />
          );
        })}
      </div>
    </div>
  );
}
