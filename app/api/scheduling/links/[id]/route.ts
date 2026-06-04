// Update or delete a single scheduling link. Owner-only via RLS — the
// .eq("user_id") guards are belt-and-suspenders on top of the policy.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SchedulingLink } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fields a PATCH may touch. slug/user_id/id are intentionally immutable.
const EDITABLE: (keyof SchedulingLink)[] = [
  "title", "description", "kind", "duration_minutes", "slot_increment_minutes",
  "location_type", "location_detail", "timezone", "availability",
  "buffer_before_minutes", "buffer_after_minutes", "min_notice_minutes",
  "booking_window_days", "target_calendar_id", "conflict_calendar_ids",
  "expires_at", "single_use", "max_bookings", "active",
];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("scheduling_links")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed." }, { status: 400 });
  }
  return NextResponse.json({ link: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { error } = await supabase
    .from("scheduling_links")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
