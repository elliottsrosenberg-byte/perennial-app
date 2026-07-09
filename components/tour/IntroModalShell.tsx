"use client";

// Shared presentation shell for the per-module intro modals (Projects, Tasks,
// Finance, …). Each module keeps its own show-logic, slides, and animations and
// just renders this shell — so the chrome stays consistent and matches the
// onboarding system (light surface, centered, sage accents, soft depth).

import { useState } from "react";
import { X as XIcon } from "lucide-react";

export interface IntroSlide {
  title: string;
  body:  string;
  Anim:  () => React.ReactElement;
}

interface Props {
  /** Small uppercase eyebrow, e.g. "Projects". */
  label:          string;
  slides:         IntroSlide[];
  /** Skip / dismiss (X, or Back on the first slide). */
  onSkip:         () => void;
  /** Final CTA on the last slide. */
  onGetStarted:   () => void;
  getStartedLabel?: string;
}

export default function IntroModalShell({
  label, slides, onSkip, onGetStarted, getStartedLabel = "Get started",
}: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const isLast  = stepIdx === slides.length - 1;
  const isFirst = stepIdx === 0;
  const slide   = slides[stepIdx];
  const Anim    = slide.Anim;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} walkthrough`}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.34)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "intro-bg 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes intro-bg   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes intro-card { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        style={{
          position: "relative",
          width: "100%", maxWidth: 460, maxHeight: "90vh",
          background: "var(--color-off-white)",
          borderRadius: 20,
          border: "0.5px solid var(--color-border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "intro-card 0.24s ease-out",
        }}
      >
        {/* Soft sage accent blob, top-right, for a touch of colour. */}
        <div aria-hidden style={{
          position: "absolute", top: -70, right: -50, width: 220, height: 220,
          borderRadius: "50%", background: "rgba(var(--color-sage-rgb),0.14)",
          filter: "blur(60px)", pointerEvents: "none",
        }} />

        {/* Close, top-right */}
        <button
          onClick={onSkip}
          aria-label="Skip walkthrough"
          title="Skip"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 1,
            background: "none", border: "none", padding: 6, cursor: "pointer",
            color: "var(--color-text-tertiary)", display: "flex",
            alignItems: "center", justifyContent: "center", borderRadius: 8,
          }}
        >
          <XIcon size={16} />
        </button>

        {/* Animation panel */}
        <div style={{ padding: "26px 28px 0", position: "relative", zIndex: 1 }}>
          <div key={stepIdx}><Anim /></div>
        </div>

        {/* Copy — centered, matching onboarding */}
        <div style={{ padding: "20px 30px 8px", textAlign: "center", flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-sage-text)", marginBottom: 8 }}>
            {label}
          </p>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: 23, fontWeight: 600,
            color: "var(--color-charcoal)",
            letterSpacing: "-0.01em", lineHeight: 1.15, marginBottom: 8,
          }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--color-text-secondary)", lineHeight: 1.6, maxWidth: 380, marginInline: "auto" }}>
            {slide.body}
          </p>
        </div>

        {/* Progress dots — elongated active, like onboarding */}
        <div style={{ padding: "12px 0 4px", display: "flex", gap: 6, justifyContent: "center", position: "relative", zIndex: 1 }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === stepIdx ? 26 : 6, height: 6, borderRadius: 99,
                background: i < stepIdx ? "var(--color-sage)" : i === stepIdx ? "var(--color-sage)" : "var(--color-border-strong)",
                transition: "width 0.2s ease, background 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 24px 20px", gap: 8, position: "relative", zIndex: 1,
        }}>
          <button
            onClick={isFirst ? onSkip : () => setStepIdx((i) => i - 1)}
            style={{
              fontSize: 12, color: "var(--color-grey)",
              background: "none", border: "none", padding: "8px 6px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isFirst ? "Skip" : "← Back"}
          </button>
          <button
            onClick={() => (isLast ? onGetStarted() : setStepIdx((i) => i + 1))}
            style={{
              padding: "11px 24px",
              fontSize: 13, fontWeight: 600,
              background: "var(--color-sage)", color: "var(--color-warm-white)",
              border: "none", borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 6px 18px rgba(var(--color-sage-rgb),0.30)",
            }}
          >
            {isLast ? getStartedLabel : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
