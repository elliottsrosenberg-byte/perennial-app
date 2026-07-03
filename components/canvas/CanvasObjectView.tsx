"use client";

// Selection + interaction chrome (move / resize / rotate) around one object.
// Lives inside the transformed world layer, so geometry is in world units;
// screen pointer deltas are divided by `scale` to convert back to world units.

import { useEffect, useRef } from "react";
import type { CanvasObject } from "./types";
import CanvasObjectContent from "./CanvasObjectContent";

type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const MIN_SIZE = 28;

interface Props {
  object: CanvasObject;
  selected: boolean;
  editing: boolean;
  scale: number;
  /** When true the whole canvas is mid-pan; suppress object hit-testing. */
  interactive: boolean;
  onSelect: (id: string) => void;
  onChangeLocal: (id: string, patch: Partial<CanvasObject>) => void;
  onCommitGeometry: (id: string, o: CanvasObject) => void;
  onStartEdit: (id: string) => void;
  onText: (id: string, text: string) => void;
  onEndEdit: () => void;
}

function rotate(vx: number, vy: number, rad: number) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: vx * c - vy * s, y: vx * s + vy * c };
}

/** Corner offset from box center, in local (unrotated) space. */
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
  editing,
  scale,
  interactive,
  onSelect,
  onChangeLocal,
  onCommitGeometry,
  onStartEdit,
  onText,
  onEndEdit,
}: Props) {
  const startRef = useRef<{
    px: number;
    py: number;
    obj: CanvasObject;
  } | null>(null);
  // Latest geometry, read at pointer-up to persist the final state. Synced in an
  // effect (not during render) per the react-hooks/refs rule.
  const latestRef = useRef<CanvasObject>(object);
  useEffect(() => {
    latestRef.current = object;
  });

  const inv = 1 / scale;

  // ── move ──
  function onBodyPointerDown(e: React.PointerEvent) {
    if (editing || !interactive) return;
    e.stopPropagation();
    onSelect(object.id);
    startRef.current = { px: e.clientX, py: e.clientY, obj: object };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onBodyPointerMove(e: React.PointerEvent) {
    const s = startRef.current;
    if (!s) return;
    const dx = (e.clientX - s.px) * inv;
    const dy = (e.clientY - s.py) * inv;
    onChangeLocal(object.id, { x: Math.round(s.obj.x + dx), y: Math.round(s.obj.y + dy) });
  }
  function onBodyPointerUp(e: React.PointerEvent) {
    if (!startRef.current) return;
    startRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    onCommitGeometry(object.id, latestRef.current);
  }

  // ── resize ──
  function onResizePointerDown(e: React.PointerEvent, corner: Corner) {
    e.stopPropagation();
    onSelect(object.id);
    startRef.current = { px: e.clientX, py: e.clientY, obj: object };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const o = s.obj;
      const rad = (o.rotation * Math.PI) / 180;
      const wdx = (ev.clientX - s.px) * inv;
      const wdy = (ev.clientY - s.py) * inv;
      const local = rotate(wdx, wdy, -rad); // delta in the box's local frame
      let nw = o.width;
      let nh = o.height;
      if (corner.includes("e")) nw = o.width + local.x;
      if (corner.includes("w")) nw = o.width - local.x;
      if (corner.includes("s")) nh = o.height + local.y;
      if (corner.includes("n")) nh = o.height - local.y;
      nw = Math.max(MIN_SIZE, nw);
      nh = Math.max(MIN_SIZE, nh);
      // Keep the opposite corner fixed in world space.
      const anchor = opposite(corner);
      const centerOld = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
      const aOld = cornerOffset(anchor, o.width, o.height);
      const aWorld = {
        x: centerOld.x + rotate(aOld.x, aOld.y, rad).x,
        y: centerOld.y + rotate(aOld.x, aOld.y, rad).y,
      };
      const aNew = cornerOffset(anchor, nw, nh);
      const rNew = rotate(aNew.x, aNew.y, rad);
      const centerNew = { x: aWorld.x - rNew.x, y: aWorld.y - rNew.y };
      onChangeLocal(object.id, {
        width: Math.round(nw),
        height: Math.round(nh),
        x: Math.round(centerNew.x - nw / 2),
        y: Math.round(centerNew.y - nh / 2),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      startRef.current = null;
      onCommitGeometry(object.id, latestRef.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── rotate ──
  function onRotatePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(object.id);
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

  const handleSize = 10 * inv;
  const handleBorder = Math.max(0.5, 1 * inv);
  const outline = 1.5 * inv;

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
      onPointerMove={onBodyPointerMove}
      onPointerUp={onBodyPointerUp}
      onDoubleClick={(e) => {
        if (object.type === "text" || object.type === "sticky") {
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
        <>
          {/* selection outline */}
          <div
            style={{
              position: "absolute",
              inset: -outline,
              border: `${outline}px solid var(--color-sage)`,
              borderRadius: "var(--radius-md)",
              pointerEvents: "none",
            }}
          />
          {/* rotate handle */}
          <div
            onPointerDown={onRotatePointerDown}
            style={{
              position: "absolute",
              left: "50%",
              top: -28 * inv,
              width: handleSize * 1.4,
              height: handleSize * 1.4,
              transform: "translate(-50%, -50%)",
              borderRadius: "var(--radius-full)",
              background: "var(--color-surface-raised)",
              border: `${handleBorder}px solid var(--color-sage)`,
              cursor: "grab",
              boxShadow: "var(--shadow-sm)",
            }}
          />
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
