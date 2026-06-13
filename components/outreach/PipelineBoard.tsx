"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, OutreachTarget, MetaStage, ContactActivityType } from "@/types/database";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Send, Check, Clock, Search, Moon, MoreHorizontal } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Select from "@/components/ui/Select";

// The Ether — a per-pipeline "parking lot" for paused targets. Visually
// distinct via a light-blue tint so cards inside it read as "set down, not
// thrown away". A special droppable id lets one DragDropContext handle drags
// between stage columns and the Ether without extra plumbing.
const ETHER_DROPPABLE_ID = "__ether__";
// Prefix marking the meta-stage droppables used in the all-pipelines view.
// These columns aggregate stages from many pipelines, so they can't change a
// card's stage_id on drop — we only use them so `Draggable`s have a valid
// parent (and to support drag-to-Ether from this view).
const META_DROPPABLE_PREFIX = "__meta__:";
const ETHER_BG           = "rgba(83, 134, 196, 0.06)";
const ETHER_BG_HOVER     = "rgba(83, 134, 196, 0.16)";
const ETHER_BLUE         = "#5386c4";

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
  /** Stage CRUD on the column header. Each handler resolves locally + on
   *  the server inside OutreachClient; the board itself just dispatches. */
  onStageRename?: (stageId: string, name: string) => void;
  onStageDelete?: (stageId: string, moveTargetsToStageId: string | null) => void;
  onStageCreate?: (pipelineId: string, isOutcome: boolean) => Promise<PipelineStage | null>;
  /** Bumps last_followup_at on the target (NOT last_touched_at — that's a
   *  general "anything happened" marker). The board uses this for the "I've
   *  been followed up today" treatment. */
  onFollowUp: (targetId: string) => void;
  /** Sets `ether` on the target. When un-ethering AND a new stage is
   *  provided, also updates stage_id (so dragging from the Ether into a
   *  stage column flips both flags atomically). */
  onEtherToggle: (targetId: string, ether: boolean, newStageId?: string) => void;
  /** When true, render the cross-pipeline "All Ether" view instead of any
   *  pipeline / meta-stage board. */
  etherView?: boolean;
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
    : target.organization?.name ?? null;

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

  const handleWidth = (zoneHov || open) && !showLogged ? 104 : 6;
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
  siblingStages,
  onTargetClick,
  onNewTarget,
  onLogFollowUp,
  onStageRename,
  onStageDelete,
  followedUpIds,
}: {
  stage: PipelineStage;
  targets: OutreachTarget[];
  pipelineColor: string;
  isOutcome: boolean;
  showPipelineBadge: boolean;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  /** Other stages in the same pipeline + section — fed into the "delete with
   *  targets" picker so the user can pick where to move targets. */
  siblingStages: PipelineStage[];
  onTargetClick: (t: OutreachTarget) => void;
  onNewTarget: () => void;
  onLogFollowUp: (t: OutreachTarget, type: ContactActivityType, note: string) => Promise<void>;
  onStageRename?: (stageId: string, name: string) => void;
  onStageDelete?: (stageId: string, moveTargetsToStageId: string | null) => void;
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
          <StageColumnHeader
            stage={stage}
            targets={targets}
            pipelineColor={pipelineColor}
            isOutcome={isOutcome}
            siblingStages={siblingStages}
            onAddTarget={isOutcome ? null : onNewTarget}
            onRename={onStageRename}
            onDelete={onStageDelete}
          />

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
              <EmptyStageDropzone
                stageName={stage.name}
                isOutcome={isOutcome}
                pipelineColor={pipelineColor}
                onAdd={onNewTarget}
              />
            )}
          </div>
        </div>
      )}
    </Droppable>
  );
}

// Hover-revealed CTA shown in empty stage columns. Resting state is the same
// dashed "—" placeholder; on hover it morphs into a real click target inviting
// the user to add a target right where it belongs.
// ── Stage column header ─────────────────────────────────────────────────────
// Click name to rename inline. Hover-revealed 3-dot menu offers Delete; if
// the stage has targets, a small picker prompts the user to choose where to
// move them before the row goes away.

