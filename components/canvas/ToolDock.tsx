"use client";

// Floating left tool dock. Create-tools drop a new object at the viewport
// centre and return to the select tool. Complex/deferred types live under the
// "+" menu, marked "Soon".

import { useState } from "react";
import {
  MousePointer2,
  Type,
  StickyNote,
  Square,
  Image as ImageIcon,
  Plus,
  PenTool,
  Workflow,
  ListChecks,
  Contact,
} from "lucide-react";
import type { CanvasObjectType } from "./types";

interface Props {
  onCreate: (type: CanvasObjectType) => void;
  onUploadImage: () => void;
}

const TOOLS: {
  key: string;
  label: string;
  icon: React.ReactNode;
  action: (p: Props) => void;
}[] = [
  { key: "text", label: "Text", icon: <Type size={18} strokeWidth={1.75} />, action: (p) => p.onCreate("text") },
  { key: "sticky", label: "Sticky note", icon: <StickyNote size={18} strokeWidth={1.75} />, action: (p) => p.onCreate("sticky") },
  { key: "shape", label: "Shape", icon: <Square size={18} strokeWidth={1.75} />, action: (p) => p.onCreate("shape") },
  { key: "image", label: "Image", icon: <ImageIcon size={18} strokeWidth={1.75} />, action: (p) => p.onUploadImage() },
];

const COMING_SOON = [
  { label: "Project / task card", icon: <ListChecks size={15} strokeWidth={1.75} /> },
  { label: "Contact reference", icon: <Contact size={15} strokeWidth={1.75} /> },
  { label: "Pen & draw", icon: <PenTool size={15} strokeWidth={1.75} /> },
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
  } as const;
}

export default function ToolDock(props: Props) {
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
      <div style={tile(true)} title="Select">
        <MousePointer2 size={18} strokeWidth={1.75} />
      </div>
      {TOOLS.map((t) => (
        <button
          key={t.key}
          title={t.label}
          aria-label={t.label}
          onClick={() => t.action(props)}
          style={tile(false)}
        >
          {t.icon}
        </button>
      ))}

      <div style={{ position: "relative" }}>
        <button
          title="More — coming soon"
          aria-label="More tools"
          onClick={() => setShowMore((v) => !v)}
          style={tile(showMore)}
        >
          <Plus size={18} strokeWidth={1.75} />
        </button>
        {showMore && (
          <div
            style={{
              position: "absolute",
              left: "calc(100% + 10px)",
              bottom: 0,
              width: 220,
              padding: 6,
              borderRadius: "var(--radius-lg)",
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {COMING_SOON.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text-tertiary)",
                  cursor: "default",
                }}
              >
                <span style={{ display: "flex", color: "var(--color-text-tertiary)" }}>
                  {item.icon}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
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
      </div>
    </div>
  );
}
