"use client";

// Tier 1: full-screen modal that introduces the Presence module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.presence_intro so it won't re-show. "Get started"
// also fires window event "presence-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import { FeedMaterialize, FilterFocus, StatusSnap, IntegrationsLight } from "./PresenceAnimations";

const SLIDES: IntroSlide[] = [
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

  return (
    <IntroModalShell
      label="Presence"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
    />
  );
}
