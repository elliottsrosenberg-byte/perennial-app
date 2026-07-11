// Token lifecycle for the Google integration. Reads the access token
// from vault, refreshes it if it's expired (or about to be), and stores
// the new one. Callers get back a guaranteed-valid bearer token.

import { readIntegrationSecret, setIntegrationSecret } from "./vault";
import { recordReauthRequired, clearIntegrationError } from "./storage";
import { googleAdapter } from "./google";
import { resolveSyncContext, type SyncContext } from "./sync-context";

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
export async function getValidGoogleAccessToken(integrationId: string, context?: SyncContext): Promise<string> {
  const ctx      = await resolveSyncContext(context);
  const supabase = ctx.db;

  const { data: row, error } = await supabase
    .from("integrations")
    .select("token_expires_at")
    .eq("id", integrationId)
    .single();
  if (error || !row) throw new TokenRefreshFailed(`integration ${integrationId} not found`, error);

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - REFRESH_LEAD_MS) {
    const cached = await readIntegrationSecret(integrationId, "access_token", ctx);
    if (cached) return cached;
    // No cached token even though we thought we had one — fall through to refresh.
  }

  const refreshToken = await readIntegrationSecret(integrationId, "refresh_token", ctx);
  if (!refreshToken) {
    await recordReauthRequired(integrationId, "no refresh token on file — user must re-authenticate", ctx);
    throw new TokenRefreshFailed("no refresh token on file — user must re-authenticate");
  }

  let refreshed;
  try {
    refreshed = await googleAdapter.refreshTokens(refreshToken);
  } catch (e) {
    await recordReauthRequired(integrationId, "Google rejected the refresh token — reconnect required", ctx);
    throw new TokenRefreshFailed("Google rejected the refresh token", e);
  }

  await setIntegrationSecret(integrationId, "access_token", refreshed.accessToken, ctx);
  await supabase
    .from("integrations")
    .update({
      token_expires_at: refreshed.expiresAt?.toISOString() ?? null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", integrationId);
  // A successful refresh clears any prior needs_reauth/error flag.
  await clearIntegrationError(integrationId, ctx);

  return refreshed.accessToken;
}
