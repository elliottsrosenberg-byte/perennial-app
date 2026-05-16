// Complete the Microsoft 365 OAuth flow. Mirror of the Google callback
// — validate state, exchange code via the adapter, upsert integration
// row, encrypt tokens into vault, redirect to Settings.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { microsoftAdapter } from "@/lib/integrations/microsoft";
import { upsertIntegrationRow, writeTokens } from "@/lib/integrations/storage";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_microsoft";
const NEXT_COOKIE  = "pn_oauth_next_microsoft";

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
    console.error("[/api/auth/microsoft/callback] unexpected error:", err);
    return NextResponse.redirect(settingsUrl(origin, { provider: "microsoft", error: "callback_failed" }));
  }
}

async function handle(req: Request, url: URL, origin: string) {
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(settingsUrl(origin, { provider: "microsoft", error }));
  }
  if (!code || !state) {
    return NextResponse.redirect(settingsUrl(origin, { provider: "microsoft", error: "missing_code_or_state" }));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", req.url));

  const cookieState = req.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  const nextPath    = req.headers.get("cookie")?.match(new RegExp(`${NEXT_COOKIE}=([^;]+)`))?.[1];
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(settingsUrl(origin, { provider: "microsoft", error: "state_mismatch" }));
  }

  const redirectUri = `${origin}/api/auth/microsoft/callback`;

  let exchange;
  try {
    exchange = await microsoftAdapter.exchangeCode({ code, redirectUri });
  } catch (e) {
    console.error("[microsoft/callback] exchangeCode failed:", e);
    return NextResponse.redirect(settingsUrl(origin, { provider: "microsoft", error: "exchange_failed" }));
  }

  const { tokens, account } = exchange;

  // Microsoft returns granted scopes in the `scope` field. Mirror to
  // sub-scope flags so the sync workers honor the user's choices.
  const grantedScopes = (tokens.scope ?? "").split(" ").filter(Boolean);
  const has = (s: string) => grantedScopes.includes(s);
  const enabledSubScopes: Record<string, boolean> = {
    identity: true,
    mail:     has("Mail.Read")      || has("https://graph.microsoft.com/Mail.Read"),
    calendar: has("Calendars.Read") || has("https://graph.microsoft.com/Calendars.Read"),
    contacts: has("Contacts.Read")  || has("https://graph.microsoft.com/Contacts.Read"),
    store_email_bodies: false,
  };

  let row;
  try {
    row = await upsertIntegrationRow({
      userId:   user.id,
      provider: "microsoft",
      account,
      scopes:   enabledSubScopes,
      metadata: { granted_scopes: grantedScopes },
    });
    await writeTokens(row.id, tokens);
  } catch (e) {
    console.error("[microsoft/callback] storage failed:", e);
    return NextResponse.redirect(settingsUrl(origin, { provider: "microsoft", error: "storage_failed" }));
  }

  const destination = nextPath
    ? new URL(decodeURIComponent(nextPath), origin).toString()
    : settingsUrl(origin, { provider: "microsoft", connected: "1" });

  const res = NextResponse.redirect(destination);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
  return res;
}
