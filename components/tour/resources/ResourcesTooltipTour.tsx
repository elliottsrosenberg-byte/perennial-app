"use client";

// Tier 2: progressive tooltips that run after the user clicks "Get started"
// on the intro modal. Uses the same spotlight-ring visual treatment as the
// home DashboardTour and the Projects/Outreach tours: sage ring on the
// target with a soft dark dim around it.
//
// All steps here are "next" steps — Resources doesn't have a single create-
// flow to gate the tour on (there's no "+ New" button on the board itself),
// so we walk the user through the surfaces and let them explore. The final
// step hands off to a "Draft starter resources with Ash" action.
//
// Triggers (window events fired from ResourcesIntroModal):
//   resources-tooltips-start → tour begins
//
// Persistence: profiles.tour_visited.resources_tour set when the tour ends.

import { useEffect, useState, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

interface Step {
  id:          string;
  anchor:      string | null;   // null = center the callout, no spotlight
  title:       string;
  body:        string;
  spotlight?:  boolean;
  /** Free-roam step: nothing dimmed, nothing spotlit. Pins callout to the
   *  bottom-right so the user can scan before we start pointing things out. */
  freeRoam?:   boolean;
  finalCta?:   { label: string; action: "ash-draft-resources" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:     "categories",
    anchor: '[data-tour-target="resources.categories"]',
    title:  "Four categories, one shelf",
    body:   "Operations, Brand, Press, Design — pick a category to focus the board. The pip next to each one shows how complete that side of your studio is.",
  },
  {
    id:     "health",
    anchor: '[data-tour-target="resources.health"]',
    title:  "Track what's still missing",
    body:   "Each category has a profile bar that fills as you complete resources. Hit \"Fill in →\" and we'll jump you to the first card that still needs work.",
  },
  {
    id:     "card",
    anchor: '[data-tour-target="resources.first-card"]',
    title:  "Click a card to set it up",
    body:   "Structured cards (mission, bio, positioning) walk you through prompts. File cards let you upload PDFs and lookbooks. Click any card to open it.",
  },
  {
    id:     "links",
    anchor: '[data-tour-target="resources.links-nav"]',
    title:  "Or just save a link",
    body:   "Got a Dropbox, Drive, or portfolio site that already runs your studio? The Links section keeps a clean list of URLs you reach for often.",
  },
  {
    id:       "free-roam",
    anchor:   null,
    title:    "Look around.",
    body:     "This is your Resources board. Switch categories from the rail, search across everything from the top, toggle grid/list when the list gets long. When you're ready, hit Next and we'll hand off to Ash.",
    freeRoam: true,
  },
  {
    id:        "ash-handoff",
    anchor:    null,
    title:     "Let Ash draft the boring ones",
    body:      "Most studios have the same starter set — bio, mission, positioning, press release boilerplate. Hand Ash what it already knows about you and it'll draft them all in one pass, then you edit. Beats staring at empty fields.",
    spotlight: false,
    finalCta:  { label: "Draft starter resources", action: "ash-draft-resources" },
  },
];

interface Highlight { top: number; left: number; w: number; h: number; radius: number; }
interface CalloutPos { top: number; left: number; }

// Read the target's computed border-radius so the spotlight ring matches its
// shape. Mirror of the helper in ProjectsTooltipTour — kept identical so the
// two tours feel like one continuous experience.
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

export default function ResourcesTooltipTour() {
  const [active,    setActive]    = useState(false);
  const [stepIdx,   setStepIdx]   = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,       setPos]       = useState<CalloutPos | null>(null);
  const [hidden,    setHidden]    = useState(false);

  // Init: only start if not yet done AND a session event fires from the intro.
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
      if (data?.tour_dismissed || visited.resources_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("resources-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("resources-tooltips-start", start);
    };
  }, []);

  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = STEPS[stepIdx];

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
    // If the anchor is on the left rail, prefer placing the callout to its
    // right so we don't push it off-screen.
    if (left < 220) left = r.right + gap;
    if (top + H + 20 > vh)   top  = Math.max(20, r.top - H - gap);
    if (left + W + 20 > vw)  left = Math.max(20, r.right - W);
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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), resources_tour: new Date().toISOString() };
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

  function draftStarterResources() {
    const prompt = [
      "I just finished the Resources walkthrough in Perennial and want to see what you can do.",
      "",
      "Please draft the following from what you know about my studio (use whatever onboarding context you have — practice type, work types, location, tagline). Keep each one tight and professional, in my voice:",
      "1. A 100-word artist bio.",
      "2. A 2–3 sentence mission statement.",
      "3. A short positioning statement (target audience, value proposition, tone).",
      "",
      "After you draft them, give me a quick note on which one to refine first based on what's most likely to move my work forward in the next 60 days.",
    ].join("\n");

    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }));
    dismiss();
  }

  if (!active || hidden) return null;
  const step   = STEPS[stepIdx];
  if (step.anchor && !pos) return null;
  const isLast = stepIdx === STEPS.length - 1;
  const centered = !step.anchor && !step.freeRoam;

  return (
    <>
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
        aria-label={`Resources tour step ${stepIdx + 1}: ${step.title}`}
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
            Resources tour · {stepIdx + 1} of {STEPS.length}
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
          marginBottom: 10,
        }}>
          {step.body}
        </p>

        {isLast && step.finalCta?.action === "ash-draft-resources" ? (
          <>
            <button
              onClick={draftStarterResources}
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
        ) : (
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
        )}
      </div>
    </>
  );
}
