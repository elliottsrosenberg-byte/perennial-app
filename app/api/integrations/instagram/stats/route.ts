import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  if (!integration?.access_token) {
    return NextResponse.json({ connected: false });
  }

  const igId = integration.metadata?.user_id;
  const token = integration.access_token;

  // Fetch profile + follower count
  const profileRes = await fetch(
    `https://graph.instagram.com/${igId}?fields=id,username,followers_count,media_count&access_token=${token}`
  );
  if (!profileRes.ok) {
    return NextResponse.json({ connected: true, error: "Failed to fetch stats", metadata: integration.metadata });
  }

  const profile = await profileRes.json() as {
    id: string; username: string; followers_count?: number; media_count?: number;
  };

  // Fetch recent media for engagement calculation
  const mediaRes = await fetch(
    `https://graph.instagram.com/${igId}/media?fields=id,like_count,comments_count,timestamp,media_type&limit=12&access_token=${token}`
  );
  let engagementRate: number | null = null;
  let recentPosts: RecentPost[] = [];

  if (mediaRes.ok) {
    const mediaData = await mediaRes.json() as { data: MediaItem[] };
    const posts = mediaData.data ?? [];
    recentPosts = posts.slice(0, 6).map(p => ({
      id:        p.id,
      likes:     p.like_count ?? 0,
      comments:  p.comments_count ?? 0,
      timestamp: p.timestamp,
      type:      p.media_type,
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
}

interface RecentPost {
  id: string;
  likes: number;
  comments: number;
  timestamp: string;
  type: string;
}
