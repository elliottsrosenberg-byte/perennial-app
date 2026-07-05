"use client";

// Reusable spatial canvas ("board"). Infinite pan/zoom viewport + a FigJam-style
// tool/selection model: select tool (click / marquee enclose|touch), hand tool
// (+ space to pan), multi-select, group move, option-drag duplicate, place-on-
// click creation, keyboard shortcuts, and a right-click menu. Colours are
// design tokens only (AGENTS.md).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Trash2,
  Copy,
  ArrowUpToLine,
  ArrowDownToLine,
  StickyNote,
  Type,
  BoxSelect,
  ClipboardPaste,
  FileText,
  Bold,
  Italic,
  Underline,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  List,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  FoldVertical,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { CanvasObjectRow, CanvasScope } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { uploadEditorImage, isUploadableImageType } from "@/lib/uploads/editor-image";
import { useCanvas } from "./useCanvas";
import {
  clampScale,
  createObject,
  cloneObject,
  screenToWorld,
  normRect,
  objectAABB,
  rectContains,
  rectIntersects,
  GRID_SIZE,
  type Viewport,
} from "./geometry";
import type {
  CanvasObject,
  CanvasObjectType,
  CanvasTool,
  StickyColor,
  ShapeContent,
  TextAlign,
  VAlign,
  ModuleKey,
} from "./types";
import { STICKY_COLOR_ORDER, STICKY_PALETTE, swatch } from "./palette";
import CanvasObjectView from "./CanvasObjectView";
import ToolDock, { type ShapeKind } from "./ToolDock";
import EntityPicker from "./EntityPicker";
import ImagePicker from "./ImagePicker";
import type { EntityKind, EntityResult } from "@/lib/canvas/entities";

export interface CanvasHandle {
  create: (type: CanvasObjectType) => void;
  uploadImage: () => void;
}

interface Props {
  canvasId?: string | null;
  initialObjects?: CanvasObjectRow[];
  scope?: CanvasScope;
  entityId?: string | null;
  hideDock?: boolean;
  style?: CSSProperties;
}

