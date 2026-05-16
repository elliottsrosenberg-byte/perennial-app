// Google OAuth adapter. Implements the unified Google connection that
// covers Gmail + Calendar + Contacts (the People/Calendar use case).
//
// Note: the standalone Google Analytics integration lives in its own
// route under /api/auth/google-analytics because GA has a different
// lifecycle, different consent expectations, and is conceptually
// separate from a user's personal communications. Same Google Cloud
// project + OAuth client, two distinct grants.

import type { OAuthProviderAdapter, OAuthTokenSet, ConnectedAccount } from "./types";

const AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function clientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return secret;
}

export const googleAdapter: OAuthProviderAdapter = {
  id: "google",

  getAuthUrl({ state, redirectUri, scopes, options }) {
    const params = new URLSearchParams({
      client_id:     clientId(),
      redirect_uri:  redirectUri,
      response_type: "code",
      scope:         scopes.join(" "),
      // access_type=offline + prompt=consent is what reliably issues a
      // refresh_token. Without prompt=consent, Google skips the refresh
      // token on subsequent grants for the same scopes, which would
      // break our offline polling sync.
      access_type:           "offline",
      include_granted_scopes: "true",
      prompt:                "consent",
      state,
      ...(options ?? {}),
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const body = new URLSearchParams({
      code,
      client_id:     clientId(),
      client_secret: clientSecret(),
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    });

    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Google token exchange failed (${res.status}): ${text}`);
    }
    const payload = await res.json() as {
      access_token:  string;
      refresh_token?: string;
      expires_in?:   number;
      scope?:        string;
      id_token?:     string;
    };

    const tokens: OAuthTokenSet = {
      accessToken:  payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt:    payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
      scope:        payload.scope ?? null,
      idToken:      payload.id_token ?? null,
    };

    const account = await fetchAccountIdentity(tokens.accessToken);
    return { tokens, account };
  },

  async refreshTokens(refreshToken: string) {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     clientId(),
      client_secret: clientSecret(),
      grant_type:    "refresh_token",
    });

    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Google token refresh failed (${res.status}): ${text}`);
    }
    const payload = await res.json() as {
      access_token: string;
      expires_in?:  number;
      scope?:       string;
    };

    return {
      accessToken:  payload.access_token,
      refreshToken: null, // refresh doesn't re-issue a refresh_token
      expiresAt:    payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
      scope:        payload.scope ?? null,
    };
  },

  async revoke(accessToken: string) {
    // Fire-and-forget: a failed revoke shouldn't block the disconnect.
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).catch(() => undefined);
  },
};

/** Hit /userinfo to learn which Google account just granted consent. We
 *  use the `sub` claim as the stable account_id (Google's user ID) and
 *  `email` as the account_name. */
async function fetchAccountIdentity(accessToken: string): Promise<ConnectedAccount> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google userinfo failed (${res.status}): ${text}`);
  }
  const u = await res.json() as {
    sub:    string;
    email:  string;
    name?:  string;
    picture?: string;
  };
  return {
    accountId:   u.sub,
    accountName: u.email,
    metadata: {
      profile_name:    u.name ?? null,
      profile_picture: u.picture ?? null,
    },
  };
}
