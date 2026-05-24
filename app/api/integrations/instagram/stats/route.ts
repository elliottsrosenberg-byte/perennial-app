import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readIntegrationSecret } from "@/lib/integrations/vault";

// Fetches latest Instagram stats and updates the integration metadata
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "instagram")
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  // Token lives in the vault (RPC integration_read_secret), not on the
  // integrations row — the column was deprecated during the migration to
  // SECURITY DEFINER token storage. Legacy reads of integration.access_token
  // returned null for any new connection, which is why the stats fetch
  // silently no-op'd and the dashboard rendered blank.
  const token = await readIntegrationSecret(integration.id, "access_token");
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  // The OAuth callback writes metadata.ig_user_id (it used to write
  // user_id; the rename happened during the IG Business Login migration).
  // Fall back to the old key so legacy rows still work without a backfill.
  const igId = integration.metadata?.ig_user_id ?? integration.metadata?.user_id;

  if (!igId) {
    return NextResponse.json({ connected: true, error: "Missing Instagram user id on integration", metadata: integration.metadata }, { status: 422 });
  }

  // Fetch profile + follower count
  console.log("[instagram/stats] fetching profile", { igId });
  const profileRes = await fetch(
    `https://graph.instagram.com/${igId}?fields=id,username,followers_count,media_count&access_token=${token}`
  );
  if (!profileRes.ok) {
    const body = await profileRes.text().catch(() => "");
    console.error("[instagram/stats] profile fetch failed", profileRes.status, body);
    // Return 502 so the UI can show the error instead of silently
    // rendering blanks. Include the upstream body so we can diagnose
    // permission/scope issues from the client side too.
    return NextResponse.json(
      { connected: true, error: `Instagram API ${profileRes.status}: ${body.slice(0, 240)}`, metadata: integration.metadata },
      { status: 502 },
    );
  }

  const profile = await profileRes.json() as {
    id: string; username: string; followers_count?: number; media_count?: number;
  };

  // Fetch recent media for engagement calculation
  const mediaRes = await fetch(
    `https://graph.instagram.com/${igId}/media?fields=id,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink,caption&limit=12&access_token=${token}`
  );
  let engagementRate: number | null = null;
  let recentPosts: RecentPost[] = [];

  if (mediaRes.ok) {
    const mediaData = await mediaRes.json() as { data: MediaItem[] };
    const posts = mediaData.data ?? [];
    recentPosts = posts.slice(0, 6).map(p => ({
      id:            p.id,
      likes:         p.like_count ?? 0,
      comments:      p.comments_count ?? 0,
      timestamp:     p.timestamp,
      type:          p.media_type,
      thumbnail_url: p.thumbnail_url ?? p.media_url ?? null,
      permalink:     p.permalink ?? null,
      caption:       p.caption ?? null,
    }));

    if (posts.length > 0 && profile.followers_count) {
      const avgInteractions = posts.reduce((s, p) => s + (p.like_count ?? 0) + (p.comments_count ?? 0), 0) / posts.length;
      engagementRate = parseFloat(((avgInteractions / profile.followers_count) * 100).toFixed(2));
    }
  }

  const updatedMeta = {
    ...integration.metadata,
    username:        profile.username,
    followers_count: profile.followers_count ?? null,
    media_count:     profile.media_count ?? null,
    engagement_rate: engagementRate,
    recent_posts:    recentPosts,
    last_fetched:    new Date().toISOString(),
  };

  await supabase.from("integrations").update({
    metadata:       updatedMeta,
    last_synced_at: new Date().toISOString(),
    account_name:   `@${profile.username}`,
  }).eq("id", integration.id);

  return NextResponse.json({
    connected:       true,
    username:        profile.username,
    followers:       profile.followers_count ?? null,
    engagement_rate: engagementRate,
    recent_posts:    recentPosts,
  });
}

interface MediaItem {
  id: string;
  like_count?: number;
  comments_count?: number;
  timestamp: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  caption?: string;
}

interface RecentPost {
  id: string;
  likes: number;
  comments: number;
  timestamp: string;
  type: string;
  thumbnail_url: string | null;
  permalink: string | null;
  caption: string | null;
}
