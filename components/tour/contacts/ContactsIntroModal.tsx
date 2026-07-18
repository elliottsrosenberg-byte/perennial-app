"use client";

// Tier 1: full-screen modal that introduces the Network module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.contacts so it won't re-show. "Get started" also
// fires window event "contacts-tooltips-start" which the tooltip tour
// listens for. (Internal keys + event names keep the legacy "contacts"
// naming — only user-visible copy says "Network".)

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import { launchAshSetup } from "@/components/tour/launchAshSetup";
import {
  NetworkMaterialize, StaleSurface, TagFilter, RelationshipFile,
} from "./ContactAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Your network",
    body:  "Network holds everyone connected to your studio — galleries, collectors, press, clients, fabricators, plus the leads you're still chasing and the organizations they belong to. Each row carries status, tags, and when you last connected, so the list reads like a living map of your practice.",
    Anim:  NetworkMaterialize,
  },
  {
    title: "Last contact",
    body:  "Every contact tracks last contact. The pill ages on its own — today is green, two weeks slips to neutral, a month turns amber, longer goes red. Stale relationships rise to the top so important ties don't quietly fade.",
    Anim:  StaleSurface,
  },
  {
    title: "Contacts, Leads, Organizations",
    body:  "Switch between Contacts (relationships you've started), Leads (the pipeline you're working), and Organizations (galleries, studios, publications) at the top. Contacts and leads share the same person record — convert a lead the moment the relationship begins. Tags slice your network in seconds; stages keep the pipeline honest.",
    Anim:  TagFilter,
  },
  {
    title: "The relationship file",
    body:  "Open any row — person or organization — and you get its full file: Canvas for your thinking, Activity for every logged touchpoint, Tasks, Notes, Files. Linked projects show in the sidebar. One scrim, everything you know about this contact or studio.",
    Anim:  RelationshipFile,
  },
];

export default function ContactsIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);

  // Decide on mount whether to show. Show iff user has onboarding_complete,
  // hasn't dismissed the global tour, and hasn't already finished the
  // contacts walkthrough.
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
      // Gate on a dedicated `contacts_intro` key. We deliberately do NOT
      // gate on `visited.contacts` — that key gets auto-marked by
      // TourTracker on sidebar nav for any user who visited /contacts
      // before this walkthrough shipped, which would otherwise silently
      // suppress the intro for them.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.contacts_intro;
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

  async function markContactsVisited() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const stamp = new Date().toISOString();
    // Write both keys: `contacts_intro` is the modal-specific gate, and
    // `contacts` keeps the dashboard / sidebar getting-started progress
    // widget ticking — same key TourTracker would use for a plain nav.
    const next = {
      ...((data?.tour_visited ?? {}) as TourVisited),
      contacts_intro: stamp,
      contacts:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markContactsVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("contacts-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Network"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
      onSetupWithAsh={() => { void close(false); launchAshSetup("Network"); }}
      getStartedLabel="Get started →"
    />
  );
}
