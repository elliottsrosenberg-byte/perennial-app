"use client";

// Tier 2: progressive tooltips that run after "Get started" on the intro
// modal. Same spotlight-ring visual language as the projects/contacts tours
// so the three flows feel like one experience.
//
// The Outreach tour has an extra wrinkle: targets need a pipeline first.
// If the user has no pipelines, the tour starts at "+ New pipeline".
// If they already have at least one pipeline (e.g. seed data), the tour
// skips the pipeline-creation steps and starts at "+ New target".
//
// Action steps wait for real user events (no Next button); guided steps
// have a Next. The final step hands off to Ash with an outreach-specific
// CTA — Ash uses the user's onboarding profile to suggest the next moves
// across their pipelines.
//
// Triggers (window events fired from OutreachClient + TargetDetailPanel):
//   outreach:new-pipeline-opened → click-new-pipeline step → next
//   outreach:pipeline-created    → create-pipeline step → next
//   outreach:new-target-opened   → click-new-target step → next
//   outreach:target-created      → create-target step → next
//   outreach:target-detail-opened → open-target step → next
//
// Persistence: profiles.tour_visited.outreach_tour set when the tour ends.

import { useEffect, useState, useCallback, useRef } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

type AdvanceMode =
  | "click-new-pipeline"
  | "create-pipeline"
  | "click-new-target"
  | "create-target"
  | "open-target"
  | "next";

interface Step {
  id:          string;
  anchor:      string | null;
  title:       string;
  body:        string;
  hint?:       string;
  advance:     AdvanceMode;
  spotlight?:  boolean;
  /** Free-roam step: nothing dimmed, nothing spotlit. Callout pins to the
   *  bottom-right corner so the user can scan the whole panel before we
   *  start pointing at specific affordances. */
  freeRoam?:   boolean;
  /** True when this step only runs if the user starts with zero pipelines.
   *  At tour-start, if `hasPipelines === true`, we drop all steps where
   *  `requiresEmpty === true` from the rendered sequence. */
  requiresEmpty?: boolean;
  finalCta?:   { label: string; action: "ash-suggest-outreach" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "new-pipeline-button",
    anchor:  '[data-tour-target="outreach.new-pipeline-button"]',
    title:   "Start with a pipeline",
    body:    "A pipeline is a kind of outreach — gallery submissions, press pitches, fair applications. Each has stages you define. Create one to begin.",
    hint:    "Waiting for you to click + New pipeline…",
    advance: "click-new-pipeline",
    requiresEmpty: true,
  },
  {
    id:      "in-pipeline-modal",
    anchor:  '[data-tour-target="outreach.new-pipeline-modal"]',
    title:   "Name it. Pick stages.",
    body:    "Default stages — Identify, Submit, Discuss, Make it happen, Closed — work for most outreach. You can rename, reorder, or add your own later.",
    hint:    "Waiting for the pipeline to be created…",
    advance: "create-pipeline",
    spotlight: false,
    requiresEmpty: true,
  },
  {
    id:      "new-target-button",
    anchor:  '[data-tour-target="outreach.new-target-button"]',
    title:   "Add your first target",
    body:    "Targets are specific people, galleries, fairs, or publications you're working. Pick one real opportunity and add it to your pipeline.",
    hint:    "Waiting for you to click + New target…",
    advance: "click-new-target",
  },
  {
    id:      "in-target-modal",
    anchor:  '[data-tour-target="outreach.new-target-modal"]',
    title:   "Name and stage are enough",
    body:    "Location, linked contact, notes — fill those in later from the detail panel. The point is to capture the target so it's in your system.",
    hint:    "Waiting for the target to be created…",
    advance: "create-target",
    spotlight: false,
  },
  {
    id:      "first-card",
    anchor:  '[data-tour-target="outreach.first-card"]',
    title:   "Open the target",
    body:    "Click the card. The detail panel slides open — Canvas for your thinking, plus the full target file.",
    hint:    "Waiting for you to open it…",
    advance: "open-target",
  },
  {
    id:       "explore",
    anchor:   null,
    title:    "Take it in.",
    body:     "Left rail holds identity, stages, details, and a Canvas link. Ash sits at the top with a contextual prompt that changes based on stage and how stale the target is. Look around — hit Next when you're ready.",
    advance:  "next",
    freeRoam: true,
  },
  {
    id:      "stage-chips",
    anchor:  '[data-tour-target="outreach.detail-stages"]',
    title:   "Move it through stages",
    body:    "Click a stage chip to move the target. Outcome stages (closed-won, closed-lost) sit below the line — once you mark an outcome, the card retires from the active flow.",
    advance: "next",
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash plan your outreach",
    body:     "Ash knows your practice, your stage, and your channels. Ask it which pipelines you should run, who to target first, and what to say when you reach out.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Plan my outreach", action: "ash-suggest-outreach" },
  },
];

