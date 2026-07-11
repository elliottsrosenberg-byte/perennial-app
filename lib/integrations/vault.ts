// Thin TypeScript wrappers around the SECURITY DEFINER vault RPCs
// (`integration_set_secret`, `integration_read_secret`,
// `integration_delete_secrets`). The user-scoped variants run as the
// authenticated user and re-check auth.uid() against the integration's
// user_id, so callers can use the standard server-side Supabase client.
//
// The background cron has no user session, so it passes a service-role
// SyncContext; we then route to the `*_service` RPCs, which authorize on
// `auth.role() = 'service_role'` instead of auth.uid(). No plaintext
// tokens ever pass through the Next.js process outside these calls.

import { createClient } from "@/lib/supabase/server";
import type { SyncContext } from "./sync-context";

type SecretKind = "access_token" | "refresh_token";

/** Resolve the Supabase client + whether to use the service-role RPC. */
async function client(ctx?: SyncContext) {
  if (ctx) return { db: ctx.db, service: ctx.service };
  return { db: await createClient(), service: false };
}

export async function setIntegrationSecret(
  integrationId: string,
  kind: SecretKind,
  value: string,
  ctx?: SyncContext,
): Promise<string> {
  const { db, service } = await client(ctx);
  const fn = service ? "integration_set_secret_service" : "integration_set_secret";
  const { data, error } = await db.rpc(fn, {
    p_integration_id: integrationId,
    p_kind:           kind,
    p_value:          value,
  });
  if (error) throw new Error(`vault.setSecret(${kind}): ${error.message}`);
  return data as string;
}

export async function readIntegrationSecret(
  integrationId: string,
  kind: SecretKind,
  ctx?: SyncContext,
): Promise<string | null> {
  const { db, service } = await client(ctx);
  const fn = service ? "integration_read_secret_service" : "integration_read_secret";
  const { data, error } = await db.rpc(fn, {
    p_integration_id: integrationId,
    p_kind:           kind,
  });
  if (error) throw new Error(`vault.readSecret(${kind}): ${error.message}`);
  return (data as string | null) ?? null;
}

export async function deleteIntegrationSecrets(integrationId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("integration_delete_secrets", {
    p_integration_id: integrationId,
  });
  if (error) throw new Error(`vault.deleteSecrets: ${error.message}`);
}
