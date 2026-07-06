"use client";

// Tier 1: full-screen modal that introduces the Tasks module with 4 animated
// slides. Closing it (Skip OR Get started) marks profiles.tour_visited with
// the dedicated `tasks_intro` key so it won't re-show. We deliberately gate
// on `tasks_intro` (not `tasks`) so that any user who hit /tasks before this
// walkthrough shipped — and had `tasks` auto-marked by TourTracker — still
// sees the modal on their next visit.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import { QuickCapture, DueDateTriage, ProjectLinkage, InlineEdits } from "./TaskAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Capture, fast.",
    body:  "Tasks are your action backbone — the small concrete moves that keep projects alive: chase a deposit, order a part, send a draft, follow up with a gallery. Type at the top, hit enter, it's in.",
    Anim:  QuickCapture,
  },
  {
    title: "Today, overdue, what's next.",
    body:  "The list sorts itself by due date — Overdue rises, Today gets focus, Upcoming sits below. Filter to a single bucket when you want to clear it. Nothing here ever silently disappears.",
    Anim:  DueDateTriage,
  },
  {
    title: "Linked to the work.",
    body:  "Any task can hang off a project, a contact, or an opportunity. Linked tasks roll up into the project's file — open a project and its open task count is right there. One source of truth for what's left to do.",
    Anim:  ProjectLinkage,
  },
  {
    title: "Edit in place.",
    body:  "Click the title to rename. Tap the due-date pill to reschedule. Cycle priority. No modal, no save button — the list moves as fast as you think.",
    Anim:  InlineEdits,
  },
];

export default function TasksIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

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
        !visited.tasks_intro;
      setOpen(shouldShow);
    })();
  }, []);

  useEffect(() => {
    if (open === true) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  async function markTasksVisited() {
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
      tasks_intro: stamp,
      tasks:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markTasksVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("tasks-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Tasks"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
      getStartedLabel="Get started →"
    />
  );
}
