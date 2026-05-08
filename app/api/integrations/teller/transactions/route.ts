import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fetch and cache recent transactions for all connected accounts
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integrations } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "teller");

  if (!integrations?.length) return NextResponse.json({ transactions: [] });

  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("user_id", user.id);

  if (!bankAccounts?.length) return NextResponse.json({ transactions: [] });

  for (const integration of integrations) {
    const accessToken = integration.access_token;
    if (!accessToken) continue;

    const integrationAccounts = bankAccounts.filter(a => a.integration_id === integration.id);

    for (const account of integrationAccounts) {
      try {
        const txRes = await fetch(
          `https://api.teller.io/accounts/${account.teller_id}/transactions?count=50`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
            },
          }
        );
        if (!txRes.ok) continue;

        const txList = await txRes.json() as TellerTransaction[];
        const rows = txList.map(tx => ({
          user_id:         user.id,
          bank_account_id: account.id,
          teller_id:       tx.id,
          amount:          parseFloat(tx.amount),
          type:            parseFloat(tx.amount) > 0 ? "credit" : "debit",
          description:     tx.description,
          details:         tx.details ?? {},
          date:            tx.date,
          status:          tx.status,
        }));

        await supabase.from("bank_transactions")
          .upsert(rows, { onConflict: "user_id,teller_id" });
      } catch {
        // Continue on individual account failure
      }
    }
  }

  const { data: transactions } = await supabase
    .from("bank_transactions")
    .select("*, bank_account:bank_accounts(name, institution, last_four)")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(100);

  return NextResponse.json({ transactions: transactions ?? [] });
}

interface TellerTransaction {
  id: string;
  amount: string;
  description: string;
  date: string;
  status: string;
  details?: Record<string, unknown>;
}
