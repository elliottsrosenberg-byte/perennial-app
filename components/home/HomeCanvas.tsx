"use client";

// PER-70: Home is a full-page spatial canvas with Ash overlaid. The top bar
// reuses the app Topbar; the canvas fills the rest; suggestion chips + an Ash
// chat bar float over the bottom. (Presence chips + board selector deferred.)

import { useCallback, useRef, useState } from "react";
import {
  Plus,
  ArrowUp,
  Leaf,
  StickyNote,
  Type,
  Image as ImageIcon,
  List,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Canvas, { type CanvasHandle } from "@/components/canvas/Canvas";
import type { CanvasObjectRow } from "@/types/database";

function openAsh(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}

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
  const [draft, setDraft] = useState("");

  const runChip = useCallback((action: (typeof CHIPS)[number]["action"]) => {
    switch (action) {
      case "summarize":
        openAsh("Summarize what's on my canvas.");
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
  }, []);

  function submit() {
    const msg = draft.trim();
    if (!msg) return;
    openAsh(msg);
    setDraft("");
  }

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
            onClick={() => openAsh("")}
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

        {/* Ash overlay — suggestion chips + chat bar */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            width: "min(760px, calc(100% - 120px))",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
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
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask Ash to create anything on your canvas…"
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
                cursor: "pointer",
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
