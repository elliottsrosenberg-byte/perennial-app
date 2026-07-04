"use client";

// Per-type visual renderer for a canvas object. Selection/drag/resize chrome
// lives in CanvasObjectView; this is purely the inner content. Text-bearing
// objects (text, sticky, box-shapes) use a lightweight contentEditable rich
// editor (RichEditable) when editing and render stored HTML otherwise. All
// colours come from design tokens (see palette.ts / AGENTS.md).

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
  /** Rich text change: (html, plainText). */
  onRichChange: (html: string, text: string) => void;
  onEndEdit: () => void;
}

const FONT = "var(--font-sans)";

// ── rich text: editable + static view ─────────────────────────────────────────

function RichEditable({
  html,
  text,
  color,
  fontSize,
  align,
  autoGrow,
  placeholder,
  onChange,
  onEndEdit,
}: {
  html?: string;
  text: string;
  color: string;
  fontSize: number;
  align?: "left" | "center" | "right";
  autoGrow?: boolean;
  placeholder?: string;
  onChange: (html: string, text: string) => void;
  onEndEdit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html) el.innerHTML = html;
    else el.innerText = text;
    el.focus();
    // caret to end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="canvas-rich"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={() => {
        const el = ref.current;
        if (el) onChange(el.innerHTML, el.textContent ?? "");
      }}
      onBlur={onEndEdit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onEndEdit();
        }
        e.stopPropagation();
      }}
      onPaste={(e) => {
        // Paste as plain text — keeps stored HTML to our own formatting only.
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, t);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        height: autoGrow ? "auto" : "100%",
        outline: "none",
        color,
        fontFamily: FONT,
        fontSize,
        lineHeight: 1.35,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        textAlign: align ?? "left",
        userSelect: "text",
        overflow: autoGrow ? "visible" : "hidden",
      }}
    />
  );
}

function RichView({
  html,
  text,
  color,
  emptyColor,
  fontSize,
  align,
  placeholder,
}: {
  html?: string;
  text: string;
  color: string;
  emptyColor: string;
  fontSize: number;
  align?: "left" | "center" | "right";
  placeholder?: string;
}) {
  const base: React.CSSProperties = {
    width: "100%",
    fontFamily: FONT,
    fontSize,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textAlign: align ?? "left",
  };
  if (html) {
    return <div className="canvas-rich" style={{ ...base, color }} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <div className="canvas-rich" style={{ ...base, color: text ? color : emptyColor }}>
      {text || placeholder || ""}
    </div>
  );
}

// ── main renderer ──────────────────────────────────────────────────────────────

export default function CanvasObjectContent({ object, editing, onRichChange, onEndEdit }: Props) {
  switch (object.type) {
    case "text": {
      const c = object.content as TextContent;
      const size = c.fontSize ?? 16;
      return editing ? (
        <RichEditable
          html={c.html}
          text={c.text}
          color="var(--color-text-primary)"
          fontSize={size}
          align={c.align}
          autoGrow
          placeholder="Type something…"
          onChange={onRichChange}
          onEndEdit={onEndEdit}
        />
      ) : (
        <RichView
          html={c.html}
          text={c.text || "Text"}
          color="var(--color-text-primary)"
          emptyColor="var(--color-text-tertiary)"
          fontSize={size}
          align={c.align}
        />
      );
    }

    case "sticky": {
      const c = object.content as StickyContent;
      const sw = STICKY_PALETTE[c.color] ?? STICKY_PALETTE.amber;
      const stickyFont = c.fontSize ?? 13;
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
              <RichEditable
                html={c.html}
                text={c.text}
                color="var(--color-text-primary)"
                fontSize={stickyFont}
                placeholder="Write a note…"
                onChange={onRichChange}
                onEndEdit={onEndEdit}
              />
            ) : (
              <RichView
                html={c.html}
                text={c.text}
                color="var(--color-text-primary)"
                emptyColor="var(--color-text-tertiary)"
                fontSize={stickyFont}
                placeholder="Write a note…"
              />
            )}
          </div>
        </div>
      );
    }

    case "shape": {
      const c = object.content as ShapeContent;
      const sw = SHAPE_PALETTE[c.color] ?? SHAPE_PALETTE.sage;

      if (c.shape === "line" || c.shape === "arrow") {
        const w = object.width;
        const h = object.height;
        const midY = h / 2;
        return (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            style={{ overflow: "visible", display: "block" }}
          >
            <line
              x1={0}
              y1={midY}
              x2={c.shape === "arrow" ? w - 9 : w}
              y2={midY}
              style={{ stroke: sw.accent }}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            {c.shape === "arrow" && (
              <polygon
                points={`${w - 11},${midY - 6} ${w},${midY} ${w - 11},${midY + 6}`}
                style={{ fill: sw.accent }}
              />
            )}
          </svg>
        );
      }

      const shapeFont = c.fontSize ?? 14;
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: sw.fill,
            border: `1.5px solid ${sw.border}`,
            borderRadius: c.shape === "ellipse" ? "50%" : "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            overflow: "hidden",
          }}
        >
          {editing ? (
            <RichEditable
              html={c.html}
              text={c.text ?? ""}
              color="var(--color-text-primary)"
              fontSize={shapeFont}
              align="center"
              onChange={onRichChange}
              onEndEdit={onEndEdit}
            />
          ) : c.html || c.text ? (
            <RichView
              html={c.html}
              text={c.text ?? ""}
              color="var(--color-text-primary)"
              emptyColor="var(--color-text-tertiary)"
              fontSize={shapeFont}
              align="center"
            />
          ) : null}
        </div>
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
