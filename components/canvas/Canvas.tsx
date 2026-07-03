"use client";

// Reusable spatial canvas ("board"). Drops into Home full-page or any detail
// panel. Infinite pan/zoom viewport + object create/move/resize/rotate/delete,
// all persisted via useCanvas. Colours are design tokens only (AGENTS.md).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Trash2 } from "lucide-react";
import type { CanvasObjectRow, CanvasScope } from "@/types/database";
import { uploadEditorImage, isUploadableImageType } from "@/lib/uploads/editor-image";
import { useCanvas } from "./useCanvas";
import {
  clampScale,
  createObject,
  screenToWorld,
  GRID_SIZE,
  type Viewport,
} from "./geometry";
import type {
  CanvasObject,
  CanvasObjectType,
  StickyColor,
  StickyContent,
  ShapeContent,
} from "./types";
import { STICKY_COLOR_ORDER, STICKY_PALETTE } from "./palette";
import CanvasObjectView from "./CanvasObjectView";
import ToolDock from "./ToolDock";

export interface CanvasHandle {
  create: (type: CanvasObjectType) => void;
  uploadImage: () => void;
}

interface Props {
  canvasId?: string | null;
  initialObjects?: CanvasObjectRow[];
  scope?: CanvasScope;
  entityId?: string | null;
  /** Hide the floating tool dock (e.g. compact detail-panel embeds). */
  hideDock?: boolean;
  style?: CSSProperties;
}

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({
  canvasId,
  initialObjects,
  scope,
  entityId = null,
  hideDock = false,
  style,
}: Props, ref) {
  const store = useCanvas({ canvasId, initialObjects, scope, entityId });
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const panRef = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const selected = store.objects.find((o) => o.id === selectedId) ?? null;

  // ── viewport helpers ──
  const viewportCenterWorld = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, view);
  }, [view]);

  // ── create ──
  const handleCreate = useCallback(
    (type: CanvasObjectType, extra?: Parameters<typeof createObject>[3]) => {
      const obj = createObject(type, viewportCenterWorld(), store.topZ + 1, extra);
      store.add(obj);
      setSelectedId(obj.id);
      if (type === "text" || type === "sticky") setEditingId(obj.id);
      return obj;
    },
    [store, viewportCenterWorld],
  );

  const handleUploadImage = useCallback(() => fileRef.current?.click(), []);

  // Upload a file and drop an image object at `center` (defaults to viewport centre).
  const addImageFromFile = useCallback(
    async (file: File, center?: { x: number; y: number }) => {
      try {
        const up = await uploadEditorImage(file);
        const maxW = 360;
        const ratio = up.width && up.height ? up.height / up.width : 0.66;
        const width = Math.min(maxW, up.width ?? maxW);
        const obj = createObject("image", center ?? viewportCenterWorld(), store.topZ + 1, {
          width,
          height: Math.round(width * ratio),
          content: { url: up.url },
        });
        store.add(obj);
        setSelectedId(obj.id);
      } catch (err) {
        console.error("canvas image upload failed", err);
      }
    },
    [store, viewportCenterWorld],
  );

  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) addImageFromFile(file);
    },
    [addImageFromFile],
  );

  // Drag image files straight onto the canvas.
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        isUploadableImageType(f.type),
      );
      if (!files.length) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const base = screenToWorld(e.clientX, e.clientY, rect, view);
      files.forEach((f, i) => addImageFromFile(f, { x: base.x + i * 24, y: base.y + i * 24 }));
    },
    [addImageFromFile, view],
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (Array.from(e.dataTransfer?.items ?? []).some((it) => it.kind === "file")) {
      e.preventDefault();
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      create: (type: CanvasObjectType) => handleCreate(type),
      uploadImage: handleUploadImage,
    }),
    [handleCreate, handleUploadImage],
  );

  // ── pan / zoom ──
  function onBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setSelectedId(null);
    setEditingId(null);
    panRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onBackgroundPointerMove(e: React.PointerEvent) {
    const p = panRef.current;
    if (!p) return;
    setView((v) => ({ ...v, x: p.vx + (e.clientX - p.px), y: p.vy + (e.clientY - p.py) }));
  }
  function onBackgroundPointerUp(e: React.PointerEvent) {
    if (!panRef.current) return;
    panRef.current = null;
    setPanning(false);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const worldBefore = screenToWorld(e.clientX, e.clientY, rect, v);
          const scale = clampScale(v.scale * (1 - e.deltaY * 0.0025));
          return {
            scale,
            x: e.clientX - rect.left - worldBefore.x * scale,
            y: e.clientY - rect.top - worldBefore.y * scale,
          };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── keyboard: delete / escape ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editingId) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        store.remove(selectedId);
        setSelectedId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId, selectedId, store]);

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
      });
    },
    [store],
  );
  const onText = useCallback(
    (id: string, text: string) => {
      const o = store.objects.find((x) => x.id === id);
      if (!o) return;
      const content = { ...o.content, text };
      store.patchLocal(id, { content });
      store.commitContentDebounced(id, content);
    },
    [store],
  );
  const setSelectedColor = useCallback(
    (color: StickyColor) => {
      if (!selected) return;
      const content = { ...selected.content, color } as StickyContent | ShapeContent;
      store.patchLocal(selected.id, { content });
      store.commit(selected.id, { content: content as unknown as Record<string, unknown> });
    },
    [selected, store],
  );

  // world → screen for the contextual toolbar
  const toolbarPos = (() => {
    if (!selected) return null;
    return {
      left: selected.x * view.scale + view.x + (selected.width * view.scale) / 2,
      top: selected.y * view.scale + view.y - 46,
    };
  })();

  const showColorBar = selected?.type === "sticky" || selected?.type === "shape";

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
        cursor: panning ? "grabbing" : "default",
        touchAction: "none",
        ...style,
      }}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onBackgroundPointerMove}
      onPointerUp={onBackgroundPointerUp}
      onDrop={onDrop}
      onDragOver={onDragOver}
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
            selected={o.id === selectedId}
            editing={o.id === editingId}
            scale={view.scale}
            interactive={!panning}
            onSelect={setSelectedId}
            onChangeLocal={store.patchLocal}
            onCommitGeometry={commitGeometry}
            onStartEdit={setEditingId}
            onText={onText}
            onEndEdit={() => setEditingId(null)}
          />
        ))}
      </div>

      {/* contextual toolbar */}
      {selected && !editingId && toolbarPos && (
        <div
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
          onPointerDown={(e) => e.stopPropagation()}
        >
          {showColorBar &&
            STICKY_COLOR_ORDER.map((color) => (
              <button
                key={color}
                aria-label={`${color} colour`}
                onClick={() => setSelectedColor(color)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "var(--radius-full)",
                  background: STICKY_PALETTE[color].fill,
                  border: `1.5px solid ${STICKY_PALETTE[color].border}`,
                  cursor: "pointer",
                }}
              />
            ))}
          {showColorBar && (
            <span style={{ width: 1, height: 18, background: "var(--color-border)" }} />
          )}
          <button
            aria-label="Delete"
            onClick={() => {
              store.remove(selected.id);
              setSelectedId(null);
            }}
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

      {!hideDock && <ToolDock onCreate={handleCreate} onUploadImage={handleUploadImage} />}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFilePicked}
        style={{ display: "none" }}
      />
    </div>
  );
});

export default Canvas;
