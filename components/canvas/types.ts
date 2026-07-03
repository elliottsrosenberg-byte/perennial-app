// Client-side model for the spatial canvas. DB row shapes live in
// types/database.ts (CanvasObjectRow); these are the ergonomic, typed
// in-memory objects the engine works with, plus the per-type `content` unions.

import type {
  CanvasObjectType,
  CanvasRefType,
  CanvasObjectRow,
} from "@/types/database";

export type { CanvasObjectType, CanvasRefType };

/** Active canvas tool. */
export type CanvasTool = "select" | "hand" | "sticky" | "text" | "shape" | "pen";

/** Sticky/shape colour keys — the app's 10-colour palette (see palette.ts). */
export type StickyColor =
  | "sage"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "blue"
  | "gold"
  | "purple"
  | "teal"
  | "grey";
/** Shape fill colour keys — same palette, used as solid-ish tints. */
export type ShapeColor = StickyColor;

export interface TextContent {
  text: string;
  fontSize?: number;
  align?: "left" | "center" | "right";
}
export interface StickyContent {
  text: string;
  color: StickyColor;
  tag?: string;
  fontSize?: number;
}
export interface ShapeContent {
  shape: "rect" | "ellipse";
  color: ShapeColor;
}
export interface ImageContent {
  url: string;
  caption?: string;
}
/** A reference card points at another entity in the app. `snapshot` denormalizes
 *  just enough to render the card without a join (title/subtitle/meta). */
export interface ReferenceContent {
  title: string;
  subtitle?: string;
  meta?: string;
}

export type CanvasContent =
  | TextContent
  | StickyContent
  | ShapeContent
  | ImageContent
  | ReferenceContent;

/** In-memory canvas object. Geometry is in canvas (world) coordinates. */
export interface CanvasObject {
  id: string;
  type: CanvasObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  content: CanvasContent;
  refType: CanvasRefType | null;
  refId: string | null;
}

// ── row ⇆ object mapping ───────────────────────────────────────────────────────

export function rowToObject(row: CanvasObjectRow): CanvasObject {
  return {
    id: row.id,
    type: row.type,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    zIndex: row.z_index,
    content: (row.content ?? {}) as unknown as CanvasContent,
    refType: row.ref_type,
    refId: row.ref_id,
  };
}

/** Persist-shape for an object (columns the DB owns). `id`/`canvas_id`/`user_id`
 *  are supplied by the caller at insert time. */
export function objectToColumns(o: CanvasObject) {
  return {
    type: o.type,
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    rotation: o.rotation,
    z_index: o.zIndex,
    content: o.content as unknown as Record<string, unknown>,
    ref_type: o.refType,
    ref_id: o.refId,
  };
}
