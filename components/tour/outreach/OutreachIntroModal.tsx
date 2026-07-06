"use client";

// Tier 1: full-screen modal that introduces the Outreach module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.outreach_intro so it won't re-show. "Get started"
// also fires window event "outreach-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import {
  PipelineMaterialize, DragStage, FollowUpBar, RailSwitch,
} from "./OutreachAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Outreach, end to end.",
    body:  "Every gallery submission, press pitch, fair application, and client pursuit. Pipelines hold the work; targets are the specific people, galleries, fairs, or publications you're trying to land.",
    Anim:  PipelineMaterialize,
  },
  {
    title: "Move the work forward.",
    body:  "Each pipeline runs through stages you define — Identify, Submit, Discuss, Make it happen, Closed. Drag a target between stages to move it. The shape of the pipeline is yours; the discipline is built in.",
    Anim:  DragStage,
  },
  {
    title: "Hover the right to follow up.",
    body:  "Hover the right side of any card; click to log a follow-up — opens inline, no modal jump. Logged cards tuck right so a glance shows what's still owed. Targets that go quiet age amber then red, so nothing important quietly dies.",
    Anim:  FollowUpBar,
  },
  {
    title: "Leads, follow-ups, pipelines — one place.",
    body:  "The left rail toggles between Leads (people you're qualifying), Follow-ups (relationships going stale), and your Pipelines. Targets you create here feed back into People, so the relationship history follows the deal.",
    Anim:  RailSwitch,
  },
];

export default function OutreachIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // outreach walkthrough.
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
      // Gate on a dedicated `outreach_intro` key. We deliberately do NOT
      // gate on `visited.outreach` — that key gets auto-marked by
      // TourTracker on sidebar nav for any user who visited /outreach
      // before this walkthrough shipped, which would otherwise silently
      // suppress the intro for them.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.outreach_intro;
      setOpen(shouldShow);
    })();
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (open === true) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  async function markOutreachVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const stamp = new Date().toISOString();
    // Write both keys: `outreach_intro` is the modal-specific gate, and
    // `outreach` keeps the dashboard / sidebar getting-started progress
    // widget ticking — same key TourTracker would use for a plain nav.
    const next = {
      ...((data?.tour_visited ?? {}) as TourVisited),
      outreach_intro: stamp,
      outreach:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markOutreachVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("outreach-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Outreach"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
    />
  );
}
