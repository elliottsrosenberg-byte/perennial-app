import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${origin}/presence?tab=socials&error=instagram_cancelled`);
  }

  const appId     = process.env.NEXT_PUBLIC_META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const redirectUri = `${appUrl}/api/auth/instagram/callback`;

  // Exchange code for short-lived token
  const tokenForm = new URLSearchParams({
    client_id:     appId,
    client_secret: appSecret,
    grant_type:    "authorization_code",
    redirect_uri:  redirectUri,
    code,
  });

  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body:   tokenForm,
  });

  if (!tokenRes.ok) {
    console.error("Instagram token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(`${origin}/presence?tab=socials&error=instagram_token`);
  }

  const { access_token: shortToken, user_id: igUserId } = await tokenRes.json() as {
    access_token: string; user_id: number;
  };

  // Exchange for long-lived token (60 days)
  const longTokenRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
  );

  const { access_token: longToken } = longTokenRes.ok
    ? await longTokenRes.json() as { access_token: string }
    : { access_token: shortToken };

  // Fetch Instagram profile
  const profileRes = await fetch(
    `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${longToken}`
  );
  const profile = profileRes.ok ? await profileRes.json() as { id: string; username: string; account_type: string } : null;

  // Fetch follower count (requires business account)
  let followerCount: number | null = null;
  const statsRes = await fetch(
    `https://graph.instagram.com/${igUserId}?fields=followers_count&access_token=${longToken}`
  );
  if (statsRes.ok) {
    const stats = await statsRes.json() as { followers_count?: number };
    followerCount = stats.followers_count ?? null;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/presence?tab=socials&error=not_authenticated`);

  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days

  await supabase.from("integrations").upsert({
    user_id:          user.id,
    provider:         "instagram",
    account_id:       String(igUserId),
    account_name:     profile?.username ? `@${profile.username}` : `Instagram ${igUserId}`,
    access_token:     longToken,
    token_expires_at: expiresAt,
    metadata: {
      user_id:        String(igUserId),
      username:       profile?.username,
      account_type:   profile?.account_type,
      followers_count: followerCount,
    },
    connected_at:    new Date().toISOString(),
    last_synced_at:  new Date().toISOString(),
  }, { onConflict: "user_id,provider,account_id" });

  return NextResponse.redirect(`${origin}/presence?tab=socials&connected=instagram`);
}
