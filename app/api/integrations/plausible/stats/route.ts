import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Fetches and caches latest Plausible analytics stats
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "plausible")
    .maybeSingle();

  if (!integration?.access_token) return NextResponse.json({ connected: false });

  const token  = integration.access_token;
  const meta   = integration.metadata as Record<string, unknown>;
  const domain = meta.domain as string;
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  // Aggregate stats (30 days)
  const statsRes = await fetch(
    `https://plausible.io/api/v1/stats/aggregate?site_id=${cleanDomain}&period=30d&metrics=visitors,pageviews,bounce_rate,visit_duration,visits`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!statsRes.ok) {
    return NextResponse.json({ connected: true, error: "Failed to fetch stats — API key may need re-authorizing" });
  }
  const { results } = await statsRes.json() as { results: Record<string, { value: number }> };

  // Top pages (30 days)
  const pagesRes = await fetch(
    `https://plausible.io/api/v1/stats/breakdown?site_id=${cleanDomain}&period=30d&property=event:page&limit=10&metrics=visitors,pageviews`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const pagesData = pagesRes.ok ? await pagesRes.json() as { results: TopPage[] } : null;

  // Top sources
  const sourcesRes = await fetch(
    `https://plausible.io/api/v1/stats/breakdown?site_id=${cleanDomain}&period=30d&property=visit:source&limit=5&metrics=visitors`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const sourcesData = sourcesRes.ok ? await sourcesRes.json() as { results: TopSource[] } : null;

  const stats = {
    visitors:       results.visitors?.value ?? null,
    pageviews:      results.pageviews?.value ?? null,
    bounce_rate:    results.bounce_rate?.value ?? null,
    visit_duration: results.visit_duration?.value ?? null,
    visits:         results.visits?.value ?? null,
    top_pages:      pagesData?.results?.slice(0, 5) ?? [],
    top_sources:    sourcesData?.results?.slice(0, 5) ?? [],
    domain:         cleanDomain,
    last_fetched:   new Date().toISOString(),
  };

  // Update cached stats
  await supabase.from("integrations").update({
    metadata:       { ...meta, ...stats },
    last_synced_at: new Date().toISOString(),
  }).eq("id", integration.id);

  return NextResponse.json({ connected: true, ...stats });
}

interface TopPage   { page: string; visitors: number; pageviews: number }
interface TopSource { source: string; visitors: number }
