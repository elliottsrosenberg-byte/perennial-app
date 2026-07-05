"use client";

// The Ash conversation body — message list (with empty-state suggestions),
// tool-running indicator, and the composer. Shared by the docked AshPanel and
// the Home AshHomeModal so both render an identical conversation; each surface
// supplies its own header/chrome and the chat engine (useAshChat) via props.

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AshMark from "@/components/ui/AshMark";
import { ASH_GRADIENT } from "./theme";
import type { AshMessage } from "./useAshChat";

interface AshChatViewProps {
  messages:     AshMessage[];
  input:        string;
  setInput:     (v: string) => void;
  isStreaming:  boolean;
  activeTool:   string | null;
  sendMessage:  (content: string) => void;
  /** Empty-state greeting. */
  emptyTitle:    string;
  emptySubtitle: string;
  suggestions:   string[];
  /** Max width of an assistant message block (docked panel constrains it when
   *  expanded; "none" lets it fill). */
  assistantMaxWidth: number | "none";
  /** Padding for the scrolling message list and the composer, respectively —
   *  each surface has its own comfortable insets. */
  listPadding:  string;
  inputPadding: string;
  /** Focus the composer on mount (surfaces open with it focused). */
  autoFocus?:   boolean;
}

export default function AshChatView({
  messages, input, setInput, isStreaming, activeTool, sendMessage,
  emptyTitle, emptySubtitle, suggestions,
  assistantMaxWidth, listPadding, inputPadding, autoFocus,
}: AshChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  // Keep the latest message in view as content streams in.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus the composer on mount when requested.
  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 120);
  }, [autoFocus]);

  // Return focus to the composer once a turn finishes streaming.
  useEffect(() => {
    if (isStreaming) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [isStreaming]);

  // Reset the auto-grown textarea height once it's been cleared (e.g. on send).
  useEffect(() => {
    if (input === "" && inputRef.current) inputRef.current.style.height = "auto";
  }, [input]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  return (
    <>
      {/* ── Messages ── */}
      <div
        className="ash-scroll"
        style={{
          flex: 1, overflowY: "auto",
          padding: listPadding,
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
                  {emptyTitle}
                </p>
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.3 }}>
                  {emptySubtitle}
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(var(--color-sage-rgb),0.16)")}
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
                /* Ash: no card — avatar + lighter text, constrained width when asked */
                <div style={{
                  flex: 1,
                  maxWidth: assistantMaxWidth,
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

      {/* ── Composer — Claude-style ── */}
      <div style={{ padding: inputPadding, flexShrink: 0 }}>
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
    </>
  );
}