function StageColumnHeader({
  stage, targets, pipelineColor, isOutcome, siblingStages,
  onAddTarget, onRename, onDelete,
}: {
  stage: PipelineStage;
  targets: OutreachTarget[];
  pipelineColor: string;
  isOutcome: boolean;
  siblingStages: PipelineStage[];
  onAddTarget: (() => void) | null;
  onRename?: (stageId: string, name: string) => void;
  onDelete?: (stageId: string, moveTargetsToStageId: string | null) => void;
}) {
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState(stage.name);
  const [hovered,    setHovered]    = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moveTo,     setMoveTo]     = useState<string>("");

  useEffect(() => { setDraft(stage.name); }, [stage.name]);

  function commitRename() {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === stage.name) { setDraft(stage.name); return; }
    onRename?.(stage.id, next);
  }

  function startDelete() {
    setMenuOpen(false);
    if (targets.length === 0) {
      onDelete?.(stage.id, null);
      return;
    }
    setMoveTo(siblingStages[0]?.id ?? "");
    setConfirming(true);
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, position: "relative" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: isOutcome ? "rgba(31,33,26,0.25)" : pipelineColor, flexShrink: 0 }} />
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") { setDraft(stage.name); setEditing(false); }
            }}
            autoFocus
            style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
              color: isOutcome ? "var(--color-grey)" : "var(--color-charcoal)",
              background: "var(--color-warm-white)",
              border: `0.5px solid ${isOutcome ? "var(--color-border)" : pipelineColor}55`,
              borderRadius: 4,
              padding: "1px 4px",
              outline: "none",
              fontFamily: "inherit",
              flex: 1, minWidth: 0,
              width: "100%",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => onRename && setEditing(true)}
            title={onRename ? "Click to rename" : undefined}
            style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
              color: isOutcome ? "var(--color-grey)" : "var(--color-charcoal)",
              background: "transparent", border: "none", padding: 0,
              cursor: onRename ? "text" : "default", fontFamily: "inherit",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 140,
              textAlign: "left",
            }}
          >
            {stage.name}
          </button>
        )}
        {targets.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{targets.length}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
        {onDelete && (hovered || menuOpen) && (
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Stage options"
            style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", background: menuOpen ? "var(--color-cream)" : "transparent", cursor: "pointer", color: "var(--color-grey)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--color-charcoal)"; e.currentTarget.style.background = "var(--color-cream)"; }}
            onMouseLeave={e => { if (!menuOpen) { e.currentTarget.style.color = "var(--color-grey)"; e.currentTarget.style.background = "transparent"; } }}
          >
            <MoreHorizontal size={12} />
          </button>
        )}
        {onAddTarget && (
          <button type="button" onClick={onAddTarget}
            style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-grey)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--color-charcoal)"; e.currentTarget.style.background = "var(--color-cream)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--color-grey)"; e.currentTarget.style.background = "transparent"; }}>
            <Plus size={12} />
          </button>
        )}
      </div>

      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)",
            zIndex: 41, minWidth: 160,
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-overlay)",
            overflow: "hidden",
            padding: 4,
          }}>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); setEditing(true); }}
              style={menuItemStyle()}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Rename stage
            </button>
            <button
              type="button"
              onClick={startDelete}
              style={menuItemStyle({ danger: true })}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Delete stage
            </button>
          </div>
        </>
      )}

      {confirming && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(31,33,26,0.5)", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirming(false); }}
        >
          <div style={{ width: "100%", maxWidth: 380, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 14, padding: "20px 22px" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 6 }}>
              Delete &ldquo;{stage.name}&rdquo;?
            </p>
            <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.55, marginBottom: 14 }}>
              {targets.length} target{targets.length === 1 ? "" : "s"} in this stage. Pick where they should move:
            </p>
            {siblingStages.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <Select
                  value={moveTo}
                  onChange={setMoveTo}
                  options={siblingStages.map(s => ({ value: s.id, label: s.name }))}
                />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--color-red-orange)", marginBottom: 16 }}>
                No other {isOutcome ? "outcome" : "active"} stage to move targets into. Add another stage first.
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{ padding: "8px 14px", fontSize: 13, borderRadius: 8, color: "#6b6860", border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={siblingStages.length === 0}
                onClick={() => { setConfirming(false); onDelete?.(stage.id, moveTo || null); }}
                style={{
                  padding: "8px 14px", fontSize: 13, fontWeight: 500, borderRadius: 8,
                  color: "white", background: "var(--color-red-orange)",
                  border: "none", cursor: siblingStages.length === 0 ? "not-allowed" : "pointer",
                  opacity: siblingStages.length === 0 ? 0.5 : 1,
                  fontFamily: "inherit",
                }}
              >
                Move & delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "+ Add stage" column — slim ghost column at the right edge of each section.
// Hover for emphasis; click creates a new stage and the parent's setPipelines
// makes the column render with the default name pre-selected for renaming.

function AddStageColumn({ pipelineColor, outcome, onAdd }: {
  pipelineColor: string;
  outcome?: boolean;
  onAdd: () => Promise<PipelineStage | null> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        await onAdd();
        setBusy(false);
      }}
      title={outcome ? "Add outcome stage" : "Add stage"}
      style={{
        width: 100,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        padding: "6px 8px",
        background: "transparent",
        border: `0.5px dashed ${outcome ? "var(--color-border-strong)" : pipelineColor + "55"}`,
        borderRadius: 8,
        color: outcome ? "var(--color-grey)" : pipelineColor,
        fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
        cursor: busy ? "default" : "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
        opacity: busy ? 0.5 : 1,
        transition: "background 0.12s ease, border 0.12s ease",
      }}
      onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = "var(--color-cream)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Plus size={11} />
      {busy ? "Adding…" : (outcome ? "Outcome" : "Stage")}
    </button>
  );
}

