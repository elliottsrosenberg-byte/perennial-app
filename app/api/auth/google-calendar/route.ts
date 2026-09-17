import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { integrationLive } from "@/lib/launch-flags";
import { isAdminUserId } from "@/lib/admin/guard";

export async function GET(req: Request) {
  // Launch gate — admins may still connect for testing (lib/launch-flags.ts).
  if (!integrationLive("google")) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!isAdminUserId(user?.id)) {
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      return NextResponse.redirect(`${origin}/settings?section=integrations&provider=google&error=coming_soon`);
    }
  }
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google Client ID not configured." }, { status: 503 });
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/auth/google-calendar/callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    access_type: "offline",
    prompt:      "consent",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
