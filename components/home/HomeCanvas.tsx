"use client";

// PER-70: Home is a full-page spatial canvas with Ash overlaid. The top bar
// reuses the app Topbar; the canvas fills the rest; suggestion chips + an Ash
// chat bar float over the bottom. (Presence chips + board selector deferred.)

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUp,
  Leaf,
  StickyNote,
  Type,
  Image as ImageIcon,
  List,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Canvas, { type CanvasHandle } from "@/components/canvas/Canvas";
import AshHomeConversation from "@/components/home/AshHomeConversation";
import { useAshChat } from "@/components/ash/useAshChat";
import type { CanvasObjectRow } from "@/types/database";

interface Props {
  canvasId: string | null;
  initialObjects: CanvasObjectRow[];
}

// Ref-free chip data (label/icon/action) so the render-time array holds no
// ref-reading closures — dispatched via runChip below (react-hooks/refs).
const CHIPS = [
  { action: "summarize", label: "Summarize this board", icon: <List size={14} strokeWidth={1.75} /> },
  { action: "sticky", label: "Add a sticky note", icon: <StickyNote size={14} strokeWidth={1.75} /> },
  { action: "text", label: "Add text", icon: <Type size={14} strokeWidth={1.75} /> },
  { action: "image", label: "Add an image", icon: <ImageIcon size={14} strokeWidth={1.75} /> },
] as const;

export default function HomeCanvas({ canvasId, initialObjects }: Props) {
  const canvasRef = useRef<CanvasHandle>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Ash on Home streams directly onto the canvas (the global docked panel is
  // hidden on "/"): the bar below is the composer, and replies stack upward
  // above it via <AshHomeConversation>.
  const {
    messages, setMessages,
    input, setInput,
    isStreaming,
    setConversationId,
    sendMessage,
  } = useAshChat({ module: "home" });

  // The conversation can be minimized ("closed down") without clearing it —
  // any new send re-opens it.
  const [collapsed, setCollapsed] = useState(false);
  const conversationOpen = messages.length > 0 && !collapsed;

  function handleSend(text: string) {
    setCollapsed(false);
    sendMessage(text);
  }

  // Stable ref so the once-registered open-ash listener never calls a stale
  // handleSend.
  const sendRef = useRef(handleSend);
  useEffect(() => { sendRef.current = handleSend; });

  // External entry points (onboarding tour, etc.) still dispatch `open-ash`.
  // A message sends straight into the conversation; a bare event just focuses
  // the composer.
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ message?: string }>).detail ?? {};
      if (detail.message?.trim()) sendRef.current(detail.message);
      else inputRef.current?.focus();
    }
    window.addEventListener("open-ash", handler);
    return () => window.removeEventListener("open-ash", handler);
  }, []);

  function runChip(action: (typeof CHIPS)[number]["action"]) {
    switch (action) {
      case "summarize":
        handleSend("Summarize what's on my canvas.");
        break;
      case "sticky":
        canvasRef.current?.create("sticky");
        break;
      case "text":
        canvasRef.current?.create("text");
        break;
      case "image":
        canvasRef.current?.uploadImage();
        break;
    }
  }

  function submit() {
    handleSend(input);
  }

  function clearChat() {
    setMessages([]);
    setConversationId(null);
    setCollapsed(false);
    inputRef.current?.focus();
  }

  const placeholder = conversationOpen
    ? "Reply to Ash…"
    : initialObjects.length > 0
      ? "Ask Ash about your board…"
      : "Ask Ash anything…";

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 14px",
    borderRadius: "var(--radius-full)",
    background: "var(--color-surface-raised)",
    border: "0.5px solid var(--color-border)",
    boxShadow: "var(--shadow-sm)",
    color: "var(--color-text-secondary)",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };

  return (
    <div className="flex flex-col h-full">
      <Topbar
        title="Home"
        greeting
        actions={
          <button
            onClick={() => inputRef.current?.focus()}
            className="px-[13px] py-[5px] text-[11px] font-medium rounded-md text-white transition-opacity hover:opacity-90 inline-flex items-center gap-1.5 leading-none"
            style={{ background: "var(--color-sage)" }}
          >
            <Leaf size={13} strokeWidth={1.9} />
            Ask Ash
          </button>
        }
      />

      <div className="relative flex-1 min-h-0">
        <Canvas
          ref={canvasRef}
          canvasId={canvasId}
          initialObjects={initialObjects}
          scope="home"
        />

        {/* Full-width blur backdrop while chatting — spans the whole screen and
            the strip below the bar, fading up into the canvas. Clicking it
            (outside the conversation/bar) closes Ash down. */}
        {conversationOpen && (
          <div
            onClick={() => setCollapsed(true)}
            aria-hidden
            style={{
              position: "absolute",
              left: 0, right: 0, bottom: 0,
              height: "64%",
              zIndex: 1,
              pointerEvents: "auto",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              background:
                "linear-gradient(to bottom, rgba(var(--color-warm-white-rgb),0) 0%, rgba(var(--color-warm-white-rgb),0.5) 55%, rgba(var(--color-warm-white-rgb),0.66) 100%)",
              maskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
            }}
          />
        )}

        {/* Ash overlay — conversation / suggestion chips + chat bar */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            width: "min(760px, calc(100% - 120px))",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          {conversationOpen ? (
            <AshHomeConversation
              messages={messages}
              onClear={clearChat}
              onClose={() => setCollapsed(true)}
            />
          ) : messages.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
                pointerEvents: "auto",
              }}
            >
              {CHIPS.map((c) => (
                <button key={c.action} onClick={() => runChip(c.action)} style={chipStyle}>
                  <span style={{ display: "flex", color: "var(--color-text-tertiary)" }}>
                    {c.icon}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}

          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 18px",
              borderRadius: "var(--radius-2xl)",
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-strong)",
              boxShadow: "var(--shadow-lg)",
              pointerEvents: "auto",
            }}
          >
            <Plus size={20} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                color: "var(--color-text-primary)",
              }}
            />
            <span style={{ width: 1, height: 24, background: "var(--color-border)" }} />
            <button
              onClick={submit}
              disabled={!input.trim() || isStreaming}
              aria-label="Send to Ash"
              style={{
                flexShrink: 0,
                width: 38,
                height: 38,
                borderRadius: "var(--radius-full)",
                background: "var(--color-sage)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                cursor: !input.trim() || isStreaming ? "not-allowed" : "pointer",
                opacity: !input.trim() || isStreaming ? 0.4 : 1,
                transition: "opacity 0.12s ease",
              }}
            >
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
