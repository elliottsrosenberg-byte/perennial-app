// Stripe Connect OAuth adapter — the user authorizes Perennial to read
// (and optionally write) on behalf of their Stripe account. Standard
// Connect flow: redirect to connect.stripe.com → exchange code at
// connect.stripe.com/oauth/token → use the returned access_token as a
// Bearer for api.stripe.com on behalf of the connected account.

import type { OAuthProviderAdapter, OAuthTokenSet, ConnectedAccount } from "./types";

const AUTH_URL  = "https://connect.stripe.com/oauth/v2/authorize";
const TOKEN_URL = "https://connect.stripe.com/oauth/token";
const ACCOUNT_URL = "https://api.stripe.com/v1/account";

function clientId(): string {
  // Stripe Connect Client ID, ca_xxx. Found in the Connect dashboard
  // under Settings → Platform → Connect Client ID. Different from the
  // platform's secret key.
  const id = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!id) throw new Error("STRIPE_CONNECT_CLIENT_ID is not set");
  return id;
}

function secretKey(): string {
  // The platform secret key (sk_test_... or sk_live_...). Used to
  // exchange the OAuth code at connect.stripe.com/oauth/token.
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
  return k;
}

export const stripeAdapter: OAuthProviderAdapter = {
  id: "stripe",

  getAuthUrl({ state, redirectUri, scopes, options }) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id:     clientId(),
      redirect_uri:  redirectUri,
      // Stripe Connect accepts "read_only" or "read_write". Default to
      // read_only — v1 only surfaces balance + recent payments.
      scope:         scopes[0] ?? "read_only",
      state,
      ...(options ?? {}),
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode({ code }) {
    // Stripe's token endpoint authenticates the request with the
    // platform secret key (NOT the OAuth client_secret pattern most
    // providers use). Submit code as a form param.
    const form = new URLSearchParams({
      client_secret: secretKey(),
      code,
      grant_type:    "authorization_code",
    });

    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Stripe token exchange failed (${res.status}): ${text}`);
    }
    const payload = await res.json() as {
      access_token:       string;
      refresh_token?:     string;
      stripe_user_id:     string;   // acct_xxx — the connected account
      stripe_publishable_key?: string;
      token_type?:        string;
      scope?:             string;
      livemode?:          boolean;
    };

    const tokens: OAuthTokenSet = {
      accessToken:  payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      // Stripe Connect tokens don't expire. Set expiresAt null so our
      // refresh helper doesn't try to refresh prematurely.
      expiresAt:    null,
      scope:        payload.scope ?? null,
    };

    const account = await fetchAccountIdentity(payload.access_token, payload.stripe_user_id);
    // Stash the publishable key + livemode + stripe_user_id so the
    // Finance module can use them later for charges/payouts.
    account.metadata = {
      ...(account.metadata ?? {}),
      stripe_user_id:    payload.stripe_user_id,
      publishable_key:   payload.stripe_publishable_key ?? null,
      livemode:          payload.livemode ?? false,
    };

    return { tokens, account };
  },

  async refreshTokens(refreshToken: string) {
    const form = new URLSearchParams({
      client_secret: secretKey(),
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    });
    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Stripe token refresh failed (${res.status}): ${text}`);
    }
    const payload = await res.json() as { access_token: string; refresh_token?: string };
    return {
      accessToken:  payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      expiresAt:    null,
      scope:        null,
    };
  },
};

async function fetchAccountIdentity(accessToken: string, fallbackId: string): Promise<ConnectedAccount> {
  // GET /v1/account with the connected account's secret key returns
  // their business profile + email so we can label the connection.
  const res = await fetch(ACCOUNT_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    // Non-fatal — fall back to the stripe_user_id we already have.
    return { accountId: fallbackId, accountName: fallbackId };
  }
  const a = await res.json() as {
    id:             string;
    email?:         string;
    business_profile?: { name?: string };
    settings?:      { dashboard?: { display_name?: string } };
  };
  return {
    accountId:   a.id,
    accountName:
      a.business_profile?.name ??
      a.settings?.dashboard?.display_name ??
      a.email ??
      a.id,
  };
}
