// Refresh balances for every Plaid Item the user has connected, then
// return the joined bank_accounts list. Mirrors the Teller route's
// shape so the UI can fan out to either provider with the same code.
//
// DELETE handler also mirrors Teller's: with ?id=… removes one
// account (and the parent Item if it was the last one); without
// removes every Plaid integration.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  plaidPost,
  PlaidNotConfiguredError,
  type PlaidAccountsResponse,
  type PlaidErrorBody,
} from "@/lib/integrations/plaid";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integrations } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "plaid");

  if (!integrations?.length) return NextResponse.json({ accounts: [] });

  const allAccounts: unknown[] = [];

  for (const integration of integrations) {
    const accessToken = integration.access_token;
    if (!accessToken) continue;

    // Try to refresh balances. Don't let a single failed Item wipe the
    // cached rows from the response — log and fall through to the DB
    // read. Same pattern as the Teller route.
    let acctRes: { res: Response; json: PlaidAccountsResponse & PlaidErrorBody } | null = null;
    try {
      acctRes = await plaidPost<PlaidAccountsResponse & PlaidErrorBody>(
        "/accounts/get",
        { access_token: accessToken },
      );
    } catch (e) {
      if (e instanceof PlaidNotConfiguredError) {
        return NextResponse.json({ error: e.message }, { status: 503 });
      }
      console.error("[plaid/accounts] refresh failed for integration", integration.id, e);
    }

    if (acctRes?.res.ok && acctRes.json.accounts) {
      const now = new Date().toISOString();
      for (const acct of acctRes.json.accounts) {
        await supabase.from("bank_accounts")
          .update({
            balance_available:  acct.balances.available,
            balance_current:    acct.balances.current,
            balance_updated_at: now,
          })
          .eq("user_id", user.id)
          .eq("provider", "plaid")
          .eq("external_id", acct.account_id);
      }
    } else if (acctRes && !acctRes.res.ok) {
      console.error("[plaid/accounts] /accounts/get returned non-OK", acctRes.res.status, acctRes.json);
    }

    const { data: dbAccounts } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("integration_id", integration.id);
    if (dbAccounts) allAccounts.push(...dbAccounts);
  }

  await supabase.from("integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("provider", "plaid");

  return NextResponse.json({ accounts: allAccounts });
}

// Same shape as the Teller DELETE: ?id=… removes one account (and the
// parent Item if it was the last one); without removes every Plaid
// integration. Plaid recommends calling /item/remove when discarding
// an Item so the Item is invalidated on Plaid's side too — we do that
// best-effort but don't gate the local delete on it.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("id");

  async function removePlaidItem(integrationId: string) {
    const { data: intg } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", user!.id)
      .maybeSingle();
    if (intg?.access_token) {
      try {
        await plaidPost("/item/remove", { access_token: intg.access_token });
      } catch (e) {
        console.error("[plaid/accounts] /item/remove failed (continuing with local delete)", e);
      }
    }
    await supabase.from("integrations").delete().eq("id", integrationId).eq("user_id", user!.id);
  }

  if (accountId) {
    const { data: acct } = await supabase
      .from("bank_accounts")
      .select("integration_id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });

    await supabase.from("bank_transactions").delete().eq("user_id", user.id).eq("bank_account_id", accountId);
    await supabase.from("bank_accounts").delete().eq("id", accountId).eq("user_id", user.id);

    if (acct.integration_id) {
      const { count } = await supabase
        .from("bank_accounts")
        .select("*", { count: "exact", head: true })
        .eq("integration_id", acct.integration_id);
      if ((count ?? 0) === 0) {
        await removePlaidItem(acct.integration_id);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Full disconnect — every Plaid Item.
  const { data: integrations } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "plaid");
  for (const intg of integrations ?? []) {
    await removePlaidItem(intg.id);
  }
  return NextResponse.json({ ok: true });
}
