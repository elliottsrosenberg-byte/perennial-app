"use client";

// Tier 1: full-screen modal that introduces the Resources module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.resources_intro so it won't re-show. "Get started"
// also fires window event "resources-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import {
  CategoryMaterialize, CardFills, FileLands, LinkSaved,
} from "./ResourcesAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Your studio's reference library.",
    body:  "Resources holds the documents your studio runs on — operations, brand, press, design. The stuff a gallery, accountant, or new collaborator might ask for, organized where you can actually find it.",
    Anim:  CategoryMaterialize,
  },
  {
    title: "Fill it in, or let Ash draft it.",
    body:  "Each card walks you through what belongs there — bios, mission, positioning, shipping specs. Type it yourself or hand Ash the prompts and get a polished first draft back in two minutes.",
    Anim:  CardFills,
  },
  {
    title: "Drop in the files you already have.",
    body:  "Upload logos, lookbooks, contracts, W-9s — they land in your private storage and stay one click away. Each category tracks what's stored versus what's still missing, so you know exactly where the gaps are.",
    Anim:  FileLands,
  },
  {
    title: "Or just link to where it lives.",
    body:  "Already have a Dropbox or Drive that runs your studio? Save the link and it sits alongside the rest. Resources doesn't fight your file system — it points to it.",
    Anim:  LinkSaved,
  },
];

export default function ResourcesIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // resources walkthrough.
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
      // Gate on a dedicated `resources_intro` key. We deliberately do NOT
      // gate on `visited.resources` — that key gets auto-marked by
      // TourTracker on sidebar nav for any user who visited /resources
      // before this walkthrough shipped, which would otherwise silently
      // suppress the intro for them.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.resources_intro;
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

  async function markResourcesVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const stamp = new Date().toISOString();
    // Write both keys: `resources_intro` is the modal-specific gate, and
    // `resources` keeps the dashboard / sidebar getting-started progress
    // widget ticking — same key TourTracker would use for a plain nav.
    const next = {
      ...((data?.tour_visited ?? {}) as TourVisited),
      resources_intro: stamp,
      resources:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markResourcesVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("resources-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Resources"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
    />
  );
}
