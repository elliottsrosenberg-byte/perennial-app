"use client";

// Tier 2: progressive tooltips that run after "Get started" on the intro
// modal. Same spotlight-ring visual language as the projects tour so the
// two flows feel like one experience.
//
// Action steps wait for real user events (no Next button); guided steps
// have a Next. The final step hands off to Ash with a contact-specific
// CTA — Ash uses the user's onboarding profile to suggest the first
// 8–10 contacts to add.
//
// Triggers (window events fired from ContactsClient + ContactDetailPanel):
//   contacts:modal-opened  → step 0 → 1
//   contacts:created       → step 1 → 2
//   contacts:detail-opened → step 2 → 3
//
// Persistence: profiles.tour_visited.contacts_tour set when the tour ends.

import { useEffect, useState, useCallback, useRef } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";
import { type TourVisited } from "@/lib/tour";

type AdvanceMode = "click-new" | "create" | "open-row" | "next";

interface Step {
  id:          string;
  anchor:      string | null;
  title:       string;
  body:        string;
  hint?:       string;
  advance:     AdvanceMode;
  spotlight?:  boolean;
  /** Free-roam step: nothing dimmed, nothing spotlit. Callout pins to the
   *  bottom-right corner so the user can scan the whole panel before we
   *  start pointing at specific affordances. */
  freeRoam?:   boolean;
  finalCta?:   { label: string; action: "ash-suggest-contacts" };
}

const W = 300;

