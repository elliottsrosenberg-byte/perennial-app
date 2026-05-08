import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${origin}/calendar?error=gcal_cancelled`);
  }

  const clientId     = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const redirectUri  = `${appUrl}/api/auth/google-calendar/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
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
    console.error("GCal token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(`${origin}/calendar?error=gcal_token`);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Get the user's email to use as account name
  const emailRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const emailData = emailRes.ok
    ? await emailRes.json() as { email?: string; name?: string }
    : { email: null, name: null };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/calendar?error=not_authenticated`);

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase.from("integrations").upsert({
    user_id:          user.id,
    provider:         "google_calendar",
    account_id:       emailData.email ?? "google_calendar",
    account_name:     emailData.name ?? emailData.email ?? "Google Calendar",
    access_token:     tokens.access_token,
    refresh_token:    tokens.refresh_token ?? null,
    token_expires_at: expiresAt,
    metadata:         { email: emailData.email, name: emailData.name },
    connected_at:     new Date().toISOString(),
    last_synced_at:   new Date().toISOString(),
  }, { onConflict: "user_id,provider,account_id" });

  return NextResponse.redirect(`${origin}/calendar?connected=gcal`);
}
