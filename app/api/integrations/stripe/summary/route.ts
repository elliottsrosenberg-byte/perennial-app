// Summary view of the user's Stripe account — balance + recent charges +
// recent payouts. Reads the restricted/secret API key from the vault
// (stored when the user connected Stripe in Settings → Integrations) and
// fans out to Stripe's REST API server-side so the key never touches the
// client.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readIntegrationSecret } from "@/lib/integrations/vault";

export const runtime = "nodejs";

interface StripeBalanceEntry { amount: number; currency: string }
interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  description: string | null;
  receipt_email: string | null;
  created: number;
}
interface StripePayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  created: number;
  method: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, account_name, metadata, status, last_synced_at")
    .eq("user_id", user.id)
    .eq("provider", "stripe")
    .eq("status", "active")
    .maybeSingle();

  if (!integration) return NextResponse.json({ connected: false });

  const apiKey = await readIntegrationSecret(integration.id, "access_token");
  if (!apiKey) return NextResponse.json({ connected: false });

  const headers = { Authorization: `Bearer ${apiKey}` };
  const [balanceRes, chargesRes, payoutsRes] = await Promise.all([
    fetch("https://api.stripe.com/v1/balance",          { headers, cache: "no-store" }),
    fetch("https://api.stripe.com/v1/charges?limit=10", { headers, cache: "no-store" }),
    fetch("https://api.stripe.com/v1/payouts?limit=10", { headers, cache: "no-store" }),
  ]);

  if (!balanceRes.ok || !chargesRes.ok || !payoutsRes.ok) {
    return NextResponse.json({
      connected: true,
      error: "stripe_fetch_failed",
      status: { balance: balanceRes.status, charges: chargesRes.status, payouts: payoutsRes.status },
    }, { status: 502 });
  }

  const balance = await balanceRes.json() as { available?: StripeBalanceEntry[]; pending?: StripeBalanceEntry[] };
  const charges = await chargesRes.json() as { data?: StripeCharge[] };
  const payouts = await payoutsRes.json() as { data?: StripePayout[] };

  const meta = (integration.metadata ?? {}) as { livemode?: boolean; default_currency?: string | null };

  return NextResponse.json({
    connected:       true,
    accountName:     integration.account_name,
    livemode:        meta.livemode ?? false,
    defaultCurrency: meta.default_currency ?? null,
    balance: {
      available: balance.available ?? [],
      pending:   balance.pending ?? [],
    },
    charges: charges.data ?? [],
    payouts: payouts.data ?? [],
  });
}
