"use client";

// Tier 1: full-screen modal that introduces the Presence module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.presence_intro so it won't re-show. "Get started"
// also fires window event "presence-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import { FeedMaterialize, FilterFocus, StatusSnap, IntegrationsLight } from "./PresenceAnimations";

interface Slide {
  title: string;
  body:  string;
  Anim:  () => React.ReactElement;
}

const SLIDES: Slide[] = [
  {
    title: "Stay on what's out there.",
    body:  "Presence is your radar for fairs, open calls, grants, residencies, and awards relevant to independent designers — curated by the Perennial team and updated as new listings open.",
    Anim:  FeedMaterialize,
  },
  {
    title: "Filter to what fits you.",
    body:  "Switch between categories — fairs, open calls, grants, residencies, awards — and the feed splits into Act soon, Upcoming, Later, and Ongoing so deadlines don't sneak up on you.",
    Anim:  FilterFocus,
  },
  {
    title: "Save what you're tracking.",
    body:  "Mark anything as Saved, Attending, Exhibiting, or Applied. It stays in your Coming up list and shows on your Calendar as a multi-day bar, so you can plan around it.",
    Anim:  StatusSnap,
  },
  {
    title: "Track your audience too.",
    body:  "Connect Google Analytics, Instagram, and your newsletter to see your studio's reach in one place — sessions, followers, open rates. All read-only, all in the Overview tab.",
    Anim:  IntegrationsLight,
  },
];

export default function PresenceIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // presence walkthrough.
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
      // Dedicated `presence_intro` key — we deliberately do NOT gate on
      // `visited.presence` since that key is auto-marked by TourTracker on
      // sidebar nav, which would suppress the intro for any user who visited
      // /presence before this walkthrough shipped.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.presence_intro;
      setOpen(shouldShow);
    })();
  }, []);

  useEffect(() => {
    if (open === true) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  async function markPresenceVisited() {
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
      presence_intro: stamp,
      presence:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markPresenceVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("presence-tooltips-start"));
    }
  }

  if (open !== true) return null;

  const isLast = stepIdx === SLIDES.length - 1;
  const isFirst = stepIdx === 0;
  const slide   = SLIDES[stepIdx];
  const Anim    = slide.Anim;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Presence walkthrough"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(31,33,26,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "pr-modal-bg 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes pr-modal-bg   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pr-modal-card { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: 480,
          maxHeight: "90vh",
          background: "var(--color-warm-white)",
          borderRadius: 16,
          border: "0.5px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(31,33,26,0.32), 0 4px 12px rgba(31,33,26,0.16)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "pr-modal-card 0.24s ease-out",
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
            Presence · {stepIdx + 1} of {SLIDES.length}
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
