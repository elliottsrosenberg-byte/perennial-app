"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AshMark from "@/components/ui/AshMark";
import { createClient } from "@/lib/supabase/client";
import { Maximize2, Minimize2, X, Clock } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  streaming?: boolean;
}

interface ConvSummary {
  id:         string;
  module:     string | null;
  updated_at: string;
  preview:    string;
}

interface AshPanelProps {
  open:       boolean;
  expanded:   boolean;
  onClose:    () => void;
  onExpand:   () => void;
  onCollapse: () => void;
  module:     string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  home: "Home", projects: "Projects", contacts: "Contacts",
  outreach: "Outreach", notes: "Notes", calendar: "Calendar",
  finance: "Finance", presence: "Presence", resources: "Resources",
  settings: "Settings",
};

const SUGGESTIONS: Record<string, string[]> = {
  home:      ["What should I prioritize today?", "Give me a business snapshot", "What's been neglected?"],
  projects:  ["Which projects need attention?", "Help me plan a commission", "What's my current workload?"],
  contacts:  ["Who should I follow up with?", "Help me write a gallery pitch", "How's my relationship health?"],
  finance:   ["How's my cash flow?", "What's outstanding?", "Help me write a payment follow-up"],
  notes:     ["Summarize my recent notes", "Help me develop this idea", "What patterns do you see?"],
  resources: ["What documents am I missing?", "Help me write an artist statement", "Review my contracts"],
  default:   ["What should I focus on today?", "Give me a business snapshot", "What's overdue?"],
};

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)  return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── AshPanel ─────────────────────────────────────────────────────────────────

