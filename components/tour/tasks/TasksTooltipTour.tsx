"use client";

// Tier 2: progressive tooltips that run after the user clicks "Get started"
// on the Tasks intro modal. Uses the same spotlight-ring visual treatment as
// the Projects + Contacts tours so the three feel like one experience.
//
// Tasks has no separate "+ New task" button — the quick-add input is always
// visible at the top of the list. So the first step spotlights the input
// itself and waits for the user to actually submit a task (tasks:created),
// rather than waiting on a click-to-open-modal step.
//
// Triggers (window events fired from TasksClient):
//   tasks:created       → step 0 → 1
//
// Persistence: profiles.tour_visited.tasks_tour set when the tour ends.

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
  freeRoam?:   boolean;
  finalCta?:   { label: string; action: "ash-suggest-tasks" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "quick-add",
    anchor:  '[data-tour-target="tasks.quick-add"]',
    title:   "Capture a task in one line",
    body:    "Type what needs doing, hit enter, and it lands in the list. You can set a due date, priority, and link to a project all before submitting — but a title is plenty to start.",
    hint:    "Waiting for you to add your first task…",
    advance: "create",
  },
  {
    id:       "explore",
    anchor:   null,
    title:    "Take it in.",
    body:     "Your task is now in the list. The sidebar on the left filters by due date and project; the main pane shows the matching tasks, grouped and sortable. Look around — when you're ready, hit Next.",
    advance:  "next",
    freeRoam: true,
  },
  {
    id:      "task-row",
    anchor:  '[data-tour-target="tasks.first-row"]',
    title:   "Everything edits in place",
    body:    "Click the title to rename. Tap the date pill to reschedule. Cycle priority. Link to a project or contact. Hover a row and the controls appear; nothing here needs a modal.",
    advance: "next",
  },
  {
    id:      "sidebar",
    anchor:  '[data-tour-target="tasks.sidebar"]',
    title:   "Filter by what's urgent",
    body:    "Overdue surfaces when something slipped. Today is the day's focus. Upcoming looks two weeks ahead. Project filters appear automatically as you link tasks to projects.",
    advance: "next",
  },
  {
    id:      "sort",
    anchor:  '[data-tour-target="tasks.sort"]',
    title:   "Sort to match your mood",
    body:    "Date for triage. Priority when you want to clear the heavy stuff first. Created when you just want to see what you've been adding. Flip the arrow for descending.",
    advance: "next",
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash help you triage",
    body:     "Ash sees every project, contact, and opportunity you've got going. Ask it to look across your studio and suggest the tasks worth doing this week — grounded in your real workload, not generic advice.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Suggest what to do this week", action: "ash-suggest-tasks" },
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

export default function TasksTooltipTour() {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);
  const taskRef = useRef<{ id: string; title: string } | null>(null);

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
      if (data?.tour_dismissed || visited.tasks_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("tasks-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("tasks-tooltips-start", start);
    };
  }, []);

  // Event-driven advance for action steps
  useEffect(() => {
    if (!active || hidden) return;

    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; title?: string }>).detail;
      if (detail?.id && detail.title) {
        taskRef.current = { id: detail.id, title: detail.title };
      }
      if (STEPS[stepIdx]?.advance === "create") setStepIdx((i) => i + 1);
    }

    window.addEventListener("tasks:created", onCreated);
    return () => {
      window.removeEventListener("tasks:created", onCreated);
    };
  }, [active, hidden, stepIdx]);

  // Position the spotlight + callout
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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), tasks_tour: new Date().toISOString() };
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

  function suggestTasks() {
    const prompt = [
      "I just finished the Tasks walkthrough in Perennial and I want you to help me triage.",
      "",
      "Please do the following, in order:",
      "1. Look across my projects, contacts, and opportunities. Use my onboarding profile (what I make, my channels, my stage) for context.",
      "2. Suggest 5–8 tasks I should be working on this week — concrete, specific actions tied to actual projects or relationships I have. For each, note which project or contact it relates to and a sensible priority.",
      "3. Call add_task for each one, with project_id / contact_id set where it applies and a due_date if a timeline is obvious.",
      "4. End with a 2–3 sentence briefing on where to start and what to defer. Honest about tradeoffs, not generic.",
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
        aria-label={`Tasks tour step ${stepIdx + 1}: ${step.title}`}
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
            Tasks tour · {stepIdx + 1} of {STEPS.length}
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

        {isLast && step.finalCta?.action === "ash-suggest-tasks" ? (
          <>
            <button
              onClick={suggestTasks}
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