interface Highlight { top: number; left: number; w: number; h: number; radius: number; }
interface CalloutPos { top: number; left: number; }

function ringRadiusFor(el: HTMLElement, pad: number): number {
  const parentRect = el.getBoundingClientRect();

  function readRadius(node: HTMLElement): number {
    const parts = window.getComputedStyle(node)
      .borderRadius.split(/\s+/)
      .map((p) => parseFloat(p) || 0);
    return Math.max(0, ...parts);
  }
  function findRadius(node: HTMLElement, depth: number): { radius: number; rect: DOMRect } | null {
    const own = readRadius(node);
    if (own > 0) return { radius: own, rect: node.getBoundingClientRect() };
    if (depth <= 0) return null;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as HTMLElement;
      const found = findRadius(child, depth - 1);
      if (found) return found;
    }
    return null;
  }

  const found = findRadius(el, 3);
  if (!found) return pad;
  const { radius: raw, rect: srcRect } = found;

  // Only inherit a child's radius if that child roughly fills the parent —
  // otherwise a small pill chip inside a normal block would round the whole
  // ring into a giant blob.
  const sourceFillsParent =
    srcRect.width  >= parentRect.width  * 0.8 &&
    srcRect.height >= parentRect.height * 0.8;
  if (!sourceFillsParent) return pad;

  const isPill = raw >= Math.min(srcRect.width, srcRect.height) / 2 - 0.5;
  if (isPill) return Math.min(parentRect.width, parentRect.height) / 2 + pad;
  return raw + pad;
}

interface Props {
  /** If the user already has at least one pipeline at tour-start, the
   *  pipeline-creation steps are filtered out and the tour jumps straight
   *  to "+ New target". */
  hasPipelinesAtStart: boolean;
}

