// Pure geometry + object-factory helpers for the canvas engine.

import type {
  CanvasObject,
  CanvasObjectType,
  CanvasContent,
} from "./types";

export interface Viewport {
  /** Screen-space offset of the world origin. */
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 2.5;
export const GRID_SIZE = 34;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Screen (client) point → world coordinates, given the container's rect. */
export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: Viewport,
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - view.x) / view.scale,
    y: (clientY - rect.top - view.y) / view.scale,
  };
}

const DEFAULTS: Record<
  CanvasObjectType,
  { width: number; height: number; content: CanvasContent }
> = {
  text:      { width: 240, height: 52,  content: { text: "Text", fontSize: 16 } },
  sticky:    { width: 220, height: 168, content: { text: "", color: "amber" } },
  shape:     { width: 200, height: 150, content: { shape: "rect", color: "sage" } },
  image:     { width: 280, height: 200, content: { url: "" } },
  reference: { width: 300, height: 132, content: { title: "Untitled" } },
  drawing:   { width: 200, height: 120, content: { points: [], color: "sage", strokeWidth: 3, mode: "marker" } },
};

let seq = 0;
/** Client-side id. crypto.randomUUID where available; falls back for old envs. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  seq += 1;
  return `tmp-${Date.now()}-${seq}`;
}

/** Axis-aligned bounding box of an object (rotation ignored — good enough for
 *  marquee hit-testing). */
export function objectAABB(o: { x: number; y: number; width: number; height: number }) {
  return { left: o.x, top: o.y, right: o.x + o.width, bottom: o.y + o.height };
}

/** Does rect A fully contain rect B? */
export function rectContains(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
}

/** Do rects A and B overlap at all? */
export function rectIntersects(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** A normalized world-space rect from two corner points. */
export function normRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

export interface CreateObjectOptions {
  content?: Partial<CanvasContent>;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  refType?: CanvasObject["refType"];
  refId?: string | null;
}

/** Build a new object centered on a world point. */
export function createObject(
  type: CanvasObjectType,
  center: { x: number; y: number },
  zIndex: number,
  opts: CreateObjectOptions = {},
): CanvasObject {
  const d = DEFAULTS[type];
  const width = opts.width ?? d.width;
  const height = opts.height ?? d.height;
  return {
    id: newId(),
    type,
    x: Math.round(center.x - width / 2),
    y: Math.round(center.y - height / 2),
    width,
    height,
    rotation: opts.rotation ?? 0,
    zIndex: opts.zIndex ?? zIndex,
    content: { ...d.content, ...(opts.content ?? {}) } as CanvasContent,
    refType: opts.refType ?? null,
    refId: opts.refId ?? null,
  };
}

/** Deep-ish copy of an object with a fresh id, offset by (dx, dy). */
export function cloneObject(o: CanvasObject, dx: number, dy: number, zIndex: number): CanvasObject {
  return {
    ...o,
    id: newId(),
    x: o.x + dx,
    y: o.y + dy,
    zIndex,
    content: { ...o.content },
  };
}
