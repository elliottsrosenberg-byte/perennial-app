"use client";

// Home's Ash conversation, rendered directly ON the canvas rather than in a
// modal. Messages stack and stream upward from just above the chat bar; the
// canvas behind them is blurred (backdrop-filter) and washed with a faint
// theme-tracking scrim for contrast, and the whole stack fades out at its top
// edge so the text melts into the board instead of sitting in a boxed panel.

import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import AshMessageRow from "@/components/ash/AshMessageRow";
import type { AshMessage } from "@/components/ash/useAshChat";

interface Props {
  messages: AshMessage[];
  /** Clear the conversation and start fresh. */
  onClear: () => void;
}

export default function AshHomeConversation({ messages, onClear }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message (just above the bar) in view as content streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div style={{ position: "relative", width: "100%", pointerEvents: "auto" }}>
      {/* New chat — crisp, above the faded top edge of the stack */}
      <button
        onClick={onClear}
        title="New chat"
        aria-label="Start a new chat"
        style={{
          position: "absolute", top: -2, right: 6, zIndex: 2,
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 11px",
          borderRadius: "var(--radius-full)",
          background: "var(--color-surface-raised)",
          border: "0.5px solid var(--color-border)",
          boxShadow: "var(--shadow-sm)",
          color: "var(--color-text-secondary)",
          fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <RotateCcw size={12} strokeWidth={1.9} />
        New chat
      </button>

      <div
        className="ash-scroll"
        style={{
          maxHeight: "52vh",
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 20,
          padding: "48px 22px 18px",
          borderRadius: 22,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          background:
            "linear-gradient(to bottom, rgba(var(--color-warm-white-rgb),0) 0%, rgba(var(--color-warm-white-rgb),0.42) 52%, rgba(var(--color-warm-white-rgb),0.66) 100%)",
          // Fade the blur + text out at the top so the stack melts into the canvas.
          maskImage: "linear-gradient(to bottom, transparent 0, black 64px, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 64px, black 100%)",
        }}
      >
        {messages.map((m) => (
          <AshMessageRow key={m.id} message={m} assistantMaxWidth="none" />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