export default function OutreachTooltipTour({ hasPipelinesAtStart }: Props) {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);
  const targetRef = useRef<{ id: string; name: string; pipeline_name: string | null } | null>(null);

  // Filtered steps — drop pipeline-creation steps if the user already has at
  // least one pipeline. Frozen at tour-start so the index stays stable across
  // re-renders.
  const [steps] = useState<Step[]>(() =>
    hasPipelinesAtStart ? STEPS.filter((s) => !s.requiresEmpty) : STEPS
  );

  // Init: only start if not yet done AND a session event fires from the intro modal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("tour_visited, tour_dismissed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const visited = (data?.tour_visited ?? {}) as TourVisited;
      if (data?.tour_dismissed || visited.outreach_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("outreach-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("outreach-tooltips-start", start);
    };
  }, []);

  // Event-driven advance for action steps
  useEffect(() => {
    if (!active || hidden) return;

    function onNewPipelineOpen() {
      if (steps[stepIdx]?.advance === "click-new-pipeline") setStepIdx((i) => i + 1);
    }
    function onPipelineCreated() {
      if (steps[stepIdx]?.advance === "create-pipeline") setStepIdx((i) => i + 1);
    }
    function onNewTargetOpen() {
      if (steps[stepIdx]?.advance === "click-new-target") setStepIdx((i) => i + 1);
    }
    function onTargetCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; name?: string; pipeline_name?: string | null }>).detail;
      if (detail?.id && detail.name) {
        targetRef.current = {
          id: detail.id,
          name: detail.name,
          pipeline_name: detail.pipeline_name ?? null,
        };
      }
      if (steps[stepIdx]?.advance === "create-target") setStepIdx((i) => i + 1);
    }
    function onTargetDetailOpen() {
      if (steps[stepIdx]?.advance === "open-target") setStepIdx((i) => i + 1);
    }

    window.addEventListener("outreach:new-pipeline-opened",   onNewPipelineOpen);
    window.addEventListener("outreach:pipeline-created",      onPipelineCreated);
    window.addEventListener("outreach:new-target-opened",     onNewTargetOpen);
    window.addEventListener("outreach:target-created",        onTargetCreated);
    window.addEventListener("outreach:target-detail-opened",  onTargetDetailOpen);
    return () => {
      window.removeEventListener("outreach:new-pipeline-opened",   onNewPipelineOpen);
      window.removeEventListener("outreach:pipeline-created",      onPipelineCreated);
      window.removeEventListener("outreach:new-target-opened",     onNewTargetOpen);
      window.removeEventListener("outreach:target-created",        onTargetCreated);
      window.removeEventListener("outreach:target-detail-opened",  onTargetDetailOpen);
    };
  }, [active, hidden, stepIdx, steps]);

  // Position the spotlight + callout
  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = steps[stepIdx];
    if (!step) { setHighlight(null); setPos(null); return; }

    // Free-roam step: pin to bottom-right corner, no spotlight, no dim.
    if (step.freeRoam) {
      setHighlight(null);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({ top: vh - 240, left: vw - W - 24 });
      return;
    }

    if (!step.anchor) {
      setHighlight(null);
      setPos(null);
      return;
    }

    const el = document.querySelector<HTMLElement>(step.anchor);
    if (!el) { setHighlight(null); setPos(null); return; }

    const r = el.getBoundingClientRect();
    const useSpotlight = step.spotlight !== false;
    if (useSpotlight) {
      const pad = 4;
      setHighlight({
        top:    r.top - pad,
        left:   r.left - pad,
        w:      r.width + pad * 2,
        h:      r.height + pad * 2,
        radius: ringRadiusFor(el, pad),
      });
    } else {
      setHighlight(null);
    }

    const gap = 14;
    const H   = 200;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;

    let top  = r.bottom + gap;
    let left = r.left;
    if (top + H + 20 > vh)   top  = Math.max(20, r.top - H - gap);
    if (left + W + 20 > vw)  left = Math.max(20, r.right - W);
    left = Math.max(20, Math.min(vw - W - 20, left));
    top  = Math.max(20, Math.min(vh - 60, top));

    setPos({ top, left });
  }, [active, hidden, stepIdx, steps]);

  useEffect(() => {
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    const interval = window.setInterval(reposition, 350);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(interval);
    };
  }, [reposition]);

  async function markDone() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), outreach_tour: new Date().toISOString() };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  function dismiss() {
    setActive(false);
    setHidden(true);
    markDone();
  }

  function nextStep() {
    if (stepIdx >= steps.length - 1) { dismiss(); return; }
    setStepIdx((i) => i + 1);
  }

  function planOutreach() {
    const t = targetRef.current;
    const recentLine = t
      ? `I just added "${t.name}"${t.pipeline_name ? ` to my "${t.pipeline_name}" pipeline` : ""}. Use that as one data point — but think much broader.`
      : "";

    const prompt = [
      "I'm setting up outreach in Perennial and want your help thinking about what to run.",
      recentLine,
      "",
      "Based on my practice (use my onboarding profile — what I make, how I sell, where I am, my years in practice), please:",
      "1. Suggest 2–3 pipelines I should be running right now. Be specific: gallery submissions for what kind of galleries, press pitches to which kinds of publications, fair applications for which fairs, etc.",
      "2. For my top-priority pipeline, name 6–10 specific kinds of targets I should be working — by name where realistic, otherwise by clear profile.",
      "3. End with one sentence: which target should I touch first this week, and what's the opening move?",
      "Be concrete and grounded in what real studios at my stage actually do — no generic advice.",
    ].filter(Boolean).join("\n");

    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }));
    dismiss();
  }

  if (!active || hidden) return null;
  const step   = steps[stepIdx];
  if (!step) return null;
  if (step.anchor && !pos) return null;
  const isLast = stepIdx === steps.length - 1;
  const isActionStep = step.advance !== "next";
  const centered = !step.anchor && !step.freeRoam;

  return (
    <>
      {/* Spotlight ring + dim */}
      {highlight && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top:    highlight.top,
            left:   highlight.left,
            width:  highlight.w,
            height: highlight.h,
            borderRadius: highlight.radius,
            boxShadow: "0 0 0 2px var(--color-sage), 0 0 0 9999px rgba(0,0,0,0.28)",
            pointerEvents: "none",
            zIndex: 55,
            transition: "top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease",
          }}
        />
      )}

      {/* Centered backdrop dim for anchor-less steps */}
      {centered && (
        <div
          aria-hidden
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.32)",
            zIndex: 55,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={`Outreach tour step ${stepIdx + 1}: ${step.title}`}
        style={{
          position: "fixed",
          top:  centered ? "50%" : pos!.top,
          left: centered ? "50%" : pos!.left,
          transform: centered ? "translate(-50%, -50%)" : "none",
          width: W,
          zIndex: 60,
          background: "#1f211a",
          color: "#f5f1e9",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,0.36), 0 2px 6px rgba(0,0,0,0.20)",
          padding: "13px 15px",
          fontFamily: "inherit",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(245,241,233,0.5)" }}>
            Outreach tour · {stepIdx + 1} of {steps.length}
          </span>
          <button
            onClick={dismiss}
            aria-label="Skip tour"
            title="Skip tour"
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer",
              color: "rgba(245,241,233,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}
          >
            <XIcon size={13} />
          </button>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,241,233,0.96)", marginBottom: 5 }}>
          {step.title}
        </h3>
        <p style={{
          fontSize: 11.5,
          color: "rgba(245,241,233,0.78)",
          lineHeight: 1.55,
          marginBottom: step.hint || step.finalCta || !isActionStep ? 10 : 0,
        }}>
          {step.body}
        </p>

        {step.hint && (
          <p style={{ fontSize: 10, color: "rgba(245,241,233,0.42)", lineHeight: 1.4, fontStyle: "italic" }}>
            {step.hint}
          </p>
        )}

        {isLast && step.finalCta?.action === "ash-suggest-outreach" ? (
          <>
            <button
              onClick={planOutreach}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "8px 12px",
                background: "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)",
                color: "white",
                border: "none", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                marginTop: 4,
              }}
            >
              <AshMark size={12} variant="on-dark" />
              {step.finalCta.label}
            </button>
            <button
              onClick={dismiss}
              style={{
                display: "block", width: "100%",
                marginTop: 8,
                fontSize: 11, color: "rgba(245,241,233,0.55)",
                background: "none", border: "none", padding: "4px 0",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              I&apos;ll explore on my own
            </button>
          </>
        ) : !isActionStep ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                background: "none", border: "none", padding: "6px 4px",
                fontSize: 11, color: "rgba(245,241,233,0.55)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={nextStep}
              style={{
                padding: "6px 14px", fontSize: 11, fontWeight: 600,
                background: "var(--color-sage)", color: "#f9faf4",
                border: "none", borderRadius: 7, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Next →
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                background: "none", border: "none", padding: "4px 6px",
                fontSize: 10.5, color: "rgba(245,241,233,0.55)",
                cursor: "pointer", fontFamily: "inherit",
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              Skip tour
            </button>
          </div>
        )}
      </div>
    </>
  );
}
