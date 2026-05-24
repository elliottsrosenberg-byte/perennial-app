import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tellerFetch, TellerNotConfiguredError } from "@/lib/integrations/teller";

export const runtime = "nodejs";

// Refresh balances for all connected bank accounts
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all Teller integrations for this user
  const { data: integrations } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "teller");

  if (!integrations?.length) {
    return NextResponse.json({ accounts: [] });
  }

  const allAccounts: BankAccountRow[] = [];

  for (const integration of integrations) {
    const accessToken = integration.access_token;
    if (!accessToken) continue;

    // Try to refresh balances from Teller. A failure here (expired
    // enrollment, transient 5xx, etc.) must NOT make the integration's
    // cached accounts disappear from the UI — previously a single bad
    // call wiped every account belonging to that integration. We log
    // the failure and fall through to the cached DB read.
    let accountsRes: Response | null = null;
    try {
      accountsRes = await tellerFetch("/accounts", accessToken);
    } catch (e) {
      if (e instanceof TellerNotConfiguredError) {
        return NextResponse.json({ error: e.message }, { status: 503 });
      }
      console.error("[teller/accounts] refresh failed for integration", integration.id, e);
    }

    if (accountsRes?.ok) {
      const tellerAccounts = await accountsRes.json() as TellerAccount[];

      const accountsWithBalances = await Promise.all(
        tellerAccounts.map(async (acct) => {
          try {
            const balRes = await tellerFetch(`/accounts/${acct.id}/balances`, accessToken);
            const bal = balRes.ok ? await balRes.json() as TellerBalance : null;
            return { ...acct, balance: bal };
          } catch {
            return { ...acct, balance: null };
          }
        })
      );

      const now = new Date().toISOString();
      for (const acct of accountsWithBalances) {
        if (acct.balance) {
          await supabase.from("bank_accounts")
            .update({
              balance_available: parseFloat(acct.balance.available ?? "0"),
              balance_current:   parseFloat(acct.balance.ledger ?? "0"),
              balance_updated_at: now,
            })
            .eq("user_id", user.id)
            .eq("teller_id", acct.id);
        }
      }
    }

    // Always return the cached DB rows for this integration — refreshed
    // or not — so the UI shows what's connected even when Teller's API
    // is misbehaving.
    const { data: dbAccounts } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("integration_id", integration.id);

    if (dbAccounts) allAccounts.push(...dbAccounts);
  }

  // Update last_synced_at
  await supabase.from("integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("provider", "teller");

  return NextResponse.json({ accounts: allAccounts });
}

// Disconnect Teller. Without ?id= this clears everything. With ?id= it
// removes just one bank_account (and any orphan integration that
// covered only that account, so a half-emptied enrollment doesn't leak
// a useless OAuth-style token row).
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("id");

  if (accountId) {
    // Single-account removal. We look up the integration_id first so we
    // can clean it up if this was the integration's last account.
    const { data: acct } = await supabase
      .from("bank_accounts")
      .select("integration_id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });

    // Transactions cascade via the bank_account_id FK; if the constraint
    // doesn't, an explicit delete keeps the table tidy.
    await supabase.from("bank_transactions").delete().eq("user_id", user.id).eq("bank_account_id", accountId);
    await supabase.from("bank_accounts").delete().eq("id", accountId).eq("user_id", user.id);

    if (acct.integration_id) {
      const { count } = await supabase
        .from("bank_accounts")
        .select("*", { count: "exact", head: true })
        .eq("integration_id", acct.integration_id);
      if ((count ?? 0) === 0) {
        await supabase.from("integrations").delete().eq("id", acct.integration_id).eq("user_id", user.id);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Full disconnect — drop every Teller integration. Cascades handle
  // bank_accounts + bank_transactions on the FK side.
  await supabase.from("integrations").delete().eq("user_id", user.id).eq("provider", "teller");
  return NextResponse.json({ ok: true });
}

interface TellerAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  last_four: string;
  currency: string;
}

interface TellerBalance {
  available: string;
  ledger: string;
}

interface BankAccountRow {
  id: string;
  teller_id: string;
  institution: string;
  name: string;
  type: string;
  subtype: string;
  last_four: string;
  balance_available: number | null;
  balance_current: number | null;
  balance_updated_at: string | null;
}
