// POST /api/integrations/website/connect
//
// Register a website to track. Returns the site_token the user
// embeds in the <script> tag on their site. Multiple sites per user
// are supported.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_PLATFORMS = ["manual", "webflow", "wix", "squarespace", "wordpress", "other"] as const;

function normalizeUrl(input: string): string | null {
  let u = input.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    // Drop trailing slash and any path/query — we just want the origin.
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { url?: string; platform?: string; display_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const url = normalizeUrl(body.url ?? "");
  if (!url) return NextResponse.json({ error: "invalid_url" }, { status: 400 });

  const platform = (ALLOWED_PLATFORMS as readonly string[]).includes(body.platform ?? "")
    ? body.platform!
    : "manual";

  const displayName = body.display_name?.trim() || new URL(url).host;

  // De-dupe by (user_id, url) — if the user already added this site,
  // return the existing row so they get the same token.
  const { data: existing } = await supabase
    .from("website_sites")
    .select("*")
    .eq("user_id", user.id)
    .eq("url",     url)
    .maybeSingle();

  if (existing) return NextResponse.json({ site: existing });

  const { data: row, error } = await supabase
    .from("website_sites")
    .insert({
      user_id:      user.id,
      url,
      display_name: displayName,
      platform,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ site: row });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const id  = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  // RLS gates the delete to owner rows, but the explicit eq adds a
  // clearer error path.
  const { error } = await supabase
    .from("website_sites")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
