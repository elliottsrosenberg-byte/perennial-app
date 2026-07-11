"use client";

// AshDock — the app-wide Ash surface for every non-home page. Instead of a card
// in the bottom-right corner, Ash rises from the bottom *center* of the content
// area: a full-width blur backdrop frosts the page, a centered composer sits at
// the bottom, and replies stack upward and fade into the page — the same feel as
// Home's on-canvas Ash, so the assistant reads as part of the app rather than a
// bolted-on widget.
//
// Dismissal: click anywhere outside the chat, press Escape, or hit the pull-down
// handle centered above the chat — all slide it back down. Chat history lives in
// the left Sidebar (a conversation opens here via the `open-ash` event).
//
// Positioning uses --sidebar-width (set by Sidebar) so the dock stays centered
// in the content area and reacts when the rail expands/collapses.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, ArrowUp, RotateCcw, ChevronDown } from "lucide-react";
import AshHomeConversation from "@/components/home/AshHomeConversation";
import AshMark from "@/components/ui/AshMark";
import { createClient } from "@/lib/supabase/client";
import { useAshChat } from "./useAshChat";
import { moduleLabel, moduleSuggestions } from "./moduleMeta";

interface ProjectCtx {
  title:    string;
  status:   string;
  priority: string;
}

interface Props {
  open:                 boolean;
  onClose:              () => void;
  module:               string;
  autoMessage?:         string;
  projectContext?:      ProjectCtx;
  /** When set, load this past conversation on open (from the Sidebar history). */
  loadConversationId?:  string | null;
}

// Measure before paint so the blur rises on the same frame as the text; fall
// back to useEffect during SSR to avoid the hydration warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const ctrlBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 11px",
  borderRadius: "var(--radius-full)",
  background: "var(--color-surface-raised)",
  border: "0.5px solid var(--color-border)",
  boxShadow: "var(--shadow-sm)",
  color: "var(--color-text-secondary)",
  fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500,
  cursor: "pointer",
};

