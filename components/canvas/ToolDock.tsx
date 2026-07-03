"use client";

// Floating left tool dock (controlled). Selecting a create-tool arms it; the
// user then places on the canvas (Canvas handles placement). A contextual
// options card opens to the right for the active tool (sticky → colours,
// shape → shape kinds). Complex/deferred types live under the "+" menu.

import { useState } from "react";
import {
  MousePointer2,
  Hand,
  Type,
  StickyNote,
  Square,
  Circle,
  PenTool,
  Image as ImageIcon,
  Plus,
  Workflow,
  ListChecks,
  Contact,
  Minus,
  MoveUpRight,
} from "lucide-react";
import type { CanvasTool, StickyColor } from "./types";
import { STICKY_COLOR_ORDER, STICKY_PALETTE } from "./palette";

export type ShapeKind = "rect" | "ellipse";

interface Props {
  tool: CanvasTool;
  onSelectTool: (t: CanvasTool) => void;
  onUploadImage: () => void;
  stickyColor: StickyColor;
  onStickyColor: (c: StickyColor) => void;
  shapeKind: ShapeKind;
  onShapeKind: (s: ShapeKind) => void;
}

const TOOLS: { key: CanvasTool; label: string; icon: React.ReactNode; short: string }[] = [
  { key: "select", label: "Select", icon: <MousePointer2 size={18} strokeWidth={1.75} />, short: "V" },
  { key: "hand", label: "Hand", icon: <Hand size={18} strokeWidth={1.75} />, short: "H" },
  { key: "text", label: "Text", icon: <Type size={18} strokeWidth={1.75} />, short: "T" },
  { key: "sticky", label: "Sticky note", icon: <StickyNote size={18} strokeWidth={1.75} />, short: "N" },
  { key: "shape", label: "Shape", icon: <Square size={18} strokeWidth={1.75} />, short: "S" },
  { key: "pen", label: "Pen", icon: <PenTool size={18} strokeWidth={1.75} />, short: "P" },
];

const COMING_SOON = [
  { label: "Project / task card", icon: <ListChecks size={15} strokeWidth={1.75} /> },
  { label: "Contact reference", icon: <Contact size={15} strokeWidth={1.75} /> },
  { label: "Connectors", icon: <Workflow size={15} strokeWidth={1.75} /> },
];

function tile(active: boolean) {
  return {
    width: 36,
    height: 36,
    borderRadius: "var(--radius-full)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    background: active ? "rgba(var(--color-sage-rgb), 0.16)" : "transparent",
    color: active ? "var(--color-sage-text)" : "var(--color-text-tertiary)",
    border: "none",
    position: "relative" as const,
  };
}

const cardStyle: React.CSSProperties = {
  position: "absolute",
  left: "calc(100% + 10px)",
  top: 0,
  padding: 10,
  borderRadius: "var(--radius-lg)",
  background: "var(--color-surface-raised)",
  border: "0.5px solid var(--color-border)",
  boxShadow: "var(--shadow-lg)",
  whiteSpace: "nowrap",
};

function OptionsCard({
  tool,
  stickyColor,
  onStickyColor,
  shapeKind,
  onShapeKind,
}: Pick<Props, "tool" | "stickyColor" | "onStickyColor" | "shapeKind" | "onShapeKind">) {
  if (tool === "sticky") {
    return (
      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {STICKY_COLOR_ORDER.map((c) => (
            <button
              key={c}
              aria-label={`${c} sticky`}
              onClick={() => onStickyColor(c)}
              style={{
                width: 22,
                height: 22,
                borderRadius: "var(--radius-full)",
                background: STICKY_PALETTE[c].fill,
                border:
                  c === stickyColor
                    ? "2px solid var(--color-sage)"
                    : `1.5px solid ${STICKY_PALETTE[c].border}`,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>
    );
  }
  if (tool === "shape") {
    const shapes: { key: ShapeKind; icon: React.ReactNode; label: string }[] = [
      { key: "rect", icon: <Square size={17} strokeWidth={1.75} />, label: "Rectangle" },
      { key: "ellipse", icon: <Circle size={17} strokeWidth={1.75} />, label: "Ellipse" },
    ];
    return (
      <div style={{ ...cardStyle, display: "flex", gap: 6, alignItems: "center" }}>
        {shapes.map((s) => (
          <button
            key={s.key}
            title={s.label}
            aria-label={s.label}
            onClick={() => onShapeKind(s.key)}
            style={{
              ...tile(s.key === shapeKind),
              width: 32,
              height: 32,
            }}
          >
            {s.icon}
          </button>
        ))}
        <span style={{ width: 1, height: 22, background: "var(--color-border)" }} />
        {[
          { icon: <Minus size={17} strokeWidth={1.75} />, label: "Line" },
          { icon: <MoveUpRight size={17} strokeWidth={1.75} />, label: "Arrow" },
        ].map((s) => (
          <div
            key={s.label}
            title={`${s.label} — soon`}
            style={{ ...tile(false), width: 32, height: 32, cursor: "default", opacity: 0.4 }}
          >
            {s.icon}
          </div>
        ))}
      </div>
    );
  }
  if (tool === "pen") {
    return (
      <div style={{ ...cardStyle, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
        Pen, marker &amp; highlighter — coming soon
      </div>
    );
  }
  return null;
}

export default function ToolDock(props: Props) {
  const { tool, onSelectTool, onUploadImage } = props;
  const [showMore, setShowMore] = useState(false);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: 24,
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 6,
        borderRadius: "var(--radius-lg)",
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        boxShadow: "var(--shadow-lg)",
        zIndex: 20,
      }}
    >
      {TOOLS.map((t) => (
        <button
          key={t.key}
          title={`${t.label} (${t.short})`}
          aria-label={t.label}
          onClick={() => onSelectTool(t.key)}
          style={tile(tool === t.key)}
        >
          {t.icon}
        </button>
      ))}

      <button title="Image" aria-label="Image" onClick={onUploadImage} style={tile(false)}>
        <ImageIcon size={18} strokeWidth={1.75} />
      </button>

      <button
        title="More — coming soon"
        aria-label="More tools"
        onClick={() => setShowMore((v) => !v)}
        style={tile(showMore)}
      >
        <Plus size={18} strokeWidth={1.75} />
        {showMore && (
          <div style={{ ...cardStyle, top: undefined, bottom: 0, width: 210, whiteSpace: "normal" }}>
            {COMING_SOON.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 8px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <span style={{ display: "flex" }}>{item.icon}</span>
                <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, textAlign: "left" }}>
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--color-sage-text)",
                    background: "rgba(var(--color-sage-rgb), 0.16)",
                    borderRadius: "var(--radius-full)",
                    padding: "2px 6px",
                  }}
                >
                  Soon
                </span>
              </div>
            ))}
          </div>
        )}
      </button>

      {/* Contextual options for the active create-tool */}
      {(tool === "sticky" || tool === "shape" || tool === "pen") && (
        <OptionsCard
          tool={tool}
          stickyColor={props.stickyColor}
          onStickyColor={props.onStickyColor}
          shapeKind={props.shapeKind}
          onShapeKind={props.onShapeKind}
        />
      )}
    </div>
  );
}
