// POST /api/track
//
// Public ingest endpoint for the website tracker snippet. Unauthenticated
// — the request is identified by the per-site token in the body. We
// hash the IP+UA+date to a visitor_hash for unique-visitor counts
// without storing raw PII.
//
// Body: { t: <site_token>, u: <pathname+search>, r: <referrer> }
// Short field names keep the payload small for sendBeacon-friendliness.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Match the no-store hint the tracker uses for its own fetch.
  "Cache-Control":                "no-store",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let body: { t?: string; u?: string; r?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS_HEADERS });
  }

  const token    = body.t?.toString().trim();
  const path     = (body.u ?? "/").toString().slice(0, 2048);
  const referrer = (body.r ?? "").toString().slice(0, 2048) || null;
  if (!token) {
    // Don't leak that the token is missing vs invalid — the ingest
    // function no-ops on unknown tokens anyway.
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  // Vercel sets x-forwarded-for + x-real-ip; Cloudflare CF-Connecting-IP.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  const country = req.headers.get("x-vercel-ip-country") ?? null;

  // Visitor hash: rotates daily so we can count unique-visitors-per-day
  // without persisting cross-day identifiers. Hash a long salt + IP +
  // UA + day-bucket so the output isn't reversible.
  const today = new Date().toISOString().slice(0, 10);
  const salt  = process.env.TRACKING_SALT ?? "perennial-default-salt";
  const visitorHash = createHash("sha256")
    .update(`${salt}|${ip}|${userAgent ?? ""}|${today}`)
    .digest("hex")
    .slice(0, 32);

  // We use the user-scoped client here even though we're unauthenticated
  // — the RPC is SECURITY DEFINER so it'll run with elevated privileges
  // and resolve the site_id from the token internally. RLS on the
  // events table doesn't block since the insert happens inside the
  // function's elevated context.
  const supabase = await createClient();
  const { error } = await supabase.rpc("ingest_website_event", {
    p_token:        token,
    p_path:         path,
    p_referrer:     referrer,
    p_user_agent:   userAgent,
    p_visitor_hash: visitorHash,
    p_country:      country,
  });

  if (error) {
    console.error("[/api/track] ingest_website_event failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: CORS_HEADERS });
  }
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
