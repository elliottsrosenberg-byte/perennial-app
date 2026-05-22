"use client";

// Tier 2: progressive tooltips that run after "Get started" on the Finance
// intro modal. Same spotlight-ring visual language as the other module
// tours so the experience feels unified.
//
// All steps are Next-driven. Finance has multiple sub-tabs, so rather than
// orchestrate action events across tabs (timer start / expense create /
// invoice draft / bank connect) we walk the user across the tab strip and
// point at the primary affordances. A final Ash handoff offers to draft a
// finance setup checklist tuned to the user's practice.
//
// The tour switches the active tab as it advances so the anchors are
// always visible — it dispatches `finance:set-tab` events that
// FinanceClient listens for.
//
// Persistence: profiles.tour_visited.finance_tour set when the tour ends.

import { useEffect, useState, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

type Tab = "overview" | "time" | "expenses" | "invoices" | "banking";

interface Step {
  id:        string;
  anchor:    string | null;
  /** Switch to this tab before measuring the anchor. */
  tab?:      Tab;
  title:     string;
  body:      string;
  spotlight?: boolean;
  /** Final-step CTA that opens Ash with a setup prompt. */
  finalCta?: { label: string; action: "ash-finance-setup" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "topbar-tabs",
    anchor:  '[data-tour-target="finance.tabs"]',
    tab:     "overview",
    title:   "Five tabs, one studio ledger",
    body:    "Overview is your daily glance. Time, Expenses, and Invoices are where the work goes in. Banking is the connected real-money side. They share data — log time, then pull it into an invoice without retyping.",
  },
  {
    id:      "timer",
    anchor:  '[data-tour-target="finance.timer-bar"]',
    tab:     "time",
    title:   "Start the timer",
    body:    "Type what you're working on, pick a project, and Start. The timer keeps running across reloads — there's also a quick Start in the app topbar so it's always one click away. Stop the timer and the hours land here as a time entry.",
  },
  {
    id:      "expenses",
    anchor:  '[data-tour-target="finance.add-expense"]',
    tab:     "expenses",
    title:   "Add an expense",
    body:    "Log studio costs as they happen — categorize, attach to a project, drop a receipt photo. The sidebar rolls everything up by category and project, and the warning bar flags anything sitting unattached.",
  },
  {
    id:      "invoices",
    anchor:  '[data-tour-target="finance.new-invoice"]',
    tab:     "invoices",
    title:   "Build an invoice",
    body:    "Pick a client, link a project, and create the draft. Once it's open you can ↓ Pull from project time to convert billable hours into line items, or add anything manually. Send it through Perennial when it's ready.",
  },
  {
    id:      "banking",
    anchor:  '[data-tour-target="finance.connect-bank"]',
    tab:     "banking",
    title:   "Connect a bank (optional)",
    body:    "Teller pulls balances and recent transactions read-only — Perennial never moves money. It's optional, but useful for seeing what cash is actually in the account vs. what's invoiced but not collected.",
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash draft your finance setup",
    body:     "Ash knows your practice and your selling channels. Ask it to suggest the first three things to set up in Finance — a rate to log against, the categories of expenses you'll actually use, and an invoice template tuned to how you bill.",
    spotlight: false,
    finalCta: { label: "Plan my finance setup", action: "ash-finance-setup" },
  },
];

interface Highlight { top: number; left: number; w: number; h: number; radius: number; }
interface CalloutPos { top: number; left: number; }

function ringRadiusFor(el: HTMLElement, pad: number): number {
  const parentRect = el.getBoundingClientRect();

  function readRadius(node: HTMLElement): number {
    const parts = window.getComputedStyle(node)
      .borderRadius.split(/\s+/)
      .map((p) => parseFloat(p) || 0);
    return Math.max(0, ...parts);
  }
  function findRadius(node: HTMLElement, depth: number): { radius: number; rect: DOMRect } | null {
    const own = readRadius(node);
    if (own > 0) return { radius: own, rect: node.getBoundingClientRect() };
    if (depth <= 0) return null;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i] as HTMLElement;
      const found = findRadius(child, depth - 1);
      if (found) return found;
    }
    return null;
  }

  const found = findRadius(el, 3);
  if (!found) return pad;
  const { radius: raw, rect: srcRect } = found;
  const sourceFillsParent =
    srcRect.width  >= parentRect.width  * 0.8 &&
    srcRect.height >= parentRect.height * 0.8;
  if (!sourceFillsParent) return pad;

  const isPill = raw >= Math.min(srcRect.width, srcRect.height) / 2 - 0.5;
  if (isPill) return Math.min(parentRect.width, parentRect.height) / 2 + pad;
  return raw + pad;
}

