"use client";

// Sage-tinted Ash module that lives in the left rail of detail panels
// (projects, contacts). Replaces the old bottom Ash strip: same contextual
// intelligence (headline + primary action), now grouped with secondary
// prompts and an "Ask Ash anything" entry — all in one panel section that
// clearly reads as Ash without being as loud as the dark gradient banner.
//
// Each prompt sends a `open-ash` window event with an optional `message` and
// any caller-provided `context` (e.g. { project: {...} } or { contact: {...} })
// so Ash gets the right grounding when it opens.

import { useState } from "react";
import AshMark from "@/components/ui/AshMark";

export interface AshPrompt {
  /** Short button label (e.g. "Triage tasks") */
  label:   string;
  /** Full instruction sent to Ash when clicked */
  message: string;
}

interface Props {
  /** Optional one-line piece of context to render above the actions
   *  (e.g. "Atelier Foster is overdue with 3 open tasks"). */
  headline?:      string;
  /** Strong contextual suggestion. Rendered as the most prominent button. */
  primaryPrompt?: AshPrompt;
  /** Secondary prompts — generic asks that always apply. */
  prompts:        AshPrompt[];
  /** Forwarded into the `open-ash` event detail so Ash has grounding when
   *  it opens. e.g. `{ project: { title, status, priority } }`. */
  context?:       Record<string, unknown>;
  /** Placeholder for the inline chat input. */
  placeholder?:   string;
}

const ASH_GRADIENT = "linear-gradient(145deg, rgba(168,184,134,0.16) 0%, rgba(122,142,86,0.22) 100%)";
const ASH_AVATAR_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";

function dispatchAsh(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail }));
}

export default function AshPromptsModule({
  headline, primaryPrompt, prompts, context = {}, placeholder = "Ask Ash about this…",
}: Props) {
  const [input, setInput] = useState("");

  function send(message: string) {
    dispatchAsh({ ...context, message });
  }
  function openBlank() {
    dispatchAsh(context);
  }
  function submitInput() {
    const trimmed = input.trim();
    if (!trimmed) { openBlank(); return; }
    send(trimmed);
    setInput("");
  }

  return (
    <div style={{
      marginTop: 14,
      borderRadius: 12,
      background: ASH_GRADIENT,
      border: "0.5px solid rgba(155,163,122,0.36)",
      padding: "10px 11px 10px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 18, height: 18, borderRadius: 99,
          background: ASH_AVATAR_GRADIENT,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <AshMark size={10} variant="on-dark" />
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "#4a5630",
        }}>
          Ash
        </span>
      </div>

      {/* Contextual headline — only when we have something specific to say */}
      {headline && (
        <p style={{
          fontSize: 11, lineHeight: 1.55, color: "#3d4a26",
          fontStyle: "italic",
        }}>
          {headline}
        </p>
      )}

      {/* Primary contextual action */}
      {primaryPrompt && (
        <button
          onClick={() => send(primaryPrompt.message)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
            width: "100%", padding: "7px 10px",
            background: ASH_AVATAR_GRADIENT, color: "white",
            border: "none", borderRadius: 8, cursor: "pointer",
            fontFamily: "inherit", fontSize: 11, fontWeight: 600,
            transition: "opacity 0.1s ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.92")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {primaryPrompt.label}
          </span>
          <span style={{ flexShrink: 0, opacity: 0.85 }}>→</span>
        </button>
      )}

      {/* Secondary prompts */}
      {prompts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {prompts.map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              onClick={() => send(p.message)}
              style={{
                width: "100%", textAlign: "left",
                padding: "5px 8px", fontSize: 11,
                background: "transparent", color: "#4a5630",
                border: "none", borderRadius: 6,
                cursor: "pointer", fontFamily: "inherit",
                transition: "background 0.1s ease",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(122,142,86,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Inline ask */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitInput(); }}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 8px", borderRadius: 8,
          background: "rgba(255,255,255,0.7)",
          border: "0.5px solid rgba(155,163,122,0.34)",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, fontSize: 11,
            border: "none", outline: "none", background: "transparent",
            fontFamily: "inherit", color: "var(--color-text-primary)",
            minWidth: 0,
          }}
        />
        {input.trim() ? (
          <button
            type="submit"
            aria-label="Send to Ash"
            style={{
              flexShrink: 0,
              padding: "3px 8px", fontSize: 10, fontWeight: 600,
              borderRadius: 6, border: "none",
              background: "#4a6232", color: "white",
              cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
            }}
          >
            Ask →
          </button>
        ) : (
          <button
            type="button"
            onClick={openBlank}
            title="Open Ash"
            aria-label="Open Ash without a message"
            style={{
              flexShrink: 0,
              width: 18, height: 18,
              padding: 0,
              borderRadius: 6, border: "none",
              background: "transparent", color: "#7d9456",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 4l4 4-4 4"/>
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
