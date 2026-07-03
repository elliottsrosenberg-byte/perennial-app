"use client";

// Selection + interaction chrome around one object. Move (incl. group drag and
// option-duplicate) is delegated to the parent Canvas via onBeginDrag; resize
// and rotate are handled here for the single-selected object. Geometry is in
// world units — screen pointer deltas are divided by `scale`.

import { useEffect, useRef } from "react";
import { RotateCw } from "lucide-react";
import type { CanvasObject } from "./types";
import CanvasObjectContent from "./CanvasObjectContent";

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const MIN_SIZE = 24;

interface Props {
  object: CanvasObject;
  selected: boolean;
  /** True when this is the ONLY selected object (shows resize/rotate handles). */
  soleSelected: boolean;
  editing: boolean;
  scale: number;
  onBeginDrag: (id: string, e: React.PointerEvent) => void;
  onChangeLocal: (id: string, patch: Partial<CanvasObject>) => void;
  onCommitGeometry: (id: string, o: CanvasObject) => void;
  onStartEdit: (id: string) => void;
  onText: (id: string, text: string) => void;
  onEndEdit: () => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
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
  editing,
  scale,
  onBeginDrag,
  onChangeLocal,
  onCommitGeometry,
  onStartEdit,
  onText,
  onEndEdit,
  onContextMenu,
}: Props) {
  const latestRef = useRef<CanvasObject>(object);
  useEffect(() => {
    latestRef.current = object;
  });

  const inv = 1 / scale;
  const scalable = object.type === "text" || object.type === "sticky";

  function onBodyPointerDown(e: React.PointerEvent) {
    if (editing) return;
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
    const move = (ev: PointerEvent) => {
      const ang = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      let deg = Math.round(ang);
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      onChangeLocal(object.id, { rotation: deg });
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
  const rotateOffset = 30 * inv;

  return (
    <div
      data-canvas-object
      style={{
        position: "absolute",
        left: object.x,
        top: object.y,
        width: object.width,
        height: object.height,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: "center center",
        zIndex: object.zIndex,
        cursor: editing ? "text" : "move",
        touchAction: "none",
      }}
      onPointerDown={onBodyPointerDown}
      onContextMenu={(e) => onContextMenu(object.id, e)}
      onDoubleClick={(e) => {
        if (scalable) {
          e.stopPropagation();
          onStartEdit(object.id);
        }
      }}
    >
      <CanvasObjectContent
        object={object}
        editing={editing}
        onText={(t) => onText(object.id, t)}
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

      {soleSelected && !editing && (
        <>
          {/* rotate handle — stem + knob above the object */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: -rotateOffset,
              width: handleBorder,
              height: rotateOffset - handleSize / 2,
              transform: "translateX(-50%)",
              background: "var(--color-sage)",
              pointerEvents: "none",
            }}
          />
          <div
            onPointerDown={onRotatePointerDown}
            title="Rotate"
            style={{
              position: "absolute",
              left: "50%",
              top: -rotateOffset,
              width: handleSize * 1.7,
              height: handleSize * 1.7,
              transform: "translate(-50%, -50%)",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-raised)",
              border: `${handleBorder}px solid var(--color-sage)`,
              boxShadow: "var(--shadow-sm)",
              cursor: "grab",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-sage-text)",
            }}
          >
            <RotateCw size={handleSize} strokeWidth={2} />
          </div>

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
