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
    const shown = posts.slice(0, 6);

    // Per-media insights. We only fetch for the handful of posts actually
    // shown (≤6) — never the full media history. Insights are best-effort:
    // older media, or certain media types (CAROUSEL/STORY etc.), don't
    // support every metric and the Graph API will 400 with "unsupported
    // metric". We therefore fetch defensively per post and, on any failure,
    // simply omit the insight fields for that post rather than failing the
    // whole stats route.
    //
    // Metric names track the current Instagram Graph API: `impressions` was
    // deprecated in favor of `reach`/`views`, and `engagement` was replaced
    // by `total_interactions`. We request: reach, total_interactions, saved,
    // shares. If a media type rejects the bundle, we retry once with just
    // reach (the most broadly supported) so we still surface something.
    const insights = await Promise.all(
      shown.map(p => fetchMediaInsights(p.id, token)),
    );

    recentPosts = shown.map((p, idx) => {
      const ins = insights[idx];
      const reach = ins.reach;
      const engagement = ins.total_interactions;
      const engagementRatePost =
        reach && reach > 0 && engagement != null
          ? parseFloat(((engagement / reach) * 100).toFixed(1))
          : undefined;
      return {
        id:              p.id,
        likes:           p.like_count ?? 0,
        comments:        p.comments_count ?? 0,
        timestamp:       p.timestamp,
        type:            p.media_type,
        thumbnail_url:   p.thumbnail_url ?? p.media_url ?? null,
        permalink:       p.permalink ?? null,
        caption:         p.caption ?? null,
        reach,
        engagement,
        saved:           ins.saved,
        shares:          ins.shares,
        engagement_rate: engagementRatePost,
      };
    });

    if (posts.length > 0 && profile.followers_count) {
      const avgInteractions = posts.reduce((s, p) => s + (p.like_count ?? 0) + (p.comments_count ?? 0), 0) / posts.length;
      engagementRate = parseFloat(((avgInteractions / profile.followers_count) * 100).toFixed(2));
    }
  }

  // Maintain a daily follower-count history (one point per day, capped at
  // ~120 days) so the UI can show 30-day follower change. We accumulate
  // going forward — there's no historical backfill from the Graph API.
  const today = new Date().toISOString().slice(0, 10);
  const prevHist = Array.isArray(integration.metadata?.followers_history)
    ? (integration.metadata.followers_history as { d: string; f: number }[])
    : [];
  let history = prevHist.filter((h) => h && typeof h.d === "string" && typeof h.f === "number");
  if (profile.followers_count != null) {
    history = history.filter((h) => h.d !== today);
    history.push({ d: today, f: profile.followers_count });
    history = history.slice(-120);
  }

  const updatedMeta = {
    ...integration.metadata,
    username:           profile.username,
    followers_count:    profile.followers_count ?? null,
    media_count:        profile.media_count ?? null,
    engagement_rate:    engagementRate,
    recent_posts:       recentPosts,
    followers_history:  history,
    last_fetched:       new Date().toISOString(),
  };

  await supabase.from("integrations").update({
    metadata:       updatedMeta,
    last_synced_at: new Date().toISOString(),
    account_name:   `@${profile.username}`,
  }).eq("id", integration.id);

  return NextResponse.json({
    connected:         true,
    username:          profile.username,
    followers:         profile.followers_count ?? null,
    media_count:       profile.media_count ?? null,
    engagement_rate:   engagementRate,
    recent_posts:      recentPosts,
    followers_history: history,
  });
}

// Per-media insight values, all optional — any can be missing if the media
// type/age doesn't support that metric.
interface MediaInsights {
  reach?: number;
  total_interactions?: number;
  saved?: number;
  shares?: number;
}

// Fetch insights for a single media object, defensively. Returns whatever
// metrics succeeded; never throws. Strategy: request the full modern bundle
// (reach, total_interactions, saved, shares); if the Graph API rejects it
// (e.g. unsupported metric for this media type), fall back to just `reach`.
async function fetchMediaInsights(mediaId: string, token: string): Promise<MediaInsights> {
  const tryMetrics = async (metrics: string): Promise<MediaInsights | null> => {
    try {
      const res = await fetch(
        `https://graph.instagram.com/${mediaId}/insights?metric=${metrics}&access_token=${token}`,
      );
      if (!res.ok) return null;
      const json = await res.json() as {
        data?: { name: string; values?: { value: number }[] }[];
      };
      const out: MediaInsights = {};
      for (const m of json.data ?? []) {
        const value = m.values?.[0]?.value;
        if (typeof value !== "number") continue;
        if (m.name === "reach") out.reach = value;
        else if (m.name === "total_interactions") out.total_interactions = value;
        else if (m.name === "saved") out.saved = value;
        else if (m.name === "shares") out.shares = value;
      }
      return out;
    } catch (err) {
      console.error("[instagram/stats] media insights fetch failed", mediaId, err);
      return null;
    }
  };

  const full = await tryMetrics("reach,total_interactions,saved,shares");
  if (full) return full;
  // Fallback: reach alone is the most broadly supported metric.
  const minimal = await tryMetrics("reach");
  return minimal ?? {};
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
  // Per-media insights (best-effort; omitted when unsupported for the post).
  reach?: number;
  engagement?: number;      // total_interactions
  saved?: number;
  shares?: number;
  engagement_rate?: number; // total_interactions / reach * 100
}
