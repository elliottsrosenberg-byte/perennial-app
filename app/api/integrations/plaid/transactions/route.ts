// Incrementally sync transactions for every Plaid Item via
// /transactions/sync, then return the cached transactions list. The
// cursor lives on integrations.plaid_cursor so each call only fetches
// what changed since the last sync.
//
// First call (cursor null) backfills the available history (Plaid
// returns ~30d immediately, more as they fetch from the institution
// — the webhook fires SYNC_UPDATES_AVAILABLE when more lands and we
// re-sync on demand).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  plaidPost,
  PlaidNotConfiguredError,
  type PlaidTransactionsSyncResponse,
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

  if (!integrations?.length) return NextResponse.json({ transactions: [] });

  // Cached account-id lookup: Plaid gives us its account_id on each tx
  // but bank_accounts.id (our PK) is what bank_transactions.bank_account_id
  // points at. We resolve via the (provider, external_id) lookup once.
  const { data: bankAccounts } = await supabase
    .from("bank_accounts")
    .select("id, external_id, integration_id")
    .eq("user_id", user.id)
    .eq("provider", "plaid");

  const accountIdByPlaidId = new Map<string, string>();
  for (const ba of bankAccounts ?? []) accountIdByPlaidId.set(ba.external_id, ba.id);

  for (const integration of integrations) {
    const accessToken = integration.access_token;
    if (!accessToken) continue;

    // Walk the sync cursor until has_more=false. We commit after each
    // page so a long backfill makes incremental progress.
    let cursor: string | null = integration.plaid_cursor ?? null;
    let hasMore = true;
    let pages   = 0;
    try {
      while (hasMore && pages < 20) {
        const { res, json } = await plaidPost<PlaidTransactionsSyncResponse & PlaidErrorBody>(
          "/transactions/sync",
          { access_token: accessToken, cursor: cursor ?? undefined, count: 250 },
        );
        if (!res.ok) {
          console.error("[plaid/transactions] sync failed", res.status, json);
          break;
        }
        // Insert/update added + modified.
        const upsertRows = [...json.added, ...json.modified]
          .map((tx) => {
            const bankAccountId = accountIdByPlaidId.get(tx.account_id);
            if (!bankAccountId) return null;
            return {
              user_id:         user.id,
              bank_account_id: bankAccountId,
              provider:        "plaid",
              external_id:     tx.transaction_id,
              // Plaid amounts: positive = money OUT of the account. We
              // store the SIGNED Teller-style value (positive = money
              // IN) so display logic matches across providers. Inverting
              // the sign here keeps BankingTab's existing renderer
              // working unchanged.
              amount:          -tx.amount,
              type:            tx.amount < 0 ? "credit" : "debit",
              description:     tx.merchant_name ?? tx.name,
              // Persist Plaid's enrichment payload so the review queue
              // can show category chips + prefer merchant_name on
              // display. Keep raw shape (snake_case) for forward compat.
              details: {
                merchant_name: tx.merchant_name ?? null,
                personal_finance_category: tx.personal_finance_category ?? null,
                category: tx.category ?? null,
              },
              date:            tx.date,
              status:          tx.pending ? "pending" : "posted",
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (upsertRows.length > 0) {
          await supabase.from("bank_transactions")
            .upsert(upsertRows, { onConflict: "user_id,provider,external_id" });
        }
        // Drop removed transactions.
        if (json.removed.length > 0) {
          await supabase.from("bank_transactions")
            .delete()
            .eq("user_id", user.id)
            .eq("provider", "plaid")
            .in("external_id", json.removed.map(r => r.transaction_id));
        }
        cursor  = json.next_cursor;
        hasMore = json.has_more;
        pages  += 1;
      }
      await supabase.from("integrations")
        .update({ plaid_cursor: cursor, last_synced_at: new Date().toISOString() })
        .eq("id", integration.id);
    } catch (e) {
      if (e instanceof PlaidNotConfiguredError) {
        return NextResponse.json({ error: e.message }, { status: 503 });
      }
      console.error("[plaid/transactions] unexpected error for integration", integration.id, e);
    }
  }

  // Return the joined list, scoped to Plaid so Teller rows (if any
  // linger from a prior connection) don't leak into the Plaid UI.
  const { data: transactions } = await supabase
    .from("bank_transactions")
    .select("*, bank_account:bank_accounts(name, institution, last_four, type, subtype)")
    .eq("user_id", user.id)
    .eq("provider", "plaid")
    .order("date", { ascending: false })
    .limit(100);

  return NextResponse.json({ transactions: transactions ?? [] });
}
