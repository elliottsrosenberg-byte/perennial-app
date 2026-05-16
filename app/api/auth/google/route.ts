// Start the unified Google OAuth flow (Gmail + Calendar + Contacts +
// identity). The user must already be signed in to Perennial — we need
// their auth.uid() to attribute the integration row in the callback.
//
// The callback URL registered in Google Cloud Console is:
//   http://localhost:3000/api/auth/google/callback   (dev)
//   https://app.perennial.design/api/auth/google/callback   (prod)

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { googleAdapter } from "@/lib/integrations/google";
import { resolveUpstreamScopes } from "@/lib/integrations/registry";

const STATE_COOKIE = "pn_oauth_state_google";
const NEXT_COOKIE  = "pn_oauth_next_google";
const COOKIE_TTL_S = 10 * 60; // 10 minutes — should be plenty for any consent screen

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings", req.url));
  }

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  // First connect requests every sub-scope; the user can later turn
  // individual sub-features off from Settings → Integrations. This
  // matches Google's recommendation: ask once at consent time so we
  // don't have to send the user back through OAuth if they later
  // enable a feature.
  const scopes = resolveUpstreamScopes("google", {
    gmail:    true,
    calendar: true,
    contacts: true,
  });

  const state = randomBytes(24).toString("base64url");

  const nextParam = new URL(req.url).searchParams.get("next");

  const url = googleAdapter.getAuthUrl({
    state,
    redirectUri,
    scopes,
    // login_hint nudges Google to default the account picker to the
    // signed-in Perennial email (helpful when the user has multiple
    // Google accounts in their browser).
    options: user.email ? { login_hint: user.email } : undefined,
  });

  const res = NextResponse.redirect(url);
  // httpOnly + sameSite=lax: lax lets the cookie ride along on the
  // top-level redirect back from accounts.google.com (which is what
  // OAuth callbacks are). Strict would drop it.
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    path:     "/",
    maxAge:   COOKIE_TTL_S,
  });
  if (nextParam) {
    res.cookies.set(NEXT_COOKIE, nextParam, {
      httpOnly: true,
      sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
      path:     "/",
      maxAge:   COOKIE_TTL_S,
    });
  }
  return res;
}