export default function AshPanel({
  open, expanded, onClose, onExpand, onCollapse, module,
}: AshPanelProps) {
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState("");
  const [isStreaming,    setIsStreaming]     = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory,    setShowHistory]    = useState(false);
  const [recentConvs,    setRecentConvs]    = useState<ConvSummary[]>([]);
  const [activeTool,     setActiveTool]     = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const historyRef     = useRef<HTMLDivElement>(null);

  const moduleLabel = MODULE_LABELS[module] ?? "Perennial";
  const suggestions = SUGGESTIONS[module]   ?? SUGGESTIONS.default;

  // Dimensions
  const W = expanded ? 680 : 360;
  const H = expanded ? "calc(100vh - 80px)" : 480;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

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

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  }

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

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    // Auto-expand on first message
    if (messages.length === 0) onExpand();

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user",      content: content.trim() };
    const ashMsg:  Message = { id: `a-${Date.now()}`, role: "assistant", content: "", streaming: true };

    setMessages((p) => [...p, userMsg, ashMsg]);
    setInput("");
    setIsStreaming(true);
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/ash", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: content.trim(), conversationId, module }),
      });

      if (!res.ok || !res.body) throw new Error("Failed");

      const reader      = res.body.getReader();
      const decoder     = new TextDecoder();
      let   accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.text) {
              accumulated += p.text;
              setActiveTool(null);
              setMessages((prev) => prev.map((m) =>
                m.id === ashMsg.id ? { ...m, content: accumulated } : m
              ));
            }
            if (p.tool) setActiveTool(p.tool);
            if (p.done && p.conversationId) setConversationId(p.conversationId);
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages((p) => p.map((m) =>
        m.id === ashMsg.id ? { ...m, content: "Something went wrong — please try again." } : m
      ));
    } finally {
      setMessages((p) => p.map((m) =>
        m.id === ashMsg.id ? { ...m, streaming: false } : m
      ));
      setActiveTool(null);
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isStreaming, conversationId, module, messages.length, onExpand]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

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
          border:        "0.5px solid var(--color-border-strong)",
          borderRadius:  16,
          boxShadow:     "var(--shadow-overlay)",
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

        {/* ── Messages ── */}
        <div
          className="ash-scroll"
          style={{
            flex: 1, overflowY: "auto",
            padding: expanded ? "24px 32px 12px" : "18px 18px 8px",
            display: "flex", flexDirection: "column",
            gap: 28,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: ASH_GRADIENT, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AshMark size={17} variant="on-dark" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
                    Hey — what can I help with?
                  </p>
                  <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
                    I have full context on your {moduleLabel.toLowerCase()} data.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    style={{
                      padding: "9px 12px", borderRadius: 8,
                      border: "0.5px solid var(--color-ash-border)",
                      background: "var(--color-ash-tint)",
                      color: "var(--color-ash-dark)",
                      fontSize: 12, fontWeight: 500, cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit", lineHeight: 1.4,
                      transition: "background 0.1s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(155,163,122,0.16)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-ash-tint)")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display:       "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  alignItems:    "flex-start",
                  gap:           10,
                }}
              >
                {/* Ash avatar */}
                {msg.role === "assistant" && (
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: ASH_GRADIENT, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 2,
                  }}>
                    <AshMark size={14} variant="on-dark" />
                  </div>
                )}

                {msg.role === "user" ? (
                  /* User: subtle card */
                  <div style={{
                    maxWidth: "72%",
                    padding: "10px 14px",
                    borderRadius: "12px 12px 3px 12px",
                    background: "var(--color-surface-sunken)",
                    border: "0.5px solid var(--color-border)",
                    fontSize: 13, lineHeight: 1.65,
                    color: "var(--color-text-primary)",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  /* Ash: no card — avatar + lighter text, constrained width in expanded */
                  <div style={{
                    flex: 1,
                    maxWidth: expanded ? 520 : "none",
                    minWidth: 0,
                  }}>
                    {msg.streaming && !msg.content ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center", height: 22, paddingTop: 2 }}>
                        {[0, 0.22, 0.44].map((d) => (
                          <div key={d} style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: "var(--color-ash-mid)",
                            animation: `ash-dot 1.4s ease-in-out ${d}s infinite`,
                          }} />
                        ))}
                      </div>
                    ) : (
                      <div
                        className="ash-md"
                        style={{ fontSize: 13, lineHeight: 1.75, color: "var(--color-text-secondary)", wordBreak: "break-word" }}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Tool running indicator ── */}
        {activeTool && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 18px 8px", flexShrink: 0,
          }}>
            <div style={{ display: "flex", gap: 3 }}>
              {[0, 0.15, 0.3].map((d) => (
                <div key={d} style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: "var(--color-ash)",
                  animation: `ash-dot 1.2s ease-in-out ${d}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--color-ash-dark)", fontStyle: "italic" }}>
              {activeTool.replace(/_/g, " ")}…
            </span>
          </div>
        )}

        {/* ── Input — Claude-style ── */}
        <div style={{ padding: expanded ? "8px 24px 20px" : "8px 14px 14px", flexShrink: 0 }}>
          <div
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 16,
              boxShadow: "var(--shadow-sm)",
              overflow: "hidden",
              transition: "border-color 0.12s ease, box-shadow 0.12s ease",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLDivElement;
              el.style.borderColor = "var(--color-ash)";
              el.style.boxShadow   = "0 0 0 3px var(--color-focus-ring)";
            }}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "var(--color-border-strong)";
                el.style.boxShadow   = "var(--shadow-sm)";
              }
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Reply..."
              rows={1}
              disabled={isStreaming}
              style={{
                width: "100%", padding: "12px 16px 6px",
                fontSize: 14, background: "transparent",
                border: "none", outline: "none",
                resize: "none", lineHeight: 1.55,
                color: "var(--color-text-primary)",
                fontFamily: "inherit", maxHeight: 140,
                opacity: isStreaming ? 0.6 : 1, display: "block",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", padding: "6px 10px 10px", gap: 6 }}>
              <button
                title="Attach context (coming soon)"
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: "transparent", border: "none",
                  cursor: "pointer", color: "var(--color-text-tertiary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, lineHeight: 1, transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                +
              </button>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: "var(--color-ash-tint)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AshMark size={15} variant="on-light" />
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
                title="Send · Enter"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  border: "none",
                  cursor: !input.trim() || isStreaming ? "not-allowed" : "pointer",
                  background: !input.trim() || isStreaming ? "var(--color-surface-sunken)" : ASH_GRADIENT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "opacity 0.12s ease",
                  opacity: !input.trim() || isStreaming ? 0.35 : 1,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M14 2L2 7l5 2 2 5 5-12z"
                    fill={!input.trim() || isStreaming ? "var(--color-text-tertiary)" : "white"} />
                </svg>
              </button>
            </div>
          </div>
        </div>
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
