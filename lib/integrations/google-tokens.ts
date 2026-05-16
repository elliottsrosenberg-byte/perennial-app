// Token lifecycle for the Google integration. Reads the access token
// from vault, refreshes it if it's expired (or about to be), and stores
// the new one. Callers get back a guaranteed-valid bearer token.

import { createClient } from "@/lib/supabase/server";
import { readIntegrationSecret, setIntegrationSecret } from "./vault";
import { googleAdapter } from "./google";

/** Refresh threshold: refresh if the access token expires within this
 *  window. 60 seconds gives us comfortable buffer for any single API
 *  call to complete before expiry. */
const REFRESH_LEAD_MS = 60_000;

export class TokenRefreshFailed extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "TokenRefreshFailed";
  }
}

/** Returns a fresh access token for the given integration, refreshing
 *  on demand. Throws TokenRefreshFailed if the refresh token is missing
 *  or rejected — caller should mark the integration as needing re-auth. */
export async function getValidGoogleAccessToken(integrationId: string): Promise<string> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("integrations")
    .select("token_expires_at")
    .eq("id", integrationId)
    .single();
  if (error || !row) throw new TokenRefreshFailed(`integration ${integrationId} not found`, error);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - REFRESH_LEAD_MS) {
    const cached = await readIntegrationSecret(integrationId, "access_token");
    if (cached) return cached;
    // No cached token even though we thought we had one — fall through to refresh.
  }

  const refreshToken = await readIntegrationSecret(integrationId, "refresh_token");
  if (!refreshToken) {
    throw new TokenRefreshFailed("no refresh token on file — user must re-authenticate");
  }

  let refreshed;
  try {
    refreshed = await googleAdapter.refreshTokens(refreshToken);
  } catch (e) {
    throw new TokenRefreshFailed("Google rejected the refresh token", e);
  }

  await setIntegrationSecret(integrationId, "access_token", refreshed.accessToken);
  await supabase
    .from("integrations")
    .update({
      token_expires_at: refreshed.expiresAt?.toISOString() ?? null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", integrationId);

  return refreshed.accessToken;
}
