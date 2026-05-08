import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Fetch accounts from Teller
    const accountsRes = await fetch("https://api.teller.io/accounts", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
      },
    });
    if (!accountsRes.ok) continue;

    const tellerAccounts = await accountsRes.json() as TellerAccount[];

    // Fetch balances for each account in parallel
    const accountsWithBalances = await Promise.all(
      tellerAccounts.map(async (acct) => {
        try {
          const balRes = await fetch(`https://api.teller.io/accounts/${acct.id}/balances`, {
            headers: {
              Authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
            },
          });
          const bal = balRes.ok ? await balRes.json() as TellerBalance : null;
          return { ...acct, balance: bal };
        } catch {
          return { ...acct, balance: null };
        }
      })
    );

    // Update balances in DB
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

    // Fetch updated accounts from DB
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

// Disconnect all Teller accounts
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
