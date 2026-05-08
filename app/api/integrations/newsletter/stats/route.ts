import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Refreshes newsletter stats from the connected provider
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find any newsletter integration
  const NEWSLETTER_PROVIDERS = ["beehiiv", "kit", "mailchimp", "substack"];
  const { data: integrations } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .in("provider", NEWSLETTER_PROVIDERS);

  if (!integrations?.length) return NextResponse.json({ connected: false });

  const results: Record<string, unknown>[] = [];

  for (const int of integrations) {
    const token = int.access_token;
    const meta  = int.metadata as Record<string, unknown>;

    if (int.provider === "beehiiv" && token) {
      const pubId = meta.publication_id as string;
      const pubRes = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pubRes.ok) {
        const { data: pub } = await pubRes.json() as { data: { name: string; stats: { total_active_subscriptions: number } } };
        const updatedMeta = {
          ...meta,
          subscribers:  pub.stats?.total_active_subscriptions ?? meta.subscribers,
          last_fetched: new Date().toISOString(),
        };
        await supabase.from("integrations")
          .update({ metadata: updatedMeta, last_synced_at: new Date().toISOString() })
          .eq("id", int.id);
        results.push({ provider: "beehiiv", ...updatedMeta });
      }
    }

    else if (int.provider === "kit" && token) {
      const subRes = await fetch(`https://api.convertkit.com/v3/subscribers?api_key=${token}&page=1&per_page=1`);
      if (subRes.ok) {
        const subData = await subRes.json() as { total_subscribers?: number };
        const updatedMeta = {
          ...meta,
          total_subscribers: subData.total_subscribers ?? meta.total_subscribers,
          last_fetched:      new Date().toISOString(),
        };
        await supabase.from("integrations")
          .update({ metadata: updatedMeta, last_synced_at: new Date().toISOString() })
          .eq("id", int.id);
        results.push({ provider: "kit", ...updatedMeta });
      }
    }

    else if (int.provider === "mailchimp" && token) {
      const dc      = meta.datacenter as string;
      const listId  = meta.list_id as string;
      const authHdr = `Basic ${Buffer.from(`anystring:${token}`).toString("base64")}`;
      const listRes = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${listId}`, {
        headers: { Authorization: authHdr },
      });
      if (listRes.ok) {
        const list = await listRes.json() as { stats?: { member_count?: number; open_rate?: number } };
        const updatedMeta = {
          ...meta,
          subscriber_count: list.stats?.member_count ?? meta.subscriber_count,
          open_rate:        list.stats?.open_rate ? parseFloat((list.stats.open_rate * 100).toFixed(1)) : meta.open_rate,
          last_fetched:     new Date().toISOString(),
        };
        await supabase.from("integrations")
          .update({ metadata: updatedMeta, last_synced_at: new Date().toISOString() })
          .eq("id", int.id);
        results.push({ provider: "mailchimp", ...updatedMeta });
      }
    }

    else if (int.provider === "substack") {
      // Substack is manual — just return the stored metadata
      results.push({ provider: "substack", ...meta });
    }
  }

  return NextResponse.json({ connected: true, results });
}
