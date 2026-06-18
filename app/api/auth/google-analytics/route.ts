import { NextResponse } from "next/server";

// Initiates Google Analytics OAuth — redirects user to Google's consent screen
export async function GET(req: Request) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google Client ID not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to your environment variables." }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/auth/google-analytics/callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics.edit",   // needed for Admin API (property list)
    ].join(" "),
    access_type:   "offline",   // get refresh token
    prompt:        "consent",   // always show consent to ensure refresh token is returned
  });

  // Carry a post-connect destination through OAuth `state` so the callback can
  // return the user where they started (e.g. /onboarding) instead of always
  // dropping them on /presence. Only same-origin relative paths are allowed.
  const next = new URL(req.url).searchParams.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    params.set("state", next);
  }

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
