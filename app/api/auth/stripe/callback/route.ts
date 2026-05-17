// Complete the Stripe Connect OAuth flow.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripeAdapter } from "@/lib/integrations/stripe";
import { upsertIntegrationRow, writeTokens } from "@/lib/integrations/storage";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_stripe";
const NEXT_COOKIE  = "pn_oauth_next_stripe";

function settingsUrl(origin: string, params: Record<string, string>): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const origin = appOrigin(req);
  try {
    return await handle(req, url, origin);
  } catch (err) {
    console.error("[/api/auth/stripe/callback] unexpected error:", err);
    return NextResponse.redirect(settingsUrl(origin, { provider: "stripe", error: "callback_failed" }));
  }
}

async function handle(req: Request, url: URL, origin: string) {
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return NextResponse.redirect(settingsUrl(origin, { provider: "stripe", error }));
  if (!code || !state) {
    return NextResponse.redirect(settingsUrl(origin, { provider: "stripe", error: "missing_code_or_state" }));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings?section=integrations", req.url));

  const cookieState = req.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  const nextPath    = req.headers.get("cookie")?.match(new RegExp(`${NEXT_COOKIE}=([^;]+)`))?.[1];
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(settingsUrl(origin, { provider: "stripe", error: "state_mismatch" }));
  }

  const redirectUri = `${origin}/api/auth/stripe/callback`;

  let exchange;
  try {
    exchange = await stripeAdapter.exchangeCode({ code, redirectUri });
  } catch (e) {
    console.error("[stripe/callback] exchangeCode failed:", e);
    return NextResponse.redirect(settingsUrl(origin, { provider: "stripe", error: "exchange_failed" }));
  }

  const { tokens, account } = exchange;

  let row;
  try {
    row = await upsertIntegrationRow({
      userId:   user.id,
      provider: "stripe",
      account,
      scopes:   { balance: true, charges: true, payouts: true },
      metadata: {},
    });
    await writeTokens(row.id, tokens);
  } catch (e) {
    console.error("[stripe/callback] storage failed:", e);
    return NextResponse.redirect(settingsUrl(origin, { provider: "stripe", error: "storage_failed" }));
  }

  const destination = nextPath
    ? new URL(decodeURIComponent(nextPath), origin).toString()
    : settingsUrl(origin, { provider: "stripe", connected: "1" });

  const res = NextResponse.redirect(destination);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
  return res;
}