const DRAG_THRESHOLD = 3;

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { canvasId, initialObjects, scope, entityId = null, hideDock = false, style }: Props,
  ref,
) {
  const store = useCanvas({ canvasId, initialObjects, scope, entityId });
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<CanvasTool>("select");
  const [stickyColor, setStickyColor] = useState<StickyColor>("yellow");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");
  const [penMode, setPenMode] = useState<"marker" | "highlighter">("marker");
  const [penColor, setPenColor] = useState<StickyColor>("olive");
  const [penSize, setPenSize] = useState(4);
  const [drawingPts, setDrawingPts] = useState<[number, number][] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [rubber, setRubber] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<EntityKind | null>(null);
  const [imagePicker, setImagePicker] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editDrop, setEditDrop] = useState<null | "block" | "align" | "valign" | "color">(null);
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const [menu, setMenu] = useState<
    { x: number; y: number; kind: "object" | "canvas"; world?: { x: number; y: number } } | null
  >(null);

  // Live refs so window/keyboard handlers read current values without re-binding.
  // Synced in an effect (not during render) per react-hooks/refs; handlers run
  // after commit, so they always see the latest.
  const viewRef = useRef(view);
  const objsRef = useRef(store.objects);
  const selRef = useRef(selectedIds);
  const storeRef = useRef(store);
  useEffect(() => {
    viewRef.current = view;
    objsRef.current = store.objects;
    selRef.current = selectedIds;
    storeRef.current = store;
  });

  const rectOf = () => containerRef.current!.getBoundingClientRect();
  const toWorld = useCallback((cx: number, cy: number) => {
    return screenToWorld(cx, cy, rectOf(), viewRef.current);
  }, []);
  const viewportCenterWorld = useCallback(() => {
    const r = rectOf();
    return screenToWorld(r.left + r.width / 2, r.top + r.height / 2, r, viewRef.current);
  }, []);
  const nextZ = () => objsRef.current.reduce((m, o) => Math.max(m, o.zIndex), 0) + 1;
  const minZ = () => objsRef.current.reduce((m, o) => Math.min(m, o.zIndex), 0);

  const selectOnly = useCallback((id: string) => setSelectedIds(new Set([id])), []);

  // Arming a create tool clears the current selection so its handles don't
  // intercept placement clicks. Select/hand keep the selection.
  const selectTool = useCallback((t: CanvasTool) => {
    setTool(t);
    setMenu(null);
    if (t !== "select" && t !== "hand") {
      setSelectedIds(new Set());
      setEditingId(null);
    }
  }, []);

  // ── create / place ──
  const placeObject = useCallback(
    (type: CanvasObjectType, center: { x: number; y: number }, extra?: Parameters<typeof createObject>[3]) => {
      const obj = createObject(type, center, nextZ(), extra);
      store.add(obj);
      selectOnly(obj.id);
      if (type === "text" || type === "sticky") setEditingId(obj.id);
      return obj;
    },
    [store, selectOnly],
  );

  // Imperative create (Home chips) — drops at viewport centre.
  const handleCreate = useCallback(
    (type: CanvasObjectType) => {
      const extra = type === "sticky" ? { content: { color: stickyColor, text: "" } } : undefined;
      placeObject(type, viewportCenterWorld(), extra);
    },
    [placeObject, viewportCenterWorld, stickyColor],
  );

  const handleUploadImage = useCallback(() => fileRef.current?.click(), []);
  const addImageFromFile = useCallback(
    async (file: File, center?: { x: number; y: number }) => {
      try {
        const up = await uploadEditorImage(file);
        const maxW = 360;
        const ratio = up.width && up.height ? up.height / up.width : 0.66;
        const width = Math.min(maxW, up.width ?? maxW);
        placeObject("image", center ?? viewportCenterWorld(), {
          width,
          height: Math.round(width * ratio),
          content: { url: up.url },
        });
      } catch (err) {
        console.error("canvas image upload failed", err);
        setToast(
          err instanceof Error ? err.message : "Couldn't add that image. Please try again.",
        );
      }
    },
    [placeObject, viewportCenterWorld],
  );
  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) addImageFromFile(file);
    },
    [addImageFromFile],
  );

  // Place an existing library image (by URL) at the viewport centre, sizing to
  // the image's natural aspect ratio.
  const placeImageFromUrl = useCallback(
    (url: string) => {
      setImagePicker(false);
      const img = new window.Image();
      const drop = (w: number, h: number) =>
        placeObject("image", viewportCenterWorld(), { width: w, height: h, content: { url } });
      img.onload = () => {
        const maxW = 360;
        const width = Math.min(maxW, img.naturalWidth || maxW);
        const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.66;
        drop(width, Math.round(width * ratio));
      };
      img.onerror = () => drop(280, 200);
      img.src = url;
    },
    [placeObject, viewportCenterWorld],
  );

  useImperativeHandle(ref, () => ({ create: handleCreate, uploadImage: handleUploadImage }), [
    handleCreate,
    handleUploadImage,
  ]);

  // ── object move (group drag + option-duplicate) ──
  const beginObjectDrag = useCallback(
    (id: string, e: React.PointerEvent) => {
      setMenu(null);
      const shift = e.shiftKey;
      const alt = e.altKey;
      const current = selRef.current;

      let ids: Set<string>;
      if (shift) {
        ids = new Set(current);
        if (ids.has(id)) {
          ids.delete(id);
          setSelectedIds(ids);
          return; // shift-click toggled off → no drag
        }
        ids.add(id);
      } else if (current.has(id)) {
        ids = new Set(current);
      } else {
        ids = new Set([id]);
      }
      setSelectedIds(ids);

      let dragObjs = objsRef.current.filter((o) => ids.has(o.id));
      if (alt) {
        let z = nextZ();
        const clones = dragObjs.map((o) => cloneObject(o, 0, 0, z++));
        clones.forEach((c) => store.add(c));
        setSelectedIds(new Set(clones.map((c) => c.id)));
        dragObjs = clones;
      }

      const starts = dragObjs.map((o) => ({ id: o.id, x: o.x, y: o.y }));
      const px = e.clientX;
      const py = e.clientY;
      const scale = viewRef.current.scale;
      let ldx = 0;
      let ldy = 0;
      const move = (ev: PointerEvent) => {
        ldx = (ev.clientX - px) / scale;
        ldy = (ev.clientY - py) / scale;
        starts.forEach((s) =>
          store.patchLocal(s.id, { x: Math.round(s.x + ldx), y: Math.round(s.y + ldy) }),
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (ldx !== 0 || ldy !== 0) {
          starts.forEach((s) =>
            store.commit(s.id, { x: Math.round(s.x + ldx), y: Math.round(s.y + ldy) }),
          );
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [store],
  );

  // ── background pointer down: pan / marquee / place / draw ──
  function onBgPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setMenu(null);
    const handMode = tool === "hand" || spaceDown;

    if (handMode) {
      const start = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
      setPanning(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) =>
        setView((v) => ({ ...v, x: start.vx + (ev.clientX - start.px), y: start.vy + (ev.clientY - start.py) }));
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setPanning(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "eraser") {
      const eraseAt = (cx: number, cy: number) => {
        const w = toWorld(cx, cy);
        const hit = objsRef.current
          .filter((o) => {
            const b = objectAABB(o);
            return w.x >= b.left && w.x <= b.right && w.y >= b.top && w.y <= b.bottom;
          })
          .sort((a, b) => b.zIndex - a.zIndex)[0];
        if (hit) store.remove(hit.id);
      };
      eraseAt(e.clientX, e.clientY);
      const move = (ev: PointerEvent) => eraseAt(ev.clientX, ev.clientY);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "sticky") {
      placeObject("sticky", toWorld(e.clientX, e.clientY), { content: { color: stickyColor, text: "" } });
      setTool("select");
      return;
    }

    if (tool === "text") {
      // Click places a default text box; drag sizes the font to the drag height.
      const sx = e.clientX;
      const sy = e.clientY;
      const move = (ev: PointerEvent) => setRubber({ sx, sy, ex: ev.clientX, ey: ev.clientY });
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setRubber(null);
        const w0 = toWorld(sx, sy);
        const w1 = toWorld(ev.clientX, ev.clientY);
        const dh = Math.abs(w1.y - w0.y);
        const dw = Math.abs(w1.x - w0.x);
        const center = dh > 12 ? { x: (w0.x + w1.x) / 2, y: (w0.y + w1.y) / 2 } : w0;
        const extra =
          dh > 12
            ? { width: Math.max(120, Math.round(dw)), content: { text: "", fontSize: Math.max(12, Math.min(160, Math.round(dh))) } }
            : undefined;
        placeObject("text", center, extra);
        setTool("select");
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "shape") {
      const sx = e.clientX;
      const sy = e.clientY;
      const move = (ev: PointerEvent) => setRubber({ sx, sy, ex: ev.clientX, ey: ev.clientY });
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setRubber(null);
        const w0 = toWorld(sx, sy);
        const w1 = toWorld(ev.clientX, ev.clientY);

        // Line / arrow: a thin box from start→end, rotated to the drag angle.
        if (shapeKind === "line" || shapeKind === "arrow") {
          const dx = w1.x - w0.x;
          const dy = w1.y - w0.y;
          const length = Math.hypot(dx, dy);
          const finalLen = length < 6 ? 160 : length;
          const angle = length < 6 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
          const center = length < 6 ? w0 : { x: (w0.x + w1.x) / 2, y: (w0.y + w1.y) / 2 };
          const lineObj = createObject("shape", center, nextZ(), {
            width: Math.round(finalLen),
            height: 14,
            rotation: angle,
            content: { shape: shapeKind, color: "green" },
          });
          store.add(lineObj);
          selectOnly(lineObj.id);
          setTool("select");
          return;
        }

        const r = normRect(w0.x, w0.y, w1.x, w1.y);
        let width = Math.round(r.right - r.left);
        let height = Math.round(r.bottom - r.top);
        let center: { x: number; y: number };
        if (width < 8 && height < 8) {
          width = 200;
          height = 150;
          center = w0;
        } else {
          center = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
        }
        const obj = createObject("shape", center, nextZ(), {
          width,
          height,
          content: { shape: shapeKind, color: "green" },
        });
        store.add(obj);
        selectOnly(obj.id);
        setTool("select");
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "pen") {
      const pts: [number, number][] = [[e.clientX, e.clientY]];
      setDrawingPts([...pts]);
      const move = (ev: PointerEvent) => {
        pts.push([ev.clientX, ev.clientY]);
        setDrawingPts([...pts]);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDrawingPts(null);
        if (pts.length < 2) return;
        const world = pts.map(([cx, cy]) => {
          const w = toWorld(cx, cy);
          return [w.x, w.y] as [number, number];
        });
        const xs = world.map((p) => p[0]);
        const ys = world.map((p) => p[1]);
        const stroke = penMode === "highlighter" ? penSize * 3.5 : penSize;
        const pad = Math.max(6, stroke);
        const bx = Math.min(...xs) - pad;
        const by = Math.min(...ys) - pad;
        const width = Math.max(1, Math.round(Math.max(...xs) - Math.min(...xs) + pad * 2));
        const height = Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys) + pad * 2));
        const rel = world.map(
          ([x, y]) => [Math.round((x - bx) * 100) / 100, Math.round((y - by) * 100) / 100] as [number, number],
        );
        const obj = createObject("drawing", { x: bx + width / 2, y: by + height / 2 }, nextZ(), {
          width,
          height,
          content: {
            points: rel,
            color: penColor,
            strokeWidth: stroke,
            mode: penMode,
          },
        });
        store.add(obj);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    // select tool → marquee with live selection
    const sx = e.clientX;
    const sy = e.clientY;
    const shift = e.shiftKey;
    const base = new Set(selRef.current);
    const applySelection = (ex: number, ey: number) => {
      const w0 = toWorld(sx, sy);
      const w1 = toWorld(ex, ey);
      const r = normRect(w0.x, w0.y, w1.x, w1.y);
      const touch = ex < sx; // right-to-left drag = touch-select
      const next = shift ? new Set(base) : new Set<string>();
      objsRef.current.forEach((o) => {
        const b = objectAABB(o);
        if (touch ? rectIntersects(r, b) : rectContains(r, b)) next.add(o.id);
      });
      setSelectedIds(next);
    };
    const dragged = (ev: PointerEvent) =>
      Math.abs(ev.clientX - sx) > DRAG_THRESHOLD || Math.abs(ev.clientY - sy) > DRAG_THRESHOLD;
    const move = (ev: PointerEvent) => {
      setMarquee({ sx, sy, ex: ev.clientX, ey: ev.clientY });
      if (dragged(ev)) applySelection(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
      if (!dragged(ev)) {
        if (!shift) setSelectedIds(new Set());
        return;
      }
      applySelection(ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onBgPointerMove(e: React.PointerEvent) {
    if ((tool === "sticky" || tool === "text" || tool === "shape") && !panning) {
      setPreview({ x: e.clientX, y: e.clientY });
    } else if (preview) {
      setPreview(null);
    }
  }

  // ── wheel: pan / zoom-to-cursor ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const before = screenToWorld(e.clientX, e.clientY, rect, v);
          // Exponential zoom (clamped) — snappier trackpad pinch.
          const dy = Math.max(-60, Math.min(60, e.deltaY));
          const scale = clampScale(v.scale * Math.exp(-dy * 0.01));
          return { scale, x: e.clientX - rect.left - before.x * scale, y: e.clientY - rect.top - before.y * scale };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── keyboard: tools, delete, escape, space-pan ──
  const deleteSelected = useCallback(() => {
    selRef.current.forEach((id) => store.remove(id));
    setSelectedIds(new Set());
  }, [store]);

  // ── copy / cut / paste (cross-canvas via localStorage) ──
  const copySelection = useCallback(() => {
    const objs = objsRef.current
      .filter((o) => selRef.current.has(o.id))
      .map((o) => ({ type: o.type, x: o.x, y: o.y, width: o.width, height: o.height, rotation: o.rotation, content: o.content, refType: o.refType, refId: o.refId }));
    if (!objs.length) return;
    try {
      localStorage.setItem("perennial:canvas-clipboard", JSON.stringify(objs));
    } catch (e) {
      console.error("canvas copy failed", e);
    }
  }, []);
  const pasteClipboard = useCallback(() => {
    let objs: ReturnType<typeof JSON.parse>;
    try {
      objs = JSON.parse(localStorage.getItem("perennial:canvas-clipboard") ?? "[]");
    } catch {
      objs = [];
    }
    if (!Array.isArray(objs) || !objs.length) return;
    const minX = Math.min(...objs.map((o) => o.x));
    const minY = Math.min(...objs.map((o) => o.y));
    const base = viewportCenterWorld();
    let z = nextZ();
    const created = objs.map((o) =>
      createObject(o.type, { x: base.x + (o.x - minX) + o.width / 2, y: base.y + (o.y - minY) + o.height / 2 }, z++, {
        width: o.width,
        height: o.height,
        rotation: o.rotation,
        content: o.content,
        refType: o.refType,
        refId: o.refId,
      }),
    );
    created.forEach((c) => store.add(c));
    setSelectedIds(new Set(created.map((c) => c.id)));
  }, [store, viewportCenterWorld]);

  useEffect(() => {
    function isTyping() {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping() || editingId) return;
      if (e.key === " ") {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selRef.current.size) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setTool("select");
        setMenu(null);
        return;
      }
      if (e.key === "Enter" && selRef.current.size === 1) {
        const id = [...selRef.current][0];
        const o = objsRef.current.find((x) => x.id === id);
        const sk = o?.type === "shape" ? (o.content as ShapeContent).shape : null;
        if (o && (o.type === "text" || o.type === "sticky" || sk === "rect" || sk === "ellipse")) {
          e.preventDefault();
          setEditingId(id);
          return;
        }
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) storeRef.current.redo();
          else storeRef.current.undo();
          return;
        }
        if (k === "y") {
          e.preventDefault();
          storeRef.current.redo();
          return;
        }
        if (k === "c") {
          copySelection();
          return;
        }
        if (k === "x") {
          copySelection();
          deleteSelected();
          return;
        }
        if (k === "v") {
          e.preventDefault();
          pasteClipboard();
          return;
        }
        if (k === "a") {
          e.preventDefault();
          setSelectedIds(new Set(objsRef.current.map((o) => o.id)));
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, CanvasTool> = { v: "select", h: "hand", n: "sticky", t: "text", s: "shape", p: "pen", e: "eraser" };
      const t = map[e.key.toLowerCase()];
      if (t) selectTool(t);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") setSpaceDown(false);
    }
    // If focus leaves the window mid space-hold the keyup never arrives, which
    // would strand the canvas in hand/pan mode — reset on blur.
    function onBlur() {
      setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [editingId, deleteSelected, selectTool, copySelection, pasteClipboard]);

  // ── object callbacks ──
  const commitGeometry = useCallback(
    (id: string, o: CanvasObject) => {
      store.commit(id, {
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        rotation: o.rotation,
        z_index: o.zIndex,
        content: o.content as unknown as Record<string, unknown>,
      });
    },
    [store],
  );
  const onText = useCallback(
    (id: string, html: string, text: string) => {
      const o = objsRef.current.find((x) => x.id === id);
      if (!o) return;
      const content = { ...o.content, html, text };
      store.patchLocal(id, { content });
      store.commitContentDebounced(id, content);
    },
    [store],
  );
  // Text objects report their measured height here; persist it (debounced) so
  // marquee hit-testing and reloads stay in sync with the auto-grown box.
  const heightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onAutoHeight = useCallback(
    (id: string, h: number) => {
      const o = objsRef.current.find((x) => x.id === id);
      const rounded = Math.round(h);
      if (!o || rounded < 1 || Math.abs(o.height - rounded) < 1) return;
      store.patchLocal(id, { height: rounded });
      const timers = heightTimers.current;
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          store.commit(id, { height: rounded });
        }, 500),
      );
    },
    [store],
  );
  useEffect(() => {
    const timers = heightTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const patchContent = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const o = objsRef.current.find((x) => x.id === id);
      if (!o) return;
      const content = { ...o.content, ...patch };
      store.patchLocal(id, { content });
      store.commit(id, { content: content as unknown as Record<string, unknown> });
    },
    [store],
  );

  // ── context menu actions ──
  const duplicateSelected = useCallback(() => {
    let z = nextZ();
    const clones = objsRef.current.filter((o) => selRef.current.has(o.id)).map((o) => cloneObject(o, 24, 24, z++));
    clones.forEach((c) => store.add(c));
    setSelectedIds(new Set(clones.map((c) => c.id)));
    setMenu(null);
  }, [store]);
  const bringForward = useCallback(() => {
    let z = nextZ();
    selRef.current.forEach((id) => {
      store.patchLocal(id, { zIndex: z });
      store.commit(id, { z_index: z });
      z += 1;
    });
    setMenu(null);
  }, [store]);
  const sendBackward = useCallback(() => {
    let z = minZ() - 1;
    selRef.current.forEach((id) => {
      store.patchLocal(id, { zIndex: z });
      store.commit(id, { z_index: z });
      z -= 1;
    });
    setMenu(null);
  }, [store]);

  const onObjectContextMenu = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds((prev) => (prev.has(id) ? prev : new Set([id])));
    setMenu({ x: e.clientX, y: e.clientY, kind: "object" });
  }, []);

  // ── convert a sticky/text into a real Note + a live note card ──
  const convertToNote = useCallback(async () => {
    const o = objsRef.current.find((x) => selRef.current.has(x.id) && (x.type === "sticky" || x.type === "text"));
    setMenu(null);
    if (!o) return;
    const cnt = o.content as { html?: string; text?: string };
    const text = cnt.text ?? "";
    const html = cnt.html ?? (text ? `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : "");
    const title = text.split("\n")[0].slice(0, 80) || "Canvas note";
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: note } = await supabase.from("notes").insert({ user_id: user.id, title, content: html }).select("id, title").single();
      if (!note) return;
      const ref = createObject("reference", { x: o.x + o.width / 2, y: o.y + o.height / 2 }, nextZ(), {
        width: 280,
        height: 140,
        content: { title: note.title || title },
        refType: "note",
        refId: note.id,
      });
      store.remove(o.id);
      store.add(ref);
      setSelectedIds(new Set([ref.id]));
    } catch (e) {
      console.error("convert to note failed", e);
    }
  }, [store]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(objsRef.current.map((o) => o.id)));
    setMenu(null);
  }, []);
  const addHere = useCallback(
    (type: CanvasObjectType, world: { x: number; y: number }) => {
      const extra = type === "sticky" ? { content: { color: stickyColor, text: "" } } : undefined;
      placeObject(type, world, extra);
      setMenu(null);
    },
    [placeObject, stickyColor],
  );

  const addModule = useCallback(
    (moduleKey: ModuleKey) => {
      placeObject("module", viewportCenterWorld(), { content: { moduleKey } });
    },
    [placeObject, viewportCenterWorld],
  );

  // Double-click a reference card → open the entity (as if from its module page).
  const openReference = useCallback(
    (o: CanvasObject) => {
      const id = o.refId;
      if (!id) return;
      const href =
        o.refType === "project"
          ? `/projects?projectId=${id}`
          : o.refType === "organization"
            ? `/network?organizationId=${id}`
            : o.refType === "lead"
              ? `/network?view=leads&contactId=${id}`
              : `/network?contactId=${id}`;
      router.push(href);
    },
    [router],
  );

  // Drop a picked entity as a reference card at the viewport centre.
  const onPickEntity = useCallback(
    (r: EntityResult) => {
      placeObject("reference", viewportCenterWorld(), {
        width: r.width,
        height: r.height,
        content: r.content,
        refType: r.refType,
        refId: r.refId,
      });
      setPicker(null);
    },
    [placeObject, viewportCenterWorld],
  );

  // ── selection toolbar (single selection) ──
  const sole = selectedIds.size === 1 ? store.objects.find((o) => selectedIds.has(o.id)) ?? null : null;
  const soleShapeKind = sole?.type === "shape" ? (sole.content as ShapeContent).shape : null;
  const soleIsLinear = soleShapeKind === "line" || soleShapeKind === "arrow";
  const soleTextBearing =
    !!sole && (sole.type === "text" || sole.type === "sticky" || soleShapeKind === "rect" || soleShapeKind === "ellipse");
  const cc = (sole?.content ?? {}) as {
    color?: StickyColor;
    textColor?: StickyColor;
    align?: TextAlign;
    vAlign?: VAlign;
    startCap?: "none" | "arrow";
    endCap?: "none" | "arrow";
    dash?: "solid" | "dashed" | "dotted";
    strokeWidth?: number;
  };
  const toolbarPos = sole
    ? { left: sole.x * view.scale + view.x + (sole.width * view.scale) / 2, top: sole.y * view.scale + view.y - 8 }
    : null;

  // ── rich-text toolbar (while editing a text-bearing object) ──
  const editingObj = editingId ? store.objects.find((o) => o.id === editingId) ?? null : null;
  const editorBarPos = editingObj
    ? { left: editingObj.x * view.scale + view.x + (editingObj.width * view.scale) / 2, top: editingObj.y * view.scale + view.y - 48 }
    : null;
  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    // execCommand mutates the contentEditable DOM but doesn't fire React's
    // onInput, so read the result back and persist it — otherwise formatting
    // (bold, headings, lists, links) is lost on reload.
    const el = document.activeElement as HTMLElement | null;
    if (el && el.classList.contains("canvas-rich") && editingObj) {
      onText(editingObj.id, el.innerHTML, el.textContent ?? "");
    }
  };
  const segBtn = (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    border: "none",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    background: active ? "rgba(var(--color-sage-rgb), 0.16)" : "transparent",
    color: active ? "var(--color-sage-text)" : "var(--color-text-secondary)",
  });
  const VALIGN_ITEMS = [
    { v: "top" as const, icon: <ArrowUpToLine size={15} strokeWidth={1.9} /> },
    { v: "middle" as const, icon: <FoldVertical size={15} strokeWidth={1.9} /> },
    { v: "bottom" as const, icon: <ArrowDownToLine size={15} strokeWidth={1.9} /> },
  ];
  const editingShapeKind =
    editingObj?.type === "shape" ? (editingObj.content as ShapeContent).shape : null;
  const editingBox =
    !!editingObj && (editingObj.type === "sticky" || editingShapeKind === "rect" || editingShapeKind === "ellipse");
  // Close the editing-toolbar dropdowns whenever the editing target changes.
  useEffect(() => {
    setEditDrop(null);
  }, [editingId]);
  // Auto-dismiss the transient error toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const bumpFont = (delta: number) => {
    if (!editingObj) return;
    const cur =
      (editingObj.content as { fontSize?: number }).fontSize ??
      (editingObj.type === "text" ? 16 : editingObj.type === "sticky" ? 13 : 14);
    patchContent(editingObj.id, { fontSize: Math.max(8, Math.min(120, cur + delta)) });
  };

  const containerCursor = useMemo(() => {
    if (tool === "hand" || spaceDown) return panning ? "grabbing" : "grab";
    if (tool === "shape" || tool === "pen" || tool === "sticky" || tool === "text" || tool === "eraser") return "crosshair";
    return "default";
  }, [tool, spaceDown, panning]);

  const shapeLinear = tool === "shape" && (shapeKind === "line" || shapeKind === "arrow");

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--color-surface-app)",
        backgroundImage:
          "radial-gradient(circle, rgba(var(--color-charcoal-rgb), 0.13) 1px, transparent 1.4px)",
        backgroundSize: `${GRID_SIZE * view.scale}px ${GRID_SIZE * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        cursor: containerCursor,
        touchAction: "none",
        userSelect: "none",
        ...style,
      }}
      onPointerDown={onBgPointerDown}
      onPointerMove={onBgPointerMove}
      onPointerLeave={() => setPreview(null)}
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropActive(true);
      }}
      onDragOver={(e) => {
        // Must preventDefault on every dragover or the browser cancels the drop.
        if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDropActive(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDropActive(false);
        const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => isUploadableImageType(f.type));
        if (!files.length) return;
        const base = toWorld(e.clientX, e.clientY);
        files.forEach((f, i) => addImageFromFile(f, { x: base.x + i * 24, y: base.y + i * 24 }));
      }}
      onContextMenu={(e) => {
        // Objects stop propagation for their own menu; this is empty canvas.
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, kind: "canvas", world: toWorld(e.clientX, e.clientY) });
      }}
    >
      {/* world layer */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {store.objects.map((o) => (
          <CanvasObjectView
            key={o.id}
            object={o}
            selected={selectedIds.has(o.id)}
            soleSelected={selectedIds.size === 1 && selectedIds.has(o.id)}
            interactive={tool === "select" && !spaceDown}
            editing={o.id === editingId}
            scale={view.scale}
            onBeginDrag={beginObjectDrag}
            onChangeLocal={store.patchLocal}
            onCommitGeometry={commitGeometry}
            onStartEdit={setEditingId}
            onText={onText}
            onEndEdit={() => {
              if (editingId) store.flushContent(editingId);
              setEditingId(null);
            }}
            onContextMenu={onObjectContextMenu}
            onAutoHeight={onAutoHeight}
            onOpenReference={openReference}
          />
        ))}
      </div>

      {/* selection marquee (box) */}
      {marquee && (
        <div
          style={{
            position: "fixed",
            left: Math.min(marquee.sx, marquee.ex),
            top: Math.min(marquee.sy, marquee.ey),
            width: Math.abs(marquee.ex - marquee.sx),
            height: Math.abs(marquee.ey - marquee.sy),
            background: "rgba(var(--color-sage-rgb), 0.12)",
            border: "1px solid var(--color-sage)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      )}

      {/* shape rubber-band — line for line/arrow, box otherwise */}
      {rubber &&
        (shapeKind === "line" || shapeKind === "arrow" ? (
          <svg
            style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", overflow: "visible", pointerEvents: "none", zIndex: 40 }}
          >
            <line
              x1={rubber.sx}
              y1={rubber.sy}
              x2={rubber.ex}
              y2={rubber.ey}
              style={{ stroke: "var(--color-sage)" }}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div
            style={{
              position: "fixed",
              left: Math.min(rubber.sx, rubber.ex),
              top: Math.min(rubber.sy, rubber.ey),
              width: Math.abs(rubber.ex - rubber.sx),
              height: Math.abs(rubber.ey - rubber.sy),
              background: "rgba(var(--color-sage-rgb), 0.12)",
              border: "1px solid var(--color-sage)",
              borderRadius: shapeKind === "ellipse" ? "50%" : "var(--radius-sm)",
              pointerEvents: "none",
              zIndex: 40,
            }}
          />
        ))}

      {/* placement preview cursor */}
      {preview && (tool === "sticky" || tool === "text" || tool === "shape") && (
        <div
          style={{
            position: "fixed",
            left: preview.x + 12,
            top: preview.y + 12,
            pointerEvents: "none",
            zIndex: 41,
            width: tool === "text" ? 20 : 34,
            height: tool === "text" ? 20 : shapeLinear ? 3 : 26,
            borderRadius: shapeLinear ? "var(--radius-full)" : tool === "shape" && shapeKind === "ellipse" ? "50%" : "var(--radius-sm)",
            background:
              shapeLinear
                ? STICKY_PALETTE.green.accent
                : tool === "sticky"
                  ? STICKY_PALETTE[stickyColor].fill
                  : tool === "shape"
                    ? STICKY_PALETTE.green.fill
                    : "transparent",
            border:
              tool === "text" || shapeLinear
                ? "none"
                : `1px solid ${tool === "sticky" ? STICKY_PALETTE[stickyColor].border : STICKY_PALETTE.green.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-tertiary)",
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          {tool === "text" ? "T" : ""}
        </div>
      )}

      {/* live pen stroke */}
      {drawingPts && drawingPts.length > 1 && (
        <svg style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 41, overflow: "visible" }}>
          <polyline
            points={drawingPts.map((p) => p.join(",")).join(" ")}
            fill="none"
            style={{ stroke: STICKY_PALETTE[penColor].accent }}
            strokeWidth={(penMode === "highlighter" ? penSize * 3.5 : penSize) * view.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={penMode === "highlighter" ? 0.35 : 1}
          />
        </svg>
      )}

      {/* single-selection formatting toolbar */}
      {sole && !editingId && toolbarPos && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: toolbarPos.left,
            top: toolbarPos.top,
            transform: "translate(-50%, -100%)",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            padding: 8,
            borderRadius: "var(--radius-lg)",
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 30,
          }}
        >
          {soleIsLinear ? (
            <>
              {/* caps + thickness + dash + delete (row 1) */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  data-tip="Start arrow"
                  onClick={() => patchContent(sole.id, { startCap: (cc.startCap ?? "none") === "arrow" ? "none" : "arrow" })}
                  style={segBtn((cc.startCap ?? "none") === "arrow")}
                >
                  <ArrowLeft size={15} strokeWidth={2} />
                </button>
                <button
                  data-tip="End arrow"
                  onClick={() =>
                    patchContent(sole.id, {
                      endCap: (cc.endCap ?? (soleShapeKind === "arrow" ? "arrow" : "none")) === "arrow" ? "none" : "arrow",
                    })
                  }
                  style={segBtn((cc.endCap ?? (soleShapeKind === "arrow" ? "arrow" : "none")) === "arrow")}
                >
                  <ArrowRight size={15} strokeWidth={2} />
                </button>
                <span style={{ width: 1, height: 16, background: "var(--color-border)", margin: "0 2px" }} />
                {(
                  [
                    { n: 2, dot: 4 },
                    { n: 4, dot: 7 },
                    { n: 7, dot: 10 },
                  ] as const
                ).map((t) => (
                  <button key={t.n} data-tip={`Thickness ${t.n}`} onClick={() => patchContent(sole.id, { strokeWidth: t.n })} style={segBtn((cc.strokeWidth ?? 2.5) === t.n)}>
                    <span style={{ width: t.dot, height: t.dot, borderRadius: "var(--radius-full)", background: "currentColor" }} />
                  </button>
                ))}
                <span style={{ width: 1, height: 16, background: "var(--color-border)", margin: "0 2px" }} />
                {(["solid", "dashed", "dotted"] as const).map((d) => (
                  <button key={d} data-tip={d} onClick={() => patchContent(sole.id, { dash: d })} style={segBtn((cc.dash ?? "solid") === d)}>
                    <svg width={18} height={10} viewBox="0 0 18 10">
                      <line x1={1} y1={5} x2={17} y2={5} stroke="currentColor" strokeWidth={2} strokeLinecap={d === "dotted" ? "round" : "butt"} strokeDasharray={d === "dashed" ? "4 3" : d === "dotted" ? "0.1 4" : undefined} />
                    </svg>
                  </button>
                ))}
                <div style={{ flex: 1, minWidth: 8 }} />
                <button aria-label="Delete" onClick={deleteSelected} style={segBtn(false)}>
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </div>
              {/* colour circles, no label (row 2) */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {STICKY_COLOR_ORDER.map((color) => (
                  <button
                    key={color}
                    aria-label={`colour ${color}`}
                    onClick={() => patchContent(sole.id, { color })}
                    style={{ width: 16, height: 16, borderRadius: "var(--radius-full)", background: swatch(color).accent, border: cc.color === color ? "2px solid var(--color-sage)" : "0.5px solid var(--color-border)", cursor: "pointer" }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {/* H-align + V-align + delete */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {soleTextBearing &&
                  (
                    [
                      { a: "left", icon: <AlignLeft size={14} strokeWidth={1.9} /> },
                      { a: "center", icon: <AlignCenter size={14} strokeWidth={1.9} /> },
                      { a: "right", icon: <AlignRight size={14} strokeWidth={1.9} /> },
                    ] as const
                  ).map((b) => (
                    <button key={b.a} aria-label={`Align ${b.a}`} onClick={() => patchContent(sole.id, { align: b.a })} style={segBtn(cc.align === b.a)}>
                      {b.icon}
                    </button>
                  ))}
                {soleTextBearing && <span style={{ width: 1, height: 16, background: "var(--color-border)", margin: "0 2px" }} />}
                {soleTextBearing &&
                  VALIGN_ITEMS.map((b) => {
                    const cur = cc.vAlign ?? (sole.type === "text" ? "top" : "middle");
                    return (
                      <button key={b.v} aria-label={`Vertical ${b.v}`} onClick={() => patchContent(sole.id, { vAlign: b.v })} style={segBtn(cur === b.v)}>
                        {b.icon}
                      </button>
                    );
                  })}
                <div style={{ flex: 1, minWidth: 8 }} />
                <button aria-label="Delete" onClick={deleteSelected} style={segBtn(false)}>
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </div>

              {/* Fill + text colour intentionally removed — fill is set from the
                  tool's options card; text colour lives in the text editor. */}
            </>
          )}
        </div>
      )}

      {/* rich-text toolbar while editing */}
      {editingObj && editorBarPos && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: editorBarPos.left,
            top: editorBarPos.top,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "5px 6px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 35,
          }}
        >
          {(() => {
            const ib = (active?: boolean): CSSProperties => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              background: active ? "rgba(var(--color-sage-rgb), 0.16)" : "transparent",
              color: active ? "var(--color-sage-text)" : "var(--color-text-secondary)",
            });
            const sep = <span style={{ width: 1, height: 16, background: "var(--color-border)", margin: "0 3px" }} />;
            const md = (cmd: string, arg?: string) => (e: React.MouseEvent) => {
              e.preventDefault();
              exec(cmd, arg);
            };
            const dropWrap: CSSProperties = { position: "relative", display: "flex" };
            const dropMenu: CSSProperties = {
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 4,
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 40,
            };
            const caret = <ChevronDown size={11} strokeWidth={2} style={{ marginLeft: -1 }} />;
            const tColor = editingObj ? (editingObj.content as { textColor?: StickyColor }).textColor : undefined;
            return (
              <>
                <button data-tip="Bold" onMouseDown={md("bold")} style={ib()}><Bold size={14} strokeWidth={2} /></button>
                <button data-tip="Italic" onMouseDown={md("italic")} style={ib()}><Italic size={14} strokeWidth={2} /></button>
                <button data-tip="Underline" onMouseDown={md("underline")} style={ib()}><Underline size={14} strokeWidth={2} /></button>
                <button
                  data-tip="Link"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const url = window.prompt("Link URL");
                    if (url) exec("createLink", url);
                  }}
                  style={ib()}
                >
                  <LinkIcon size={14} strokeWidth={2} />
                </button>
                {sep}

                {/* block style dropdown */}
                <div style={dropWrap}>
                  <button data-tip="Text style" onMouseDown={(e) => { e.preventDefault(); setEditDrop((d) => (d === "block" ? null : "block")); }} style={ib(editDrop === "block")}>
                    <Heading size={15} strokeWidth={2} />
                    {caret}
                  </button>
                  {editDrop === "block" && (
                    <div style={dropMenu}>
                      {([
                        { a: "H1", icon: <Heading1 size={15} strokeWidth={2} /> },
                        { a: "H2", icon: <Heading2 size={15} strokeWidth={2} /> },
                        { a: "H3", icon: <Heading3 size={15} strokeWidth={2} /> },
                        { a: "P", icon: <Pilcrow size={14} strokeWidth={2} /> },
                      ] as const).map((o) => (
                        <button key={o.a} data-tip={o.a} onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", o.a); setEditDrop(null); }} style={ib()}>{o.icon}</button>
                      ))}
                    </div>
                  )}
                </div>
                <button data-tip="Bullets" onMouseDown={md("insertUnorderedList")} style={ib()}><List size={14} strokeWidth={2} /></button>
                {sep}

                {/* align dropdown */}
                <div style={dropWrap}>
                  <button data-tip="Align" onMouseDown={(e) => { e.preventDefault(); setEditDrop((d) => (d === "align" ? null : "align")); }} style={ib(editDrop === "align")}>
                    <AlignLeft size={14} strokeWidth={2} />
                    {caret}
                  </button>
                  {editDrop === "align" && (
                    <div style={dropMenu}>
                      {([
                        { c: "justifyLeft", icon: <AlignLeft size={14} strokeWidth={2} /> },
                        { c: "justifyCenter", icon: <AlignCenter size={14} strokeWidth={2} /> },
                        { c: "justifyRight", icon: <AlignRight size={14} strokeWidth={2} /> },
                      ] as const).map((o) => (
                        <button key={o.c} onMouseDown={(e) => { e.preventDefault(); exec(o.c); setEditDrop(null); }} style={ib()}>{o.icon}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* vertical align dropdown (box objects) */}
                {editingBox && (
                  <div style={dropWrap}>
                    <button data-tip="Vertical align" onMouseDown={(e) => { e.preventDefault(); setEditDrop((d) => (d === "valign" ? null : "valign")); }} style={ib(editDrop === "valign")}>
                      <FoldVertical size={15} strokeWidth={2} />
                      {caret}
                    </button>
                    {editDrop === "valign" && (
                      <div style={dropMenu}>
                        {VALIGN_ITEMS.map((o) => (
                          <button key={o.v} onMouseDown={(e) => { e.preventDefault(); if (editingObj) patchContent(editingObj.id, { vAlign: o.v }); setEditDrop(null); }} style={ib()}>{o.icon}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {sep}

                {/* text colour circle */}
                <div style={dropWrap}>
                  <button data-tip="Text colour" onMouseDown={(e) => { e.preventDefault(); setEditDrop((d) => (d === "color" ? null : "color")); }} style={ib(editDrop === "color")}>
                    <span style={{ width: 15, height: 15, borderRadius: "var(--radius-full)", background: tColor ? swatch(tColor).accent : "var(--color-text-primary)", border: "0.5px solid var(--color-border)" }} />
                  </button>
                  {editDrop === "color" && (
                    <div style={{ ...dropMenu, flexDirection: "row", flexWrap: "wrap", width: 122, gap: 6 }}>
                      {STICKY_COLOR_ORDER.map((color) => (
                        <button key={color} aria-label={color} onMouseDown={(e) => { e.preventDefault(); if (editingObj) patchContent(editingObj.id, { textColor: color }); setEditDrop(null); }} style={{ width: 18, height: 18, borderRadius: "var(--radius-full)", background: swatch(color).accent, border: tColor === color ? "2px solid var(--color-sage)" : "0.5px solid var(--color-border)", cursor: "pointer" }} />
                      ))}
                    </div>
                  )}
                </div>
                {sep}

                {/* font size: ∨ A ∧ */}
                <button data-tip="Smaller" onMouseDown={(e) => { e.preventDefault(); bumpFont(-2); }} style={ib()}><ChevronDown size={14} strokeWidth={2} /></button>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", padding: "0 1px" }}>A</span>
                <button data-tip="Bigger" onMouseDown={(e) => { e.preventDefault(); bumpFont(2); }} style={ib()}><ChevronUp size={14} strokeWidth={2} /></button>
              </>
            );
          })()}
        </div>
      )}

      {/* right-click context menu */}
      {menu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            style={{
              position: "fixed",
              left: menu.x,
              top: menu.y,
              minWidth: 176,
              padding: 6,
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface-raised)",
              border: "0.5px solid var(--color-border)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 50,
            }}
          >
            {(menu.kind === "object"
              ? [
                  { label: "Copy", icon: <Copy size={14} strokeWidth={1.75} />, onClick: () => { copySelection(); setMenu(null); } },
                  { label: "Duplicate", icon: <Copy size={14} strokeWidth={1.75} />, onClick: duplicateSelected },
                  ...(store.objects.some((o) => selectedIds.has(o.id) && (o.type === "sticky" || o.type === "text"))
                    ? [{ label: "Convert to note", icon: <FileText size={14} strokeWidth={1.75} />, onClick: convertToNote }]
                    : []),
                  { label: "Bring to front", icon: <ArrowUpToLine size={14} strokeWidth={1.75} />, onClick: bringForward },
                  { label: "Send to back", icon: <ArrowDownToLine size={14} strokeWidth={1.75} />, onClick: sendBackward },
                  { label: "Delete", icon: <Trash2 size={14} strokeWidth={1.75} />, onClick: deleteSelected, danger: true },
                ]
              : [
                  { label: "Add note here", icon: <StickyNote size={14} strokeWidth={1.75} />, onClick: () => menu.world && addHere("sticky", menu.world) },
                  { label: "Add text here", icon: <Type size={14} strokeWidth={1.75} />, onClick: () => menu.world && addHere("text", menu.world) },
                  { label: "Paste", icon: <ClipboardPaste size={14} strokeWidth={1.75} />, onClick: () => { pasteClipboard(); setMenu(null); } },
                  { label: "Select all", icon: <BoxSelect size={14} strokeWidth={1.75} />, onClick: selectAll },
                ]
            ).map((item) => {
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "7px 9px",
                    border: "none",
                    background: "transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    color: "danger" in item && item.danger ? "var(--color-red)" : "var(--color-text-primary)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", color: "danger" in item && item.danger ? "var(--color-red)" : "var(--color-text-tertiary)" }}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {dropActive && (
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "var(--radius-xl)",
            border: "2px dashed var(--color-sage)",
            background: "rgba(var(--color-sage-rgb), 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 45,
          }}
        >
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--color-sage-text)" }}>
            Drop images to add
          </span>
        </div>
      )}

      {!hideDock && (
        <ToolDock
          tool={tool}
          activeTool={spaceDown ? "hand" : tool}
          onSelectTool={selectTool}
          onUploadImage={handleUploadImage}
          stickyColor={stickyColor}
          onStickyColor={setStickyColor}
          shapeKind={shapeKind}
          onShapeKind={setShapeKind}
          penMode={penMode}
          onPenMode={setPenMode}
          penColor={penColor}
          onPenColor={setPenColor}
          penSize={penSize}
          onPenSize={setPenSize}
          onAddEntity={(k) => setPicker(k)}
          onImageFromFiles={() => setImagePicker(true)}
          onAddModule={addModule}
        />
      )}

      {picker && (
        <EntityPicker initialKind={picker} onPick={onPickEntity} onClose={() => setPicker(null)} />
      )}

      {imagePicker && (
        <ImagePicker onPick={placeImageFromUrl} onClose={() => setImagePicker(false)} />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        onChange={onFilePicked}
        style={{ display: "none" }}
      />

      {toast && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: "min(420px, calc(100% - 32px))",
            padding: "10px 16px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            boxShadow: "var(--shadow-lg)",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            color: "var(--color-text-primary)",
            zIndex: 70,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
});

export default Canvas;
