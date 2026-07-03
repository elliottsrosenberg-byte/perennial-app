"use client";

// Per-type visual renderer for a canvas object. Selection/drag/resize chrome
// lives in CanvasObjectView; this is purely the inner content. All colours come
// from design tokens (see palette.ts / AGENTS.md).

import { useEffect, useRef } from "react";
import { ImageIcon, FolderIcon, ListChecks } from "lucide-react";
import type {
  CanvasObject,
  TextContent,
  StickyContent,
  ShapeContent,
  ImageContent,
  ReferenceContent,
} from "./types";
import { STICKY_PALETTE, SHAPE_PALETTE } from "./palette";

interface Props {
  object: CanvasObject;
  editing: boolean;
  /** Update editable text (text + sticky). */
  onText: (text: string) => void;
  onEndEdit: () => void;
}

const FONT = "var(--font-sans)";

function AutoTextarea({
  value,
  placeholder,
  color,
  fontSize,
  fontWeight,
  align,
  onChange,
  onEndEdit,
}: {
  value: string;
  placeholder: string;
  color: string;
  fontSize: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  onChange: (v: string) => void;
  onEndEdit: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onEndEdit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onEndEdit();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        height: "100%",
        resize: "none",
        border: "none",
        outline: "none",
        background: "transparent",
        color,
        fontFamily: FONT,
        fontSize,
        fontWeight,
        lineHeight: 1.35,
        textAlign: align ?? "left",
        padding: 0,
        margin: 0,
      }}
    />
  );
}

export default function CanvasObjectContent({
  object,
  editing,
  onText,
  onEndEdit,
}: Props) {
  switch (object.type) {
    case "text": {
      const c = object.content as TextContent;
      const size = c.fontSize ?? 16;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "flex-start",
          }}
        >
          {editing ? (
            <AutoTextarea
              value={c.text}
              placeholder="Type something…"
              color="var(--color-text-primary)"
              fontSize={size}
              align={c.align}
              onChange={onText}
              onEndEdit={onEndEdit}
            />
          ) : (
            <div
              style={{
                width: "100%",
                color: c.text ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                fontFamily: FONT,
                fontSize: size,
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                textAlign: c.align ?? "left",
              }}
            >
              {c.text || "Text"}
            </div>
          )}
        </div>
      );
    }

    case "sticky": {
      const c = object.content as StickyContent;
      const sw = STICKY_PALETTE[c.color] ?? STICKY_PALETTE.amber;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: sw.fill,
            border: `0.5px solid ${sw.border}`,
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflow: "hidden",
          }}
        >
          {c.tag && !editing && (
            <span
              style={{
                alignSelf: "flex-start",
                fontFamily: FONT,
                fontSize: 11,
                fontWeight: 500,
                color: sw.accent,
                background: sw.fill,
                border: `0.5px solid ${sw.border}`,
                borderRadius: "var(--radius-full)",
                padding: "3px 9px",
              }}
            >
              {c.tag}
            </span>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            {editing ? (
              <AutoTextarea
                value={c.text}
                placeholder="Write a note…"
                color="var(--color-text-primary)"
                fontSize={13}
                onChange={onText}
                onEndEdit={onEndEdit}
              />
            ) : (
              <div
                style={{
                  color: c.text ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  fontFamily: FONT,
                  fontSize: 13,
                  lineHeight: 1.4,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {c.text || "Write a note…"}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "shape": {
      const c = object.content as ShapeContent;
      const sw = SHAPE_PALETTE[c.color] ?? SHAPE_PALETTE.sage;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: sw.fill,
            border: `1.5px solid ${sw.border}`,
            borderRadius:
              c.shape === "ellipse" ? "50%" : "var(--radius-md)",
          }}
        />
      );
    }

    case "image": {
      const c = object.content as ImageContent;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            boxShadow: "var(--shadow-md)",
            border: "0.5px solid var(--color-border)",
            background: "var(--color-surface-sunken)",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {c.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.url}
              alt={c.caption ?? "canvas image"}
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-tertiary)",
              }}
            >
              <ImageIcon size={22} strokeWidth={1.75} />
            </div>
          )}
          {c.caption && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: 12,
                background: "rgba(var(--color-charcoal-rgb), 0.04)",
                backdropFilter: "blur(6px)",
                fontFamily: FONT,
                fontSize: 12,
                color: "var(--color-text-secondary)",
              }}
            >
              <ImageIcon size={14} strokeWidth={1.75} />
              {c.caption}
            </div>
          )}
        </div>
      );
    }

    case "reference": {
      const c = object.content as ReferenceContent;
      const Icon = object.refType === "project" ? ListChecks : FolderIcon;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            padding: 16,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: "var(--radius-md)",
              background: "rgba(var(--color-sage-rgb), 0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-sage-text)",
            }}
          >
            <Icon size={16} strokeWidth={1.75} />
          </div>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontFamily: FONT,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.title}
            </span>
            {c.subtitle && (
              <span style={{ fontFamily: FONT, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {c.subtitle}
              </span>
            )}
            {c.meta && (
              <span style={{ fontFamily: FONT, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {c.meta}
              </span>
            )}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
