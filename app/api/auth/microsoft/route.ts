// Start the Microsoft 365 OAuth flow. Mirror of /api/auth/google/route.ts
// with Microsoft-specific scope set and adapter.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { microsoftAdapter } from "@/lib/integrations/microsoft";
import { resolveUpstreamScopes } from "@/lib/integrations/registry";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_microsoft";
const NEXT_COOKIE  = "pn_oauth_next_microsoft";
const COOKIE_TTL_S = 10 * 60;

function settingsErrorUrl(origin: string, error: string): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section",  "integrations");
  url.searchParams.set("provider", "microsoft");
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
    if (!process.env.MICROSOFT_CLIENT_ID)     return NextResponse.redirect(settingsErrorUrl(appUrl, "client_id_not_configured"));
    if (!process.env.MICROSOFT_CLIENT_SECRET) return NextResponse.redirect(settingsErrorUrl(appUrl, "client_secret_not_configured"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login?next=/settings", req.url));

    const redirectUri = `${appUrl}/api/auth/microsoft/callback`;
    const scopes = resolveUpstreamScopes("microsoft", {
      mail:     true,
      calendar: true,
      contacts: true,
    });

    const state     = generateState();
    const nextParam = new URL(req.url).searchParams.get("next");
    const url       = microsoftAdapter.getAuthUrl({
      state, redirectUri, scopes,
      options: user.email ? { login_hint: user.email } : undefined,
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
    console.error("[/api/auth/microsoft] unexpected error:", err);
    return NextResponse.redirect(settingsErrorUrl(appUrl, "start_failed"));
  }
}
