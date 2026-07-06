"use client";

// Tier 1: full-screen modal that introduces the Notes module with 3
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.notes_intro so it won't re-show. "Get started"
// also fires window event "notes-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import { WritingSurface, NoteToTasks, InlineAshTease } from "./NoteAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Capture the thinking.",
    body:  "Notes are your studio's open page — meeting recaps, sketches in words, half-formed pitches, drafts. A plain writing surface with rich formatting when you want it, linkable to projects, contacts, and opportunities.",
    Anim:  WritingSurface,
  },
  {
    title: "Write freely. We save as you go.",
    body:  "There's no Save button — every keystroke is persisted. Walk away, close the tab, come back tomorrow. Your draft is exactly where you left it.",
    Anim:  WritingSurface,
  },
  {
    title: "Three power moves to know.",
    body:  "Generate tasks turns a note into actionable to-dos. Share gets you a public link or a Markdown export. And typing a space at the start of any new line calls Ash inline — ask for a draft, a rewrite, a summary.",
    Anim:  InlineAshTease,
  },
];

export default function NotesIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // notes walkthrough.
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
      // Gate on a dedicated `notes_intro` key. We deliberately do NOT
      // gate on `visited.notes` — that key gets auto-marked by
      // TourTracker on sidebar nav for any user who visited /notes
      // before this walkthrough shipped, which would otherwise silently
      // suppress the intro for them.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.notes_intro;
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

  async function markNotesVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const stamp = new Date().toISOString();
    // Write both keys: `notes_intro` is the modal-specific gate, and
    // `notes` keeps the dashboard / sidebar getting-started progress
    // widget ticking — same key TourTracker would use for a plain nav.
    const next = {
      ...((data?.tour_visited ?? {}) as TourVisited),
      notes_intro: stamp,
      notes:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markNotesVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("notes-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Notes"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
    />
  );
}
