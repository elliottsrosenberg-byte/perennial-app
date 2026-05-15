"use client";

// First-time hint shown inside a Canvas surface (project or contact) the
// first time it's opened, teaching the user about the "Press Space to ask
// Ash" shortcut. Persists dismissal in localStorage so it never reappears.
//
// Positioned absolute inside the canvas scroll container — caller should
// give the parent `position: relative` and render this near the bottom of
// the editor body.

import { useState, useSyncExternalStore } from "react";
import { X, Keyboard } from "lucide-react";
import AshMark from "@/components/ui/AshMark";

const STORAGE_KEY = "perennial-canvas-ash-hint-seen";

function readSeen(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}
function subscribe() {
  return () => {};
}

export default function CanvasAshHint() {
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  if (seen || dismissedThisSession) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissedThisSession(true);
  }

  return (
    <div
      role="status"
      style={{
        position: "absolute",
        right: 24, bottom: 24, zIndex: 5,
        maxWidth: 280,
        background: "var(--color-charcoal)",
        color: "rgba(245,241,233,0.95)",
        borderRadius: 12,
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        padding: "12px 14px 12px 14px",
        display: "flex", alignItems: "flex-start", gap: 10,
        fontSize: 12, lineHeight: 1.5,
      }}
    >
      <div
        style={{
          width: 26, height: 26, borderRadius: 999, flexShrink: 0,
          background: "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginTop: 1,
        }}
      >
        <AshMark size={13} variant="on-dark" animate />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 600, marginBottom: 4, color: "white", fontSize: 12 }}>
          Tip: hand the page to Ash
        </p>
        <p style={{ color: "rgba(245,241,233,0.7)", fontSize: 11, marginBottom: 8 }}>
          On a blank line, press{" "}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "1px 6px", borderRadius: 5,
            background: "rgba(255,255,255,0.12)",
            border: "0.5px solid rgba(255,255,255,0.18)",
            fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
            fontSize: 10, fontWeight: 600,
          }}>
            <Keyboard size={9} strokeWidth={2} /> Space
          </span>
          {" "}to open an inline Ash prompt and drop the result right where you&apos;re writing.
        </p>
        <p style={{ color: "rgba(245,241,233,0.55)", fontSize: 10 }}>
          Highlight any text to convert it into a linked note.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        style={{
          flexShrink: 0,
          width: 22, height: 22,
          background: "rgba(255,255,255,0.08)",
          border: "none", borderRadius: 6,
          color: "rgba(245,241,233,0.7)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.16)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
