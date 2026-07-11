"use client";

// AshDock — the app-wide Ash surface for every non-home page. Instead of a card
// in the bottom-right corner, Ash rises from the bottom *center* of the content
// area: a full-width blur backdrop frosts the page, a centered composer sits at
// the bottom, and replies stack upward and fade into the page — the same feel as
// Home's on-canvas Ash, so the assistant reads as part of the app rather than a
// bolted-on widget.
//
// A slim control row above the composer gives Claude-style New chat / History /
// Close; History raises a recent-conversations list you can jump back into.
//
// Positioning uses --sidebar-width (set by Sidebar) so the dock stays centered
// in the content area and reacts when the rail expands/collapses.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, ArrowUp, RotateCcw, Clock, ChevronDown } from "lucide-react";
import AshHomeConversation from "@/components/home/AshHomeConversation";
import { createClient } from "@/lib/supabase/client";
import { timeAgoDays as timeAgo } from "@/lib/format/date";
import { useAshChat } from "./useAshChat";
import { moduleLabel, moduleSuggestions, MODULE_LABELS } from "./moduleMeta";

interface ProjectCtx {
  title:    string;
  status:   string;
  priority: string;
}

interface ConvSummary {
  id:         string;
  module:     string | null;
  updated_at: string;
  preview:    string;
}

interface Props {
  open:            boolean;
  onClose:         () => void;
  module:          string;
  autoMessage?:    string;
  projectContext?: ProjectCtx;
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

export default function AshDock({ open, onClose, module, autoMessage, projectContext }: Props) {
  const {
    messages, setMessages,
    input, setInput,
    isStreaming,
    setConversationId,
    sendMessage,
  } = useAshChat({ module });

  const inputRef   = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayH, setOverlayH] = useState(0);
  const [focused,  setFocused]  = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [recentConvs, setRecentConvs] = useState<ConvSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const label       = moduleLabel(module);
  const hasMessages = messages.length > 0;

  const suggestions = projectContext
    ? [
        `What should I prioritize for "${projectContext.title}"?`,
        `Is "${projectContext.title}" on track — any blockers or risks?`,
        `Summarize the status of "${projectContext.title}" and suggest next steps`,
      ]
    : moduleSuggestions(module);

  // Re-measure the overlay (before paint) so the blur backdrop tracks the actual
  // content height and rises line-by-line as Ash streams.
  useIsoLayoutEffect(() => {
    if (overlayRef.current) setOverlayH(overlayRef.current.offsetHeight);
  }, [messages, open, showHistory, recentConvs]);
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

