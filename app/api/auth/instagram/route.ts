// Start the Instagram Business Login OAuth flow. Replaces the legacy
// Instagram Basic Display path that lived here before — Basic Display
// was deprecated by Meta in late 2024.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { instagramAdapter } from "@/lib/integrations/instagram";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const STATE_COOKIE = "pn_oauth_state_instagram";
const NEXT_COOKIE  = "pn_oauth_next_instagram";
const COOKIE_TTL_S = 10 * 60;

function settingsErrorUrl(origin: string, error: string): string {
  const url = new URL("/settings", origin);
  url.searchParams.set("section",  "integrations");
  url.searchParams.set("provider", "instagram");
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
    if (!process.env.INSTAGRAM_APP_ID && !process.env.META_APP_ID)
      return NextResponse.redirect(settingsErrorUrl(appUrl, "client_id_not_configured"));
    if (!process.env.INSTAGRAM_APP_SECRET && !process.env.META_APP_SECRET)
      return NextResponse.redirect(settingsErrorUrl(appUrl, "client_secret_not_configured"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login?next=/settings?section=integrations", req.url));

    const redirectUri = `${appUrl}/api/auth/instagram/callback`;

    // Instagram Business Login scopes (must be enabled in the Meta app's
    // "Manage Content on Instagram" use case → permissions panel):
    //   instagram_business_basic           → profile + media listing
    //   instagram_business_manage_insights → reach, impressions, profile views
    // Optional (not requested in v1 — add when we surface these features):
    //   instagram_business_manage_comments
    //   instagram_business_content_publish
    //   instagram_business_manage_messages
    const scopes = [
      "instagram_business_basic",
      "instagram_business_manage_insights",
    ];

    const state     = generateState();
    const nextParam = new URL(req.url).searchParams.get("next");
    const url       = instagramAdapter.getAuthUrl({ state, redirectUri, scopes });

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
    console.error("[/api/auth/instagram] unexpected error:", err);
    return NextResponse.redirect(settingsErrorUrl(appUrl, "start_failed"));
  }
}
