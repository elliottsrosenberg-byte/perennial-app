import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/integrations/connect
// Validates an API key connection and stores it
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    provider: string;
    apiKey?: string;
    domain?: string;     // for Plausible
    metadata?: Record<string, unknown>; // for manual entries like Substack
  };

  const { provider, apiKey, domain, metadata: manualMeta } = body;

  let accountName = provider;
  let validatedMeta: Record<string, unknown> = {};
  let accountId = provider; // default

  // ── Plausible ────────────────────────────────────────────────────────────────
  if (provider === "plausible") {
    if (!apiKey || !domain) {
      return NextResponse.json({ error: "API key and domain are required." }, { status: 400 });
    }
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const statsRes = await fetch(
      `https://plausible.io/api/v1/stats/aggregate?site_id=${cleanDomain}&period=30d&metrics=visitors,pageviews,bounce_rate,visit_duration`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!statsRes.ok) {
      return NextResponse.json({ error: "Invalid Plausible API key or domain not found in your account." }, { status: 400 });
    }
    const stats = await statsRes.json() as { results?: Record<string, { value: number }> };
    accountName = cleanDomain;
    accountId   = cleanDomain;
    validatedMeta = {
      domain,
      visitors_30d:    stats.results?.visitors?.value ?? null,
      pageviews_30d:   stats.results?.pageviews?.value ?? null,
      bounce_rate:     stats.results?.bounce_rate?.value ?? null,
      visit_duration:  stats.results?.visit_duration?.value ?? null,
      last_fetched:    new Date().toISOString(),
    };
  }

  // ── Beehiiv ───────────────────────────────────────────────────────────────────
  else if (provider === "beehiiv") {
    if (!apiKey) return NextResponse.json({ error: "API key is required." }, { status: 400 });
    const pubRes = await fetch("https://api.beehiiv.com/v2/publications?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pubRes.ok) {
      return NextResponse.json({ error: "Invalid Beehiiv API key." }, { status: 400 });
    }
    const { data: pubs } = await pubRes.json() as { data: BeehiivPub[] };
    const pub = pubs?.[0];
    if (!pub) return NextResponse.json({ error: "No publications found in this account." }, { status: 400 });

    accountName = pub.name;
    accountId   = pub.id;
    validatedMeta = {
      publication_id:   pub.id,
      publication_name: pub.name,
      subscribers:      pub.stats?.total_active_subscriptions ?? null,
      last_fetched:     new Date().toISOString(),
    };
  }

  // ── Kit (ConvertKit) ───────────────────────────────────────────────────────────
  else if (provider === "kit") {
    if (!apiKey) return NextResponse.json({ error: "API key is required." }, { status: 400 });
    const subRes = await fetch(`https://api.convertkit.com/v3/subscribers?api_key=${apiKey}&page=1&per_page=1`, {});
    if (!subRes.ok) {
      return NextResponse.json({ error: "Invalid Kit API key." }, { status: 400 });
    }
    const subData = await subRes.json() as { total_subscribers?: number };
    accountName = "Kit newsletter";
    validatedMeta = {
      total_subscribers: subData.total_subscribers ?? null,
      last_fetched:      new Date().toISOString(),
    };
  }

  // ── Mailchimp ─────────────────────────────────────────────────────────────────
  else if (provider === "mailchimp") {
    if (!apiKey) return NextResponse.json({ error: "API key is required." }, { status: 400 });
    const dc = apiKey.split("-").pop(); // e.g. "us21"
    if (!dc) return NextResponse.json({ error: "Invalid Mailchimp API key format. Should end in -us##." }, { status: 400 });
    const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;
    const listsRes = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=1`, {
      headers: { Authorization: authHeader },
    });
    if (!listsRes.ok) {
      return NextResponse.json({ error: "Invalid Mailchimp API key." }, { status: 400 });
    }
    const listsData = await listsRes.json() as { lists: MailchimpList[] };
    const list = listsData.lists?.[0];
    accountName = list?.name ?? "Mailchimp audience";
    accountId   = list?.id ?? "mailchimp";
    validatedMeta = {
      datacenter:        dc,
      list_id:           list?.id ?? null,
      list_name:         list?.name ?? null,
      subscriber_count:  list?.stats?.member_count ?? null,
      open_rate:         list?.stats?.open_rate ? parseFloat((list.stats.open_rate * 100).toFixed(1)) : null,
      last_fetched:      new Date().toISOString(),
    };
  }

  // ── Substack (manual) ─────────────────────────────────────────────────────────
  else if (provider === "substack") {
    accountName = manualMeta?.publication_name as string ?? "Substack newsletter";
    accountId   = "substack";
    validatedMeta = {
      ...manualMeta,
      last_updated: new Date().toISOString(),
    };
  }

  else {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  // Store in integrations table
  const { data: integration, error: dbErr } = await supabase
    .from("integrations")
    .upsert({
      user_id:        user.id,
      provider,
      account_id:     accountId,
      account_name:   accountName,
      access_token:   apiKey ?? null,
      metadata:       validatedMeta,
      connected_at:   new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider,account_id" })
    .select()
    .single();

  if (dbErr) {
    console.error("Integration store error:", dbErr);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, integration });
}

// DELETE /api/integrations/connect?provider=X
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const provider = searchParams.get("provider");
  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

  await supabase.from("integrations").delete()
    .eq("user_id", user.id)
    .eq("provider", provider);

  return NextResponse.json({ ok: true });
}

interface BeehiivPub {
  id: string;
  name: string;
  stats?: { total_active_subscriptions?: number };
}
interface MailchimpList {
  id: string;
  name: string;
  stats?: { member_count?: number; open_rate?: number };
}
