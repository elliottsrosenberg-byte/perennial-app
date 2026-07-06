"use client";

// 4-step walkthrough that runs the first time a freshly-onboarded user
// lands on the home dashboard. Anchors each step to a section of the page
// via [data-tour-step], with the final step handing off to the sidebar
// tour by navigating to /projects.

import { useEffect, useState, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";

interface Step {
  id:        string;
  title:     string;
  body:      string;
  anchor:    string | null;
  finalCta?: { label: string };
}

const STEPS: Step[] = [
  {
    id:     "welcome",
    title:  "This is your board",
    body:   "Your home in Perennial is a canvas — a space to think, plan, and pull your studio together. Nothing here is fixed; arrange it however you like.",
    anchor: null,
  },
  {
    id:     "tools",
    title:  "Build it out",
    body:   "Add sticky notes, text, shapes, and arrows from the toolbar — or drop in live cards from your projects, tasks, and finance so the board reflects real work.",
    anchor: '[data-tour-canvas="tools"]',
  },
  {
    id:       "ash",
    title:    "Meet Ash",
    body:     "Ash is your studio partner, right here on the board. Ask it anything — or tap “Help me finish setting up” to pick up where onboarding left off.",
    anchor:   '[data-tour-canvas="ash"]',
    finalCta: { label: "Start exploring" },
  },
];

// Session flag: set when the tour's final step opens Ash, so the sidebar
// TourCallout stays hidden until Ash is closed. The AshContainer's close
// handler clears this and fires a "tour-ash-closed" event.
export const TOUR_WAITING_KEY = "perennial-tour-waiting-ash";

const W = 320;

// Read the target's computed border-radius so the spotlight ring matches its
// shape. Walks a few levels of descendants when the anchor itself has no
// radius (common for wrapper spans / Draggable divs).
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

export default function DashboardTour() {
  const [stepIdx, setStepIdx] = useState(0);
  const [active,  setActive]  = useState<boolean | null>(null);
  const [pos,     setPos]     = useState<{ top: number; left: number } | null>(null);
  const [highlight, setHighlight] = useState<{ top: number; left: number; w: number; h: number; radius: number } | null>(null);

  // Init: check whether the dashboard tour should run.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setActive(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("tour_visited, tour_dismissed, onboarding_complete")
        .eq("user_id", user.id)
        .maybeSingle();
      const visited = (data?.tour_visited ?? {}) as TourVisited;
      const shouldRun =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.home;
      setActive(shouldRun);
    })();
  }, []);

  // Position callout + highlight ring whenever the step changes or layout shifts.
  const reposition = useCallback(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step.anchor) {
      setPos(null);
      setHighlight(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(step.anchor);
    if (!el) {
      setPos(null);
      setHighlight(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 4;
    setHighlight({
      top:    r.top - pad,
      left:   r.left - pad,
      w:      r.width + pad * 2,
      h:      r.height + pad * 2,
      radius: ringRadiusFor(el, pad),
    });

    // Default: place callout below the target, centered horizontally
    let top  = r.bottom + 14;
    let left = r.left + r.width / 2 - W / 2;
    // Flip above if it'd run off the bottom
    if (top + 220 > window.innerHeight - 20) {
      top = r.top - 220 - 14;
    }
    // Clamp horizontally
    left = Math.max(20, Math.min(window.innerWidth - W - 20, left));
    setPos({ top, left });
  }, [active, stepIdx]);

  useEffect(() => {
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    const interval = window.setInterval(reposition, 500);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(interval);
    };
  }, [reposition]);

  async function markHomeVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), home: new Date().toISOString() };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function finish() {
    // Mark the home walkthrough complete so the GettingStarted widget + sidebar
    // module tour proceed. We no longer auto-open Ash — the "Help me finish
    // setting up" ghost prompt in the board's Ash bar owns that handoff now, so
    // the user starts guided setup on their own terms.
    await markHomeVisited();
    setActive(false);
  }

  async function skip() {
    // Skip the entire tour, including sidebar callouts.
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ tour_dismissed: true }).eq("user_id", user.id);
      // Also mark home visited so progress reflects it.
      await markHomeVisited();
    }
    setActive(false);
    window.dispatchEvent(new Event("tour-dismissed"));
  }

  if (!active) return null;

  const step    = STEPS[stepIdx];
  const isLast  = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;

  return (
    <>
      {/* Backdrop. When a target is anchored, use a spotlight cutout via a
          huge box-shadow on the highlight element so the target itself isn't
          dimmed. When centered (no anchor), use a uniform soft dim. */}
      {/* Non-modal: a sage ring + soft glow around the target only — NO dimming
          of the rest of the screen. The app stays fully live and clickable while
          the coachmark is up. When there's no anchor (welcome step), nothing is
          drawn here and the callout simply floats. */}
      {highlight && (
        <div
          key="tour-spotlight"
          aria-hidden
          style={{
            position: "fixed",
            top:    highlight.top,
            left:   highlight.left,
            width:  highlight.w,
            height: highlight.h,
            borderRadius: highlight.radius,
            boxShadow: "0 0 0 2px var(--color-sage), 0 0 0 6px rgba(var(--color-sage-rgb),0.18)",
            pointerEvents: "none",
            zIndex: 40,
            transition: "top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease",
          }}
        />
      )}

      {/* Callout */}
      <div
        role="dialog"
        aria-label={`Tour step ${stepIdx + 1}: ${step.title}`}
        style={{
          position: "fixed",
          top:  pos?.top  ?? "50%",
          left: pos?.left ?? "50%",
          transform: pos ? "none" : "translate(-50%, -50%)",
          width: W, zIndex: 50,
          // Hardcoded so the callout stays dark in both light and dark mode
          // (var(--color-charcoal) flips to a light cream in dark mode).
          background: "#1f211a",
          color: "#f5f1e9",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(31,33,26,0.4)",
          padding: "14px 16px",
          fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(245,241,233,0.5)" }}>
            Welcome tour · {stepIdx + 1} of {STEPS.length}
          </span>
          <button
            onClick={skip}
            aria-label="Skip tour"
            title="Skip tour"
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer",
              color: "rgba(245,241,233,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}
          >
            <XIcon size={14} />
          </button>
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(245,241,233,0.96)", marginBottom: 6 }}>
          {step.title}
        </h3>
        <p style={{ fontSize: 12, color: "rgba(245,241,233,0.72)", lineHeight: 1.6, marginBottom: 14 }}>
          {step.body}
        </p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={isFirst ? skip : () => setStepIdx((i) => Math.max(0, i - 1))}
            style={{
              fontSize: 11, color: "rgba(245,241,233,0.55)",
              background: "none", border: "none", padding: "6px 4px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isFirst ? "Skip tour" : "← Back"}
          </button>
          <button
            onClick={() => {
              if (isLast) finish();
              else        setStepIdx((i) => i + 1);
            }}
            style={{
              padding: "7px 14px",
              fontSize: 11, fontWeight: 600,
              background: "var(--color-sage)", color: "#f9faf4",
              border: "none", borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {isLast ? (step.finalCta?.label ?? "Done") : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}
