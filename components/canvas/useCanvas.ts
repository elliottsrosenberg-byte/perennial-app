// Canvas state + persistence. Optimistic local state; DB writes are
// fire-and-forget (geometry commits on interaction-end, content debounced).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CanvasObjectRow, CanvasScope } from "@/types/database";
import {
  rowToObject,
  objectToColumns,
  type CanvasObject,
} from "./types";
import {
  ensureCanvas,
  loadCanvasObjects,
  insertCanvasObject,
  updateCanvasObject,
  deleteCanvasObject,
} from "@/lib/canvas/api";

export interface UseCanvasArgs {
  /** Pre-resolved canvas id (server components pass this). */
  canvasId?: string | null;
  /** Server-provided initial rows (avoids a client round-trip on first paint). */
  initialObjects?: CanvasObjectRow[];
  /** When canvasId is absent, resolve/create by scope + entity on mount. */
  scope?: CanvasScope;
  entityId?: string | null;
}

type ColumnPatch = Partial<ReturnType<typeof objectToColumns>>;

export interface CanvasStore {
  loading: boolean;
  objects: CanvasObject[];
  /** Insert an object (optimistic + persist). */
  add: (object: CanvasObject) => void;
  /** Local-only geometry/content change (during a drag). */
  patchLocal: (id: string, patch: Partial<CanvasObject>) => void;
  /** Persist the current state of an object's columns. */
  commit: (id: string, patch: ColumnPatch) => void;
  /** Debounced content persist (text typing). */
  commitContentDebounced: (id: string, content: CanvasObject["content"]) => void;
  /** Immediately persist any pending debounced content for an object (on blur). */
  flushContent: (id: string) => void;
  remove: (id: string) => void;
  /** Highest z-index currently in use (for "bring new object to front"). */
  topZ: number;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useCanvas({
  canvasId: canvasIdProp,
  initialObjects,
  scope,
  entityId = null,
}: UseCanvasArgs): CanvasStore {
  const supabase = useMemo(() => createClient(), []);
  const [canvasId, setCanvasId] = useState<string | null>(canvasIdProp ?? null);
  const [objects, setObjects] = useState<CanvasObject[]>(
    () => (initialObjects ?? []).map(rowToObject),
  );
  const [loading, setLoading] = useState<boolean>(
    !canvasIdProp && !!scope,
  );

  // Resolve the canvas on the client when the id wasn't provided by the server.
  useEffect(() => {
    if (canvasId || !scope) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const id = await ensureCanvas(supabase, { scope, entityId });
      if (cancelled || !id) {
        if (!cancelled) setLoading(false);
        return;
      }
      const rows = await loadCanvasObjects(supabase, id);
      if (cancelled) return;
      setCanvasId(id);
      setObjects(rows.map(rowToObject));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, canvasId, scope, entityId]);

  const topZ = objects.reduce((m, o) => Math.max(m, o.zIndex), 0);

  const add = useCallback(
    (object: CanvasObject) => {
      setObjects((prev) => [...prev, object]);
      if (canvasId) {
        insertCanvasObject(supabase, canvasId, object).catch((e) =>
          console.error("canvas insert failed", e),
        );
      }
    },
    [supabase, canvasId],
  );

  const patchLocal = useCallback((id: string, patch: Partial<CanvasObject>) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  }, []);

