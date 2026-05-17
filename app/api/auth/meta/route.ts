// Start the Meta Business Suite OAuth flow (Facebook Pages +
// Instagram Business via Meta Graph API). Mirror of /api/auth/google.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { metaAdapter } from "@/lib/integrations/meta";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_meta";
const NEXT_COOKIE  = "pn_oauth_next_meta";
const COOKIE_TTL_S = 10 * 60;

function settingsErrorUrl(origin: string, error: string): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section",  "integrations");
  url.searchParams.set("provider", "meta");
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
    if (!process.env.META_APP_ID)     return NextResponse.redirect(settingsErrorUrl(appUrl, "client_id_not_configured"));
    if (!process.env.META_APP_SECRET) return NextResponse.redirect(settingsErrorUrl(appUrl, "client_secret_not_configured"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login?next=/settings", req.url));

    const redirectUri = `${appUrl}/api/auth/meta/callback`;

    // Scopes for Pages + Instagram Business + insights.
    // pages_show_list:           list user's Facebook Pages
    // pages_read_engagement:     read post insights for those Pages
    // instagram_basic:           map Pages to connected Instagram Business accounts
    // instagram_manage_insights: read Instagram insights
    // business_management:       enumerate Business Manager assets
    const scopes = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_insights",
      "business_management",
    ];

    const state     = generateState();
    const nextParam = new URL(req.url).searchParams.get("next");
    const url       = metaAdapter.getAuthUrl({ state, redirectUri, scopes });

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
    console.error("[/api/auth/meta] unexpected error:", err);
    return NextResponse.redirect(settingsErrorUrl(appUrl, "start_failed"));
  }
}
