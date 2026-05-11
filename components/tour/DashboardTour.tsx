"use client";

// 4-step walkthrough that runs the first time a freshly-onboarded user
// lands on the home dashboard. Anchors each step to a section of the page
// via [data-tour-step], with the final step handing off to the sidebar
// tour by navigating to /projects.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";

interface Step {
  id:       string;
  title:    string;
  body:     string;
  anchor:   string | null;
  finalCta?: { label: string; href: string };
}

const STEPS: Step[] = [
  {
    id:     "overview",
    title:  "Your home dashboard",
    body:   "A daily lens into your studio. Each card is a live snapshot from the modules in the sidebar — no data lives here, the dashboard reads from the rest of the app.",
    anchor: null,
  },
  {
    id:     "capture",
    title:  "Quick capture",
    body:   "Notes, Tasks, and Calendar give you fast capture. Notes is the only card you can write in directly. Tasks lets you add quick to-dos. Calendar surfaces upcoming deadlines.",
    anchor: '[data-tour-step="dashboard.capture"]',
  },
  {
    id:     "snapshots",
    title:  "Module snapshots",
    body:   "Finance, Projects, and Contacts stay quiet until your modules have data. They each link to their module — click View all to set them up.",
    anchor: '[data-tour-step="dashboard.snapshots"]',
  },
  {
    id:       "ash",
    title:    "Meet Ash & navigate",
    body:     "Ash (bottom-right) is your AI partner with full studio context. The sidebar takes you deeper into each module. Ready? Let's start with Projects.",
    anchor:   ".ash-fab",
    finalCta: { label: "Open Projects →", href: "/projects" },
  },
];

const W = 320;

export default function DashboardTour() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [active,  setActive]  = useState<boolean | null>(null);
  const [pos,     setPos]     = useState<{ top: number; left: number } | null>(null);
  const [highlight, setHighlight] = useState<{ top: number; left: number; w: number; h: number } | null>(null);

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
    setHighlight({ top: r.top - 4, left: r.left - 4, w: r.width + 8, h: r.height + 8 });

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

  async function finish(navigateTo?: string) {
    await markHomeVisited();
    setActive(false);
    if (navigateTo) router.push(navigateTo);
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
      {/* Soft dim — non-blocking so users can still see the page */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0,
          background: "rgba(31,33,26,0.22)",
          zIndex: 40, pointerEvents: "none",
        }}
      />

      {/* Highlight ring on the anchored target */}
      {highlight && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top:  highlight.top,
            left: highlight.left,
            width:  highlight.w,
            height: highlight.h,
            borderRadius: 16,
            boxShadow: "0 0 0 2px var(--color-sage), 0 0 0 9999px rgba(31,33,26,0.0)",
            pointerEvents: "none",
            zIndex: 41,
            transition: "all 0.18s ease",
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
          background: "var(--color-charcoal)",
          color: "var(--color-warm-white)",
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
              if (isLast) finish(step.finalCta?.href);
              else        setStepIdx((i) => i + 1);
            }}
            style={{
              padding: "7px 14px",
              fontSize: 11, fontWeight: 600,
              background: "var(--color-sage)", color: "var(--color-warm-white)",
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
