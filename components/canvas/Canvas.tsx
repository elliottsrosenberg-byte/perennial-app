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
} from "lucide-react";
import type { CanvasObjectRow, CanvasScope } from "@/types/database";
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
} from "./types";
import { STICKY_COLOR_ORDER, STICKY_PALETTE } from "./palette";
import CanvasObjectView from "./CanvasObjectView";
import ToolDock, { type ShapeKind } from "./ToolDock";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState<CanvasTool>("select");
  const [stickyColor, setStickyColor] = useState<StickyColor>("amber");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [rubber, setRubber] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<
    { x: number; y: number; kind: "object" | "canvas"; world?: { x: number; y: number } } | null
  >(null);

  // Live refs so window/keyboard handlers read current values without re-binding.
  // Synced in an effect (not during render) per react-hooks/refs; handlers run
  // after commit, so they always see the latest.
  const viewRef = useRef(view);
  const objsRef = useRef(store.objects);
  const selRef = useRef(selectedIds);
  useEffect(() => {
    viewRef.current = view;
    objsRef.current = store.objects;
    selRef.current = selectedIds;
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

    if (tool === "text" || tool === "sticky") {
      const extra = tool === "sticky" ? { content: { color: stickyColor, text: "" } } : undefined;
      placeObject(tool, toWorld(e.clientX, e.clientY), extra);
      setTool("select");
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
            content: { shape: shapeKind, color: "sage" },
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
          content: { shape: shapeKind, color: "sage" },
        });
        store.add(obj);
        selectOnly(obj.id);
        setTool("select");
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "pen") return; // pen drawing — coming soon

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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, CanvasTool> = { v: "select", h: "hand", n: "sticky", t: "text", s: "shape", p: "pen" };
      const t = map[e.key.toLowerCase()];
      if (t) selectTool(t);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [editingId, deleteSelected, selectTool]);

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
    (id: string, text: string) => {
      const o = objsRef.current.find((x) => x.id === id);
      if (!o) return;
      const content = { ...o.content, text };
      store.patchLocal(id, { content });
      store.commitContentDebounced(id, content);
    },
    [store],
  );
  const setSelectedColor = useCallback(
    (id: string, color: StickyColor) => {
      const o = objsRef.current.find((x) => x.id === id);
      if (!o) return;
      const content = { ...o.content, color };
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

  // ── selection toolbar (single sticky/shape) ──
  const sole = selectedIds.size === 1 ? store.objects.find((o) => selectedIds.has(o.id)) ?? null : null;
  const showColorBar = sole?.type === "sticky" || sole?.type === "shape";
  const toolbarPos = sole
    ? { left: sole.x * view.scale + view.x + (sole.width * view.scale) / 2, top: sole.y * view.scale + view.y - 46 }
    : null;

  const containerCursor = useMemo(() => {
    if (tool === "hand" || spaceDown) return panning ? "grabbing" : "grab";
    if (tool === "shape" || tool === "pen" || tool === "sticky" || tool === "text") return "crosshair";
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
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => isUploadableImageType(f.type));
        if (!files.length) return;
        e.preventDefault();
        const base = toWorld(e.clientX, e.clientY);
        files.forEach((f, i) => addImageFromFile(f, { x: base.x + i * 24, y: base.y + i * 24 }));
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.items ?? []).some((it) => it.kind === "file")) e.preventDefault();
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
            onEndEdit={() => setEditingId(null)}
            onContextMenu={onObjectContextMenu}
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
                ? "var(--color-sage)"
                : tool === "sticky"
                  ? STICKY_PALETTE[stickyColor].fill
                  : tool === "shape"
                    ? STICKY_PALETTE.sage.fill
                    : "transparent",
            border:
              tool === "text" || shapeLinear
                ? "none"
                : `1px solid ${tool === "sticky" ? STICKY_PALETTE[stickyColor].border : STICKY_PALETTE.sage.border}`,
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

      {/* single-selection colour + delete toolbar */}
      {sole && !editingId && toolbarPos && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: toolbarPos.left,
            top: toolbarPos.top,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 30,
          }}
        >
          {showColorBar &&
            STICKY_COLOR_ORDER.map((color) => (
              <button
                key={color}
                aria-label={`${color} colour`}
                onClick={() => setSelectedColor(sole.id, color)}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "var(--radius-full)",
                  background: STICKY_PALETTE[color].fill,
                  border: `1.5px solid ${STICKY_PALETTE[color].border}`,
                  cursor: "pointer",
                }}
              />
            ))}
          {showColorBar && <span style={{ width: 1, height: 18, background: "var(--color-border)" }} />}
          <button
            aria-label="Delete"
            onClick={deleteSelected}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              border: "none",
              background: "transparent",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
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
                  { label: "Duplicate", icon: <Copy size={14} strokeWidth={1.75} />, onClick: duplicateSelected },
                  { label: "Bring to front", icon: <ArrowUpToLine size={14} strokeWidth={1.75} />, onClick: bringForward },
                  { label: "Send to back", icon: <ArrowDownToLine size={14} strokeWidth={1.75} />, onClick: sendBackward },
                  { label: "Delete", icon: <Trash2 size={14} strokeWidth={1.75} />, onClick: deleteSelected, danger: true },
                ]
              : [
                  { label: "Add note here", icon: <StickyNote size={14} strokeWidth={1.75} />, onClick: () => menu.world && addHere("sticky", menu.world) },
                  { label: "Add text here", icon: <Type size={14} strokeWidth={1.75} />, onClick: () => menu.world && addHere("text", menu.world) },
                  { label: "Select all", icon: <BoxSelect size={14} strokeWidth={1.75} />, onClick: selectAll },
                  { label: "Paste", icon: <ClipboardPaste size={14} strokeWidth={1.75} />, disabled: true },
                ]
            ).map((item) => {
              const disabled = "disabled" in item && item.disabled;
              return (
                <button
                  key={item.label}
                  onClick={disabled ? undefined : item.onClick}
                  disabled={disabled}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "7px 9px",
                    border: "none",
                    background: "transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.4 : 1,
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
        />
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={onFilePicked} style={{ display: "none" }} />
    </div>
  );
});

export default Canvas;
