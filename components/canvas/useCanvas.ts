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
  remove: (id: string) => void;
  /** Highest z-index currently in use (for "bring new object to front"). */
  topZ: number;
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
  const commitContentDebounced = useCallback(
    (id: string, content: CanvasObject["content"]) => {
      const timers = debounceRef.current;
      const prev = timers.get(id);
      if (prev) clearTimeout(prev);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          updateCanvasObject(supabase, id, {
            content: content as unknown as Record<string, unknown>,
          }).catch((e) => console.error("canvas content save failed", e));
        }, 600),
      );
    },
    [supabase],
  );

  // Flush pending debounced saves on unmount.
  useEffect(() => {
    const timers = debounceRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const remove = useCallback(
    (id: string) => {
      setObjects((prev) => prev.filter((o) => o.id !== id));
      deleteCanvasObject(supabase, id).catch((e) =>
        console.error("canvas delete failed", e),
      );
    },
    [supabase],
  );

  return {
    loading,
    objects,
    add,
    patchLocal,
    commit,
    commitContentDebounced,
    remove,
    topZ,
  };
}
