// Supabase read/write helpers for the spatial canvas. Pure functions that take a
// SupabaseClient, so they work identically from a server component (Home page)
// or the browser client (detail panels / live edits).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasObjectRow, CanvasScope } from "@/types/database";
import { objectToColumns, type CanvasObject } from "@/components/canvas/types";

export interface ResolveCanvasArgs {
  scope: CanvasScope;
  /** null for the Home board. */
  entityId?: string | null;
}

/**
 * Return the id of the canvas for (current user, scope, entity), creating it on
 * first use. Safe against the create/create race via the unique index.
 */
export async function ensureCanvas(
  supabase: SupabaseClient,
  { scope, entityId = null }: ResolveCanvasArgs,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const select = () => {
    let q = supabase
      .from("canvases")
      .select("id")
      .eq("user_id", user.id)
      .eq("scope", scope);
    q = entityId == null ? q.is("entity_id", null) : q.eq("entity_id", entityId);
    return q.maybeSingle();
  };

  const existing = await select();
  if (existing.data) return existing.data.id as string;

  const insert = await supabase
    .from("canvases")
    .insert({ user_id: user.id, scope, entity_id: entityId })
    .select("id")
    .single();
  if (insert.data) return insert.data.id as string;

  // Lost the insert race (unique-index violation) — the row now exists.
  const retry = await select();
  return (retry.data?.id as string) ?? null;
}

export async function loadCanvasObjects(
  supabase: SupabaseClient,
  canvasId: string,
): Promise<CanvasObjectRow[]> {
  const { data } = await supabase
    .from("canvas_objects")
    .select("*")
    .eq("canvas_id", canvasId)
    .order("z_index", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as CanvasObjectRow[];
}

/** Insert a new object. `id` is client-generated so optimistic state and the DB
 *  row share an identity. */
export async function insertCanvasObject(
  supabase: SupabaseClient,
  canvasId: string,
  object: CanvasObject,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("canvas_objects").insert({
    id: object.id,
    canvas_id: canvasId,
    user_id: user.id,
    ...objectToColumns(object),
  });
}

/** Patch geometry/content/z-index of an existing object. */
export async function updateCanvasObject(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ReturnType<typeof objectToColumns>>,
): Promise<void> {
  await supabase.from("canvas_objects").update(patch).eq("id", id);
}

export async function deleteCanvasObject(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  await supabase.from("canvas_objects").delete().eq("id", id);
}
