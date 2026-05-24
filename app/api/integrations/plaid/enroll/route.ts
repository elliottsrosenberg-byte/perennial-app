// Exchange Plaid Link's public_token for a long-lived access_token,
// fetch the accounts the user selected, and persist them.
//
// Plaid Link runs entirely in the browser and returns:
//   public_token        — single-use, ~30-min TTL
//   metadata.institution.name, metadata.institution.institution_id
//   metadata.accounts[] — only the accounts the user picked in Link's
//                         account selector. We use this list to filter
//                         the /accounts/get response so we don't import
//                         everything the institution has.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  plaidPost,
  PlaidNotConfiguredError,
  plaidEnv,
  type PlaidAccountsResponse,
  type PlaidPublicTokenExchangeResponse,
  type PlaidErrorBody,
} from "@/lib/integrations/plaid";

export const runtime = "nodejs";

interface Body {
  public_token?:     string;
  institution_name?: string;
  institution_id?:   string | null;
  accounts?:         { id: string; name?: string; mask?: string }[];
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.public_token) {
    return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
  }
  const institutionName = body.institution_name ?? "Bank";
  const pickedIds       = new Set((body.accounts ?? []).map(a => a.id));

  try {
    // 1) Exchange public_token → access_token + item_id.
    const exchange = await plaidPost<PlaidPublicTokenExchangeResponse & PlaidErrorBody>(
      "/item/public_token/exchange",
      { public_token: body.public_token },
    );
    if (!exchange.res.ok) {
      console.error("[plaid/enroll] exchange failed", exchange.res.status, exchange.json);
      return NextResponse.json(
        { error: exchange.json.error_message ?? `Plaid exchange failed (${exchange.res.status})` },
        { status: 502 },
      );
    }
    const accessToken = exchange.json.access_token;
    const itemId      = exchange.json.item_id;

    // 2) Pull the account list. Plaid returns every account on the
    //    Item; we filter to the user's picks (if any were provided).
    const acctRes = await plaidPost<PlaidAccountsResponse & PlaidErrorBody>(
      "/accounts/get",
      { access_token: accessToken },
    );
    if (!acctRes.res.ok) {
      console.error("[plaid/enroll] accounts/get failed", acctRes.res.status, acctRes.json);
      return NextResponse.json(
        { error: acctRes.json.error_message ?? `Plaid accounts/get failed (${acctRes.res.status})` },
        { status: 502 },
      );
    }
    const allAccounts = acctRes.json.accounts ?? [];
    const accounts    = pickedIds.size > 0
      ? allAccounts.filter(a => pickedIds.has(a.account_id))
      : allAccounts;

    // 3) Upsert the integration row. account_id (our column) carries
    //    Plaid's item_id so a re-enrollment of the same institution
    //    updates instead of duplicating.
    const env = plaidEnv();
    const { data: integration, error: intErr } = await supabase
      .from("integrations")
      .upsert({
        user_id:        user.id,
        provider:       "plaid",
        account_id:     itemId,
        account_name:   institutionName,
        access_token:   accessToken,
        metadata: {
          item_id:        itemId,
          institution:    institutionName,
          institution_id: body.institution_id ?? null,
          environment:    env,
        },
        connected_at:   new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider,account_id" })
      .select()
      .single();
    if (intErr || !integration) {
      console.error("[plaid/enroll] integration upsert failed", intErr);
      return NextResponse.json({ error: intErr?.message ?? "Failed to store integration" }, { status: 500 });
    }

    // 4) Upsert the per-account rows.
    const accountRows = accounts.map(a => ({
      user_id:        user.id,
      integration_id: integration.id,
      provider:       "plaid",
      external_id:    a.account_id,
      institution:    institutionName,
      name:           a.official_name ?? a.name,
      type:           a.type,
      subtype:        a.subtype ?? "",
      last_four:      a.mask ?? "",
      currency:       a.balances.iso_currency_code ?? "USD",
      balance_available: a.balances.available,
      balance_current:   a.balances.current,
      balance_updated_at: new Date().toISOString(),
    }));

    const { data: bankAccounts, error: baErr } = await supabase
      .from("bank_accounts")
      .upsert(accountRows, { onConflict: "user_id,provider,external_id" })
      .select();

    if (baErr) {
      console.error("[plaid/enroll] bank_accounts upsert failed", baErr);
    }

    return NextResponse.json({ ok: true, accounts: bankAccounts ?? [] });
  } catch (e) {
    if (e instanceof PlaidNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[plaid/enroll] unexpected error", msg, e);
    return NextResponse.json({ error: `Plaid enroll failed: ${msg}` }, { status: 502 });
  }
}
