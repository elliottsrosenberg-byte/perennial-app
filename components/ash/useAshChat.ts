"use client";

// The Ash chat engine: conversation state + streaming send. Shared by every
// Ash surface (docked AshPanel, Home AshHomeModal) so there is exactly one
// implementation of the /api/ash SSE protocol. Presentation lives in
// AshChatView; chrome (header/dimensions/open state) lives in each surface.

import { useCallback, useState } from "react";
import type { AshPrompt } from "@/lib/ash/interactive-types";

export interface AshMessage {
  id:         string;
  role:       "user" | "assistant";
  content:    string;
  streaming?: boolean;
  /** An interactive prompt (tappable choices / answer fields) Ash attached to
   *  this turn. Rendered inline by AshPromptCard; answering it sends a normal
   *  user message back. */
  prompt?:    AshPrompt;
}

interface UseAshChatOptions {
  module: string;
  /** Called when the first message of a conversation is sent (AshPanel uses
   *  this to auto-expand the docked panel). */
  onFirstMessage?: () => void;
}

export function useAshChat({ module, onFirstMessage }: UseAshChatOptions) {
  const [messages,       setMessages]       = useState<AshMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [isStreaming,    setIsStreaming]    = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [activeTool,     setActiveTool]     = useState<string | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    if (messages.length === 0) { onFirstMessage?.(); setConversationTitle(null); }

    const userMsg: AshMessage = { id: `u-${Date.now()}`, role: "user",      content: content.trim() };
    const ashMsg:  AshMessage = { id: `a-${Date.now()}`, role: "assistant", content: "", streaming: true };

    setMessages((p) => [...p, userMsg, ashMsg]);
    setInput("");
    setIsStreaming(true);

    let turnConvId = conversationId;
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
            if (p.action && typeof window !== "undefined") {
              // Ash wants to route the user somewhere (a module, or a "new X"
              // form). A global bridge with router access executes it. Carry the
              // conversation id so a home→module hop can keep this conversation
              // going in the persistent dock.
              setActiveTool(null);
              window.dispatchEvent(new CustomEvent("perennial:ash-action", {
                detail: { action: p.action, conversationId: p.conversationId ?? turnConvId ?? conversationId },
              }));
            }
            if (p.prompt) {
              setActiveTool(null);
              setMessages((prev) => prev.map((m) =>
                m.id === ashMsg.id ? { ...m, prompt: p.prompt } : m
              ));
            }
            if (p.done && p.conversationId) {
              // A brand-new conversation just got its id — surface it in the
              // Sidebar's "Recent chats" immediately (with its first-message
              // preview) rather than waiting for the dock to close.
              const isNewConversation = !turnConvId;
              setConversationId(p.conversationId);
              turnConvId = p.conversationId;
              if (isNewConversation && typeof window !== "undefined") {
                window.dispatchEvent(new Event("ash-history-refresh"));
              }
            }
            if (p.title) {
              setConversationTitle(p.title);
              // Title arrives moments after the turn — refresh again so the
              // Sidebar swaps the preview for the generated title.
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("ash-history-refresh"));
              }
            }
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
      // Let the rest of the app know an Ash turn finished, so views that care
      // about Ash-driven writes (project detail panel, tasks list, etc.) can
      // refetch without requiring the user to navigate away and back.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ash:turn-complete"));
      }
      // Fire-and-forget: let Ash learn any durable preferences from this turn.
      if (turnConvId) {
        void fetch("/api/ash/learn", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ conversationId: turnConvId }),
        }).catch(() => {});
      }
    }
  }, [isStreaming, conversationId, module, messages.length, onFirstMessage]);

  return {
    messages, setMessages,
    input, setInput,
    isStreaming,
    conversationId, setConversationId,
    conversationTitle, setConversationTitle,
    activeTool,
    sendMessage,
  };
}
