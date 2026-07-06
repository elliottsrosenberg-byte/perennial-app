"use client";

import { useState, useRef, useEffect } from "react";
import AshMark from "@/components/ui/AshMark";
import { createClient } from "@/lib/supabase/client";
import { Maximize2, Minimize2, X, Clock } from "lucide-react";
import { timeAgoDays as timeAgo } from "@/lib/format/date";
import { useAshChat } from "./useAshChat";
import AshChatView from "./AshChatView";
import { ASH_GRADIENT } from "./theme";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ConvSummary {
  id:         string;
  module:     string | null;
  updated_at: string;
  preview:    string;
}

interface ProjectCtx {
  title:    string;
  status:   string;
  priority: string;
}

interface AshPanelProps {
  open:            boolean;
  expanded:        boolean;
  onClose:         () => void;
  onExpand:        () => void;
  onCollapse:      () => void;
  module:          string;
  autoMessage?:    string;   // auto-send this message when panel opens
  projectContext?: ProjectCtx;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  home: "Home", projects: "Projects", contacts: "Network", network: "Network",
  outreach: "Outreach", notes: "Notes", calendar: "Calendar",
  finance: "Finance", presence: "Presence", resources: "Resources",
  tasks: "Tasks", settings: "Settings",
};

const SUGGESTIONS: Record<string, string[]> = {
  home:      ["What should I prioritize today?", "Give me a business snapshot", "What's been neglected?"],
  projects:  ["Which projects need attention?", "Help me plan a commission", "What's my current workload?"],
  contacts:  ["Who should I follow up with?", "Help me write a gallery pitch", "How's my relationship health?"],
  network:   ["Who should I follow up with?", "Help me write a gallery pitch", "How's my relationship health?"],
  outreach:  ["What's in my pipeline right now?", "Who should I reach out to next?", "Help me write a cold email to a gallery"],
  finance:   ["How's my cash flow?", "What's outstanding?", "Help me write a payment follow-up"],
  notes:     ["Summarize my recent notes", "Help me develop this idea", "What patterns do you see?"],
  calendar:  ["What's coming up this week?", "What deadlines am I close to?", "Help me plan my schedule"],
  tasks:     ["What's overdue?", "Help me prioritize my tasks", "What should I tackle first today?"],
  presence:  ["What opportunities are coming up?", "Help me write an open call application", "What fairs should I apply to?"],
  resources: ["What documents am I missing?", "Help me write an artist statement", "Review my contracts"],
  default:   ["What should I focus on today?", "Give me a business snapshot", "What's overdue?"],
};

// ─── AshPanel ─────────────────────────────────────────────────────────────────

