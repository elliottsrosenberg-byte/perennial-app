// A sync can run in one of two authentication contexts:
//
//   • user-scoped  — the standard server client backed by the caller's
//     session cookies. RLS applies; vault secrets are read via the
//     `auth.uid()`-gated RPCs. This is how the interactive "Sync now"
//     button and the sync-on-open path run.
//
//   • service      — the service-role admin client (bypasses RLS), used by
//     the background pg_cron job which has no user session. Vault secrets
//     are read/written via the `*_service` RPCs, which authorize on
//     `auth.role() = 'service_role'` instead of `auth.uid()`.
//
// Every leaf helper in the integrations layer accepts an optional
// SyncContext so the same sync code runs unchanged in both. When omitted,
// helpers fall back to a fresh user-scoped context — preserving the
// original single-user behavior for existing callers.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncContext {
  /** The Supabase client to run queries with (user-scoped or admin). */
  db: SupabaseClient;
  /** When true, use the service-role vault RPCs (background cron). */
  service: boolean;
}

/** User-scoped context (session cookies + RLS). The default. */
export async function userSyncContext(): Promise<SyncContext> {
  return { db: (await createClient()) as unknown as SupabaseClient, service: false };
}

/** Service-role context for the background cron. Bypasses RLS. */
export function adminSyncContext(): SyncContext {
  return { db: createAdminClient() as unknown as SupabaseClient, service: true };
}

/** Resolve an optional context to a concrete one, defaulting to user-scoped. */
export async function resolveSyncContext(ctx?: SyncContext): Promise<SyncContext> {
  return ctx ?? (await userSyncContext());
}
