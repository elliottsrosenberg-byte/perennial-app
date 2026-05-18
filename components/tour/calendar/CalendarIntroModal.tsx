"use client";

// Tier 1: full-screen modal that introduces the Calendar module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.calendar_intro so it won't re-show. "Get started"
// also fires window event "calendar-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import {
  WeekGridMaterialize, ConnectCalendars, QuickCapture, UnifiedTimeline,
} from "./CalendarAnimations";

interface Slide {
  title: string;
  body:  string;
  Anim:  () => React.ReactElement;
}

const SLIDES: Slide[] = [
  {
    title: "Your studio's calendar.",
    body:  "The unified time view of your studio — project deadlines, outreach follow-ups, tasks with due dates, and synced events from Google or Outlook all show up together. One place to see what's coming.",
    Anim:  WeekGridMaterialize,
  },
  {
    title: "Connect Google or Outlook.",
    body:  "Pull your real calendar in. Both connect read-only — Perennial reads events to display them and to log meeting activity against matched contacts. Nothing is written back to your calendar. Connect both if you split your work across accounts.",
    Anim:  ConnectCalendars,
  },
  {
    title: "Capture a task in seconds.",
    body:  "Hit + Task in the topbar to drop a to-do on any day. Tasks with a due date show on the calendar grid and roll up to their linked project or contact too. Ash can create them for you — try \"remind me to email Foster next Thursday\".",
    Anim:  QuickCapture,
  },
  {
    title: "Everything in one timeline.",
    body:  "Project deadlines, follow-ups, tasks, and synced events all land on the same week view. Click any event for context — open it in Google or Outlook directly, or click a task to mark it done from here.",
    Anim:  UnifiedTimeline,
  },
];

export default function CalendarIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // calendar walkthrough.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setOpen(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("tour_visited, tour_dismissed, onboarding_complete")
        .eq("user_id", user.id)
        .maybeSingle();
      const visited = (data?.tour_visited ?? {}) as TourVisited;
      // Dedicated `calendar_intro` key — we deliberately do NOT gate on
      // `visited.calendar` since that key is auto-marked by TourTracker on
      // sidebar nav, which would suppress the intro for any user who
      // visited /calendar before this walkthrough shipped.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.calendar_intro;
      setOpen(shouldShow);
    })();
  }, []);

  useEffect(() => {
    if (open === true) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  async function markCalendarVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const stamp = new Date().toISOString();
    const next = {
      ...((data?.tour_visited ?? {}) as TourVisited),
      calendar_intro: stamp,
      calendar:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markCalendarVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("calendar-tooltips-start"));
    }
  }

  if (open !== true) return null;

  const isLast  = stepIdx === SLIDES.length - 1;
  const isFirst = stepIdx === 0;
  const slide   = SLIDES[stepIdx];
  const Anim    = slide.Anim;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calendar walkthrough"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(31,33,26,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "cl-modal-bg 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes cl-modal-bg   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cl-modal-card { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: 480,
          height: 560,
          maxHeight: "90vh",
          background: "var(--color-warm-white)",
          borderRadius: 16,
          border: "0.5px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(31,33,26,0.32), 0 4px 12px rgba(31,33,26,0.16)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "cl-modal-card 0.24s ease-out",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-off-white)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-grey)" }}>
            Calendar · {stepIdx + 1} of {SLIDES.length}
          </span>
          <button
            onClick={() => close(false)}
            aria-label="Skip walkthrough"
            title="Skip"
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer",
              color: "var(--color-grey)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6,
            }}
          >
            <XIcon size={15} />
          </button>
        </div>

        {/* Animation panel */}
        <div style={{ padding: "20px 24px 0" }}>
          <div key={stepIdx}>
            <Anim />
          </div>
        </div>

        {/* Copy */}
        <div style={{ padding: "18px 24px 20px", flex: 1, overflowY: "auto" }}>
          <h2 style={{
            fontFamily: "var(--font-newsreader)",
            fontSize: 22, fontWeight: 700,
            color: "var(--color-charcoal)",
            letterSpacing: "-0.01em", marginBottom: 8,
          }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 13, color: "var(--color-grey)", lineHeight: 1.6 }}>
            {slide.body}
          </p>
        </div>

        {/* Progress dots */}
        <div style={{ padding: "0 24px 12px", display: "flex", gap: 6, justifyContent: "center" }}>
          {SLIDES.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === stepIdx ? 18 : 6, height: 6, borderRadius: 99,
                background: i === stepIdx ? "var(--color-sage)" : "var(--color-border)",
                transition: "width 0.2s ease, background 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px 18px",
          borderTop: "0.5px solid var(--color-border)",
          gap: 8,
        }}>
          <button
            onClick={isFirst ? () => close(false) : () => setStepIdx((i) => i - 1)}
            style={{
              fontSize: 12, color: "var(--color-grey)",
              background: "none", border: "none", padding: "8px 6px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isFirst ? "Skip" : "← Back"}
          </button>
          <button
            onClick={() => isLast ? close(true) : setStepIdx((i) => i + 1)}
            style={{
              padding: "9px 22px",
              fontSize: 13, fontWeight: 600,
              background: "var(--color-sage)", color: "var(--color-warm-white)",
              border: "none", borderRadius: 9, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {isLast ? "Get started →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
