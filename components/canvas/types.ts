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
export type CanvasTool = "select" | "hand" | "sticky" | "text" | "shape" | "pen" | "eraser";

/** Sticky/shape colour keys — the app's canonical 10-colour palette
 *  (lib/ui/palette.ts, surfaced for canvas in palette.ts). */
export type StickyColor =
  | "green"
  | "grey"
  | "brown"
  | "orange"
  | "yellow"
  | "olive"
  | "blue"
  | "purple"
  | "rose"
  | "red";
/** Shape fill colour keys — same palette, used as solid-ish tints. */
export type ShapeColor = StickyColor;

// `html` holds rich formatting (bold/italic/underline, headings, alignment);
// `text` is always the plain-text fallback (search, Ash, legacy objects).
export type TextAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface TextContent {
  text: string;
  html?: string;
  fontSize?: number;
  align?: TextAlign;
  /** Base text colour (whole box); inline colours can override in html. */
  textColor?: StickyColor;
}
export interface StickyContent {
  text: string;
  html?: string;
  color: StickyColor;
  tag?: string;
  fontSize?: number;
  align?: TextAlign;
  vAlign?: VAlign;
  textColor?: StickyColor;
}
export type LineCap = "none" | "arrow";
export type LineDash = "solid" | "dashed" | "dotted";

export interface ShapeContent {
  shape: "rect" | "ellipse" | "line" | "arrow";
  color: ShapeColor;
  text?: string;
  html?: string;
  fontSize?: number;
  align?: TextAlign;
  vAlign?: VAlign;
  textColor?: StickyColor;
  // Line/arrow only:
  startCap?: LineCap;
  endCap?: LineCap;
  dash?: LineDash;
  strokeWidth?: number;
}
export interface ImageContent {
  url: string;
  caption?: string;
}
/** A reference card points at another entity in the app. Fields denormalize
 *  just enough to render the card without a join. */
export interface ReferenceContent {
  title: string;
  subtitle?: string;
  meta?: string;
  /** project/task status label */
  status?: string;
  /** project completion 0..1 */
  progress?: number;
  /** task completed */
  done?: boolean;
  /** note preview text */
  snippet?: string;
  /** contact initials */
  initials?: string;
  /** accent tint key for the card's icon tile */
  color?: StickyColor;
  /** For a task-list card: which entity the list is scoped to. */
  scopeType?: "project" | "contact";
}

/** A live module-summary card (pulls stats from a module on mount). */
export type ModuleKey = "tasks" | "projects" | "finance" | "contacts" | "notes" | "calendar";
export interface ModuleContent {
  moduleKey: ModuleKey;
}

/** An onboarding call-to-action card. Clicking it either opens Ash with a
 *  starter prompt or routes to a module — used to seed a fresh Home board with
 *  interactive next steps instead of static hints. */
export type ActionIcon =
  | "ash" | "project" | "note" | "contact" | "calendar" | "sparkles" | "compass" | "plus";
export interface ActionContent {
  label:      string;
  sublabel?:  string;
  icon?:      ActionIcon;
  /** "ash" opens Ash with `prompt`; "route" navigates to `href`. */
  actionKind: "ash" | "route";
  prompt?:    string;
  href?:      string;
  /** Accent tint key from the palette. */
  color?:     StickyColor;
}

/** Freehand pen stroke. Points are relative to the object's box; the SVG
 *  viewBox stretches with the box so resize/rotate just work. */
export interface DrawingContent {
  points: [number, number][];
  color: StickyColor;
  strokeWidth: number;
  mode: "marker" | "highlighter";
}

export type CanvasContent =
  | TextContent
  | StickyContent
  | ShapeContent
  | ImageContent
  | ReferenceContent
  | DrawingContent
  | ModuleContent
  | ActionContent;

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