function menuItemStyle(opts?: { danger?: boolean }): React.CSSProperties {
  return {
    width: "100%", textAlign: "left",
    padding: "7px 10px", fontSize: 12, borderRadius: 6,
    background: "transparent", border: "none", cursor: "pointer",
    color: opts?.danger ? "var(--color-red-orange)" : "var(--color-text-primary)",
    fontFamily: "inherit",
  };
}

function EmptyStageDropzone({ stageName, isOutcome, pipelineColor, onAdd }: {
  stageName: string;
  isOutcome: boolean;
  pipelineColor: string;
  onAdd: () => void;
}) {
  const [hov, setHov] = useState(false);
  // Outcomes don't get a "+ Add" affordance — outcomes are end-states, not
  // somewhere you'd seed a new target. Show the resting "—" only.
  if (isOutcome) {
    return (
      <div style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "var(--color-grey)" }}>—</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        padding: "14px 12px",
        borderRadius: 10,
        border: `1px dashed ${hov ? pipelineColor + "88" : "var(--color-border)"}`,
        background: hov ? pipelineColor + "0c" : "transparent",
        textAlign: "center",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
        color: hov ? pipelineColor : "var(--color-grey)",
        fontSize: 11,
        fontWeight: hov ? 500 : 400,
        outline: "none",
      }}
    >
      {hov ? `+ Add target to ${stageName}` : "—"}
    </button>
  );
}

// ── Meta-stage column (All-pipelines view) ────────────────────────────────────
// Aggregates stages from many pipelines, so it can't accept stage-changing
// drops. It IS a Droppable, but only so its cards can be Draggables (so the
// user can drag them down to the Ether). Drops onto this column itself are
// no-ops (handled in `handleDragEnd`).

function MetaColumn({
  metaKey,
  label,
  targets,
  showPipelineBadge,
  allPipelines,
  onTargetClick,
  onAdd,
  onLogFollowUp,
  followedUpIds,
}: {
  metaKey: MetaStage;
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
      <Droppable droppableId={`${META_DROPPABLE_PREFIX}${metaKey}`}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}
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
                        isOutcome={false}
                        isFollowedUp={followedUpIds.has(t.id)}
                        onClick={() => onTargetClick(t)}
                        onLogFollowUp={(type, note) => onLogFollowUp(t, type, note)}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
            {targets.length === 0 && (
              <div style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed var(--color-border)", textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--color-grey)" }}>Empty</p>
              </div>
            )}
          </div>
        )}
      </Droppable>
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

// ── The Ether ────────────────────────────────────────────────────────────────
// A per-pipeline (or global) parking lot for paused targets. Renders as a
// single wrapping drop zone — intentionally looser than the strict stage
// columns above it.

