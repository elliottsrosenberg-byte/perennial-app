"use client";

// Tier 1: full-screen modal that introduces the Projects module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.projects so it won't re-show. "Get started" also
// fires window event "projects-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import { launchAshSetup } from "@/components/tour/launchAshSetup";
import { CardMaterialize, FormFill, ScrimOpen, DragColumns } from "./ProjectAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Your work, tracked.",
    body:  "Projects are every piece of work you're making, selling, or pitching — editions, commissions, client jobs, side experiments. Everything else in Perennial connects back to them.",
    Anim:  CardMaterialize,
  },
  {
    title: "Organize the way you think.",
    body:  "Columns are status — Planning, In progress, On hold, Complete, Cut. Drag any project card between columns to update its status. Filter to a single column when you want focus.",
    Anim:  DragColumns,
  },
  {
    title: "Open a project to do the work.",
    body:  "Click a card and the project opens as a scrim view — your project in focus, your board still behind it. Want more room? Expand to full screen. Click out to come back.",
    Anim:  ScrimOpen,
  },
  {
    title: "Everything for the project, in one place.",
    body:  "The left rail holds your sections — Canvas, Tasks, Contacts, Notes, Files — and the content sits beside it. Pick a section to jump straight in, with Ash a click away if you want a partner.",
    Anim:  FormFill,
  },
];

export default function ProjectsIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // projects walkthrough.
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
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.projects;
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

  async function markProjectsVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), projects: new Date().toISOString() };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markProjectsVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("projects-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Projects"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
      onSetupWithAsh={() => { void close(false); launchAshSetup("Projects"); }}
    />
  );
}
