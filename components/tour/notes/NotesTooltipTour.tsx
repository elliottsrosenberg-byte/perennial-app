"use client";

// Tier 2: progressive tooltips that run after "Get started" on the intro
// modal. Same spotlight-ring visual language as the projects + contacts
// tours so the flows feel like one experience.
//
// Action steps wait for a real user event (no Next button); guided steps
// have a Next.
//
// Triggers (window events fired from NotesClient):
//   notes:created → step 0 → 1 (carries id + title)
//
// Persistence: profiles.tour_visited.notes_tour set when the tour ends.

import { useEffect, useState, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";

type AdvanceMode = "create" | "next";

interface Step {
  id:          string;
  anchor:      string | null;
  title:       string;
  body:        string;
  hint?:       string;
  advance:     AdvanceMode;
  spotlight?:  boolean;
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "new-button",
    anchor:  '[data-tour-target="notes.new-button"]',
    title:   "Start your first note",
    body:    "A meeting recap, a half-formed pitch, a list of materials — anything you want to capture. Click + New note and a blank page opens.",
    hint:    "Waiting for you to click + New note…",
    advance: "create",
  },
  {
    id:      "generate-tasks",
    anchor:  '[data-tour-target="notes.generate-tasks"]',
    title:   "Turn a note into next steps",
    body:    "When you've captured the thinking, hit Generate tasks. Ash reads the note, drafts 3–6 tasks, and you pick which ones to keep and set due dates before they land in your task list.",
    advance: "next",
  },
  {
    id:      "share-button",
    anchor:  '[data-tour-target="notes.share-button"]',
    title:   "Share or export anywhere",
    body:    "Get a public link to send a collaborator a read-only view. Or download as Markdown, copy as plain text — your notes are never trapped here.",
    advance: "next",
  },
  {
    id:      "inline-ash",
    anchor:  '[data-tour-target="notes.editor"]',
    title:   "Call Ash inline with one keystroke",
    body:    "Type a space at the start of any new line in the editor to call Ash inline — ask for a draft, a rewrite, a summary, or anything else. Ash writes directly into the note where your cursor is.",
    advance: "next",
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
  // otherwise a small pill chip inside a larger block would round the
  // whole ring into a giant blob.
  const sourceFillsParent =
    srcRect.width  >= parentRect.width  * 0.8 &&
    srcRect.height >= parentRect.height * 0.8;
  if (!sourceFillsParent) return pad;

  const isPill = raw >= Math.min(srcRect.width, srcRect.height) / 2 - 0.5;
  if (isPill) return Math.min(parentRect.width, parentRect.height) / 2 + pad;
  return raw + pad;
}

export default function NotesTooltipTour() {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);

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
      if (data?.tour_dismissed || visited.notes_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("notes-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("notes-tooltips-start", start);
    };
  }, []);

  // Event-driven advance for action steps
  useEffect(() => {
    if (!active || hidden) return;

    function onCreated() {
      if (STEPS[stepIdx]?.advance === "create") setStepIdx((i) => i + 1);
    }

    window.addEventListener("notes:created", onCreated);
    return () => {
      window.removeEventListener("notes:created", onCreated);
    };
  }, [active, hidden, stepIdx]);

  // Position the spotlight + callout
  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = STEPS[stepIdx];

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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), notes_tour: new Date().toISOString() };
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

  if (!active || hidden) return null;
  const step   = STEPS[stepIdx];
  if (step.anchor && !pos) return null;
  const isActionStep = step.advance !== "next";
  const centered = !step.anchor;

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
            boxShadow: "0 0 0 2px var(--color-sage), 0 0 0 6px rgba(var(--color-sage-rgb),0.18)",
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
            background: "transparent",
            zIndex: 55,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={`Notes tour step ${stepIdx + 1}: ${step.title}`}
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
            Notes tour · {stepIdx + 1} of {STEPS.length}
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
          marginBottom: step.hint || !isActionStep ? 10 : 0,
        }}>
          {step.body}
        </p>

        {step.hint && (
          <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.4, fontStyle: "italic" }}>
            {step.hint}
          </p>
        )}

        {!isActionStep ? (
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
              {stepIdx >= STEPS.length - 1 ? "Done" : "Next →"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                background: "none", border: "none", padding: "4px 6px",
                fontSize: 10.5, color: "var(--color-grey)",
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
