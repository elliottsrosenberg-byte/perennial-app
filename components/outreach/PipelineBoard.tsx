"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachPipeline, PipelineStage, OutreachTarget, MetaStage, ContactActivityType } from "@/types/database";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, X, Send } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

// Distinct follow-up colour. Intentionally NOT sage (overloaded with "healthy
// project" semantics) and NOT amber/red-orange (already used for lead/stale
// states). A warm copper signals "outreach touch" without echoing any other
// surface in the app.
const FOLLOWUP_COPPER       = "#c97a4a";
const FOLLOWUP_COPPER_TINT  = "rgba(201,122,74,0.16)";
const FOLLOWUP_COPPER_REVEAL = "rgba(201,122,74,0.22)";
const FOLLOWUP_COPPER_LOGGED = "rgba(201,122,74,0.28)";

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

// Pixel thresholds for the swipe-right follow-up gesture.
// COMMIT_AT: distance past which release fires a follow-up.
// MAX_PULL: maximum visible offset, applied via rubber-banding so a vigorous
//           drag still feels bounded.
const SWIPE_COMMIT_AT = 64;
const SWIPE_MAX_PULL  = 110;

function TargetCard({
  target,
  pipelineBadge,
  isDragging,
  isOutcome,
  isFollowedUp,
  onClick,
  onOpenFollowUp,
  onQuickFollowUp,
}: {
  target: OutreachTarget;
  pipelineBadge?: { name: string; color: string };
  isDragging: boolean;
  isOutcome: boolean;
  isFollowedUp: boolean;
  onClick: () => void;
  /** Opens the full follow-up modal (notes, type). Triggered by clicking
   *  the right-edge handle without a drag. */
  onOpenFollowUp?: () => void;
  /** Logs a quick follow-up (just bumps last_touched_at, no modal).
   *  Triggered by a swipe-right gesture past the commit threshold. */
  onQuickFollowUp?: () => void;
}) {
  const [cardHov, setCardHov] = useState(false);
  const [barHov,  setBarHov]  = useState(false);

  // ── Swipe state ─────────────────────────────────────────────────────────────
  // `offset`: current translateX in px (rubber-banded from raw drag delta).
  // `committed`: latched true the moment a release crosses the threshold — we
  //   want the celebratory animation to keep playing even though offset eases
  //   back to 0. Auto-clears after the animation window.
  const [offset,    setOffset]    = useState(0);
  const [committed, setCommitted] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    active: boolean;        // hijacked the gesture (we own pointer capture)
    direction: "?" | "h" | "v"; // locked once we decide what kind of drag this is
    pointerId: number;
  } | null>(null);

  const linkedLabel = target.contact
    ? `${target.contact.first_name} ${target.contact.last_name}`
    : target.company?.name ?? null;

  const recentlyTouched = Math.floor((Date.now() - new Date(target.last_touched_at).getTime()) / 86400000) === 0;
  const showLogged = isFollowedUp || recentlyTouched || committed;

  // Right-edge "swipe handle". Visible all the time on active cards so the
  // affordance is discoverable; widens on hover to invite the gesture.
  const barWidth = barHov && !showLogged && offset === 0 ? 14 : 8;
  const barColor = showLogged
    ? FOLLOWUP_COPPER_LOGGED
    : barHov && offset === 0
      ? FOLLOWUP_COPPER
      : FOLLOWUP_COPPER_TINT;

  // ── Drag handlers on the swipe handle ───────────────────────────────────────
  function onHandlePointerDown(e: React.PointerEvent) {
    if (isOutcome || !onQuickFollowUp) return;
    e.stopPropagation();
    // Capture so we keep receiving move events even if the pointer wanders off
    // the handle (which happens immediately — the card slides right under it).
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      direction: "?",
      pointerId: e.pointerId,
    };
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // Direction lock: first ~6px decides. Right-skewed → swipe gesture;
    // anything else (left, vertical, diagonal) → cancel and let the user click.
    if (d.direction === "?") {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (dx > 0 && dx > Math.abs(dy)) {
        d.direction = "h";
        d.active = true;
      } else {
        d.direction = "v";
        return;
      }
    }
    if (d.direction !== "h") return;
    // Rubber-banded translation: linear up to MAX_PULL/2, then resistance.
    const raw = Math.max(0, dx);
    const eased = raw <= SWIPE_MAX_PULL
      ? raw
      : SWIPE_MAX_PULL + (raw - SWIPE_MAX_PULL) * 0.25;
    setOffset(Math.min(eased, SWIPE_MAX_PULL + 20));
  }
  function endDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    const wasActive  = d.active;
    const finalDelta = e.clientX - d.startX;
    dragRef.current = null;

    // Pure click (no drag past direction-lock): open the full modal.
    if (!wasActive) {
      if (Math.abs(finalDelta) < 4 && onOpenFollowUp) onOpenFollowUp();
      return;
    }
    if (finalDelta >= SWIPE_COMMIT_AT && onQuickFollowUp) {
      setCommitted(true);
      onQuickFollowUp();
      // Animate fully open for the celebratory beat, then ease back.
      setOffset(SWIPE_MAX_PULL);
      setTimeout(() => setOffset(0), 220);
      // Release the "committed" latch after the colour-flash settles.
      setTimeout(() => setCommitted(false), 1400);
    } else {
      setOffset(0);
    }
  }

  // Belt-and-braces: if the gesture is cancelled by the OS / browser (alt-tab,
  // scroll interrupt) make sure we don't strand the card mid-swipe.
  useEffect(() => {
    if (offset === 0) return;
    function cancel() {
      if (!dragRef.current) return;
      dragRef.current = null;
      setOffset(0);
    }
    window.addEventListener("pointercancel", cancel);
    return () => window.removeEventListener("pointercancel", cancel);
  }, [offset]);

  const isPulling = offset > 0;

  return (
    // Outer wrapper holds the reveal layer behind the card so it appears
    // *under* the card as the card slides right. The reveal copy lives here.
    <div style={{ position: "relative", width: "100%" }}>
      {/* Reveal layer (behind card) — copper wash + label that becomes visible
          as the card slides right. Pointer events disabled so it never blocks
          the handle. */}
      {!isOutcome && onQuickFollowUp && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0, bottom: 0, left: 0, right: 0,
            borderRadius: 10,
            background: isPulling || committed
              ? `linear-gradient(90deg, ${FOLLOWUP_COPPER_TINT} 0%, ${FOLLOWUP_COPPER_REVEAL} 70%, ${FOLLOWUP_COPPER} 100%)`
              : "transparent",
            display: "flex", alignItems: "center", justifyContent: "flex-start",
            paddingLeft: 14,
            color: "white",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
            opacity: isPulling || committed ? 1 : 0,
            transition: "opacity 0.15s ease",
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            opacity: offset > 24 || committed ? 1 : 0,
            transform: `translateX(${Math.min(offset - 18, 24)}px)`,
            transition: "opacity 0.12s ease",
          }}>
            <svg width="10" height="8" viewBox="0 0 8 6" fill="none">
              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {offset >= SWIPE_COMMIT_AT || committed ? "Release to log" : "Keep pulling…"}
          </span>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (!isDragging && offset === 0) onClick(); }}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isDragging) onClick(); } }}
        onMouseEnter={() => setCardHov(true)}
        onMouseLeave={() => { setCardHov(false); setBarHov(false); }}
        style={{
          position: "relative",
          width: "100%",
          textAlign: "left",
          borderRadius: 10,
          padding: "10px 12px",
          paddingRight: 18,
          background: isDragging ? "var(--color-cream)" : "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          boxShadow: isDragging
            ? "0 8px 24px rgba(31,33,26,0.18)"
            : isPulling
              ? "0 6px 18px rgba(201,122,74,0.22)"
              : cardHov ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
          cursor: "inherit",
          transform: `translateX(${offset}px)`,
          // Snap-back gets a spring-ish ease; live drag is instant for tactility.
          transition: isPulling
            ? "box-shadow 0.1s ease, background 0.1s ease"
            : "transform 0.28s cubic-bezier(0.34, 1.4, 0.5, 1), box-shadow 0.18s ease, background 0.1s ease",
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
        <p style={{
          fontSize: 10, marginTop: 6,
          color: showLogged ? FOLLOWUP_COPPER : "var(--color-grey)",
          fontWeight: showLogged ? 600 : 400,
          transition: "color 0.18s ease",
        }}>
          {committed ? "Followed up · today" : fmtLastTouch(target.last_touched_at)}
        </p>

        {/* Swipe handle — right edge, active stages only. Doubles as click
            target for the detailed modal and drag origin for the quick-log
            swipe. */}
        {!isOutcome && onQuickFollowUp && (
          <div
            data-tour-target={undefined}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onMouseEnter={e => { e.stopPropagation(); setBarHov(true); }}
            onMouseLeave={e => { e.stopPropagation(); setBarHov(false); }}
            title={showLogged ? "Followed up — pull to log another" : "Pull right to log follow-up"}
            style={{
              position: "absolute",
              right: 0, top: 0, bottom: 0,
              width: barWidth,
              borderRadius: "0 10px 10px 0",
              background: barColor,
              cursor: isPulling ? "grabbing" : "grab",
              transition: isPulling
                ? "background 0.12s ease"
                : "background 0.15s ease, width 0.18s ease",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              touchAction: "pan-y",
            }}
          >
            {/* Vertical grip lines — telegraph that this is a draggable handle */}
            {!showLogged && (
              <span aria-hidden style={{
                display: "flex", flexDirection: "column", gap: 2,
                opacity: barHov ? 0.9 : 0.55,
                transition: "opacity 0.15s ease",
              }}>
                <span style={{ width: 2, height: 2, borderRadius: 1, background: "white" }} />
                <span style={{ width: 2, height: 2, borderRadius: 1, background: "white" }} />
                <span style={{ width: 2, height: 2, borderRadius: 1, background: "white" }} />
              </span>
            )}
            {showLogged && (
              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M1 3L3 5L7 1" stroke={FOLLOWUP_COPPER} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {/* Hover hint tooltip — only when card is at rest and not yet logged */}
            {barHov && !showLogged && offset === 0 && (
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
                Swipe right · click for note
              </span>
            )}
          </div>
        )}
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
  onOpenFollowUp,
  onQuickFollowUp,
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
  onQuickFollowUp: (t: OutreachTarget) => void;
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
                        onQuickFollowUp={isOutcome ? undefined : () => onQuickFollowUp(t)}
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
  onOpenFollowUp,
  onQuickFollowUp,
  followedUpIds,
}: {
  label: string;
  targets: OutreachTarget[];
  showPipelineBadge: boolean;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  onTargetClick: (t: OutreachTarget) => void;
  onAdd: () => void;
  onOpenFollowUp: (t: OutreachTarget) => void;
  onQuickFollowUp: (t: OutreachTarget) => void;
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
                onOpenFollowUp={() => onOpenFollowUp(t)}
                onQuickFollowUp={() => onQuickFollowUp(t)}
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

  // Swipe-right gesture: log a quick follow-up (just bumps last_touched_at),
  // no modal. The clicked-bar path still opens the full modal for adding type
  // + notes via `setFollowUpTarget`.
  function handleQuickFollowUp(target: OutreachTarget) {
    handleLogged(target.id);
    // Best-effort activity entry — same shape FollowUpModal writes, but with
    // an autogenerated note. Failure is silent on purpose: the visible UI
    // change (last-touched colour, copper checkmark) is the real ack.
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !target.contact_id) return;
      const now = new Date().toISOString();
      supabase.from("contact_activities").insert({
        user_id:     user.id,
        contact_id:  target.contact_id,
        type:        "note" as ContactActivityType,
        content:     `Quick follow-up logged for ${target.name}`,
        occurred_at: now,
      });
      supabase.from("contacts").update({ last_contacted_at: now }).eq("id", target.contact_id);
    });
    window.dispatchEvent(new CustomEvent("outreach:followup-logged", { detail: { id: target.id, name: target.name } }));
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
                    onQuickFollowUp={handleQuickFollowUp}
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
                        onQuickFollowUp={handleQuickFollowUp}
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
    <>
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
                onOpenFollowUp={setFollowUpTarget}
                onQuickFollowUp={handleQuickFollowUp}
                followedUpIds={followedUpIds}
              />
            );
          })}
        </div>
      </div>
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
