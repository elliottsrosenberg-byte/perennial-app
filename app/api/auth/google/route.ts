// Start the unified Google OAuth flow (Gmail + Calendar + Contacts +
// identity). The user must already be signed in to Perennial — we need
// their auth.uid() to attribute the integration row in the callback.
//
// The callback URL registered in Google Cloud Console is:
//   http://localhost:3000/api/auth/google/callback   (dev)
//   https://app.perennial.design/api/auth/google/callback   (prod)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleAdapter } from "@/lib/integrations/google";
import { resolveUpstreamScopes } from "@/lib/integrations/registry";

// Explicit Node.js runtime — matches the project convention for routes
// that touch the database, and avoids any Edge-runtime ambiguity that
// could trip up env-var access or Web APIs.
export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_google";
const NEXT_COOKIE  = "pn_oauth_next_google";
const COOKIE_TTL_S = 10 * 60; // 10 minutes — should be plenty for any consent screen

function settingsErrorUrl(origin: string, error: string): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section",  "integrations");
  url.searchParams.set("provider", "google");
  url.searchParams.set("error",    error);
  return url.toString();
}

/** Web-Crypto nonce — works in both Node.js and Edge runtimes. */
function generateState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  try {
    // Fail-fast with a readable redirect if the OAuth credentials aren't
    // configured in this environment — matches how the existing
    // /api/auth/google-calendar route surfaces this (was returning a
    // generic 500 before).
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      return NextResponse.redirect(settingsErrorUrl(appUrl, "client_id_not_configured"));
    }
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.redirect(settingsErrorUrl(appUrl, "client_secret_not_configured"));
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login?next=/settings", req.url));
    }

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

    const state = generateState();
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
  } catch (err) {
    // Last-resort safety net so the user gets a readable error in the
    // Settings UI instead of a generic 500. The error is logged so we
    // can find it in Vercel function logs.
    console.error("[/api/auth/google] unexpected error:", err);
    return NextResponse.redirect(settingsErrorUrl(appUrl, "start_failed"));
  }
}
