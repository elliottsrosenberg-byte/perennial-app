import { NextResponse } from "next/server";

// Initiates Instagram OAuth — redirect user to Meta's auth page
export async function GET(req: Request) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) return NextResponse.json({ error: "Meta App ID not configured" }, { status: 503 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/auth/instagram/callback`;

  const params = new URLSearchParams({
    client_id:     appId,
    redirect_uri:  redirectUri,
    scope:         "instagram_basic,instagram_manage_insights,pages_show_list",
    response_type: "code",
  });

  return NextResponse.redirect(
    `https://api.instagram.com/oauth/authorize?${params.toString()}`
  );
}
