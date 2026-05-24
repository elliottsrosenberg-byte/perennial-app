// Plaid API client wrapper.
//
// Plaid uses simple client_id + secret HTTP auth (no mTLS — easier to
// operate than Teller). The same client_id is used in every environment;
// only the secret differs (sandbox / development / production).
//
// Env vars:
//   PLAID_CLIENT_ID — your Plaid client ID (visible in the dashboard).
//   PLAID_SECRET    — environment-specific secret. Use the sandbox
//                     secret when PLAID_ENV=sandbox, etc.
//   PLAID_ENV       — "sandbox" | "development" | "production".
//                     Defaults to "sandbox" so a missing env doesn't
//                     accidentally bill against production.
//
// All routes call `plaidPost(path, body)`. It throws PlaidNotConfiguredError
// if creds are missing so the route can return a clean 503.

const PLAID_HOSTS = {
  sandbox:     "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production:  "https://production.plaid.com",
} as const;

export type PlaidEnv = keyof typeof PLAID_HOSTS;

export class PlaidNotConfiguredError extends Error {
  constructor() {
    super("Plaid not configured (PLAID_CLIENT_ID / PLAID_SECRET).");
    this.name = "PlaidNotConfiguredError";
  }
}

interface Creds { clientId: string; secret: string; env: PlaidEnv; host: string }

function getCreds(): Creds | null {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  if (!clientId || !secret) return null;
  const envName = (process.env.PLAID_ENV ?? "sandbox") as PlaidEnv;
  const env     = envName in PLAID_HOSTS ? envName : "sandbox";
  return { clientId, secret, env, host: PLAID_HOSTS[env] };
}

export function plaidConfigured(): boolean {
  return getCreds() !== null;
}

export function plaidEnv(): PlaidEnv {
  return (getCreds()?.env ?? "sandbox") as PlaidEnv;
}

/** POST to a Plaid endpoint with auth + JSON body. Returns the parsed
 *  JSON response and the raw Response so callers can branch on status.
 *  Throws PlaidNotConfiguredError if env vars aren't set. */
export async function plaidPost<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<{ res: Response; json: T }> {
  const creds = getCreds();
  if (!creds) throw new PlaidNotConfiguredError();
  const res = await fetch(`${creds.host}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: creds.clientId,
      secret:    creds.secret,
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { res, json };
}

// Plaid's typed response shapes — narrow enough for our use; the SDK
// has full types but we don't take a dep on it.

export interface PlaidLinkTokenCreateResponse {
  link_token: string;
  expiration: string;
  request_id: string;
}

export interface PlaidPublicTokenExchangeResponse {
  access_token: string;
  item_id:      string;
  request_id:   string;
}

export interface PlaidAccount {
  account_id:    string;
  name:          string;
  official_name: string | null;
  mask:          string | null;
  type:          string;
  subtype:       string | null;
  balances: {
    available:        number | null;
    current:          number | null;
    iso_currency_code: string | null;
  };
}

export interface PlaidAccountsResponse {
  accounts: PlaidAccount[];
  item: { item_id: string; institution_id: string | null };
  request_id: string;
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id:     string;
  amount:         number;        // Positive = money out (matches Plaid convention)
  date:           string;        // YYYY-MM-DD
  name:           string;
  merchant_name:  string | null;
  pending:        boolean;
  iso_currency_code: string | null;
}

export interface PlaidTransactionsSyncResponse {
  added:       PlaidTransaction[];
  modified:    PlaidTransaction[];
  removed:     { transaction_id: string }[];
  next_cursor: string;
  has_more:    boolean;
  request_id:  string;
}

export interface PlaidErrorBody {
  error_type?:    string;
  error_code?:    string;
  error_message?: string;
  display_message?: string;
}