export default function AshDock({ open, onClose, module, autoMessage, projectContext, loadConversationId }: Props) {
  const {
    messages, setMessages,
    input, setInput,
    isStreaming,
    setConversationId,
    conversationTitle, setConversationTitle,
    sendMessage,
  } = useAshChat({ module });

  const inputRef   = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayH, setOverlayH] = useState(0);
  const [focused,  setFocused]  = useState(false);
  const [closing,  setClosing]  = useState(false);

  const label       = moduleLabel(module);
  const hasMessages = messages.length > 0;

  const suggestions = projectContext
    ? [
        `What should I prioritize for "${projectContext.title}"?`,
        `Is "${projectContext.title}" on track — any blockers or risks?`,
        `Summarize the status of "${projectContext.title}" and suggest next steps`,
      ]
    : moduleSuggestions(module);

  // Reset the closing flag whenever the dock (re)opens — the component stays
  // mounted while hidden, so this clears a stale slide-out from last time.
  useEffect(() => { if (open) setClosing(false); }, [open]);

  // Re-measure the overlay (before paint) so the blur backdrop tracks the actual
  // content height and rises line-by-line as Ash streams.
  useIsoLayoutEffect(() => {
    if (overlayRef.current) setOverlayH(overlayRef.current.offsetHeight);
  }, [messages, open]);
  useEffect(() => {
    function onResize() {
      if (overlayRef.current) setOverlayH(overlayRef.current.offsetHeight);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Focus the composer when the dock opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // Slide the dock down, then tell the parent to unmount it.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => closeRef.current(), 240);
  }

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && open) requestClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load a past conversation (from Sidebar history) — messages + its title.
  async function loadConversation(convId: string) {
    const supabase = createClient();
    const [{ data: msgs }, { data: conv }] = await Promise.all([
      supabase.from("ash_messages").select("role, content")
        .eq("conversation_id", convId).order("created_at", { ascending: true }).limit(50),
      supabase.from("ash_conversations").select("title").eq("id", convId).maybeSingle(),
    ]);
    if (msgs) {
      setMessages(msgs.map((m, i) => ({
        id: `hist-${i}`, role: m.role as "user" | "assistant", content: m.content,
      })));
      setConversationId(convId);
    }
    setConversationTitle(conv?.title ?? null);
  }

  // On mount: auto-send a message, or load a past conversation. The parent
  // remounts the dock via key= so this fires once per opened session.
  const sendRef = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; });
  useEffect(() => {
    if (autoMessage) {
      const msg = autoMessage;
      const timer = setTimeout(() => sendRef.current(msg), 300);
      return () => clearTimeout(timer);
    }
    if (loadConversationId) void loadConversation(loadConversationId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function send(text: string) {
    if (!text.trim() || isStreaming) return;
    sendMessage(text);
  }
  function submit() { send(input); }

  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setConversationTitle(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  if (!open) return null;

  // The blur ramps with engagement and, once a conversation is open, tracks the
  // measured content height so it rises with each streamed line.
  const engaged   = focused || input.trim().length > 0 || hasMessages;
  const level     = hasMessages ? "open" : engaged ? "engaged" : "idle";
  const blurTint  = { idle: { amount: 12, opacity: 0.6 }, engaged: { amount: 18, opacity: 0.9 }, open: { amount: 22, opacity: 1 } }[level];
  const blurHeight = hasMessages ? `${Math.max(overlayH + 96, 240)}px` : engaged ? "260px" : "184px";

  const sendDisabled = !input.trim() || isStreaming;
  const overlayAnim  = closing ? "ash-dock-fall 0.24s ease-in forwards" : "ash-dock-rise 0.28s ease-out";

  return (
    <>
      <style>{`
        @keyframes ash-dock-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ash-dock-fall { from { opacity: 1; transform: translateY(0); }  to { opacity: 0; transform: translateY(28px); } }
      `}</style>

      {/* Click-outside catcher — clicking anywhere off the chat slides it down. */}
      <div
        onClick={requestClose}
        aria-hidden
        style={{ position: "fixed", left: "var(--sidebar-width, 52px)", right: 0, top: 0, bottom: 0, zIndex: 37 }}
      />

      {/* Full-width blur backdrop — frosts the page content behind and fades up
          into it. Purely visual; the catcher above handles clicks. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 52px)", right: 0, bottom: 0,
          height: blurHeight,
          opacity: closing ? 0 : blurTint.opacity,
          zIndex: 38, pointerEvents: "none",
          backdropFilter: `blur(${blurTint.amount}px)`,
          WebkitBackdropFilter: `blur(${blurTint.amount}px)`,
          background:
            "linear-gradient(to bottom, rgba(var(--color-warm-white-rgb),0) 0%, rgba(var(--color-warm-white-rgb),0.5) 55%, rgba(var(--color-warm-white-rgb),0.66) 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
          transition: "height 0.3s ease, opacity 0.24s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />

      {/* Centered overlay — pull-down handle + conversation + composer. */}
      <div
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 52px)", right: 0, bottom: 24,
          zIndex: 40,
          display: "flex", justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          ref={overlayRef}
          style={{
            width: "min(760px, calc(100% - 96px))",
            display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch",
            pointerEvents: "none",
            animation: overlayAnim,
          }}
        >
          {/* Header — chat title, steady at the top, with the pull-down close. */}
          <div style={{ display: "flex", justifyContent: "center", pointerEvents: "auto" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 9, maxWidth: "100%",
              padding: "5px 6px 5px 13px",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              boxShadow: "var(--shadow-sm)",
            }}>
              <AshMark size={13} variant="on-light" />
              <span style={{
                fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 340,
              }}>
                {conversationTitle ?? `Ash · ${label}`}
              </span>
              <button
                onClick={requestClose}
                title="Close Ash" aria-label="Close Ash"
                style={{
                  flexShrink: 0, width: 24, height: 24, borderRadius: "var(--radius-full)",
                  border: "none", background: "transparent", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--color-text-tertiary)", transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <ChevronDown size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Content: conversation, or empty-state suggestions. */}
          {hasMessages ? (
            <AshHomeConversation messages={messages} onClear={newConversation} onClose={requestClose} hideControls />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, pointerEvents: "auto" }}>
              <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", textAlign: "center" }}>
                Ash has full context on your {label.toLowerCase()} — ask anything.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} style={ctrlBtn}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* New chat — small control, only once a conversation exists. */}
          {hasMessages && (
            <div style={{ display: "flex", justifyContent: "flex-end", pointerEvents: "auto" }}>
              <button onClick={newConversation} title="New chat" style={ctrlBtn}>
                <RotateCcw size={12} strokeWidth={1.9} /> New chat
              </button>
            </div>
          )}

          {/* Composer — matches the Home Ash bar. */}
          <div
            style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: 12,
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
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder={hasMessages ? "Reply to Ash…" : `Ask Ash about your ${label.toLowerCase()}…`}
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--color-text-primary)",
              }}
            />
            <span style={{ width: 1, height: 24, background: "var(--color-border)" }} />
            <button
              onClick={submit}
              disabled={sendDisabled}
              aria-label="Send to Ash"
              style={{
                flexShrink: 0, width: 38, height: 38,
                borderRadius: "var(--radius-full)",
                background: "var(--color-sage)", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff",
                cursor: sendDisabled ? "not-allowed" : "pointer",
                opacity: sendDisabled ? 0.4 : 1,
                transition: "opacity 0.12s ease",
              }}
            >
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
