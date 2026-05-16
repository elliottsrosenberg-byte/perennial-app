// Microsoft 365 OAuth adapter (Outlook Mail + Calendar + Contacts via
// Microsoft Graph). Mirror of `google.ts` with Microsoft endpoints.

import type { OAuthProviderAdapter, OAuthTokenSet, ConnectedAccount } from "./types";

function tenant(): string {
  // "common" supports both personal Microsoft accounts and any workplace
  // Entra ID tenant. Override via MICROSOFT_TENANT_ID if the app is
  // registered single-tenant.
  return process.env.MICROSOFT_TENANT_ID || "common";
}

function authBase(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
}

function clientId(): string {
  const id = process.env.MICROSOFT_CLIENT_ID;
  if (!id) throw new Error("MICROSOFT_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!secret) throw new Error("MICROSOFT_CLIENT_SECRET is not set");
  return secret;
}

const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";

export const microsoftAdapter: OAuthProviderAdapter = {
  id: "microsoft",

  getAuthUrl({ state, redirectUri, scopes, options }) {
    const params = new URLSearchParams({
      client_id:     clientId(),
      response_type: "code",
      redirect_uri:  redirectUri,
      response_mode: "query",
      scope:         scopes.join(" "),
      // prompt=consent forces re-consent so we reliably get a refresh
      // token (offline_access scope handles the issuance).
      prompt:        "consent",
      state,
      ...(options ?? {}),
    });
    return `${authBase()}/authorize?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri }) {
    const body = new URLSearchParams({
      client_id:     clientId(),
      scope:         "openid email profile offline_access User.Read Mail.Read Calendars.Read Contacts.Read",
      code,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
      client_secret: clientSecret(),
    });

    const res = await fetch(`${authBase()}/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Microsoft token exchange failed (${res.status}): ${text}`);
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
      client_id:     clientId(),
      // Microsoft requires `scope` on refresh; pass the same string we
      // used for the initial exchange so the new token carries them.
      scope:         "openid email profile offline_access User.Read Mail.Read Calendars.Read Contacts.Read",
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
      client_secret: clientSecret(),
    });

    const res = await fetch(`${authBase()}/token`, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Microsoft token refresh failed (${res.status}): ${text}`);
    }
    const payload = await res.json() as {
      access_token:  string;
      refresh_token?: string;
      expires_in?:   number;
      scope?:        string;
    };

    return {
      accessToken:  payload.access_token,
      // Microsoft *does* sometimes re-issue a refresh token on refresh
      // (rolling refresh). Capture it if present.
      refreshToken: payload.refresh_token ?? null,
      expiresAt:    payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000) : null,
      scope:        payload.scope ?? null,
    };
  },
};

async function fetchAccountIdentity(accessToken: string): Promise<ConnectedAccount> {
  const res = await fetch(GRAPH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph /me failed (${res.status}): ${text}`);
  }
  const u = await res.json() as {
    id:                  string;
    mail?:               string;
    userPrincipalName?:  string;
    displayName?:        string;
  };
  return {
    accountId:   u.id,
    accountName: u.mail ?? u.userPrincipalName ?? u.id,
    metadata:    { display_name: u.displayName ?? null },
  };
}
