"use client";

// Tier 2: progressive tooltips that run after "Get started" on the intro
// modal. Same spotlight-ring visual language as the other module tours.
//
// Presence is mostly a read-here-and-act module — the central interaction
// is browsing the curated feed and saving items. So the tour is lighter than
// Projects/Calendar: no event-driven action steps, just guided callouts that
// take the user from the Overview tab to the Opportunities feed and offer
// an Ash handoff for finding new opportunities.
//
// Persistence: profiles.tour_visited.presence_tour set when the tour ends.

import { useEffect, useState, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

interface Step {
  id:          string;
  anchor:      string | null;
  title:       string;
  body:        string;
  advance:     "next";
  spotlight?:  boolean;
  freeRoam?:   boolean;
  finalCta?:   { label: string; action: "ash-find-opps" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:       "explore",
    anchor:   null,
    title:    "Take it in.",
    body:     "Presence has two halves: the Overview tab (your audience signals — website, socials, newsletter) and the Opportunities tab (the curated feed of fairs, open calls, grants, residencies, and awards). Look around — hit Next when you're ready.",
    advance:  "next",
    freeRoam: true,
  },
  {
    id:      "tabs",
    anchor:  '[data-tour-target="presence.tabs"]',
    title:   "Two surfaces, one module",
    body:    "Overview is the read-out — what's connected, what your reach looks like. The other tabs (Website, Socials, Newsletter) dive into each channel. Opportunities is the curated feed.",
    advance: "next",
  },
  {
    id:      "opportunities-tab",
    anchor:  '[data-tour-target="presence.tab-opportunities"]',
    title:   "The Perennial Feed",
    body:    "Jump into the Opportunities tab to browse what the Perennial team is tracking — fairs, open calls, grants, residencies, awards. Click any card to read the details and save it.",
    advance: "next",
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash hunt for you",
    body:     "Ash knows your studio context — your work, your past projects, your practice. Ask it to surface opportunities that fit you specifically, or to draft an application for one you've already saved.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Find opportunities for me", action: "ash-find-opps" },
  },
];

interface Highlight { top: number; left: number; w: number; h: number; radius: number; }
interface CalloutPos { top: number; left: number; }

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

export default function PresenceTooltipTour() {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);

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
      if (data?.tour_dismissed || visited.presence_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("presence-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("presence-tooltips-start", start);
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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), presence_tour: new Date().toISOString() };
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

  function findOpps() {
    const prompt = [
      "I want you to help me find opportunities that fit my practice — fairs to apply to, open calls, grants, residencies, awards.",
      "",
      "Please do the following, in order:",
      "1. Look at the upcoming opportunities in my Presence feed (call get_opportunities). Identify the 2–3 that are the strongest fit for my work based on what you know about my practice and the studio context Perennial has on me.",
      "2. For each one you flag: explain in 1–2 sentences why it's a good fit, and tell me the deadline.",
      "3. If you can think of any obvious opportunities outside my current feed (specific galleries, residencies, awards that fit my work), name them and tell me where to look. Be concrete — actual program names, not categories.",
      "4. Suggest the single best one to act on this week.",
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
            boxShadow: "0 0 0 2px var(--color-sage), 0 0 0 6px rgba(var(--color-sage-rgb),0.18)",
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
            background: "transparent",
            zIndex: 55,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={`Presence tour step ${stepIdx + 1}: ${step.title}`}
        style={{
          position: "fixed",
          top:  centered ? "50%" : pos!.top,
          left: centered ? "50%" : pos!.left,
          transform: centered ? "translate(-50%, -50%)" : "none",
          width: W,
          zIndex: 60,
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border-strong)",
          color: "var(--color-text-primary)",
          borderRadius: 16,
          boxShadow: "0 16px 40px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)",
          padding: "13px 15px",
          fontFamily: "inherit",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-sage-text)" }}>
            Presence tour · {stepIdx + 1} of {STEPS.length}
          </span>
          <button
            onClick={dismiss}
            aria-label="Skip tour"
            title="Skip tour"
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer",
              color: "var(--color-grey)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}
          >
            <XIcon size={13} />
          </button>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 5 }}>
          {step.title}
        </h3>
        <p style={{
          fontSize: 11.5,
          color: "var(--color-text-secondary)",
          lineHeight: 1.55,
          marginBottom: step.finalCta || !isLast ? 10 : 0,
        }}>
          {step.body}
        </p>

        {isLast && step.finalCta?.action === "ash-find-opps" ? (
          <>
            <button
              onClick={findOpps}
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
                fontSize: 11, color: "var(--color-grey)",
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
                fontSize: 11, color: "var(--color-grey)",
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
