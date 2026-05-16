// Complete the unified Google OAuth flow: validate state, exchange the
// code for tokens, identify the connected account, upsert the row, and
// write tokens to the vault via the SECURITY DEFINER RPCs.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleAdapter } from "@/lib/integrations/google";
import { upsertIntegrationRow, writeTokens } from "@/lib/integrations/storage";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_google";
const NEXT_COOKIE  = "pn_oauth_next_google";

function settingsUrl(origin: string, params: Record<string, string>): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section", "integrations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  try {
    return await handle(req, url, origin);
  } catch (err) {
    // Last-resort safety net so the user gets a readable error in the
    // Settings UI instead of a generic 500. Logged for Vercel function
    // logs to debug.
    console.error("[/api/auth/google/callback] unexpected error:", err);
    return NextResponse.redirect(settingsUrl(origin, {
      provider: "google",
      error:    "callback_failed",
    }));
  }
}

async function handle(req: Request, url: URL, origin: string) {
  const code   = url.searchParams.get("code");
  const state  = url.searchParams.get("state");
  const error  = url.searchParams.get("error");

  // ── Provider-side error (user denied, scope rejected, …) ──────────
  if (error) {
    return NextResponse.redirect(settingsUrl(origin, {
      provider: "google",
      error,
    }));
  }

  if (!code || !state) {
    return NextResponse.redirect(settingsUrl(origin, {
      provider: "google",
      error:    "missing_code_or_state",
    }));
  }

  // ── CSRF: verify state matches the cookie we set in the start route ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/settings", req.url));
  }

  const cookieState = req.headers.get("cookie")?.match(
    new RegExp(`${STATE_COOKIE}=([^;]+)`),
  )?.[1];
  const nextPath = req.headers.get("cookie")?.match(
    new RegExp(`${NEXT_COOKIE}=([^;]+)`),
  )?.[1];

  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(settingsUrl(origin, {
      provider: "google",
      error:    "state_mismatch",
    }));
  }

  // ── Exchange the code for tokens + identify the account ──────────
  const redirectUri = `${origin}/api/auth/google/callback`;

  let exchange;
  try {
    exchange = await googleAdapter.exchangeCode({ code, redirectUri });
  } catch (e) {
    console.error("[oauth/google/callback] exchangeCode failed:", e);
    return NextResponse.redirect(settingsUrl(origin, {
      provider: "google",
      error:    "exchange_failed",
    }));
  }

  const { tokens, account } = exchange;

  // The Google `scope` field returned with the token tells us which
  // sub-scopes the user actually granted (they can opt-out of
  // individual scopes during consent on some screens). We mirror that
  // into our integration.scopes so the sync workers don't ask for
  // capabilities the user denied.
  const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);
  const has = (s: string) => grantedScopes.includes(s);
  const enabledSubScopes: Record<string, boolean> = {
    identity: true,
    gmail:    has("https://www.googleapis.com/auth/gmail.readonly"),
    calendar: has("https://www.googleapis.com/auth/calendar.readonly"),
    contacts: has("https://www.googleapis.com/auth/contacts.readonly"),
    // App-level: opt-in to full-body storage is OFF by default, user
    // turns it on from Settings after connecting.
    store_email_bodies: false,
  };

  let row;
  try {
    row = await upsertIntegrationRow({
      userId:   user.id,
      provider: "google",
      account,
      scopes:   enabledSubScopes,
      metadata: { granted_scopes: grantedScopes },
    });
    await writeTokens(row.id, tokens);
  } catch (e) {
    console.error("[oauth/google/callback] storage failed:", e);
    return NextResponse.redirect(settingsUrl(origin, {
      provider: "google",
      error:    "storage_failed",
    }));
  }

  // ── Success: clear OAuth cookies, redirect ──────────────────────
  const destination = nextPath
    ? new URL(decodeURIComponent(nextPath), origin).toString()
    : settingsUrl(origin, { provider: "google", connected: "1" });

  const res = NextResponse.redirect(destination);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
  return res;
}
