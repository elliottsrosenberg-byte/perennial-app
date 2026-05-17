// Meta (Facebook Pages + Instagram Business) OAuth adapter. Replaces
// the older Instagram-only flow under /api/auth/instagram which was
// only set up for the basic-display API and is now defunct.
//
// One Meta app, one OAuth grant — covers both Facebook Pages and
// Instagram Business accounts that the user manages, plus the
// permissions required to read insights.

import type { OAuthProviderAdapter, OAuthTokenSet, ConnectedAccount } from "./types";

const AUTH_URL  = "https://www.facebook.com/v18.0/dialog/oauth";
const TOKEN_URL = "https://graph.facebook.com/v18.0/oauth/access_token";
const ME_URL    = "https://graph.facebook.com/v18.0/me";

function appId(): string {
  const id = process.env.META_APP_ID;
  if (!id) throw new Error("META_APP_ID is not set");
  return id;
}
function appSecret(): string {
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error("META_APP_SECRET is not set");
  return secret;
}

export const metaAdapter: OAuthProviderAdapter = {
  id: "meta" as const, // not in the ProviderId union yet — adding it on the next types pass

  getAuthUrl({ state, redirectUri, scopes, options }) {
    const params = new URLSearchParams({
      client_id:     appId(),
      redirect_uri:  redirectUri,
      response_type: "code",
      // Meta scopes are comma-separated, not space-separated.
      scope:         scopes.join(","),
      state,
      ...(options ?? {}),
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    // Step 1: short-lived user access token
    const shortRes = await fetch(
      `${TOKEN_URL}?` + new URLSearchParams({
        client_id:     appId(),
        client_secret: appSecret(),
        redirect_uri:  redirectUri,
        code,
      }).toString(),
    );
    if (!shortRes.ok) {
      const text = await shortRes.text().catch(() => "");
      throw new Error(`Meta token exchange failed (${shortRes.status}): ${text}`);
    }
    const short = await shortRes.json() as { access_token: string; token_type?: string; expires_in?: number };

    // Step 2: trade for a long-lived token (~60 days). Meta short-lived
    // tokens expire in ~1-2 hours, which is useless for polling sync.
    const longRes = await fetch(
      `${TOKEN_URL}?` + new URLSearchParams({
        grant_type:        "fb_exchange_token",
        client_id:         appId(),
        client_secret:     appSecret(),
        fb_exchange_token: short.access_token,
      }).toString(),
    );
    if (!longRes.ok) {
      const text = await longRes.text().catch(() => "");
      throw new Error(`Meta long-lived exchange failed (${longRes.status}): ${text}`);
    }
    const long = await longRes.json() as { access_token: string; token_type?: string; expires_in?: number };

    const tokens: OAuthTokenSet = {
      accessToken:  long.access_token,
      // Meta long-lived tokens are refreshed by re-exchanging them
      // (not via a refresh_token grant). We persist null here and the
      // refresh helper re-exchanges the access token before expiry.
      refreshToken: null,
      expiresAt:    long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
      scope:        null,
    };

    const account = await fetchAccountIdentity(tokens.accessToken);
    return { tokens, account };
  },

  async refreshTokens(_existingRefreshOrAccess: string) {
    // Meta doesn't have refresh_token semantics. Callers should re-exchange
    // the existing long-lived token via fb_exchange_token before expiry.
    // Throwing here surfaces the issue rather than silently failing.
    throw new Error("Meta tokens are refreshed via fb_exchange_token on the access token, not refresh_token");
  },
};

async function fetchAccountIdentity(accessToken: string): Promise<ConnectedAccount> {
  const res = await fetch(`${ME_URL}?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Meta /me failed (${res.status}): ${text}`);
  }
  const u = await res.json() as { id: string; name?: string; email?: string };
  return {
    accountId:   u.id,
    accountName: u.email ?? u.name ?? u.id,
    metadata:    { display_name: u.name ?? null },
  };
}
