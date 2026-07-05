"use client";

// PER-70: Home is a full-page spatial canvas with Ash overlaid. The top bar
// reuses the app Topbar; the canvas fills the rest; suggestion chips + an Ash
// chat bar float over the bottom. (Presence chips + board selector deferred.)

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  ArrowUp,
  ChevronUp,
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
  const overlayRef = useRef<HTMLDivElement>(null);

  // Measured height of the overlay (conversation + bar) so the blur can be
  // sized to the actual content — it then grows exactly as the text does
  // (rising with each streamed line, holding steady while Ash thinks) instead
  // of snapping to a fixed height.
  const [overlayH, setOverlayH] = useState(0);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setOverlayH(el.offsetHeight));
    ro.observe(el);
    setOverlayH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

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
  // any new send (or the Resume pill) re-opens it.
  const [collapsed, setCollapsed] = useState(false);
  const [focused, setFocused]     = useState(false);
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

  // The backdrop blur rises with engagement rather than snapping to full: a
  // light baseline always sits below the bar, deepens while composing the
  // first prompt, and — once a conversation is open — tracks the measured
  // content height so it rises line-by-line alongside Ash's reply.
  const engaged   = focused || input.trim().length > 0;
  const blurLevel = conversationOpen ? "open" : engaged ? "engaged" : "idle";
  const blurTint = {
    idle:    { amount: 12, opacity: 0.55 },
    engaged: { amount: 18, opacity: 0.85 },
    open:    { amount: 22, opacity: 1 },
  }[blurLevel];
  const blurHeight = conversationOpen
    ? `${Math.max(overlayH + 88, 200)}px`
    : engaged
      ? "220px"
      : "116px";

  // Preview of the minimized conversation so "closed" reads as "tucked away".
  const lastMessage = messages[messages.length - 1];
  const collapsedPreview = lastMessage
    ? lastMessage.content.replace(/\s+/g, " ").trim().slice(0, 54)
    : "";

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

        {/* Full-width blur backdrop — spans the whole screen and the strip below
            the bar, fading up into the canvas. A light baseline is always
            present and rises with engagement (see `blur`). Clicking it while a
            conversation is open closes Ash down. */}
        <div
          onClick={conversationOpen ? () => setCollapsed(true) : undefined}
          aria-hidden
          style={{
            position: "absolute",
            left: 0, right: 0, bottom: 0,
            height: blurHeight,
            opacity: blurTint.opacity,
            zIndex: 1,
            pointerEvents: conversationOpen ? "auto" : "none",
            backdropFilter: `blur(${blurTint.amount}px)`,
            WebkitBackdropFilter: `blur(${blurTint.amount}px)`,
            background:
              "linear-gradient(to bottom, rgba(var(--color-warm-white-rgb),0) 0%, rgba(var(--color-warm-white-rgb),0.5) 55%, rgba(var(--color-warm-white-rgb),0.66) 100%)",
            maskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
            transition:
              "height 0.3s ease, opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
          }}
        />

        {/* Ash overlay — conversation / suggestion chips + chat bar */}
        <div
          ref={overlayRef}
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
          ) : messages.length > 0 ? (
            /* Minimized — tucked at the bottom, one click (or typing) reopens it */
            <button
              onClick={() => setCollapsed(false)}
              title="Resume chat"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                maxWidth: "100%",
                padding: "8px 14px",
                borderRadius: "var(--radius-full)",
                background: "var(--color-surface-raised)",
                border: "0.5px solid var(--color-border)",
                boxShadow: "var(--shadow-md)",
                color: "var(--color-text-secondary)",
                fontFamily: "var(--font-sans)", fontSize: 13,
                cursor: "pointer", pointerEvents: "auto",
              }}
            >
              <ChevronUp size={15} strokeWidth={2} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
              <span style={{ fontWeight: 600, flexShrink: 0 }}>Resume chat</span>
              {collapsedPreview && (
                <span style={{
                  color: "var(--color-text-tertiary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  — {collapsedPreview}…
                </span>
              )}
            </button>
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
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