const STEPS: Step[] = [
  {
    id:      "new-button",
    anchor:  '[data-tour-target="contacts.new-button"]',
    title:   "Add your first contact",
    body:    "Someone real — a gallery you've shown with, a fabricator, a client, the editor you've been chasing. Pick one person and add them. The list grows from there.",
    hint:    "Waiting for you to click + Contact…",
    advance: "click-new",
  },
  {
    id:      "in-modal",
    anchor:  '[data-tour-target="contacts.new-modal"]',
    title:   "Just a name to start",
    body:    "Everything else — email, phone, tags, company — you can add later from the detail panel. Don't let a half-filled form stop you from capturing the person.",
    hint:    "Waiting for the contact to be created…",
    advance: "create",
    spotlight: false,
  },
  {
    id:      "first-row",
    anchor:  '[data-tour-target="contacts.first-row"]',
    title:   "Open the relationship",
    body:    "Click the row. The detail panel slides open with everything Perennial knows about this person — and you can fill in the rest from inside.",
    hint:    "Waiting for you to open it…",
    advance: "open-row",
  },
  {
    id:       "explore",
    anchor:   null,
    title:    "Take it in.",
    body:     "This is the person's full file. The left rail holds identity, status, tags, linked projects, and a Workspace switcher for Canvas, Activity, Tasks, Notes, and Files. The main pane defaults to Canvas — your private thinking about this relationship. Take a look around. Hit Next when you want a guided pass.",
    advance:  "next",
    freeRoam: true,
  },
  {
    id:      "tags-status",
    anchor:  '[data-tour-target="contacts.detail-tags"]',
    title:   "Tag and stage",
    body:    "Add tags (gallery, press, collector, supplier) so this person can be sliced out of your list later. Status — Active, Inactive, Former client — keeps your view honest about who's currently in motion.",
    advance: "next",
  },
  {
    id:      "workspace",
    anchor:  '[data-tour-target="contacts.detail-workspace"]',
    title:   "One file per person",
    body:    "Canvas is your private thinking — collector preferences, gallery dynamics, the awkward thing they said last summer. Tasks, Notes, Files sit alongside. Linked projects appear in the sidebar.",
    advance: "next",
  },
  {
    id:      "activity",
    anchor:  '[data-tour-target="contacts.detail-activity"]',
    title:   "Log every touch",
    body:    "Calls, emails, meetings, studio visits — every logged activity updates the last-contact date. Skip a few weeks and they'll surface as needing a follow-up.",
    advance: "next",
  },
  {
    id:       "ash-handoff",
    anchor:   null,
    title:    "Let Ash kickstart your network",
    body:     "Ash knows your practice, your city, and your selling channels. Ask it to draft a starter list of 8–10 contacts you should reach out to — galleries, press, collectors that fit your work — with reasoning and suggested tags.",
    advance:  "next",
    spotlight: false,
    finalCta: { label: "Suggest contacts to add", action: "ash-suggest-contacts" },
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

  // Only inherit a child's radius if that child roughly fills the parent —
  // otherwise a small pill chip (e.g. a tag) inside a normal block would
  // round the whole ring into a giant blob.
  const sourceFillsParent =
    srcRect.width  >= parentRect.width  * 0.8 &&
    srcRect.height >= parentRect.height * 0.8;
  if (!sourceFillsParent) return pad;

  const isPill = raw >= Math.min(srcRect.width, srcRect.height) / 2 - 0.5;
  if (isPill) return Math.min(parentRect.width, parentRect.height) / 2 + pad;
  return raw + pad;
}

export default function ContactsTooltipTour() {
  const [active,   setActive]   = useState(false);
  const [stepIdx,  setStepIdx]  = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [pos,      setPos]      = useState<CalloutPos | null>(null);
  const [hidden,   setHidden]   = useState(false);
  const contactRef = useRef<{ id: string; first_name: string; last_name: string } | null>(null);

  // Init: only start if not yet done AND a session event fires from the intro modal.
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
      if (data?.tour_dismissed || visited.contacts_tour) {
        setHidden(true);
      }
    })();

    function start() { setActive(true); setStepIdx(0); setHidden(false); }
    window.addEventListener("contacts-tooltips-start", start);
    return () => {
      cancelled = true;
      window.removeEventListener("contacts-tooltips-start", start);
    };
  }, []);

  // Event-driven advance for action steps
  useEffect(() => {
    if (!active || hidden) return;

    function onModalOpen() {
      if (STEPS[stepIdx]?.advance === "click-new") setStepIdx((i) => i + 1);
    }
    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ id?: string; first_name?: string; last_name?: string }>).detail;
      if (detail?.id && detail.first_name) {
        contactRef.current = {
          id:         detail.id,
          first_name: detail.first_name,
          last_name:  detail.last_name ?? "",
        };
      }
      if (STEPS[stepIdx]?.advance === "create") setStepIdx((i) => i + 1);
    }
    function onDetailOpen() {
      if (STEPS[stepIdx]?.advance === "open-row") setStepIdx((i) => i + 1);
    }

    window.addEventListener("contacts:modal-opened",  onModalOpen);
    window.addEventListener("contacts:created",       onCreated);
    window.addEventListener("contacts:detail-opened", onDetailOpen);
    return () => {
      window.removeEventListener("contacts:modal-opened",  onModalOpen);
      window.removeEventListener("contacts:created",       onCreated);
      window.removeEventListener("contacts:detail-opened", onDetailOpen);
    };
  }, [active, hidden, stepIdx]);

  // Position the spotlight + callout
  const reposition = useCallback(() => {
    if (!active || hidden) { setHighlight(null); setPos(null); return; }
    const step = STEPS[stepIdx];

    // Free-roam step: pin to bottom-right corner, no spotlight, no dim. Lets
    // the user scan the whole panel before we start pointing at controls.
    if (step.freeRoam) {
      setHighlight(null);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({ top: vh - 240, left: vw - W - 24 });
      return;
    }

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
    const next = { ...((data?.tour_visited ?? {}) as TourVisited), contacts_tour: new Date().toISOString() };
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

  function suggestContacts() {
    const c = contactRef.current;
    const recentLine = c
      ? `I just added ${c.first_name} ${c.last_name}. Use them as one data point about my network — but think much broader.`
      : "";

    const prompt = [
      "I'm building out my contacts in Perennial and want your help thinking about who to add first.",
      recentLine,
      "",
      "Based on my practice (use my onboarding profile — what I make, how I sell, where I am, my years in practice), please:",
      "1. Suggest 8–10 specific kinds of contacts I should be adding right now — galleries, press, collectors, fabricators, peers. Be specific about the role and why it matters for my stage.",
      "2. For each, suggest 1–2 tags I should use (gallery / press / collector / client / supplier / etc.) and what to log as the first activity.",
      "3. End with one sentence on the *one* relationship I should prioritize seeding this week and why.",
      "Be concrete — names of types of contacts that matter to my city and channels, not generic advice.",
    ].filter(Boolean).join("\n");

    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }));
    dismiss();
  }

  if (!active || hidden) return null;
  const step   = STEPS[stepIdx];
  if (step.anchor && !pos) return null;
  const isLast = stepIdx === STEPS.length - 1;
  const isActionStep = step.advance !== "next";
  const centered = !step.anchor && !step.freeRoam;

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
        aria-label={`People tour step ${stepIdx + 1}: ${step.title}`}
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
            People tour · {stepIdx + 1} of {STEPS.length}
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
          marginBottom: step.hint || step.finalCta || !isActionStep ? 10 : 0,
        }}>
          {step.body}
        </p>

        {step.hint && (
          <p style={{ fontSize: 10, color: "rgba(245,241,233,0.42)", lineHeight: 1.4, fontStyle: "italic" }}>
            {step.hint}
          </p>
        )}

        {isLast && step.finalCta?.action === "ash-suggest-contacts" ? (
          <>
            <button
              onClick={suggestContacts}
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
        ) : !isActionStep ? (
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
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              type="button"
              onClick={dismiss}
              style={{
                background: "none", border: "none", padding: "4px 6px",
                fontSize: 10.5, color: "rgba(245,241,233,0.55)",
                cursor: "pointer", fontFamily: "inherit",
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              Skip tour
            </button>
          </div>
        )}
      </div>
    </>
  );
}