function EtherSection({
  cards, search, onSearch, onTargetClick, onLogFollowUp, followedUpIds,
  allPipelines, showPipelineBadge, label,
}: {
  cards: OutreachTarget[];
  search: string;
  onSearch: (q: string) => void;
  onTargetClick: (t: OutreachTarget) => void;
  onLogFollowUp: (t: OutreachTarget, type: ContactActivityType, note: string) => Promise<void>;
  followedUpIds: Set<string>;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  showPipelineBadge: boolean;
  label: string;
}) {
  const q = search.trim().toLowerCase();
  const filtered = q
    ? cards.filter(t => {
        const linked = t.contact ? `${t.contact.first_name} ${t.contact.last_name}` : "";
        return t.name.toLowerCase().includes(q)
          || (t.location ?? "").toLowerCase().includes(q)
          || linked.toLowerCase().includes(q)
          || (t.organization?.name ?? "").toLowerCase().includes(q);
      })
    : cards;

  return (
    <Droppable droppableId={ETHER_DROPPABLE_ID}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          style={{
            background: snapshot.isDraggingOver ? ETHER_BG_HOVER : ETHER_BG,
            border: `0.5px solid ${snapshot.isDraggingOver ? ETHER_BLUE + "55" : "rgba(83, 134, 196, 0.18)"}`,
            borderRadius: 12,
            padding: "14px 16px 16px",
            transition: "background 0.18s ease, border-color 0.18s ease",
            minHeight: 140,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Moon size={11} strokeWidth={1.75} style={{ color: ETHER_BLUE }} />
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: ETHER_BLUE }}>
              {label}
            </span>
            <span style={{ fontSize: 10, color: "var(--color-grey)" }}>
              {cards.length} paused
            </span>
            <div style={{ marginLeft: "auto", position: "relative", width: 200 }}>
              <Search size={11} strokeWidth={1.75} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-grey)", pointerEvents: "none" }} />
              <input
                type="text"
                value={search}
                onChange={e => onSearch(e.target.value)}
                placeholder="Search the ether…"
                style={{
                  width: "100%",
                  padding: "4px 8px 4px 26px",
                  fontSize: 11,
                  borderRadius: 7,
                  background: "var(--color-warm-white)",
                  border: "0.5px solid var(--color-border)",
                  color: "var(--color-charcoal)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Cards — wrapping flex, intentionally looser than stage columns */}
          {cards.length === 0 ? (
            <div style={{ padding: "18px 12px", textAlign: "center", fontSize: 11, color: "var(--color-grey)" }}>
              Drag a card here to pause it. The Ether is for targets you&apos;re not actively working but don&apos;t want to archive.
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "18px 12px", textAlign: "center", fontSize: 11, color: "var(--color-grey)" }}>
              No matches for &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {filtered.map((t, index) => {
                const tp = allPipelines.find(p => p.id === t.pipeline_id);
                return (
                  <Draggable key={t.id} draggableId={t.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        style={{
                          ...dragProvided.draggableProps.style,
                          cursor: dragSnapshot.isDragging ? "grabbing" : "grab",
                          width: 210,
                        }}
                      >
                        <TargetCard
                          target={t}
                          pipelineBadge={showPipelineBadge && tp ? { name: tp.name, color: tp.color } : undefined}
                          isDragging={dragSnapshot.isDragging}
                          isOutcome={true /* suppresses the follow-up handle — Ether cards are paused */}
                          isFollowedUp={followedUpIds.has(t.id)}
                          onClick={() => onTargetClick(t)}
                        />
                      </div>
                    )}
                  </Draggable>
                );
              })}
            </div>
          )}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PipelineBoard({
  pipelines, selectedPipeline, targets,
  onTargetClick, onNewTarget, onNewPipeline,
  onStageChange, onStageRename, onStageDelete, onStageCreate,
  onFollowUp, onEtherToggle, etherView,
}: Props) {
  const [followedUpIds, setFollowedUpIds] = useState<Set<string>>(new Set());
  const [etherSearch,   setEtherSearch]   = useState("");

  function clearFollowupMarker(id: string) {
    setFollowedUpIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination, source } = result;
    const target = targets.find(t => t.id === draggableId);
    if (!target) return;

    const destId = destination.droppableId;
    const srcId  = source.droppableId;

    // Drop INTO the Ether — pause the card. Keep stage_id intact so it
    // remembers where to return.
    if (destId === ETHER_DROPPABLE_ID) {
      if (target.ether) return;
      clearFollowupMarker(draggableId);
      onEtherToggle(draggableId, true);
      return;
    }
    // Drop FROM the Ether into a meta-stage column (all-pipelines view) —
    // un-ether but keep the original stage_id; we can't infer a real stage
    // from a meta-stage aggregate.
    if (srcId === ETHER_DROPPABLE_ID && destId.startsWith(META_DROPPABLE_PREFIX)) {
      clearFollowupMarker(draggableId);
      onEtherToggle(draggableId, false);
      return;
    }
    // Drop FROM the Ether into a real stage column — un-ether AND set the
    // new stage in one atomic update.
    if (srcId === ETHER_DROPPABLE_ID && destId !== ETHER_DROPPABLE_ID) {
      clearFollowupMarker(draggableId);
      onEtherToggle(draggableId, false, destId);
      return;
    }

    // Drags into / out of meta-stage columns in the all-pipelines view are
    // no-ops — those columns are aggregates, not real stages.
    if (destId.startsWith(META_DROPPABLE_PREFIX) || srcId.startsWith(META_DROPPABLE_PREFIX)) {
      return;
    }

    // Regular stage-to-stage move.
    if (target.stage_id === destId) return;
    // Moving to a new column is the new "touch" — the old column's follow-up
    // is no longer current. Drop the in-memory marker; the server-side clear
    // happens inside the OutreachClient `onStageChange` handler.
    clearFollowupMarker(draggableId);
    onStageChange(draggableId, destId);
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

  // Global "All Ether" view — every paused target across pipelines in one
  // grid with the same search affordance. The cleanup view.
  if (etherView) {
    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          <EtherSection
            cards={targets}
            search={etherSearch}
            onSearch={setEtherSearch}
            onTargetClick={onTargetClick}
            onLogFollowUp={handleLogFollowUp}
            followedUpIds={followedUpIds}
            allPipelines={pipelines}
            showPipelineBadge
            label="All ether — paused"
          />
        </div>
      </DragDropContext>
    );
  }

  if (selectedPipeline) {
    const activeStages  = selectedPipeline.stages.filter(s => !s.is_outcome);
    const outcomeStages = selectedPipeline.stages.filter(s =>  s.is_outcome);
    const stageTargets  = targets.filter(t => !t.ether);
    const etherTargets  = targets.filter(t =>  t.ether);

    // Per-pipeline view always shows the stage columns — even with zero
    // targets — so the user can see the structure of their pipeline. Empty
    // columns reveal a hover dropzone (see DroppableColumn) inviting them to
    // add a target right where it belongs. The Ether sits below as a single
    // wrapping drop zone.

    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Stage columns — scrollable region that fills available space so
              the Ether (below) is pinned to the bottom of the viewport. */}
          <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto" }}>
            <div style={{ display: "flex", gap: 0, padding: "20px 20px 8px", minWidth: "max-content", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {activeStages.map(stage => (
                  <DroppableColumn
                    key={stage.id}
                    stage={stage}
                    targets={stageTargets.filter(t => t.stage_id === stage.id)}
                    pipelineColor={selectedPipeline.color}
                    isOutcome={false}
                    showPipelineBadge={false}
                    allPipelines={pipelines}
                    siblingStages={activeStages.filter(s => s.id !== stage.id)}
                    onTargetClick={onTargetClick}
                    onNewTarget={() => onNewTarget(selectedPipeline.id, stage.id)}
                    onLogFollowUp={handleLogFollowUp}
                    onStageRename={onStageRename}
                    onStageDelete={onStageDelete}
                    followedUpIds={followedUpIds}
                  />
                ))}
                {onStageCreate && (
                  <AddStageColumn pipelineColor={selectedPipeline.color}
                    onAdd={() => onStageCreate(selectedPipeline.id, false)} />
                )}
              </div>

              {/* Outcome columns — separated by a vertical rule */}
              {(outcomeStages.length > 0 || onStageCreate) && (
                <>
                  <div style={{ width: 1, background: "var(--color-border)", margin: "0 20px", alignSelf: "stretch", flexShrink: 0 }} />
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    {outcomeStages.map(stage => (
                      <DroppableColumn
                        key={stage.id}
                        stage={stage}
                        targets={stageTargets.filter(t => t.stage_id === stage.id)}
                        pipelineColor={selectedPipeline.color}
                        isOutcome={true}
                        showPipelineBadge={false}
                        allPipelines={pipelines}
                        siblingStages={outcomeStages.filter(s => s.id !== stage.id)}
                        onTargetClick={onTargetClick}
                        onNewTarget={() => onNewTarget(selectedPipeline.id, stage.id)}
                        onLogFollowUp={handleLogFollowUp}
                        onStageRename={onStageRename}
                        onStageDelete={onStageDelete}
                        followedUpIds={followedUpIds}
                      />
                    ))}
                    {onStageCreate && (
                      <AddStageColumn pipelineColor="var(--color-grey)"
                        outcome
                        onAdd={() => onStageCreate(selectedPipeline.id, true)} />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* The Ether — pinned to the bottom of the viewport. Capped height
              with internal scroll so a long parking lot doesn't push the
              stage columns offscreen. */}
          <div style={{ padding: "8px 20px 20px", flexShrink: 0, maxHeight: "38vh", overflowY: "auto" }}>
            <EtherSection
              cards={etherTargets}
              search={etherSearch}
              onSearch={setEtherSearch}
              onTargetClick={onTargetClick}
              onLogFollowUp={handleLogFollowUp}
              followedUpIds={followedUpIds}
              allPipelines={pipelines}
              showPipelineBadge={false}
              label="The Ether — paused"
            />
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

  // All pipelines — have pipelines but zero targets anywhere. Show the rich
  // EmptyState rather than the meta-stage grid (which would be five "—"
  // columns and look broken). Two CTAs because both on-ramps make sense at
  // this moment: add a target, or stand up another pipeline.
  if (targets.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          <EmptyIllustration />
          <EmptyState
            icon={<Send size={22} strokeWidth={1.5} color="var(--color-sage)" />}
            heading="No targets yet"
            body="You have pipelines set up — now add the actual galleries, fairs, publications, or clients you're chasing. One real opportunity is enough to get the system working for you."
            action={{
              label:   "+ New target",
              onClick: () => onNewTarget(),
            }}
            secondaryAction={onNewPipeline ? {
              label:   "+ New pipeline",
              onClick: onNewPipeline,
              icon:    <Plus size={12} />,
            } : undefined}
            ashPrompt="Help me identify the first targets to add to my outreach pipelines based on my practice."
            tips={[
              "Pick one pipeline and add the most obvious target — the gallery you've been thinking about, the editor you wish would cover you.",
              "Drag cards between stages to advance them. Hover the right edge of a card to log a follow-up inline.",
              "Add a results deadline and a link (submission form, listing) so the card carries everything you need.",
            ]}
          />
        </div>
      </div>
    );
  }

  // All pipelines — meta-stage columns + the Ether pinned to the bottom.
  // Cards are Draggable so users can drop them into the Ether from this view
  // too; the meta-stage columns themselves don't accept stage-changing drops
  // (see handleDragEnd).
  const allStageTargets = targets.filter(t => !t.ether);
  const allEtherTargets = targets.filter(t =>  t.ether);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 14, padding: "20px", minWidth: "max-content", alignItems: "flex-start" }}>
            {META_ORDER.map(meta => {
              const metaTargets = allStageTargets.filter(t => {
                const tp = pipelines.find(p => p.id === t.pipeline_id);
                const stage = tp?.stages.find(s => s.id === t.stage_id);
                return stage?.meta_stage === meta;
              });
              return (
                <MetaColumn
                  key={meta}
                  metaKey={meta}
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
        <div style={{ padding: "8px 20px 20px", flexShrink: 0, maxHeight: "38vh", overflowY: "auto" }}>
          <EtherSection
            cards={allEtherTargets}
            search={etherSearch}
            onSearch={setEtherSearch}
            onTargetClick={onTargetClick}
            onLogFollowUp={handleLogFollowUp}
            followedUpIds={followedUpIds}
            allPipelines={pipelines}
            showPipelineBadge
            label="The Ether — paused"
          />
        </div>
      </div>
    </DragDropContext>
  );
}
