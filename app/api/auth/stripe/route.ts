// Start the Stripe Connect OAuth flow.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripeAdapter } from "@/lib/integrations/stripe";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_stripe";
const NEXT_COOKIE  = "pn_oauth_next_stripe";
const COOKIE_TTL_S = 10 * 60;

function settingsErrorUrl(origin: string, error: string): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section",  "integrations");
  url.searchParams.set("provider", "stripe");
  url.searchParams.set("error",    error);
  return url.toString();
}

function generateState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function GET(req: Request) {
  const appUrl = appOrigin(req);
  try {
    if (!process.env.STRIPE_CONNECT_CLIENT_ID)
      return NextResponse.redirect(settingsErrorUrl(appUrl, "client_id_not_configured"));
    if (!process.env.STRIPE_SECRET_KEY)
      return NextResponse.redirect(settingsErrorUrl(appUrl, "client_secret_not_configured"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login?next=/settings?section=integrations", req.url));

    const redirectUri = `${appUrl}/api/auth/stripe/callback`;
    // v1 = read_only: balance, recent charges, payouts. Switch to
    // read_write later when we want to programmatically issue invoices
    // / charges on behalf of the connected account.
    const scopes = ["read_only"];

    const state     = generateState();
    const nextParam = new URL(req.url).searchParams.get("next");
    const url       = stripeAdapter.getAuthUrl({
      state, redirectUri, scopes,
      options: user.email ? { "stripe_user[email]": user.email } : undefined,
    });

    const res = NextResponse.redirect(url);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true, sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
      path:     "/", maxAge: COOKIE_TTL_S,
    });
    if (nextParam) {
      res.cookies.set(NEXT_COOKIE, nextParam, {
        httpOnly: true, sameSite: "lax",
        secure:   process.env.NODE_ENV === "production",
        path:     "/", maxAge: COOKIE_TTL_S,
      });
    }
    return res;
  } catch (err) {
    console.error("[/api/auth/stripe] unexpected error:", err);
    return NextResponse.redirect(settingsErrorUrl(appUrl, "start_failed"));
  }
}
