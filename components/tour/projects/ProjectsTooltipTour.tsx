"use client";

// Tier 2: progressive tooltips that run after the user clicks "Get started"
// on the intro modal. Each tooltip waits for a real user action before
// advancing — no Next buttons. Final step offers an Ash handoff with a
// project-context-aware prompt.
//
// Triggers (window events fired from ProjectsClient):
//   projects:modal-opened  → modal-open detected; advance step 1 → 2
//   projects:created       → a new project was created; advance step 2 → 3
//   projects:detail-opened → user clicked a card; advance step 3 → 4
//
// Persistence: profiles.tour_visited.projects_tour set when the tour ends
// (completed or skipped). Won't fire again once set.

import { useEffect, useState, useCallback, useRef } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

interface Step {
  id:        string;
  anchor:    string;            // CSS selector
  side:      "right" | "bottom" | "top" | "left";
  title:     string;
  body:      string;
  hint?:     string;            // small italicized hint about how it advances
  finalCta?: { label: string; action: "ash-draft-tasks" | "done" };
}

const W = 280;

const STEPS: Step[] = [
  {
    id:     "new-button",
    anchor: '[data-tour-target="projects.new-button"]',
    side:   "bottom",
    title:  "Create your first project",
    body:   "Click here to open the New Project form. You can edit any field later.",
    hint:   "Waiting for you to click +New project…",
  },
  {
    id:     "in-modal",
    anchor: '[data-tour-target="projects.new-modal"]',
    side:   "left",
    title:  "Title and type are enough",
    body:   "Anything you don't know yet you can fill in later — or ask Ash to draft pricing, materials, or scope for you.",
    hint:   "Waiting for the project to be created…",
  },
  {
    id:     "first-card",
    anchor: '[data-tour-target="projects.first-card"]',
    side:   "right",
    title:  "Open your project",
    body:   "Click your project card to slide open its detail panel. That's where you add tasks, log time, link contacts, and track finance.",
    hint:   "Waiting for you to open the project…",
  },
  {
    id:       "ash-handoff",
    anchor:   '[data-tour-target="projects.detail-panel"]',
    side:     "left",
    title:    "Let Ash get this started",
    body:     "Ash knows this project and has a working sense of how successful design studios actually price, scope, and ship work like it. Hit the button — Ash will draft starter tasks straight into your project and brief you on what to focus on first.",
    finalCta: { label: "Draft starter tasks", action: "ash-draft-tasks" },
  },
];

interface Pos { top: number; left: number; arrowOffset: number; placement: Step["side"]; }

export default function ProjectsTooltipTour() {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [pos,      setPos]      = useState<Pos | null>(null);
  const [hidden,   setHidden]   = useState(false);
  const projectRef = useRef<{ id: string; title: string; type: string | null } | null>(null);

  // Init: only start if profile says we haven't done the tour AND a session
  // event fires to start it. We don't auto-start on mount — the intro modal
  // dispatches "projects-tooltips-start" when the user clicks Get started.
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

  // Event-driven advance
  useEffect(() => {
    if (!active || hidden) return;

    function onModalOpen() { if (stepIdx === 0) setStepIdx(1); }
    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; title?: string; type?: string | null }>).detail;
      if (detail?.id && detail.title) {
        projectRef.current = { id: detail.id, title: detail.title, type: detail.type ?? null };
      }
      if (stepIdx === 1) setStepIdx(2);
    }
    function onDetailOpen() { if (stepIdx === 2) setStepIdx(3); }

    window.addEventListener("projects:modal-opened",  onModalOpen);
    window.addEventListener("projects:created",       onCreated);
    window.addEventListener("projects:detail-opened", onDetailOpen);
    return () => {
      window.removeEventListener("projects:modal-opened",  onModalOpen);
      window.removeEventListener("projects:created",       onCreated);
      window.removeEventListener("projects:detail-opened", onDetailOpen);
    };
  }, [active, hidden, stepIdx]);

  const reposition = useCallback(() => {
    if (!active || hidden) { setPos(null); return; }
    const step = STEPS[stepIdx];
    const el = document.querySelector<HTMLElement>(step.anchor);
    if (!el) { setPos(null); return; }
    const r = el.getBoundingClientRect();

    let top = 0, left = 0;
    const gap = 14;
    const H = 200; // rough estimate
    switch (step.side) {
      case "right":
        top  = r.top + r.height / 2 - H / 2;
        left = r.right + gap;
        break;
      case "left":
        top  = r.top + r.height / 2 - H / 2;
        left = r.left - W - gap;
        break;
      case "bottom":
        top  = r.bottom + gap;
        left = r.left + r.width / 2 - W / 2;
        break;
      case "top":
        top  = r.top - H - gap;
        left = r.left + r.width / 2 - W / 2;
        break;
    }
    // Clamp to viewport
    top  = Math.max(20, Math.min(window.innerHeight - 60, top));
    left = Math.max(20, Math.min(window.innerWidth  - W - 20, left));
    setPos({ top, left, arrowOffset: 0, placement: step.side });
  }, [active, hidden, stepIdx]);

  useEffect(() => {
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    const interval = window.setInterval(reposition, 400);
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

  function draftStarterTasks() {
    const proj = projectRef.current;
    // Build a structured prompt that asks Ash to actually call its add_task
    // tool for each task — not just describe them. The brief at the end
    // signals expert, design-industry-grounded insight rather than generic
    // chatbot advice.
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

  if (!active || hidden || !pos) return null;
  const step   = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  // Arrow position styling per placement
  const arrowStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: "absolute",
      width: 12, height: 12,
      background: "#1f211a",
    };
    switch (step.side) {
      case "right":  return { ...base, left:  -6, top: "50%",  transform: "translateY(-50%) rotate(45deg)" };
      case "left":   return { ...base, right: -6, top: "50%",  transform: "translateY(-50%) rotate(45deg)" };
      case "bottom": return { ...base, top:   -6, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
      case "top":    return { ...base, bottom:-6, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
    }
  })();

  return (
    <div
      role="dialog"
      aria-label={`Projects tour step ${stepIdx + 1}: ${step.title}`}
      style={{
        position: "fixed",
        top:  pos.top,
        left: pos.left,
        width: W,
        zIndex: 60,
        // Hardcoded so the callout stays dark in both themes.
        background: "#1f211a",
        color: "#f5f1e9",
        borderRadius: 12,
        boxShadow: "0 16px 40px rgba(31,33,26,0.36), 0 2px 6px rgba(31,33,26,0.2)",
        padding: "13px 15px",
        fontFamily: "inherit",
      }}
    >
      <div aria-hidden style={arrowStyle} />

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
      <p style={{ fontSize: 11, color: "rgba(245,241,233,0.72)", lineHeight: 1.55, marginBottom: step.hint || step.finalCta ? 10 : 0 }}>
        {step.body}
      </p>

      {step.hint && (
        <p style={{ fontSize: 10, color: "rgba(245,241,233,0.42)", lineHeight: 1.4, fontStyle: "italic" }}>
          {step.hint}
        </p>
      )}

      {isLast && step.finalCta?.action === "ash-draft-tasks" && (
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
      )}

      {isLast && (
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
      )}
    </div>
  );
}
