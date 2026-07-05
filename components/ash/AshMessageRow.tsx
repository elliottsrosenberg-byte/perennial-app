"use client";

// A single Ash conversation row — a user prompt (subtle card) or an Ash reply
// (avatar + streamed markdown, with typing dots before the first token).
// Shared by AshChatView (docked panel / Home modal) and the Home canvas
// conversation overlay so messages read identically wherever Ash appears.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AshMark from "@/components/ui/AshMark";
import { ASH_GRADIENT } from "./theme";
import type { AshMessage } from "./useAshChat";

interface AshMessageRowProps {
  message: AshMessage;
  /** Max width of an assistant block ("none" lets it fill its column). */
  assistantMaxWidth: number | "none";
}

export default function AshMessageRow({ message: msg, assistantMaxWidth }: AshMessageRowProps) {
  return (
    <div
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
  );
}
