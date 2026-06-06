"use client";

// In-modal Ash conversation for the Resources setup modals. Lets the user
// work through a guided document WITH Ash right inside the modal — then push
// any of Ash's replies straight into one of the fields below, instead of
// bouncing out to the floating Ash panel. Streams from POST /api/ash (SSE).

import { useState, useRef, useEffect } from "react";

interface Msg { id: string; role: "user" | "assistant"; content: string; streaming?: boolean }

export default function AshInlineChat({
  module = "resources", title, fieldLabels, onInsert,
}: {
  module?: string;
  title: string;
  /** Prompt labels the user can drop an Ash reply into. */
  fieldLabels: string[];
  onInsert: (label: string, text: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [insertFor, setInsertFor] = useState<string | null>(null); // msg id whose insert menu is open
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    function h(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setInsertFor(null); }
    if (insertFor) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [insertFor]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text.trim() };
    const ashMsg: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "", streaming: true };
    setMessages(p => [...p, userMsg, ashMsg]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/ash", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), conversationId, module }),
      });
      if (!res.ok || !res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.text) { acc += p.text; setMessages(prev => prev.map(m => m.id === ashMsg.id ? { ...m, content: acc } : m)); }
            if (p.done && p.conversationId) setConversationId(p.conversationId);
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages(p => p.map(m => m.id === ashMsg.id ? { ...m, content: "Something went wrong — please try again." } : m));
    } finally {
      setMessages(p => p.map(m => m.id === ashMsg.id ? { ...m, streaming: false } : m));
      setStreaming(false);
    }
  }

  const starter = `Help me draft my ${title}. Ask me one question at a time, and once you have enough, write a polished version I can use.`;

  return (
    <div style={{ border: "0.5px solid rgba(61,107,79,0.25)", borderRadius: 12, overflow: "hidden", background: "var(--color-warm-white)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: "linear-gradient(135deg, #7a9a55 0%, #5a7a38 60%, #3a5228 100%)" }}>
        <img src="/Ash-Logomak.svg" alt="" style={{ width: 18, height: 18, filter: "brightness(0) invert(1)", opacity: 0.95 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: "white" }}>Work on this with Ash</span>
      </div>

      <div ref={scrollRef} style={{ maxHeight: 280, minHeight: 110, overflowY: "auto", padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.55 }}>
              Talk it through with me and I&apos;ll help you write your {title}. When a reply looks good, drop it straight into a field below with <strong>Insert</strong>.
            </div>
            <button onClick={() => send(starter)}
              style={{ fontSize: 12, fontWeight: 600, color: "white", background: "var(--color-sage)", border: "none", borderRadius: 7, padding: "7px 13px", cursor: "pointer", fontFamily: "inherit" }}>
              Start with a few questions
            </button>
          </div>
        ) : messages.map(m => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 4 }}>
            <div style={{
              maxWidth: "88%", fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
              padding: "8px 11px", borderRadius: 10,
              background: m.role === "user" ? "var(--color-charcoal)" : "var(--color-cream)",
              color: m.role === "user" ? "white" : "var(--color-charcoal)",
            }}>
              {m.content || (m.streaming ? "…" : "")}
            </div>
            {m.role === "assistant" && m.content && !m.streaming && fieldLabels.length > 0 && (
              <div ref={insertFor === m.id ? menuRef : undefined} style={{ position: "relative" }}>
                <button onClick={() => setInsertFor(v => v === m.id ? null : m.id)}
                  style={{ fontSize: 10.5, color: "var(--color-sage)", background: "none", border: "0.5px solid var(--color-border)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                  Insert into ▾
                </button>
                {insertFor === m.id && (
                  <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, zIndex: 20, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,0.14)", overflow: "hidden", minWidth: 180, maxWidth: 260 }}>
                    {fieldLabels.map(label => (
                      <button key={label} onClick={() => { onInsert(label, m.content); setInsertFor(null); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", fontSize: 11.5, background: "none", border: "none", cursor: "pointer", color: "var(--color-charcoal)", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 7, padding: "9px 11px", borderTop: "0.5px solid var(--color-border)" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={streaming ? "Ash is writing…" : "Message Ash…"}
          disabled={streaming}
          style={{ flex: 1, fontSize: 12.5, padding: "8px 11px", borderRadius: 8, border: "0.5px solid var(--color-border)", background: "var(--color-off-white)", color: "var(--color-charcoal)", outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => send(input)} disabled={streaming || !input.trim()}
          style={{ fontSize: 12, fontWeight: 600, color: "white", background: "var(--color-sage)", border: "none", borderRadius: 8, padding: "0 14px", cursor: streaming || !input.trim() ? "default" : "pointer", opacity: streaming || !input.trim() ? 0.5 : 1, fontFamily: "inherit" }}>
          Send
        </button>
      </div>
    </div>
  );
}
