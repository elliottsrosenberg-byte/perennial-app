"use client";

// Tier 2: progressive tooltips that run after "Get started" on the intro
// modal. Same spotlight-ring visual language as the other module tours.
//
// Conditional skip: if the user already has at least one calendar
// integration connected at tour-start, the connect-integration step is
// dropped (mirrors hasPipelinesAtStart in OutreachTooltipTour).
//
// Triggers (window events fired from CalendarClient):
//   calendar:integration-connected → integration-connect step → next
//   calendar:new-task-opened       → new-task-button step → next
//   calendar:task-created          → in-modal step → next
//
// Persistence: profiles.tour_visited.calendar_tour set when the tour ends.

import { useEffect, useState, useCallback, useRef } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

type AdvanceMode =
  | "integration-connected"
  | "open-new-task"
  | "task-created"
  | "next";

interface Step {
  id:          string;
  anchor:      string | null;
  title:       string;
  body:        string;
  hint?:       string;
  advance:     AdvanceMode;
  spotlight?:  boolean;
  freeRoam?:   boolean;
  /** Step only runs if the user has NO calendar integration at tour-start.
   *  When `hasIntegrationAtStart === true`, all `requiresEmpty` steps are
   *  filtered out of the rendered sequence. */
  requiresEmpty?: boolean;
  finalCta?:   { label: string; action: "ash-plan-week" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "connect-integration",
    anchor:  '[data-tour-target="calendar.integrations"]',
    title:   "Connect Google or Outlook",
    body:    "Pull your real calendar in so it lives next to your tasks. Both providers are read-only by default — Perennial reads events to display them and to log meeting activity against matched contacts. Once you connect, the Calendars panel here in the rail handles per-calendar visibility, color, and the \"+ Add calendar account\" entry for stacking multiple logins.",
    hint:    "Waiting for you to connect a calendar… (or hit Skip below)",
    advance: "integration-connected",
    requiresEmpty: true,
  },
  {
    id:      "new-task-button",
    anchor:  '[data-tour-target="calendar.new-task-button"]',
    title:   "Two CTAs: task or event",
    body:    "New task drops a check-box on any day. New event (the sage button next to it) opens a Notion-style side card to create a calendar event without leaving this view. Tasks ride in their own ribbon above the all-day row so the day's to-dos read first.",
    hint:    "Waiting for you to click + New task…",
    advance: "open-new-task",
  },
  {
    id:      "in-modal",
    anchor:  '[data-tour-target="calendar.new-task-modal"]',
    title:   "Title and date are enough",
    body:    "Link it to a project or contact later from the task detail. The point is to capture it so it shows up where you'll see it.",
    hint:    "Waiting for the task to be created…",
    advance: "task-created",
    spotlight: false,
  },
  {
    id:       "explore",
    anchor:   null,
    title:    "Take it in.",
    body:     "Left rail: mini-month, upcoming tasks, the Calendars panel for synced accounts, and the Perennial Feed toggles that hide/show opportunity bars by category. Main view: the tasks ribbon up top, opportunity bars in the all-day row, synced events laid out side-by-side when they overlap. Click any event for a side preview card (no scrim — the grid stays visible).",
    advance:  "next",
    freeRoam: true,
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash plan your week",
    body:     "Ash sees your calendar, project deadlines, outreach follow-ups, and Presence opportunities together. Ask it to plan your week, surface what's slipping, or block time for deep work on a specific project.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Plan my week", action: "ash-plan-week" },
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

  const sourceFillsParent =
    srcRect.width  >= parentRect.width  * 0.8 &&
    srcRect.height >= parentRect.height * 0.8;
  if (!sourceFillsParent) return pad;

  const isPill = raw >= Math.min(srcRect.width, srcRect.height) / 2 - 0.5;
  if (isPill) return Math.min(parentRect.width, parentRect.height) / 2 + pad;
  return raw + pad;
}

interface Props {
  /** If the user already has any calendar (Google or Outlook) connected
   *  at tour-start, the integration-connect step is filtered out. */
  hasIntegrationAtStart: boolean;
}

export default function CalendarTooltipTour({ hasIntegrationAtStart }: Props) {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);
  const taskRef = useRef<{ id: string; title: string } | null>(null);

  const [steps] = useState<Step[]>(() =>
    hasIntegrationAtStart ? STEPS.filter((s) => !s.requiresEmpty) : STEPS,
  );

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
      if (data?.tour_dismissed || visited.calendar_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("calendar-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("calendar-tooltips-start", start);
    };
  }, []);

  useEffect(() => {
    if (!active || hidden) return;

    function onIntegrationConnected() {
      if (steps[stepIdx]?.advance === "integration-connected") setStepIdx((i) => i + 1);
    }
    function onNewTaskOpen() {
      if (steps[stepIdx]?.advance === "open-new-task") setStepIdx((i) => i + 1);
    }
    function onTaskCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; title?: string }>).detail;
      if (detail?.id && detail.title) {
        taskRef.current = { id: detail.id, title: detail.title };
      }
      if (steps[stepIdx]?.advance === "task-created") setStepIdx((i) => i + 1);
    }

    window.addEventListener("calendar:integration-connected", onIntegrationConnected);
    window.addEventListener("calendar:new-task-opened",       onNewTaskOpen);
    window.addEventListener("calendar:task-created",          onTaskCreated);
    return () => {
      window.removeEventListener("calendar:integration-connected", onIntegrationConnected);
      window.removeEventListener("calendar:new-task-opened",       onNewTaskOpen);
      window.removeEventListener("calendar:task-created",          onTaskCreated);
    };
  }, [active, hidden, stepIdx, steps]);

  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = steps[stepIdx];
    if (!step) { setHighlight(null); setPos(null); return; }

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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), calendar_tour: new Date().toISOString() };
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

  function planWeek() {
    const taskLine = taskRef.current
      ? `I just added a task: "${taskRef.current.title}". Use that as one signal.`
      : "";
    const prompt = [
      "Help me plan this week using my calendar.",
      taskLine,
      "",
      "Please do the following, in order:",
      "1. Look at what's on my calendar this week (tasks, project deadlines, outreach follow-ups, synced events).",
      "2. Call out the 2–3 highest-leverage items I should make sure I actually do.",
      "3. If anything is slipping (overdue tasks, outreach that's gone quiet, projects with deadlines without scheduled work), name it.",
      "4. Suggest where in the week I should block focused time, based on what's already on my schedule.",
      "Be concrete and short — bullet points, no fluff.",
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
        aria-label={`Calendar tour step ${stepIdx + 1}: ${step.title}`}
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
            Calendar tour · {stepIdx + 1} of {steps.length}
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
          marginBottom: step.hint || step.finalCta || !isActionStep ? 10 : 0,
        }}>
          {step.body}
        </p>

        {step.hint && (
          <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.4, fontStyle: "italic" }}>
            {step.hint}
          </p>
        )}

        {isLast && step.finalCta?.action === "ash-plan-week" ? (
          <>
            <button
              onClick={planWeek}
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
        ) : !isActionStep ? (
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
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
            <button
              type="button"
              onClick={() => nextStep()}
              style={{
                background: "none", border: "none", padding: "4px 6px",
                fontSize: 10.5, color: "var(--color-grey)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Skip this step
            </button>
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
