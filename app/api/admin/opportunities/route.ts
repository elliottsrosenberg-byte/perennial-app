// Admin: create/update opportunities in the curated feed. Writes use the
// service-role client (the opportunities write policy is service_role-only);
// reads happen client-side via the authenticated select-all policy. Gated to
// a signed-in user — pre-launch that's the owner. TODO: real admin-role gate.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const FIELDS = [
  "title", "event_type", "category", "start_date", "end_date", "location",
  "about", "notes", "website_url", "registration_url", "application_deadline",
  "submissions_open", "frequency", "cost", "eligibility", "contact_email",
  "image_url", "status", "source", "is_perennial_feed",
] as const;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const row: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (f in body) row[f] = body[f] === "" ? null : body[f];
  }
  if (!row.category) row.category = "fair";
  if (!row.event_type) row.event_type = "Event";
  if (!row.source) row.source = "curated";
  if (!row.status) row.status = "published";

  const admin = createAdminClient();
  const id = typeof body.id === "string" ? body.id : null;
  const q = id
    ? admin.from("opportunities").update(row).eq("id", id).select("*").single()
    : admin.from("opportunities").insert({ ...row, is_perennial_feed: true }).select("*").single();
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, opportunity: data });
}