  const commit = useCallback(
    (id: string, patch: ColumnPatch) => {
      updateCanvasObject(supabase, id, patch).catch((e) =>
        console.error("canvas update failed", e),
      );
    },
    [supabase],
  );

  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Latest un-persisted content per object, so a blur/unmount can flush the
  // most recent value instead of dropping it mid-debounce.
  const pendingRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const commitContentDebounced = useCallback(
    (id: string, content: CanvasObject["content"]) => {
      const timers = debounceRef.current;
      const payload = content as unknown as Record<string, unknown>;
      pendingRef.current.set(id, payload);
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          pendingRef.current.delete(id);
          updateCanvasObject(supabase, id, {
            content: payload,
          }).catch((e) => console.error("canvas content save failed", e));
        }, 600),
      );
    },
    [supabase],
  );

  // Force-persist an object's pending content immediately (e.g. editor blur).
  const flushContent = useCallback(
    (id: string) => {
      const timers = debounceRef.current;
      const t = timers.get(id);
      if (t) {
        clearTimeout(t);
        timers.delete(id);
      }
      const payload = pendingRef.current.get(id);
      if (!payload) return;
      pendingRef.current.delete(id);
      updateCanvasObject(supabase, id, { content: payload }).catch((e) =>
        console.error("canvas content flush failed", e),
      );
    },
    [supabase],
  );

  // Flush pending debounced saves on unmount instead of dropping them.
  useEffect(() => {
    const timers = debounceRef.current;
    const pending = pendingRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      pending.forEach((payload, id) => {
        updateCanvasObject(supabase, id, { content: payload }).catch(() => {});
      });
      pending.clear();
    };
  }, [supabase]);

  const remove = useCallback(
    (id: string) => {
      setObjects((prev) => prev.filter((o) => o.id !== id));
      deleteCanvasObject(supabase, id).catch((e) =>
        console.error("canvas delete failed", e),
      );
    },
    [supabase],
  );

  // ── undo / redo ──────────────────────────────────────────────────────────
  // Debounced snapshots of the whole object set at rest; undo/redo restore a
  // snapshot and reconcile the DB (insert/update/delete the diff).
  const objectsRef = useRef(objects);
  const historyRef = useRef<CanvasObject[][]>([]);
  const ptrRef = useRef(-1);
  const applyingRef = useRef(false);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    objectsRef.current = objects;
  });

  const clone = (objs: CanvasObject[]) => objs.map((o) => ({ ...o, content: { ...o.content } }));
  const syncHist = () =>
    setHist({ canUndo: ptrRef.current > 0, canRedo: ptrRef.current < historyRef.current.length - 1 });

  // Record settled states.
  useEffect(() => {
    if (applyingRef.current) return;
    const t = setTimeout(() => {
      const cur = clone(objects);
      const top = historyRef.current[ptrRef.current];
      if (top && JSON.stringify(top) === JSON.stringify(cur)) return;
      historyRef.current = historyRef.current.slice(0, ptrRef.current + 1);
      historyRef.current.push(cur);
      if (historyRef.current.length > 60) historyRef.current.shift();
      ptrRef.current = historyRef.current.length - 1;
      syncHist();
    }, 450);
    return () => clearTimeout(t);
  }, [objects]);

  const applyState = useCallback(
    (target: CanvasObject[]) => {
      applyingRef.current = true;
      const cur = objectsRef.current;
      const curMap = new Map(cur.map((o) => [o.id, o]));
      const tgtMap = new Map(target.map((o) => [o.id, o]));
      if (canvasId) {
        for (const o of target) {
          const c = curMap.get(o.id);
          if (!c) insertCanvasObject(supabase, canvasId, o).catch((e) => console.error("undo insert failed", e));
          else if (JSON.stringify(objectToColumns(c)) !== JSON.stringify(objectToColumns(o)))
            updateCanvasObject(supabase, o.id, objectToColumns(o)).catch((e) => console.error("undo update failed", e));
        }
        for (const o of cur) {
          if (!tgtMap.has(o.id)) deleteCanvasObject(supabase, o.id).catch((e) => console.error("undo delete failed", e));
        }
      }
      setObjects(clone(target));
      // Cleared after the state settles; the record effect also skips no-ops.
      setTimeout(() => {
        applyingRef.current = false;
      }, 0);
    },
    [supabase, canvasId],
  );

  const undo = useCallback(() => {
    if (ptrRef.current <= 0) return;
    ptrRef.current -= 1;
    applyState(historyRef.current[ptrRef.current]);
    syncHist();
  }, [applyState]);
  const redo = useCallback(() => {
    if (ptrRef.current >= historyRef.current.length - 1) return;
    ptrRef.current += 1;
    applyState(historyRef.current[ptrRef.current]);
    syncHist();
  }, [applyState]);

  return {
    loading,
    objects,
    add,
    patchLocal,
    commit,
    commitContentDebounced,
    flushContent,
    remove,
    topZ,
    undo,
    redo,
    canUndo: hist.canUndo,
    canRedo: hist.canRedo,
  };
}
