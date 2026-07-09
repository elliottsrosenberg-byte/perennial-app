"use client";

// Tier 1: full-screen modal that introduces the Calendar module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.calendar_intro so it won't re-show. "Get started"
// also fires window event "calendar-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import {
  WeekGridMaterialize, ConnectCalendars, QuickCapture, UnifiedTimeline,
} from "./CalendarAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Your studio's calendar.",
    body:  "Project deadlines, outreach follow-ups, tasks with due dates, synced events from Google or Outlook, and opportunity bars from your Perennial Feed all live on the same week view. Two CTAs in the topbar — New task and New event — let you add to either side without a context switch.",
    Anim:  WeekGridMaterialize,
  },
  {
    title: "Bring in real calendars.",
    body:  "Connect Google or Outlook from the left rail. The Calendars panel groups each connection by account and shows every calendar you've subscribed to — toggle visibility with the eye, change a calendar's color, or hide everything but one calendar for a focus session. Multiple accounts? Stack them.",
    Anim:  ConnectCalendars,
  },
  {
    title: "Tasks and events, side by side.",
    body:  "Tasks ride above the all-day row in their own ribbon so the day's to-dos are the first thing you scan. Click on the time grid (or drag) to draft an event — the create card slides in from the side without dimming the calendar, so you can still see what you're scheduling around. Ash can create tasks for you too: \"remind me to email Foster next Thursday\".",
    Anim:  QuickCapture,
  },
  {
    title: "Opportunities at a glance.",
    body:  "Fairs, open calls, grants, awards, and residencies you're tracking in Presence show up as multi-day bars across the all-day row. The Perennial Feed panel in the left rail lets you toggle each category on or off — keep the cadence visible without losing your week to it.",
    Anim:  UnifiedTimeline,
  },
];

export default function CalendarIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

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

  return (
    <IntroModalShell
      label="Calendar"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
    />
  );
}
