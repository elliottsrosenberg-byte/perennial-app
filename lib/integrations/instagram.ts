// Instagram Business Login OAuth adapter — Meta's modern direct-to-IG
// OAuth path ("API with Instagram Login"). Replaces the deprecated
// Instagram Basic Display API flow that was in app/api/auth/instagram
// previously, and replaces our brief detour through Facebook Login.
//
// Key differences vs Facebook Login:
//   - User authenticates directly with Instagram (no Facebook Page required)
//   - Auth endpoint:  https://www.instagram.com/oauth/authorize
//   - Token endpoint: https://api.instagram.com/oauth/access_token (short)
//                     https://graph.instagram.com/access_token        (long-lived)
//   - Identity:       https://graph.instagram.com/me?fields=id,username,account_type
//   - Scopes use the `instagram_business_*` prefix and are comma-separated
//
// Instagram account requirements: must be Business or Creator type. The
// consent screen handles the conversion prompt automatically if the user
// is on a Personal account.

import type { OAuthProviderAdapter, OAuthTokenSet, ConnectedAccount } from "./types";

const AUTH_URL        = "https://www.instagram.com/oauth/authorize";
const SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_IG        = "https://graph.instagram.com";

// Instagram Business Login lives on its own App ID/Secret pair in the
// Meta dashboard under the "Manage Content on Instagram" use case →
// "Set up Instagram business login" panel. They're not the same as the
// Facebook Login App ID/Secret, so we look for INSTAGRAM_* first and
// fall back to META_* for convenience during early setup.
function clientId(): string {
  const id = process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  if (!id) throw new Error("INSTAGRAM_APP_ID (or META_APP_ID) is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!secret) throw new Error("INSTAGRAM_APP_SECRET (or META_APP_SECRET) is not set");
  return secret;
}

export const instagramAdapter: OAuthProviderAdapter = {
  id: "instagram",

  getAuthUrl({ state, redirectUri, scopes }) {
    const params = new URLSearchParams({
      client_id:     clientId(),
      redirect_uri:  redirectUri,
      response_type: "code",
      // IG Business Login uses comma-separated scopes (different from
      // Facebook Login, which uses comma-separated too but with different
      // scope names entirely).
      scope:         scopes.join(","),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    // Step 1: short-lived token (~1 hour)
    const shortForm = new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      grant_type:    "authorization_code",
      redirect_uri:  redirectUri,
      code,
    });
    const shortRes = await fetch(SHORT_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    shortForm.toString(),
    });
    if (!shortRes.ok) {
      const text = await shortRes.text().catch(() => "");
      throw new Error(`Instagram token exchange failed (${shortRes.status}): ${text}`);
    }
    const short = await shortRes.json() as { access_token: string; user_id: number; permissions?: string };

    // Step 2: exchange for long-lived token (~60 days). Short-lived
    // tokens are useless for polling sync, so we always upgrade.
    const longParams = new URLSearchParams({
      grant_type:    "ig_exchange_token",
      client_secret: clientSecret(),
      access_token:  short.access_token,
    });
    const longRes = await fetch(`${GRAPH_IG}/access_token?${longParams.toString()}`);
    if (!longRes.ok) {
      const text = await longRes.text().catch(() => "");
      throw new Error(`Instagram long-lived exchange failed (${longRes.status}): ${text}`);
    }
    const long = await longRes.json() as { access_token: string; token_type: string; expires_in: number };

    const tokens: OAuthTokenSet = {
      accessToken:  long.access_token,
      // Instagram doesn't have refresh_token semantics — long-lived
      // tokens are refreshed by hitting /refresh_access_token with the
      // existing access token. Our refresh helper handles that path.
      refreshToken: null,
      expiresAt:    new Date(Date.now() + long.expires_in * 1000),
      scope:        short.permissions ?? null,
    };

    const account = await fetchAccountIdentity(tokens.accessToken);
    return { tokens, account };
  },

  async refreshTokens(accessToken: string) {
    // Instagram long-lived tokens are refreshed by passing the current
    // (still-valid) access token to /refresh_access_token. The token
    // must be at least 24h old. We persist the new access token as
    // both the access AND treat it as our refresh credential.
    const params = new URLSearchParams({
      grant_type:    "ig_refresh_token",
      access_token:  accessToken,
    });
    const res = await fetch(`${GRAPH_IG}/refresh_access_token?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Instagram refresh failed (${res.status}): ${text}`);
    }
    const refreshed = await res.json() as { access_token: string; token_type: string; expires_in: number };
    return {
      accessToken:  refreshed.access_token,
      refreshToken: null,
      expiresAt:    new Date(Date.now() + refreshed.expires_in * 1000),
      scope:        null,
    };
  },
};

async function fetchAccountIdentity(accessToken: string): Promise<ConnectedAccount> {
  const url = `${GRAPH_IG}/me?fields=id,username,account_type&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Instagram /me failed (${res.status}): ${text}`);
  }
  const u = await res.json() as { id: string; username: string; account_type?: string };
  return {
    accountId:   u.id,
    accountName: u.username,
    metadata:    { account_type: u.account_type ?? null },
  };
}