export default function FinanceTooltipTour() {
  const [active,    setActive]    = useState(false);
  const [stepIdx,   setStepIdx]   = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,       setPos]       = useState<CalloutPos | null>(null);
  const [hidden,    setHidden]    = useState(false);

  // Init: gate by tour_dismissed / finance_tour, then listen for the
  // intro modal's "get started" event.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("tour_visited, tour_dismissed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const visited = (data?.tour_visited ?? {}) as TourVisited;
      if (data?.tour_dismissed || visited.finance_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("finance-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("finance-tooltips-start", start);
    };
  }, []);

  // Switch tabs as the active step changes
  useEffect(() => {
    if (!active || hidden) return;
    const step = STEPS[stepIdx];
    if (step.tab) {
      window.dispatchEvent(new CustomEvent("finance:set-tab", { detail: { tab: step.tab } }));
    }
  }, [active, hidden, stepIdx]);

  // Position the spotlight + callout
  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = STEPS[stepIdx];

    if (!step.anchor) {
      setHighlight(null);
      setPos(null);
      return;
    }

    const el = document.querySelector<HTMLElement>(step.anchor);
    if (!el) { setHighlight(null); setPos(null); return; }

    const r = el.getBoundingClientRect();
    const useSpotlight = step.spotlight !== false;
    if (useSpotlight) {
      const pad = 4;
      setHighlight({
        top:    r.top - pad,
        left:   r.left - pad,
        w:      r.width + pad * 2,
        h:      r.height + pad * 2,
        radius: ringRadiusFor(el, pad),
      });
    } else {
      setHighlight(null);
    }

    const gap = 14;
    const H   = 200;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;

    let top  = r.bottom + gap;
    let left = r.left;
    if (top + H + 20 > vh)   top  = Math.max(20, r.top - H - gap);
    if (left + W + 20 > vw)  left = Math.max(20, r.right - W);
    left = Math.max(20, Math.min(vw - W - 20, left));
    top  = Math.max(20, Math.min(vh - 60, top));

    setPos({ top, left });
  }, [active, hidden, stepIdx]);

  useEffect(() => {
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    const interval = window.setInterval(reposition, 350);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(interval);
    };
  }, [reposition]);

  async function markDone() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("tour_visited")
      .eq("user_id", user.id)
      .maybeSingle();
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), finance_tour: new Date().toISOString() };
    await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
  }

  function dismiss() {
    setActive(false);
    setHidden(true);
    markDone();
  }

  function nextStep() {
    if (stepIdx >= STEPS.length - 1) { dismiss(); return; }
    setStepIdx((i) => i + 1);
  }

  function ashFinanceSetup() {
    const prompt = [
      "I'm setting up the Finance module in Perennial and want your help thinking it through.",
      "",
      "Based on my practice (use my onboarding profile — what I make, how I sell, where I am, years in practice, my hourly rate if I set one), please:",
      "1. Suggest the first three things I should configure or log in Finance this week — be specific, not generic.",
      "2. Tell me which of materials / travel / production / software / other expense categories I'll actually use most, and what kinds of receipts to capture.",
      "3. Suggest an invoice template (line item structure + payment terms) that fits how I bill — flat fees, hourly, or hybrid.",
      "End with one sentence on the single piece of finance hygiene I should commit to weekly.",
    ].join("\n");

    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }));
    dismiss();
  }

  if (!active || hidden) return null;
  const step   = STEPS[stepIdx];
  if (step.anchor && !pos) return null;
  const isLast = stepIdx === STEPS.length - 1;
  const centered = !step.anchor;

  return (
    <>
      {/* Spotlight ring + dim */}
      {highlight && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top:    highlight.top,
            left:   highlight.left,
            width:  highlight.w,
            height: highlight.h,
            borderRadius: highlight.radius,
            boxShadow: "0 0 0 2px var(--color-sage), 0 0 0 9999px rgba(0,0,0,0.28)",
            pointerEvents: "none",
            zIndex: 55,
            transition: "top 0.18s ease, left 0.18s ease, width 0.18s ease, height 0.18s ease",
          }}
        />
      )}

      {/* Centered backdrop dim for anchor-less steps */}
      {centered && (
        <div
          aria-hidden
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.32)",
            zIndex: 55,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={`Finance tour step ${stepIdx + 1}: ${step.title}`}
        style={{
          position: "fixed",
          top:  centered ? "50%" : pos!.top,
          left: centered ? "50%" : pos!.left,
          transform: centered ? "translate(-50%, -50%)" : "none",
          width: W,
          zIndex: 60,
          background: "#1f211a",
          color: "#f5f1e9",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,0.36), 0 2px 6px rgba(0,0,0,0.20)",
          padding: "13px 15px",
          fontFamily: "inherit",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(245,241,233,0.5)" }}>
            Finance tour · {stepIdx + 1} of {STEPS.length}
          </span>
          <button
            onClick={dismiss}
            aria-label="Skip tour"
            title="Skip tour"
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer",
              color: "rgba(245,241,233,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}
          >
            <XIcon size={13} />
          </button>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,241,233,0.96)", marginBottom: 5 }}>
          {step.title}
        </h3>
        <p style={{
          fontSize: 11.5,
          color: "rgba(245,241,233,0.78)",
          lineHeight: 1.55,
          marginBottom: 10,
        }}>
          {step.body}
        </p>

        {isLast && step.finalCta?.action === "ash-finance-setup" ? (
          <>
            <button
              onClick={ashFinanceSetup}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "8px 12px",
                background: "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)",
                color: "white",
                border: "none", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                marginTop: 4,
              }}
            >
              <AshMark size={12} variant="on-dark" />
              {step.finalCta.label}
            </button>
            <button
              onClick={dismiss}
              style={{
                display: "block", width: "100%",
                marginTop: 8,
                fontSize: 11, color: "rgba(245,241,233,0.55)",
                background: "none", border: "none", padding: "4px 0",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              I&apos;ll explore on my own
            </button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                background: "none", border: "none", padding: "6px 4px",
                fontSize: 11, color: "rgba(245,241,233,0.55)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Skip tour
            </button>
            <button
              type="button"
              onClick={nextStep}
              style={{
                padding: "6px 14px", fontSize: 11, fontWeight: 600,
                background: "var(--color-sage)", color: "#f9faf4",
                border: "none", borderRadius: 7, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
