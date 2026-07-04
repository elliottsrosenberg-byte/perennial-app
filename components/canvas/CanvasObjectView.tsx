"use client";

// Selection + interaction chrome around one object. Move (incl. group drag and
// option-duplicate) is delegated to the parent Canvas via onBeginDrag; resize
// and rotate are handled here for the single-selected object. `interactive` is
// true only under the Select tool — otherwise pointer events fall through so
// create tools can place over existing objects. Geometry is in world units;
// screen pointer deltas are divided by `scale`.

import { useEffect, useRef } from "react";
import type { CanvasObject, ShapeContent } from "./types";
import CanvasObjectContent from "./CanvasObjectContent";

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const MIN_SIZE = 24;

// Rotate cursor (a circular arrow). The stroke is a neutral glyph colour, not a
// themeable UI colour — a cursor icon, so it's a contrast-anchor exception.
const ROTATE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='22'%20height='22'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23555'%20stroke-width='2.2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M21%2012a9%209%200%201%201-3-6.7'/%3E%3Cpolyline%20points='21%203%2021%209%2015%209'/%3E%3C/svg%3E\") 11 11, grab";

interface Props {
  object: CanvasObject;
  selected: boolean;
  /** True when this is the ONLY selected object (shows resize/rotate handles). */
  soleSelected: boolean;
  /** True only under the Select tool — gates move/resize/rotate hit-testing. */
  interactive: boolean;
  editing: boolean;
  scale: number;
  onBeginDrag: (id: string, e: React.PointerEvent) => void;
  onChangeLocal: (id: string, patch: Partial<CanvasObject>) => void;
  onCommitGeometry: (id: string, o: CanvasObject) => void;
  onStartEdit: (id: string) => void;
  onText: (id: string, html: string, text: string) => void;
  onEndEdit: () => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  /** Report measured content height (text objects auto-grow). */
  onAutoHeight: (id: string, height: number) => void;
}

function rotate(vx: number, vy: number, rad: number) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: vx * c - vy * s, y: vx * s + vy * c };
}
function cornerOffset(corner: Corner, w: number, h: number) {
  return {
    x: (corner.includes("e") ? 1 : -1) * (w / 2),
    y: (corner.includes("s") ? 1 : -1) * (h / 2),
  };
}
function opposite(corner: Corner): Corner {
  return `${corner[0] === "n" ? "s" : "n"}${corner[1] === "w" ? "e" : "w"}` as Corner;
}

