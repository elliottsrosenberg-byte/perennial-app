"use client";

// Tier 2: progressive tooltips that run after the user clicks "Get started"
// on the intro modal. Uses the same spotlight-ring visual treatment as the
// home DashboardTour: sage ring on the target with a soft dark dim around it.
//
// Some steps advance only after the user takes a real action (action steps —
// no Next button). The remaining steps are guided callouts that move the user
// through the inside of a project; those have a Next button.
//
// Triggers (window events fired from ProjectsClient / ProjectDetailPanel):
//   projects:modal-opened  → step 0 → 1
//   projects:created       → step 1 → 2
//   projects:detail-opened → step 2 → 3
//
// Persistence: profiles.tour_visited.projects_tour set when the tour ends.

import { useEffect, useState, useCallback, useRef } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

type AdvanceMode = "click-new" | "create" | "open-card" | "next";

interface Step {
  id:          string;
  anchor:      string | null;   // null = center the callout, no spotlight
  title:       string;
  body:        string;
  hint?:       string;          // italicised hint about how it advances
  advance:     AdvanceMode;     // action-driven or Next button
  spotlight?:  boolean;         // ring + dim. default true if anchored
  finalCta?:   { label: string; action: "ash-draft-tasks" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "new-button",
    anchor:  '[data-tour-target="projects.new-button"]',
    title:   "Create your first project",
    body:    "Projects are the anchor of your studio. Start one to see how Perennial puts your work in motion.",
    hint:    "Waiting for you to click + New project…",
    advance: "click-new",
  },
  {
    id:      "in-modal",
    anchor:  '[data-tour-target="projects.new-modal"]',
    title:   "Title and type are enough",
    body:    "Everything else — status, due date, materials, price, client — you can fill in later. Or ask Ash to draft it.",
    hint:    "Waiting for the project to be created…",
    advance: "create",
    spotlight: false,
  },
  {
    id:      "first-card",
    anchor:  '[data-tour-target="projects.first-card"]',
    title:   "Open your project",
    body:    "Click your project card to slide its detail panel open.",
    hint:    "Waiting for you to open it…",
    advance: "open-card",
  },
  {
    id:      "properties",
    anchor:  '[data-tour-target="projects.detail-properties"]',
    title:   "Edit anything inline",
    body:    "Status, type, priority, and timeline are all click-to-edit. Set a due date and the card surfaces overdue automatically — no extra fiddling.",
    advance: "next",
  },
  {
    id:      "workspace",
    anchor:  '[data-tour-target="projects.detail-workspace"]',
    title:   "Your project's workspace",
    body:    "Canvas is for free-form writing. Tasks, Contacts, Notes, and Files live alongside — everything you need for this project, no tab-hopping.",
    advance: "next",
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash get this started",
    body:     "Ash hasn't met this project yet — give it the title and type, and it'll draft 3–5 starter tasks based on what design studios actually do at this stage. You'll get a quick brief on where to focus first.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Draft starter tasks", action: "ash-draft-tasks" },
  },
];

interface Highlight { top: number; left: number; w: number; h: number; radius: number; }
interface CalloutPos { top: number; left: number; }

// Read the target's computed border-radius so the spotlight ring matches its
// shape (a pill stays a pill; a card stays a card). Many anchors are wrapper
// elements (`<span data-tour-target>` around a Button, or a Draggable div
// around a card), so when the anchor itself has no radius we descend a few
// levels to find the first descendant that does. Pads by the same offset the
// ring expands by, keeping the curve concentric with the target.
function ringRadiusFor(el: HTMLElement, pad: number): number {
  function readRadius(node: HTMLElement): number {
    const parts = window.getComputedStyle(node)
      .borderRadius.split(/\s+/)
      .map((p) => parseFloat(p) || 0);
    return Math.max(0, ...parts);
  }
  function findRadius(node: HTMLElement, depth: number): number {
    const own = readRadius(node);
    if (own > 0) return own;
    if (depth <= 0) return 0;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as HTMLElement;
      const found = findRadius(child, depth - 1);
      if (found > 0) return found;
    }
    return 0;
  }
  const raw = findRadius(el, 3);
  const r = el.getBoundingClientRect();
  const isPill = raw >= Math.min(r.width, r.height) / 2 - 0.5;
  if (isPill) return Math.min(r.width, r.height) / 2 + pad;
  return raw + pad;
}

