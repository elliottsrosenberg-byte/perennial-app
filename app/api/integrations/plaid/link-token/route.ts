// Mint a short-lived Plaid Link token. The browser fetches this on
// "Connect bank" click and feeds it into Plaid.create({ token }).
//
// Returns 503 if Plaid env vars aren't installed, so the BankingTab
// can show a clear "Plaid not configured" instead of a generic
// "fetch failed".

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidPost, PlaidNotConfiguredError, type PlaidLinkTokenCreateResponse, type PlaidErrorBody } from "@/lib/integrations/plaid";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  // Webhook URL is computed from the request so it works in dev,
  // preview, and prod without per-env wiring. The route below handles
  // SYNC_UPDATES_AVAILABLE + ITEM events.
  const webhookUrl = `${url.origin}/api/integrations/plaid/webhook`;

  try {
    const { res, json } = await plaidPost<PlaidLinkTokenCreateResponse & PlaidErrorBody>(
      "/link/token/create",
      {
        user:          { client_user_id: user.id },
        client_name:   "Perennial",
        products:      ["transactions"],
        country_codes: ["US"],
        language:      "en",
        webhook:       webhookUrl,
      },
    );
    if (!res.ok) {
      console.error("[plaid/link-token] create failed", res.status, json);
      return NextResponse.json(
        { error: json.error_message ?? json.display_message ?? `Plaid ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ link_token: json.link_token, expiration: json.expiration });
  } catch (e) {
    if (e instanceof PlaidNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    console.error("[plaid/link-token] unexpected error", e);
    return NextResponse.json({ error: "Failed to create Plaid link token" }, { status: 500 });
  }
}
