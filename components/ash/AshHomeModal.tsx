"use client";

// Home's Ash surface. Unlike the docked AshPanel (which lives bottom-right on
// every other route), Home hides the global panel and instead opens Ash as a
// centered, streaming modal over the canvas — a focused "front door" for the
// board. Chrome here (a gradient header + the Modal shell); the conversation
// body and streaming engine are shared with AshPanel via AshChatView/useAshChat.

import { useEffect, useRef } from "react";
import { X, PenLine } from "lucide-react";
import Modal from "@/components/ui/Modal";
import AshMark from "@/components/ui/AshMark";
import AshChatView from "./AshChatView";
import { useAshChat } from "./useAshChat";
import { ASH_GRADIENT } from "./theme";

const SUGGESTIONS = [
  "What should I prioritize today?",
  "Give me a business snapshot",
  "What's been neglected?",
];

interface Props {
  open: boolean;
  /** Message to auto-send when the modal is opened from an entry point (e.g.
   *  the canvas chat bar). Empty string opens a blank chat. */
  initialMessage: string;
  /** Increments on every open request so the same text can be re-sent, and a
   *  fresh open re-triggers the auto-send. */
  nonce: number;
  onClose: () => void;
}

export default function AshHomeModal({ open, initialMessage, nonce, onClose }: Props) {
  const {
    messages, setMessages,
    input, setInput,
    isStreaming,
    setConversationId,
    activeTool,
    sendMessage,
  } = useAshChat({ module: "home" });

  // Always-current ref so the auto-send effect never calls a stale sendMessage.
  const sendRef = useRef(sendMessage);
  useEffect(() => { sendRef.current = sendMessage; });

  // Auto-send the entry-point message once per open request (keyed by nonce).
  useEffect(() => {
    if (nonce === 0 || !open) return;
    const msg = initialMessage.trim();
    if (!msg) return;
    const timer = setTimeout(() => sendRef.current(msg), 250);
    return () => clearTimeout(timer);
  }, [nonce, open, initialMessage]);

  function newConversation() {
    setMessages([]);
    setConversationId(null);
  }

  const header = (
    <div style={{
      height: 48, flexShrink: 0,
      display: "flex", alignItems: "center", gap: 10,
      padding: "0 14px",
      background: ASH_GRADIENT,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "rgba(255,255,255,0.18)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <AshMark size={17} variant="on-dark" animate={!isStreaming} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "white" }}>Ash</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginLeft: 6 }}>Home</span>
      </div>

      {messages.length > 0 && (
        <button
          onClick={newConversation}
          title="New chat"
          aria-label="Start a new chat"
          style={ctrlBtn}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <PenLine size={15} strokeWidth={1.75} color="white" />
        </button>
      )}
      <button
        onClick={onClose}
        title="Close"
        aria-label="Close Ash"
        style={ctrlBtn}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <X size={16} strokeWidth={2} color="white" />
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={720}
      header={header}
      ariaLabel="Ash"
      bodyStyle={{
        padding: 0,
        height: "min(72vh, 640px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <AshChatView
        messages={messages}
        input={input}
        setInput={setInput}
        isStreaming={isStreaming}
        activeTool={activeTool}
        sendMessage={sendMessage}
        emptyTitle="Hey — what can I help with?"
        emptySubtitle="I have full context on your studio — projects, finances, contacts and this board."
        suggestions={SUGGESTIONS}
        assistantMaxWidth={560}
        listPadding="24px 28px 12px"
        inputPadding="8px 22px 20px"
        autoFocus
      />
    </Modal>
  );
}

const ctrlBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  background: "transparent", border: "none",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  transition: "background 0.1s ease",
};