export default function AshPanel({
  open, expanded, onClose, onExpand, onCollapse, module, autoMessage, projectContext,
}: AshPanelProps) {
  // Streaming conversation engine (shared with the Home modal via useAshChat).
  const {
    messages, setMessages,
    input, setInput,
    isStreaming,
    setConversationId,
    activeTool,
    sendMessage,
  } = useAshChat({ module, onFirstMessage: onExpand });

  const [showHistory, setShowHistory] = useState(false);
  const [recentConvs, setRecentConvs] = useState<ConvSummary[]>([]);

  const historyRef = useRef<HTMLDivElement>(null);

  const moduleLabel = MODULE_LABELS[module] ?? "Perennial";

  // Project-specific suggestions override generic module ones
  const suggestions = projectContext
    ? [
        `What should I prioritize for "${projectContext.title}"?`,
        `Is "${projectContext.title}" on track — any blockers or risks?`,
        `Summarize the status of "${projectContext.title}" and suggest next steps`,
      ]
    : (SUGGESTIONS[module] ?? SUGGESTIONS.default);

  // Dimensions
  const W = expanded ? 680 : 360;
  const H = expanded ? "calc(100vh - 80px)" : 480;

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showHistory) setShowHistory(false);
        else if (open) onClose();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, showHistory, onClose]);


  // Click-outside for history dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    if (showHistory) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHistory]);

  // Load recent conversations for history panel
  async function openHistory() {
    setShowHistory((v) => !v);
    if (!showHistory) {
      const supabase = createClient();
      const { data } = await supabase
        .from("ash_conversations")
        .select("id, module, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        // Fetch first user message for each as a preview
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
              id:         conv.id,
              module:     conv.module,
              updated_at: conv.updated_at,
              preview:    msgs?.[0]?.content?.slice(0, 52) ?? "—",
            } as ConvSummary;
          })
        );
        setRecentConvs(previews);
      }
    }
  }

  // Load a past conversation
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
        id:   `hist-${i}`,
        role: m.role as "user" | "assistant",
        content: m.content,
      })));
      setConversationId(convId);
    }
    setShowHistory(false);
    if (!expanded) onExpand();
  }

  // Start a fresh conversation
  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  }

  // Always-current ref so the auto-send effect can call sendMessage without stale closure
  const sendRef = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; });

  // Auto-send on mount: component is freshly mounted (key={convKey}) when an autoMessage arrives,
  // so empty deps is intentional — we only want this to fire once per mount.
  useEffect(() => {
    if (!autoMessage) return;
    const msg = autoMessage;
    const timer = setTimeout(() => sendRef.current(msg), 300);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <>
      {/* Transparent dismiss backdrop (floating mode only) */}
      {!expanded && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 38 }}
        />
      )}

      {/* Floating card */}
      <div
        style={{
          position:      "fixed",
          bottom:        20,
          right:         20,
          width:         W,
          height:        H,
          zIndex:        39,
          display:       "flex",
          flexDirection: "column",
          background:    "var(--color-surface-raised)",
          border:        "0.5px solid var(--color-border)",
          borderRadius:  18,
          boxShadow:     "0 20px 52px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08)",
          overflow:      "hidden",
          transition:    "width 0.22s ease, height 0.22s ease, bottom 0.22s ease",
          animation:     "ash-panel-in 0.18s ease-out",
        }}
      >

        {/* ── Header ── */}
        <div style={{
          height: 44, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px",
          background: ASH_GRADIENT,
          position: "relative",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "rgba(255,255,255,0.18)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AshMark size={16} variant="on-dark" animate={!isStreaming} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "white" }}>Ash</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginLeft: 6 }}>
              {moduleLabel}
            </span>
          </div>

          {/* History */}
          <div ref={historyRef} style={{ position: "relative" }}>
            <button
              onClick={openHistory}
              title="Recent conversations"
              style={{ ...ctrlBtn, background: showHistory ? "rgba(255,255,255,0.18)" : "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
              onMouseLeave={(e) => {
                if (!showHistory) e.currentTarget.style.background = "transparent";
              }}
            >
              <Clock size={14} strokeWidth={1.75} color="white" />
            </button>

            {/* History dropdown */}
            {showHistory && (
              <div style={{
                position:   "absolute",
                top:        "calc(100% + 8px)",
                right:      0,
                width:      260,
                background: "var(--color-surface-raised)",
                border:     "0.5px solid var(--color-border)",
                borderRadius: 12,
                boxShadow:  "var(--shadow-lg)",
                zIndex:     50,
                overflow:   "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px 8px",
                  borderBottom: "0.5px solid var(--color-border)",
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Recent chats
                  </p>
                  <button
                    onClick={newConversation}
                    style={{
                      fontSize: 11, color: "var(--color-ash)", background: "none",
                      border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
                    }}
                  >
                    + New
                  </button>
                </div>

                {recentConvs.length === 0 ? (
                  <p style={{ padding: "14px 12px", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    No recent conversations.
                  </p>
                ) : (
                  recentConvs.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => loadConversation(c.id)}
                      style={{
                        display: "block", width: "100%", padding: "9px 12px",
                        background: "transparent", border: "none", cursor: "pointer",
                        textAlign: "left", fontFamily: "inherit",
                        borderBottom: "0.5px solid var(--color-border)",
                        transition: "background 0.08s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-tertiary)" }}>
                          {MODULE_LABELS[c.module ?? ""] ?? c.module ?? "Perennial"}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                          {timeAgo(c.updated_at)}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>
                        {c.preview}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Expand / collapse */}
          <button
            onClick={expanded ? onCollapse : onExpand}
            title={expanded ? "Collapse" : "Expand"}
            style={ctrlBtn}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {expanded
              ? <Minimize2 size={14} strokeWidth={1.75} color="white" />
              : <Maximize2 size={14} strokeWidth={1.75} color="white" />
            }
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Close"
            style={ctrlBtn}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} strokeWidth={2} color="white" />
          </button>
        </div>

        {/* ── Conversation body (shared with the Home modal) ── */}
        <AshChatView
          messages={messages}
          input={input}
          setInput={setInput}
          isStreaming={isStreaming}
          activeTool={activeTool}
          sendMessage={sendMessage}
          emptyTitle="Hey — what can I help with?"
          emptySubtitle={projectContext
            ? `I have full context on "${projectContext.title}" — ${projectContext.status}, ${projectContext.priority} priority.`
            : `I have full context on your ${moduleLabel.toLowerCase()} data.`}
          suggestions={suggestions}
          assistantMaxWidth={expanded ? 520 : "none"}
          listPadding={expanded ? "24px 32px 12px" : "18px 18px 8px"}
          inputPadding={expanded ? "8px 24px 20px" : "8px 14px 14px"}
          autoFocus
        />
      </div>

      <style>{`
        @keyframes ash-panel-in {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>
    </>
  );
}

const ctrlBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 6,
  background: "transparent", border: "none",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  transition: "background 0.1s ease",
};