  // Escape closes the history list first, then the dock.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showHistory) setShowHistory(false);
      else if (open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, showHistory, onClose]);

  // Auto-send on mount when an autoMessage arrives (the parent remounts the dock
  // via key= so this fires once per opened conversation).
  const sendRef = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; });
  useEffect(() => {
    if (!autoMessage) return;
    const msg = autoMessage;
    const timer = setTimeout(() => sendRef.current(msg), 300);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function send(text: string) {
    if (!text.trim() || isStreaming) return;
    setShowHistory(false);
    sendMessage(text);
  }

  function submit() { send(input); }

  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  // Load recent conversations for the history list.
  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (!next) return;
    setLoadingHistory(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("ash_conversations")
      .select("id, module, updated_at")
      .order("updated_at", { ascending: false })
      .limit(12);
    if (data) {
      const previews = await Promise.all(
        data.map(async (conv) => {
          const { data: msgs } = await supabase
            .from("ash_messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .eq("role", "user")
            .order("created_at", { ascending: true })
            .limit(1);
          return {
            id: conv.id, module: conv.module, updated_at: conv.updated_at,
            preview: msgs?.[0]?.content?.slice(0, 64) ?? "—",
          } as ConvSummary;
        })
      );
      setRecentConvs(previews);
    }
    setLoadingHistory(false);
  }

  async function loadConversation(convId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("ash_messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data) {
      setMessages(data.map((m, i) => ({
        id: `hist-${i}`, role: m.role as "user" | "assistant", content: m.content,
      })));
      setConversationId(convId);
    }
    setShowHistory(false);
  }

  if (!open) return null;

  // The blur ramps with engagement and, once a conversation is open, tracks the
  // measured content height so it rises with each streamed line.
  const engaged   = focused || input.trim().length > 0 || hasMessages || showHistory;
  const level     = (hasMessages || showHistory) ? "open" : engaged ? "engaged" : "idle";
  const blurTint  = { idle: { amount: 12, opacity: 0.6 }, engaged: { amount: 18, opacity: 0.9 }, open: { amount: 22, opacity: 1 } }[level];
  const blurHeight = (hasMessages || showHistory) ? `${Math.max(overlayH + 96, 240)}px` : engaged ? "260px" : "184px";

  const sendDisabled = !input.trim() || isStreaming;

  return (
    <>
      <style>{`
        @keyframes ash-dock-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Full-width blur backdrop — frosts the page content behind and fades up
          into it. Clicking it closes the dock. Offset by the sidebar so it only
          covers the content area. */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 52px)", right: 0, bottom: 0,
          height: blurHeight,
          opacity: blurTint.opacity,
          zIndex: 38,
          backdropFilter: `blur(${blurTint.amount}px)`,
          WebkitBackdropFilter: `blur(${blurTint.amount}px)`,
          background:
            "linear-gradient(to bottom, rgba(var(--color-warm-white-rgb),0) 0%, rgba(var(--color-warm-white-rgb),0.5) 55%, rgba(var(--color-warm-white-rgb),0.66) 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 104px, black 100%)",
          transition: "height 0.3s ease, opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />

      {/* Centered overlay — conversation/history + control row + composer. */}
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
            animation: "ash-dock-rise 0.28s ease-out",
          }}
        >
          {/* Content area: history list, conversation, or empty suggestions. */}
          {showHistory ? (
            <div style={{
              pointerEvents: "auto",
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-lg)",
              maxHeight: "44vh", overflowY: "auto",
            }} className="ash-scroll">
              <div style={{
                padding: "10px 14px 8px", position: "sticky", top: 0,
                background: "var(--color-surface-raised)",
                borderBottom: "0.5px solid var(--color-border)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)" }}>
                  Recent chats
                </span>
                <button onClick={newConversation} style={{ fontSize: 11, color: "var(--color-ash)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                  + New chat
                </button>
              </div>
              {loadingHistory ? (
                <p style={{ padding: "16px 14px", fontSize: 12, color: "var(--color-text-tertiary)" }}>Loading…</p>
              ) : recentConvs.length === 0 ? (
                <p style={{ padding: "16px 14px", fontSize: 12, color: "var(--color-text-tertiary)" }}>No recent conversations yet.</p>
              ) : (
                recentConvs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 14px", background: "transparent", border: "none",
                      borderBottom: "0.5px solid var(--color-border)", cursor: "pointer",
                      fontFamily: "inherit", transition: "background 0.08s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-tertiary)" }}>
                        {MODULE_LABELS[c.module ?? ""] ?? c.module ?? "Perennial"}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{timeAgo(c.updated_at)}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>
                      {c.preview}
                    </p>
                  </button>
                ))
              )}
            </div>
          ) : hasMessages ? (
            <AshHomeConversation messages={messages} onClear={newConversation} onClose={onClose} hideControls />
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

          {/* Control row — New chat / History / Close, right-aligned. */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", pointerEvents: "auto" }}>
            {hasMessages && !showHistory && (
              <button onClick={newConversation} title="New chat" style={ctrlBtn}>
                <RotateCcw size={12} strokeWidth={1.9} /> New chat
              </button>
            )}
            <button
              onClick={toggleHistory}
              title="Recent chats"
              style={{ ...ctrlBtn, ...(showHistory ? { background: "var(--color-ash-tint)", color: "var(--color-ash-dark)", borderColor: "var(--color-ash-border)" } : null) }}
            >
              <Clock size={12} strokeWidth={1.9} /> History
            </button>
            <button onClick={onClose} title="Close Ash" style={ctrlBtn}>
              <ChevronDown size={13} strokeWidth={1.9} /> Close
            </button>
          </div>

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