export default function CanvasObjectView({
  object,
  selected,
  soleSelected,
  interactive,
  editing,
  scale,
  onBeginDrag,
  onChangeLocal,
  onCommitGeometry,
  onStartEdit,
  onText,
  onEndEdit,
  onContextMenu,
  onAutoHeight,
}: Props) {
  const latestRef = useRef<CanvasObject>(object);
  useEffect(() => {
    latestRef.current = object;
  });

  // Text objects grow with their content: measure the wrapper and report up.
  const wrapRef = useRef<HTMLDivElement>(null);
  const isText = object.type === "text";
  useEffect(() => {
    if (!isText) return;
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onAutoHeight(object.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isText, object.id, onAutoHeight]);

  const inv = 1 / scale;
  const scalable = object.type === "text" || object.type === "sticky";
  const shapeKind = object.type === "shape" ? (object.content as ShapeContent).shape : null;
  // Double-click to edit text: text, sticky, and box-shapes (not line/arrow).
  const editableText = scalable || shapeKind === "rect" || shapeKind === "ellipse";

  function onBodyPointerDown(e: React.PointerEvent) {
    if (editing || !interactive) return; // fall through so create/hand tools work
    e.stopPropagation();
    onBeginDrag(object.id, e);
  }

  // ── resize ──
  function onResizePointerDown(e: React.PointerEvent, corner: Corner) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, obj: object };
    const move = (ev: PointerEvent) => {
      const o = start.obj;
      const rad = (o.rotation * Math.PI) / 180;
      const wdx = (ev.clientX - start.px) * inv;
      const wdy = (ev.clientY - start.py) * inv;
      const local = rotate(wdx, wdy, -rad);
      let nw = o.width;
      let nh = o.height;
      if (corner.includes("e")) nw = o.width + local.x;
      if (corner.includes("w")) nw = o.width - local.x;
      if (corner.includes("s")) nh = o.height + local.y;
      if (corner.includes("n")) nh = o.height - local.y;
      nw = Math.max(MIN_SIZE, nw);
      nh = Math.max(MIN_SIZE, nh);

      // Shift on a text/sticky corner = uniform scale of the box AND its text.
      const uniform = ev.shiftKey && scalable;
      let fontPatch: Partial<CanvasObject> = {};
      if (uniform) {
        const factor = Math.max(nw / o.width, nh / o.height);
        nw = Math.round(o.width * factor);
        nh = Math.round(o.height * factor);
        const baseFont =
          (o.content as { fontSize?: number }).fontSize ?? (o.type === "text" ? 16 : 13);
        fontPatch = {
          content: { ...o.content, fontSize: Math.max(6, Math.round(baseFont * factor)) },
        };
      }

      const anchor = opposite(corner);
      const centerOld = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
      const aOld = cornerOffset(anchor, o.width, o.height);
      const rOld = rotate(aOld.x, aOld.y, rad);
      const aWorld = { x: centerOld.x + rOld.x, y: centerOld.y + rOld.y };
      const aNew = cornerOffset(anchor, nw, nh);
      const rNew = rotate(aNew.x, aNew.y, rad);
      const centerNew = { x: aWorld.x - rNew.x, y: aWorld.y - rNew.y };
      onChangeLocal(object.id, {
        width: Math.round(nw),
        height: Math.round(nh),
        x: Math.round(centerNew.x - nw / 2),
        y: Math.round(centerNew.y - nh / 2),
        ...fontPatch,
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommitGeometry(object.id, latestRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── rotate ──
  function onRotatePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest("[data-canvas-object]");
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Anchor to the grab angle so rotation starts from the object's current
    // angle instead of snapping (fixes the jump on pointer-down).
    const deg = (rad: number) => (rad * 180) / Math.PI;
    const startPointerAngle = deg(Math.atan2(e.clientY - cy, e.clientX - cx));
    const startRotation = object.rotation;
    const move = (ev: PointerEvent) => {
      const delta = deg(Math.atan2(ev.clientY - cy, ev.clientX - cx)) - startPointerAngle;
      let next = Math.round(startRotation + delta);
      if (ev.shiftKey) next = Math.round(next / 15) * 15;
      onChangeLocal(object.id, { rotation: next });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onCommitGeometry(object.id, latestRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const handleSize = 11 * inv;
  const handleBorder = Math.max(0.5, 1.25 * inv);
  const outline = 1.5 * inv;
  const rotZone = 22 * inv;
  const off = rotZone + handleSize / 2;

  return (
    <div
      data-canvas-object
      ref={wrapRef}
      style={{
        position: "absolute",
        left: object.x,
        top: object.y,
        width: object.width,
        height: isText ? "auto" : object.height,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: "center center",
        zIndex: object.zIndex,
        cursor: interactive && !editing ? "move" : editing ? "text" : "inherit",
        touchAction: "none",
      }}
      onPointerDown={onBodyPointerDown}
      onContextMenu={(e) => onContextMenu(object.id, e)}
      onDoubleClick={(e) => {
        if (editableText && interactive) {
          e.stopPropagation();
          onStartEdit(object.id);
        }
      }}
    >
      <CanvasObjectContent
        object={object}
        editing={editing}
        onRichChange={(html, text) => onText(object.id, html, text)}
        onEndEdit={onEndEdit}
      />

      {selected && !editing && (
        <div
          style={{
            position: "absolute",
            inset: -outline,
            border: `${outline}px solid var(--color-sage)`,
            borderRadius: "var(--radius-md)",
            pointerEvents: "none",
          }}
        />
      )}

      {soleSelected && interactive && !editing && (
        <>
          {/* rotate zones just outside each corner — rotate cursor on hover */}
          {CORNERS.map((corner) => (
            <div
              key={`rot-${corner}`}
              onPointerDown={onRotatePointerDown}
              title="Rotate"
              style={{
                position: "absolute",
                left: corner.includes("w") ? -off : undefined,
                right: corner.includes("e") ? -off : undefined,
                top: corner.includes("n") ? -off : undefined,
                bottom: corner.includes("s") ? -off : undefined,
                width: rotZone,
                height: rotZone,
                cursor: ROTATE_CURSOR,
              }}
            />
          ))}

          {/* resize handles */}
          {CORNERS.map((corner) => (
            <div
              key={corner}
              onPointerDown={(e) => onResizePointerDown(e, corner)}
              style={{
                position: "absolute",
                left: corner.includes("w") ? -handleSize / 2 : undefined,
                right: corner.includes("e") ? -handleSize / 2 : undefined,
                top: corner.includes("n") ? -handleSize / 2 : undefined,
                bottom: corner.includes("s") ? -handleSize / 2 : undefined,
                width: handleSize,
                height: handleSize,
                background: "var(--color-surface-raised)",
                border: `${handleBorder}px solid var(--color-sage)`,
                borderRadius: 2 * inv,
                cursor: `${corner}-resize`,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
