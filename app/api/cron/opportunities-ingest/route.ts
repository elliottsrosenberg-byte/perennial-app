// Ingest endpoint for the weekly opportunities-monitoring routine (and any
// cron). Bearer-auth with CRON_SECRET. GET returns the worklist (drafts +
// stale rows) so the agent knows what to verify; POST upserts the agent's
// findings (matched by title, case-insensitive) using the service-role client.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}`;
}

const UPSERT_FIELDS = [
  "category", "event_type", "start_date", "end_date", "application_deadline",
  "submissions_open", "location", "about", "notes", "website_url",
  "registration_url", "frequency", "cost", "eligibility", "contact_email", "status", "tags",
];

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 21 * 86400_000).toISOString();
  const { data } = await admin
    .from("opportunities")
    .select("id, title, category, status, website_url, start_date, application_deadline, last_verified_at")
    .or(`status.eq.draft,last_verified_at.is.null,last_verified_at.lt.${cutoff}`)
    .order("application_deadline", { ascending: true, nullsFirst: false })
    .limit(80);
  const { count: pendingSuggestions } = await admin
    .from("opportunity_suggestions").select("id", { count: "exact", head: true }).eq("status", "pending");
  return NextResponse.json({ needs_verification: data ?? [], pending_suggestions: pendingSuggestions ?? 0 });
}

export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: Record<string, unknown>[] } | null;
  if (!body?.items?.length) return NextResponse.json({ error: "items[] required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("opportunities").select("id, title");
  const byTitle = new Map((existing ?? []).map((o) => [String(o.title).trim().toLowerCase(), o.id]));

  let updated = 0, inserted = 0;
  const now = new Date().toISOString();
  for (const item of body.items) {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) continue;
    const patch: Record<string, unknown> = { last_verified_at: now };
    for (const f of UPSERT_FIELDS) if (f in item && item[f] !== "") patch[f] = item[f];
    const id = byTitle.get(title.toLowerCase());
    if (id) {
      await admin.from("opportunities").update(patch).eq("id", id);
      updated++;
    } else {
      await admin.from("opportunities").insert({
        title, is_perennial_feed: true, source: "agent",
        category: patch.category ?? "fair", event_type: patch.event_type ?? "Event",
        status: patch.status ?? "draft", ...patch,
      });
      inserted++;
    }
  }
  return NextResponse.json({ ok: true, updated, inserted });
}
