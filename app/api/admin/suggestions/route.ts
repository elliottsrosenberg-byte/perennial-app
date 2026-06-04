// Admin: act on a user-submitted opportunity suggestion — promote it into the
// curated feed (as a draft, for a final review) or dismiss it. Service-role
// writes; gated to a signed-in user.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: string; action?: string } | null;
  if (!body?.id || !["promote", "dismiss"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "id and a valid action are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sug } = await admin.from("opportunity_suggestions").select("*").eq("id", body.id).single();
  if (!sug) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.action === "promote") {
    const { data: opp, error } = await admin.from("opportunities").insert({
      title:       sug.title,
      category:    sug.category ?? "fair",
      event_type:  sug.event_type ?? "Event",
      start_date:  sug.start_date,
      end_date:    sug.end_date,
      location:    sug.location,
      website_url: sug.website_url,
      notes:       sug.notes,
      is_perennial_feed: true,
      source:      "suggestion",
      status:      "draft", // lands as a draft for a final review before publish
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("opportunity_suggestions").update({ status: "approved" }).eq("id", body.id);
    return NextResponse.json({ ok: true, opportunity_id: opp.id });
  }

  await admin.from("opportunity_suggestions").update({ status: "dismissed" }).eq("id", body.id);
  return NextResponse.json({ ok: true });
}
