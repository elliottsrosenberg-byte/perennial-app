"use client";

// Home's Ash conversation, rendered directly ON the canvas rather than in a
// modal. Messages stack and stream upward from just above the chat bar and
// fade out at the top edge so the text melts into the board. The blur + scrim
// behind the text is a full-width backdrop owned by HomeCanvas; this component
// is just the (crisp) controls + the faded message stack.

import { useEffect, useRef } from "react";
import { RotateCcw, ChevronDown } from "lucide-react";
import AshMessageRow from "@/components/ash/AshMessageRow";
import type { AshMessage } from "@/components/ash/useAshChat";

interface Props {
  messages: AshMessage[];
  /** Clear the conversation and start fresh. */
  onClear: () => void;
  /** Minimize the conversation without clearing it. */
  onClose: () => void;
  /** Hide the built-in New chat / Close controls (the caller supplies its own,
   *  e.g. AshDock's control row). Defaults to false for Home. */
  hideControls?: boolean;
  /** Submit an interactive prompt answer as a new user turn. */
  onSubmitPrompt?: (text: string) => void;
}

const ctrlBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "5px 11px",
  borderRadius: "var(--radius-full)",
  background: "var(--color-surface-raised)",
  border: "0.5px solid var(--color-border)",
  boxShadow: "var(--shadow-sm)",
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500,
  cursor: "pointer",
};

export default function AshHomeConversation({ messages, onClear, onClose, hideControls = false, onSubmitPrompt }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message (just above the bar) in view as content streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        pointerEvents: "auto",
        // Rise in over the same 0.3s the backdrop blur takes, so text and blur
        // come up together when opening or resuming a chat.
        animation: "ash-home-rise 0.3s ease",
      }}
    >
      <style>{`
        @keyframes ash-home-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Controls — crisp, above the faded top edge of the stack */}
      {!hideControls && (
        <div style={{ position: "absolute", top: -2, right: 6, zIndex: 2, display: "flex", gap: 8 }}>
          <button onClick={onClear} title="New chat" aria-label="Start a new chat" style={ctrlBtn}>
            <RotateCcw size={12} strokeWidth={1.9} />
            New chat
          </button>
          <button onClick={onClose} title="Close" aria-label="Close Ash" style={{ ...ctrlBtn, gap: 5 }}>
            <ChevronDown size={13} strokeWidth={1.9} />
            Close
          </button>
        </div>
      )}

      <div
        className="ash-scroll"
        style={{
          maxHeight: "50vh",
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 20,
          padding: "48px 22px 14px",
          // Fade the text out at the top so the stack melts into the canvas.
          maskImage: "linear-gradient(to bottom, transparent 0, black 64px, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 64px, black 100%)",
        }}
      >
        {messages.map((m, i) => (
          <AshMessageRow
            key={m.id}
            message={m}
            assistantMaxWidth="none"
            onSubmitPrompt={onSubmitPrompt}
            isLast={i === messages.length - 1}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
