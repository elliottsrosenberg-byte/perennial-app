import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  // `state` carries the post-connect destination (e.g. /onboarding?step=9) set
  // when the flow began, so we return the user where they started instead of
  // always dropping them on /presence. Restrict to same-origin relative paths.
  const stateNext = searchParams.get("state");
  const safeNext = stateNext && stateNext.startsWith("/") && !stateNext.startsWith("//") ? stateNext : null;
  const back = (qs: string) => {
    if (safeNext) {
      const sep = safeNext.includes("?") ? "&" : "?";
      return `${origin}${safeNext}${sep}${qs}`;
    }
    return `${origin}/presence?tab=website&${qs}`;
  };

  if (error || !code) {
    return NextResponse.redirect(back("error=ga4_cancelled"));
  }

  const clientId     = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const redirectUri  = `${appUrl}/api/auth/google-analytics/callback`;

  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("GA4 token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(back("error=ga4_token"));
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(back("error=not_authenticated"));
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Store with a placeholder account_id — will be updated when user selects a property
  await supabase.from("integrations").upsert({
    user_id:          user.id,
    provider:         "google_analytics",
    account_id:       "pending_property_selection",
    account_name:     "Google Analytics",
    access_token:     tokens.access_token,
    refresh_token:    tokens.refresh_token ?? null,
    token_expires_at: expiresAt,
    metadata:         { step: "select_property" },
    connected_at:     new Date().toISOString(),
  }, { onConflict: "user_id,provider,account_id" });

  // Success. If we came from onboarding (or elsewhere via `state`), return there
  // to keep the user in their flow; otherwise go to Presence, where the
  // "select_property" step prompts the user to pick a GA4 property.
  return NextResponse.redirect(
    safeNext ? `${origin}${safeNext}` : `${origin}/presence?tab=website&step=select-property`
  );
}
