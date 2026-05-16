// Token lifecycle for the Microsoft integration. Mirror of
// google-tokens.ts — refresh on demand, write the new token back to
// vault, surface a typed error if the refresh token is missing or
// rejected so the caller can mark the integration as needing re-auth.

import { createClient } from "@/lib/supabase/server";
import { readIntegrationSecret, setIntegrationSecret } from "./vault";
import { microsoftAdapter } from "./microsoft";

const REFRESH_LEAD_MS = 60_000;

export class MicrosoftTokenRefreshFailed extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "MicrosoftTokenRefreshFailed";
  }
}

export async function getValidMicrosoftAccessToken(integrationId: string): Promise<string> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("integrations")
    .select("token_expires_at")
    .eq("id", integrationId)
    .single();
  if (error || !row) throw new MicrosoftTokenRefreshFailed(`integration ${integrationId} not found`, error);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - REFRESH_LEAD_MS) {
    const cached = await readIntegrationSecret(integrationId, "access_token");
    if (cached) return cached;
  }

  const refreshToken = await readIntegrationSecret(integrationId, "refresh_token");
  if (!refreshToken) {
    throw new MicrosoftTokenRefreshFailed("no refresh token on file — user must re-authenticate");
  }

  let refreshed;
  try {
    refreshed = await microsoftAdapter.refreshTokens(refreshToken);
  } catch (e) {
    throw new MicrosoftTokenRefreshFailed("Microsoft rejected the refresh token", e);
  }

  await setIntegrationSecret(integrationId, "access_token", refreshed.accessToken);
  // Microsoft can rotate the refresh token on each refresh — capture it
  // if Graph returned a new one so future refreshes keep working.
  if (refreshed.refreshToken) {
    await setIntegrationSecret(integrationId, "refresh_token", refreshed.refreshToken);
  }
  await supabase
    .from("integrations")
    .update({
      token_expires_at: refreshed.expiresAt?.toISOString() ?? null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", integrationId);

  return refreshed.accessToken;
}