export default function ProjectsTooltipTour() {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);
  const projectRef = useRef<{ id: string; title: string; type: string | null } | null>(null);

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
      if (data?.tour_dismissed || visited.projects_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("projects-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("projects-tooltips-start", start);
    };
  }, []);

  // Event-driven advance for action steps
  useEffect(() => {
    if (!active || hidden) return;

    function onModalOpen() {
      if (STEPS[stepIdx]?.advance === "click-new") setStepIdx((i) => i + 1);
    }
    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; title?: string; type?: string | null }>).detail;
      if (detail?.id && detail.title) {
        projectRef.current = { id: detail.id, title: detail.title, type: detail.type ?? null };
      }
      if (STEPS[stepIdx]?.advance === "create") setStepIdx((i) => i + 1);
    }
    function onDetailOpen() {
      if (STEPS[stepIdx]?.advance === "open-card") setStepIdx((i) => i + 1);
    }

    window.addEventListener("projects:modal-opened",  onModalOpen);
    window.addEventListener("projects:created",       onCreated);
    window.addEventListener("projects:detail-opened", onDetailOpen);
    return () => {
      window.removeEventListener("projects:modal-opened",  onModalOpen);
      window.removeEventListener("projects:created",       onCreated);
      window.removeEventListener("projects:detail-opened", onDetailOpen);
    };
  }, [active, hidden, stepIdx]);

  // Position the spotlight + callout
  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = STEPS[stepIdx];

    // No anchor → center the callout, no spotlight.
    if (!step.anchor) {
      setHighlight(null);
      setPos(null); // null pos = centered (handled in render)
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

    // Decide where to place the callout based on available space around the target
    const gap = 14;
    const H   = 200; // approximate callout height
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;

    // Prefer bottom-right; flip to left or top if there's not enough room
    let top  = r.bottom + gap;
    let left = r.left;
    if (top + H + 20 > vh)   top  = Math.max(20, r.top - H - gap);
    if (left + W + 20 > vw)  left = Math.max(20, r.right - W);
    // If the anchor is wide (modal), center the callout to its left edge but
    // keep it onscreen.
    left = Math.max(20, Math.min(vw - W - 20, left));
    top  = Math.max(20, Math.min(vh - 60, top));

    setPos({ top, left });
  }, [active, hidden, stepIdx]);

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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), projects_tour: new Date().toISOString() };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  function dismiss() {
    setActive(false);
    setHidden(true);
    markDone();
  }

  function nextStep() {
    if (stepIdx >= STEPS.length - 1) { dismiss(); return; }
    setStepIdx((i) => i + 1);
  }

  function draftStarterTasks() {
    const proj = projectRef.current;
    const projLine = proj
      ? `The project I just created:\n- Title: "${proj.title}"\n- Type: ${proj.type ?? "unspecified"}\n- Project ID (use this for add_task): ${proj.id}`
      : "The project I just created (use the most recently created project as context):";

    const prompt = [
      "I just created my first project in Perennial and I want to see what you can do.",
      projLine,
      "",
      "Please do the following, in order:",
      "1. Draft 3–5 starter tasks that any project like this typically needs at this stage. Lean on what successful design studios actually do — sourcing, contracts, photography, deposit invoicing, fabrication milestones, install logistics, etc. Tailor them to my practice if you have context on it.",
      "2. Call add_task for each one with project_id set to the ID above. Use medium priority unless something is genuinely urgent.",
      "3. Once the tasks are added, give me a short briefing (3–5 sentences) on what to focus on first for a project like this — pricing benchmarks, common pitfalls, timeline expectations. Grounded in what real studios do, not generic advice.",
    ].join("\n");

    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }));
    dismiss();
  }

  if (!active || hidden) return null;
  const step   = STEPS[stepIdx];
  // Anchored steps wait for `pos` to be computed; centered steps render
  // immediately with no anchor (pos === null).
  if (step.anchor && !pos) return null;
  const isLast = stepIdx === STEPS.length - 1;
  const isActionStep = step.advance !== "next";
  const centered = !step.anchor;

  return (
    <>
      {/* Spotlight ring + dim. Same visual language as DashboardTour so the
          two tours feel like one continuous experience. */}
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

      {/* Centered backdrop dim for anchor-less steps (no spotlight target). */}
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

      {/* Callout. `userSelect: none` prevents accidental drag-selection of
          tooltip body or buttons when the layout shifts during the tour. */}
      <div
        role="dialog"
        aria-label={`Projects tour step ${stepIdx + 1}: ${step.title}`}
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
            Projects tour · {stepIdx + 1} of {STEPS.length}
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

        {/* Action footer: Next button on non-action steps. Final step shows
            the Ash CTA + "I'll explore on my own" dismiss. */}
        {isLast && step.finalCta?.action === "ash-draft-tasks" ? (
          <>
            <button
              onClick={draftStarterTasks}
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
          // Action step (waiting for click-new / create / open-card). No Next,
          // but always offer an explicit Skip option so users aren't trapped
          // if they don't want to take the prescribed action.
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
