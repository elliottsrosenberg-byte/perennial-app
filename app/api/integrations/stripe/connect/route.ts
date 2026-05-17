// Connect a Stripe account by pasting a Restricted API key. Validates
// the key against /v1/account, then upserts an integrations row and
// stores the key encrypted in the vault.
//
// We use a restricted key (rk_xxx or sk_xxx with limited scopes)
// rather than full Stripe Connect OAuth because Perennial is a
// per-user tool reading the user's own Stripe account — not a
// platform onboarding third-party sellers. Connect would be wrong
// and require platform review.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertIntegrationRow } from "@/lib/integrations/storage";
import { setIntegrationSecret } from "@/lib/integrations/vault";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body;
  try {
    body = await req.json() as { api_key?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const apiKey = body.api_key?.trim();
  if (!apiKey) return NextResponse.json({ error: "api_key_required" }, { status: 400 });

  // Stripe restricted keys start with rk_, secret keys with sk_.
  // Reject anything else (especially publishable pk_ keys, which
  // would be a security mistake for the user to send us).
  if (!/^(rk|sk)_(test|live)_/.test(apiKey)) {
    return NextResponse.json({
      error: "invalid_key_format",
      hint:  "Expected a Stripe Restricted API key (rk_test_… / rk_live_…) or Secret key (sk_…). Publishable keys (pk_…) won't work.",
    }, { status: 400 });
  }

  // Validate by hitting /v1/account. This also gives us the account
  // id + business name for the connection label.
  const accountRes = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!accountRes.ok) {
    const detail = await accountRes.text().catch(() => "");
    return NextResponse.json({
      error: "stripe_rejected_key",
      status: accountRes.status,
      // Strip Stripe's response body to a short hint — full body
      // could leak account-related info if logged.
      hint:   accountRes.status === 401
        ? "Stripe rejected the key. Double-check you pasted the full value."
        : `Stripe returned ${accountRes.status}. Detail: ${detail.slice(0, 120)}`,
    }, { status: 400 });
  }
  const account = await accountRes.json() as {
    id:                string;
    email?:            string;
    business_profile?: { name?: string };
    settings?:         { dashboard?: { display_name?: string } };
    country?:          string;
    default_currency?: string;
  };

  const accountName =
    account.business_profile?.name ??
    account.settings?.dashboard?.display_name ??
    account.email ??
    account.id;

  // Detect livemode from the key prefix (sk_live_/rk_live_ vs _test_).
  const livemode = /_live_/.test(apiKey);

  const row = await upsertIntegrationRow({
    userId:   user.id,
    provider: "stripe",
    account:  { accountId: account.id, accountName },
    scopes:   { balance: true, charges: true, payouts: true, invoices: true },
    metadata: {
      key_type:         apiKey.startsWith("rk_") ? "restricted" : "secret",
      livemode,
      country:          account.country ?? null,
      default_currency: account.default_currency ?? null,
    },
  });

  await setIntegrationSecret(row.id, "access_token", apiKey);

  return NextResponse.json({ ok: true, integration_id: row.id });
}
