"use client";

// Tier 1: full-screen modal that introduces the Notes module with 4
// animated slides. Closing it (Skip OR Get started) marks
// profiles.tour_visited.notes_intro so it won't re-show. "Get started"
// also fires window event "notes-tooltips-start" which the tooltip tour
// listens for.

import { useState, useEffect } from "react";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited } from "@/lib/tour";
import {
  WritingSurface, PinAndFilter, LinkBack, NoteToTasks,
} from "./NoteAnimations";

interface Slide {
  title: string;
  body:  string;
  Anim:  () => React.ReactElement;
}

const SLIDES: Slide[] = [
  {
    title: "Capture the thinking.",
    body:  "Notes are your studio's open page — meeting notes, sketches in words, half-formed pitches, lists, drafts. Plain writing surface, rich formatting when you want it, auto-saved as you type.",
    Anim:  WritingSurface,
  },
  {
    title: "Pin what matters, find anything.",
    body:  "Pin the few notes you keep coming back to so they float to the top. Search the title and body of every note from one box. Sidebar filters slice your list by project, person, or opportunity.",
    Anim:  PinAndFilter,
  },
  {
    title: "Link a note to the work.",
    body:  "Drop a note onto a project, a contact, or an opportunity and it shows up everywhere that thing lives. One note can link to all three — the visit notes for a client commission carry the whole context with them.",
    Anim:  LinkBack,
  },
  {
    title: "From notes to motion.",
    body:  "Type Space anywhere to ask Ash to write inline, or hit Generate tasks and Ash will read the note and propose what to do next. Pick the ones that fit, set due dates, ship them to your task list.",
    Anim:  NoteToTasks,
  },
];

export default function NotesIntroModal() {
  const [open,    setOpen]    = useState<boolean | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

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

  const isLast  = stepIdx === SLIDES.length - 1;
  const isFirst = stepIdx === 0;
  const slide   = SLIDES[stepIdx];
  const Anim    = slide.Anim;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes walkthrough"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(31,33,26,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "nt-modal-bg 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes nt-modal-bg   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nt-modal-card { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: 480,
          // Locked height so clicking through the walkthrough never
          // shifts the modal. Copy region (flex 1) absorbs body length.
          height: 560,
          maxHeight: "90vh",
          background: "var(--color-warm-white)",
          borderRadius: 16,
          border: "0.5px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(31,33,26,0.32), 0 4px 12px rgba(31,33,26,0.16)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "nt-modal-card 0.24s ease-out",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-off-white)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-grey)" }}>
            Notes · {stepIdx + 1} of {SLIDES.length}
          </span>
          <button
            onClick={() => close(false)}
            aria-label="Skip walkthrough"
            title="Skip"
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer",
              color: "var(--color-grey)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6,
            }}
          >
            <XIcon size={15} />
          </button>
        </div>

        {/* Animation panel */}
        <div style={{ padding: "20px 24px 0" }}>
          <div key={stepIdx}>
            <Anim />
          </div>
        </div>

        {/* Copy */}
        <div style={{ padding: "18px 24px 20px", flex: 1, overflowY: "auto" }}>
          <h2 style={{
            fontFamily: "var(--font-newsreader)",
            fontSize: 22, fontWeight: 700,
            color: "var(--color-charcoal)",
            letterSpacing: "-0.01em", marginBottom: 8,
          }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 13, color: "var(--color-grey)", lineHeight: 1.6 }}>
            {slide.body}
          </p>
        </div>

        {/* Progress dots */}
        <div style={{ padding: "0 24px 12px", display: "flex", gap: 6, justifyContent: "center" }}>
          {SLIDES.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === stepIdx ? 18 : 6, height: 6, borderRadius: 99,
                background: i === stepIdx ? "var(--color-sage)" : "var(--color-border)",
                transition: "width 0.2s ease, background 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px 18px",
          borderTop: "0.5px solid var(--color-border)",
          gap: 8,
        }}>
          <button
            onClick={isFirst ? () => close(false) : () => setStepIdx((i) => i - 1)}
            style={{
              fontSize: 12, color: "var(--color-grey)",
              background: "none", border: "none", padding: "8px 6px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isFirst ? "Skip" : "← Back"}
          </button>
          <button
            onClick={() => isLast ? close(true) : setStepIdx((i) => i + 1)}
            style={{
              padding: "9px 22px",
              fontSize: 13, fontWeight: 600,
              background: "var(--color-sage)", color: "var(--color-warm-white)",
              border: "none", borderRadius: 9, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {isLast ? "Get started →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
