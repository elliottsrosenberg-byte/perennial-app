// Service-role token lifecycle — the no-session twin of google-tokens.ts /
// microsoft-tokens.ts. Used ONLY by server code that has no authenticated
// user but a legitimate, controlled reason to act on a user's calendar:
// the public scheduling booking flow (compute availability + create the
// booked event). The integration id is always resolved from the booking
// link's owner, never from visitor input. Tokens stay on the server.
//
// Reads/writes vault via the service_role-gated RPCs and the service-role
// Supabase client (RLS bypass). Refresh logic mirrors the session helpers.

import { createServiceClient } from "@/lib/supabase/service";
import { googleAdapter } from "./google";
import { microsoftAdapter } from "./microsoft";

const REFRESH_LEAD_MS = 60_000;

async function readSecretService(integrationId: string, kind: "access_token" | "refresh_token"): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("integration_read_secret_service", {
    p_integration_id: integrationId,
    p_kind:           kind,
  });
  if (error) throw new Error(`vault.readSecretService(${kind}): ${error.message}`);
  return (data as string | null) ?? null;
}

async function setSecretService(integrationId: string, kind: "access_token" | "refresh_token", value: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("integration_set_secret_service", {
    p_integration_id: integrationId,
    p_kind:           kind,
    p_value:          value,
  });
  if (error) throw new Error(`vault.setSecretService(${kind}): ${error.message}`);
}

export class ServiceTokenError extends Error {}

export async function getValidGoogleAccessTokenService(integrationId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("integrations").select("token_expires_at").eq("id", integrationId).single();
  if (error || !row) throw new ServiceTokenError(`integration ${integrationId} not found`);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - REFRESH_LEAD_MS) {
    const cached = await readSecretService(integrationId, "access_token");
    if (cached) return cached;
  }

  const refreshToken = await readSecretService(integrationId, "refresh_token");
  if (!refreshToken) throw new ServiceTokenError("no refresh token on file");

  const refreshed = await googleAdapter.refreshTokens(refreshToken);
  await setSecretService(integrationId, "access_token", refreshed.accessToken);
  await supabase
    .from("integrations")
    .update({ token_expires_at: refreshed.expiresAt?.toISOString() ?? null, updated_at: new Date().toISOString() })
    .eq("id", integrationId);
  return refreshed.accessToken;
}

export async function getValidMicrosoftAccessTokenService(integrationId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("integrations").select("token_expires_at").eq("id", integrationId).single();
  if (error || !row) throw new ServiceTokenError(`integration ${integrationId} not found`);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - REFRESH_LEAD_MS) {
    const cached = await readSecretService(integrationId, "access_token");
    if (cached) return cached;
  }

  const refreshToken = await readSecretService(integrationId, "refresh_token");
  if (!refreshToken) throw new ServiceTokenError("no refresh token on file");

  const refreshed = await microsoftAdapter.refreshTokens(refreshToken);
  await setSecretService(integrationId, "access_token", refreshed.accessToken);
  if (refreshed.refreshToken) {
    await setSecretService(integrationId, "refresh_token", refreshed.refreshToken);
  }
  await supabase
    .from("integrations")
    .update({ token_expires_at: refreshed.expiresAt?.toISOString() ?? null, updated_at: new Date().toISOString() })
    .eq("id", integrationId);
  return refreshed.accessToken;
}
