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
  Highlighter,
  Image as ImageIcon,
  ImagePlus,
  Plus,
  ListChecks,
  CheckSquare,
  FileText,
  Contact,
  Calendar,
  Minus,
  MoveUpRight,
} from "lucide-react";
import type { CanvasTool, StickyColor } from "./types";
import type { EntityKind } from "@/lib/canvas/entities";
import { STICKY_COLOR_ORDER, STICKY_PALETTE } from "./palette";

export type ShapeKind = "rect" | "ellipse" | "line" | "arrow";

interface Props {
  tool: CanvasTool;
  /** Highlighted tool — may differ from `tool` (e.g. Hand while space is held). */
  activeTool: CanvasTool;
  onSelectTool: (t: CanvasTool) => void;
  onUploadImage: () => void;
  stickyColor: StickyColor;
  onStickyColor: (c: StickyColor) => void;
  shapeKind: ShapeKind;
  onShapeKind: (s: ShapeKind) => void;
  penMode: "marker" | "highlighter";
  onPenMode: (m: "marker" | "highlighter") => void;
  penColor: StickyColor;
  onPenColor: (c: StickyColor) => void;
  onAddEntity: (kind: EntityKind) => void;
  onImageFromFiles: () => void;
}

const TOOLS: { key: CanvasTool; label: string; icon: React.ReactNode; short: string }[] = [
  { key: "select", label: "Select", icon: <MousePointer2 size={18} strokeWidth={1.75} />, short: "V" },
  { key: "hand", label: "Hand", icon: <Hand size={18} strokeWidth={1.75} />, short: "H" },
  { key: "text", label: "Text", icon: <Type size={18} strokeWidth={1.75} />, short: "T" },
  { key: "sticky", label: "Sticky note", icon: <StickyNote size={18} strokeWidth={1.75} />, short: "N" },
  { key: "shape", label: "Shape", icon: <Square size={18} strokeWidth={1.75} />, short: "S" },
  { key: "pen", label: "Pen", icon: <PenTool size={18} strokeWidth={1.75} />, short: "P" },
];

const ADD_ITEMS: { kind: EntityKind; label: string; icon: React.ReactNode }[] = [
  { kind: "project", label: "Project", icon: <ListChecks size={15} strokeWidth={1.75} /> },
  { kind: "task", label: "Task", icon: <CheckSquare size={15} strokeWidth={1.75} /> },
  { kind: "note", label: "Note", icon: <FileText size={15} strokeWidth={1.75} /> },
  { kind: "contact", label: "Contact", icon: <Contact size={15} strokeWidth={1.75} /> },
  { kind: "event", label: "Event", icon: <Calendar size={15} strokeWidth={1.75} /> },
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
  penMode,
  onPenMode,
  penColor,
  onPenColor,
}: Pick<
  Props,
  | "tool"
  | "stickyColor"
  | "onStickyColor"
  | "shapeKind"
  | "onShapeKind"
  | "penMode"
  | "onPenMode"
  | "penColor"
  | "onPenColor"
>) {
  if (tool === "sticky") {
    return (
      <div style={cardStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
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
      { key: "line", icon: <Minus size={17} strokeWidth={1.75} />, label: "Line" },
      { key: "arrow", icon: <MoveUpRight size={17} strokeWidth={1.75} />, label: "Arrow" },
    ];
    return (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        {shapes.map((s) => (
          <button
            key={s.key}
            title={s.label}
            aria-label={s.label}
            onClick={() => onShapeKind(s.key)}
            style={{ ...tile(s.key === shapeKind), width: 32, height: 32 }}
          >
            {s.icon}
          </button>
        ))}
      </div>
    );
  }
  if (tool === "pen") {
    return (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        {(
          [
            { key: "marker", icon: <PenTool size={16} strokeWidth={1.75} />, label: "Marker" },
            { key: "highlighter", icon: <Highlighter size={16} strokeWidth={1.75} />, label: "Highlighter" },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            title={m.label}
            aria-label={m.label}
            onClick={() => onPenMode(m.key)}
            style={{ ...tile(m.key === penMode), width: 32, height: 32 }}
          >
            {m.icon}
          </button>
        ))}
        <span style={{ width: 22, height: 1, background: "var(--color-border)" }} />
        {STICKY_COLOR_ORDER.map((c) => (
          <button
            key={c}
            aria-label={`${c} ink`}
            onClick={() => onPenColor(c)}
            style={{
              width: 20,
              height: 20,
              borderRadius: "var(--radius-full)",
              background: STICKY_PALETTE[c].accent,
              border: c === penColor ? "2px solid var(--color-sage)" : "0.5px solid var(--color-border)",
              cursor: "pointer",
            }}
          />
        ))}
      </div>
    );
  }
  return null;
}

export default function ToolDock(props: Props) {
  const { tool, activeTool, onSelectTool, onUploadImage, onAddEntity, onImageFromFiles } = props;
  const [showMore, setShowMore] = useState(false);

  const rowBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 8px",
    border: "none",
    background: "transparent",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  };
  const rowLabel: React.CSSProperties = {
    flex: 1,
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    textAlign: "left",
    color: "var(--color-text-primary)",
  };

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
          style={tile(activeTool === t.key)}
        >
          {t.icon}
        </button>
      ))}

      <button title="Image" aria-label="Image" onClick={onUploadImage} style={tile(false)}>
        <ImageIcon size={18} strokeWidth={1.75} />
      </button>

      <button
        title="Add"
        aria-label="Add element"
        onClick={() => setShowMore((v) => !v)}
        style={tile(showMore)}
      >
        <Plus size={18} strokeWidth={1.75} />
        {showMore && (
          <div style={{ ...cardStyle, top: undefined, bottom: 0, width: 200, whiteSpace: "normal" }}>
            {ADD_ITEMS.map((item) => (
              <button
                key={item.kind}
                onClick={() => {
                  setShowMore(false);
                  onAddEntity(item.kind);
                }}
                style={rowBtn}
              >
                <span style={{ display: "flex", color: "var(--color-text-tertiary)" }}>{item.icon}</span>
                <span style={rowLabel}>{item.label}</span>
              </button>
            ))}
            <span style={{ display: "block", height: 1, background: "var(--color-border)", margin: "5px 4px" }} />
            <button
              onClick={() => {
                setShowMore(false);
                onImageFromFiles();
              }}
              style={rowBtn}
            >
              <span style={{ display: "flex", color: "var(--color-text-tertiary)" }}>
                <ImagePlus size={15} strokeWidth={1.75} />
              </span>
              <span style={rowLabel}>Image from files</span>
            </button>
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
          penMode={props.penMode}
          onPenMode={props.onPenMode}
          penColor={props.penColor}
          onPenColor={props.onPenColor}
        />
      )}
    </div>
  );
}
