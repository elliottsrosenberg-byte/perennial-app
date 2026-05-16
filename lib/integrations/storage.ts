// Read/write helpers for the `public.integrations` table. Everything in
// here uses the user-scoped Supabase client (RLS enforces row ownership).
// The vault-encrypted token columns are filled in via `lib/integrations/vault`
// after the row is upserted — never write plaintext tokens through this
// module.

import { createClient } from "@/lib/supabase/server";
import { setIntegrationSecret, deleteIntegrationSecrets } from "./vault";
import type {
  IntegrationRow,
  OAuthTokenSet,
  ConnectedAccount,
  ProviderId,
  IntegrationStatus,
} from "./types";

/** Look up an integration by (user_id, provider, account_id). Returns
 *  null if the user hasn't connected that account yet. Used at the start
 *  of an OAuth callback to decide insert vs update. */
export async function findIntegrationByAccount(
  userId:    string,
  provider:  ProviderId | string,
  accountId: string,
): Promise<IntegrationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`storage.findByAccount: ${error.message}`);
  return (data as IntegrationRow | null) ?? null;
}

/** List all of a user's integrations. Used by the Settings UI and the
 *  sync worker. */
export async function listIntegrations(userId: string): Promise<IntegrationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .order("connected_at", { ascending: true });
  if (error) throw new Error(`storage.list: ${error.message}`);
  return (data ?? []) as IntegrationRow[];
}

interface UpsertArgs {
  userId:   string;
  provider: ProviderId | string;
  account:  ConnectedAccount;
  scopes:   Record<string, boolean>;
  metadata?: Record<string, unknown>;
}

/** Insert-or-update the metadata row, returning the row id. Tokens are
 *  written separately via `writeTokens` so the vault RPC sees an
 *  existing row to attach the secret to. */
export async function upsertIntegrationRow(args: UpsertArgs): Promise<IntegrationRow> {
  const supabase = await createClient();

  const existing = await findIntegrationByAccount(args.userId, args.provider, args.account.accountId);

  const base = {
    user_id:      args.userId,
    provider:     args.provider,
    account_id:   args.account.accountId,
    account_name: args.account.accountName,
    scopes:       args.scopes,
    metadata:     { ...(existing?.metadata ?? {}), ...(args.account.metadata ?? {}), ...(args.metadata ?? {}) },
    status:       "active" as IntegrationStatus,
    last_error:   null,
    last_error_at: null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("integrations")
      .update({ ...base, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`storage.upsert/update: ${error.message}`);
    return data as IntegrationRow;
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({ ...base, connected_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw new Error(`storage.upsert/insert: ${error.message}`);
  return data as IntegrationRow;
}

/** Encrypt+store the access/refresh tokens for an existing row and stamp
 *  `token_expires_at`. */
export async function writeTokens(
  integrationId: string,
  tokens: OAuthTokenSet,
): Promise<void> {
  await setIntegrationSecret(integrationId, "access_token", tokens.accessToken);
  if (tokens.refreshToken) {
    await setIntegrationSecret(integrationId, "refresh_token", tokens.refreshToken);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({
      token_expires_at: tokens.expiresAt?.toISOString() ?? null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", integrationId);
  if (error) throw new Error(`storage.writeTokens: ${error.message}`);
}

/** Update sync cursors / counters after a sync run. */
export async function recordSyncSuccess(
  integrationId: string,
  syncState: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({
      sync_state:     syncState,
      status:         "active",
      last_synced_at: new Date().toISOString(),
      last_error:     null,
      last_error_at:  null,
      updated_at:     new Date().toISOString(),
    })
    .eq("id", integrationId);
  if (error) throw new Error(`storage.recordSyncSuccess: ${error.message}`);
}

/** Record a sync failure. Switches `status` to 'error' so the Settings UI
 *  can surface the issue. */
export async function recordSyncError(integrationId: string, message: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({
      status:        "error",
      last_error:    message.slice(0, 1000),
      last_error_at: new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    })
    .eq("id", integrationId);
  if (error) throw new Error(`storage.recordSyncError: ${error.message}`);
}

/** Disconnect an integration: zeroes out vault secrets and marks the row
 *  status='disconnected'. The row itself is retained so that any
 *  `contact_activities` rows linked via metadata.integration_id continue
 *  to make sense. */
export async function disconnectIntegration(integrationId: string): Promise<void> {
  await deleteIntegrationSecrets(integrationId);
  // integration_delete_secrets already flips status='disconnected'.
}
