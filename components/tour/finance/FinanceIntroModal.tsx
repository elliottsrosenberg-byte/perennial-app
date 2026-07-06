"use client";

// Tier 1: full-screen modal that introduces the Finance module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.finance_intro so it won't re-show. "Get started"
// also fires window event "finance-tooltips-start" which the tooltip
// tour listens for. Mirrors the Projects/Contacts/Outreach pattern.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import IntroModalShell, { type IntroSlide } from "@/components/tour/IntroModalShell";
import {
  TimerTick, ExpenseLand, InvoicePull, BankConnect,
} from "./FinanceAnimations";

const SLIDES: IntroSlide[] = [
  {
    title: "Track time like a habit",
    body:  "The timer is one click from anywhere. Tag what you're doing, pin it to a project, and the studio learns where your hours actually go — billable or internal. Skip it and Log time after the fact.",
    Anim:  TimerTick,
  },
  {
    title: "Expenses, by project",
    body:  "Log studio costs as they happen — materials, travel, software, production, other. Attach them to a project and they roll up against that work. Anything unattached gets flagged so nothing slips between the cracks.",
    Anim:  ExpenseLand,
  },
  {
    title: "Invoices that build themselves",
    body:  "Pick a client and a project, then pull your billable time and expenses straight in as line items. Edit anything you want. Status moves Draft → Sent → Paid, and you can send the invoice over email when you're ready.",
    Anim:  InvoicePull,
  },
  {
    title: "Bank-connected, optional",
    body:  "Connect a checking, savings, or credit account through Teller and Perennial pulls balances and recent transactions into Banking — a real picture of cash flow, separate from invoiced revenue. Add Stripe in Settings to read your payment activity too.",
    Anim:  BankConnect,
  },
];

export default function FinanceIntroModal() {
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
      // Dedicated `finance_intro` gate so users who visited /finance before
      // this walkthrough shipped still see it. `finance` is auto-marked by
      // TourTracker on any sidebar nav.
      const shouldShow =
        Boolean(data?.onboarding_complete) &&
        !data?.tour_dismissed &&
        !visited.finance_intro;
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

  async function markFinanceVisited() {
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
      finance_intro: stamp,
      finance:       stamp,
    };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  async function close(startTooltips: boolean) {
    setOpen(false);
    await markFinanceVisited();
    if (startTooltips) {
      window.dispatchEvent(new Event("finance-tooltips-start"));
    }
  }

  if (open !== true) return null;

  return (
    <IntroModalShell
      label="Finance"
      slides={SLIDES}
      onSkip={() => close(false)}
      onGetStarted={() => close(true)}
    />
  );
}
