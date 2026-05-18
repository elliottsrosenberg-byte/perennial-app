"use client";

// Tier 2: progressive tooltips that run after "Get started" on the intro
// modal. Same spotlight-ring visual language as the projects + contacts
// tours so the flows feel like one experience.
//
// Action steps wait for a real user event (no Next button); guided steps
// have a Next. The final step hands off to Ash with a notes-specific
// CTA — Ash takes the user's new note (or the first thing they jot
// down) and turns it into starter tasks.
//
// Triggers (window events fired from NotesClient):
//   notes:create-clicked → step 0 → 1 (a click-new heartbeat for parity)
//   notes:created        → step 0 → 1 (real advance; carries id + title)
//
// Persistence: profiles.tour_visited.notes_tour set when the tour ends.

import { useEffect, useState, useCallback, useRef } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
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
  /** Free-roam step: nothing dimmed, nothing spotlit. Callout pins to the
   *  bottom-right corner so the user can scan the whole panel before we
   *  start pointing at specific affordances. */
  freeRoam?:   boolean;
  finalCta?:   { label: string; action: "ash-draft-from-note" };
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
    id:       "explore",
    anchor:   null,
    title:    "Take it in.",
    body:     "This is your blank page — title at the top, body below, format toolbar above. It auto-saves as you type. Have a look around. When you're ready, hit Next and we'll point things out.",
    advance:  "next",
    freeRoam: true,
  },
  {
    id:      "title-input",
    anchor:  '[data-tour-target="notes.title-input"]',
    title:   "Title is yours, never required",
    body:    "Give the note a title if it helps you find it later. Or skip it — Perennial will list it as Untitled and you can search the body anyway.",
    advance: "next",
  },
  {
    id:      "link-picker",
    anchor:  '[data-tour-target="notes.link-picker"]',
    title:   "Link to the work",
    body:    "Attach this note to a project, a contact, or an opportunity (or all three). It then appears in that project's Notes tab, on that contact's file, on that opportunity. One note can carry the full context of a job.",
    advance: "next",
  },
  {
    id:      "format-toolbar",
    anchor:  '[data-tour-target="notes.format-toolbar"]',
    title:   "Rich formatting, fast",
    body:    "Headings, lists, bold, italic, toggle blocks — all here. Or hit Space on an empty line to ask Ash to write inline: \"Summarize what we discussed,\" \"Draft an email reply,\" \"Outline the next steps.\"",
    advance: "next",
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
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash flesh it out",
    body:     "Your note is just a starting point. Hand it to Ash with a goal — expand the outline, draft the follow-up email, surface what's missing — and you'll have something usable in seconds.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Hand this note to Ash", action: "ash-draft-from-note" },
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
  const noteRef = useRef<{ id: string; title: string } | null>(null);

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

    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; title?: string }>).detail;
      if (detail?.id) {
        noteRef.current = { id: detail.id, title: detail.title ?? "" };
      }
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

  function draftFromNote() {
    const n = noteRef.current;
    const noteLine = n
      ? `The note I just created in Perennial:\n- Note ID: ${n.id}\n- Title: "${n.title || "Untitled"}"`
      : "The note I just opened in Perennial (use the most recently created note as context).";

    const prompt = [
      "I just created a note in Perennial and I want your help turning it into something useful.",
      noteLine,
      "",
      "Please do the following, in order:",
      "1. Read the note content if there's any. If it's still blank or thin, ask me one short question about what I want to capture, then wait.",
      "2. Once there's enough to work with, propose 3 ways to take this forward — e.g. expand into an outline, draft a follow-up email, extract a task list, or summarize the takeaways. Be concrete about what each output would contain.",
      "3. Run the one I pick. If I don't pick, default to the most useful for this kind of note based on what you see.",
    ].join("\n");

    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }));
    dismiss();
  }

  if (!active || hidden) return null;
  const step   = STEPS[stepIdx];
  if (step.anchor && !pos) return null;
  const isLast = stepIdx === STEPS.length - 1;
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
        aria-label={`Notes tour step ${stepIdx + 1}: ${step.title}`}
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
            Notes tour · {stepIdx + 1} of {STEPS.length}
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

        {isLast && step.finalCta?.action === "ash-draft-from-note" ? (
          <>
            <button
              onClick={draftFromNote}
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
