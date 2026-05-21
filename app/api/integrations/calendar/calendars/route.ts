// CRUD-ish endpoint for the per-user calendar list. The Calendar
// left rail uses this to render per-account checkboxes; the user can
// toggle visibility, and the next events-fetch fans out to only the
// visible calendars.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserCalendarList } from "@/lib/calendar/sync-calendar-list";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let { data: cals } = await supabase
    .from("user_calendars")
    .select("*")
    .eq("user_id", user.id)
    .order("account_email", { ascending: true })
    .order("is_primary",    { ascending: false })
    .order("name",          { ascending: true });

  // First load after a fresh integration may have zero rows — sync once
  // and re-read so the UI sees something useful immediately.
  if (!cals || cals.length === 0) {
    const sync = await syncUserCalendarList(user.id);
    if (sync.count > 0) {
      const reread = await supabase
        .from("user_calendars")
        .select("*")
        .eq("user_id", user.id)
        .order("account_email", { ascending: true })
        .order("is_primary",    { ascending: false })
        .order("name",          { ascending: true });
      cals = reread.data ?? [];
    }
  }

  return NextResponse.json({ calendars: cals ?? [] });
}

interface PatchBody {
  id?:      string;
  visible?: boolean;
  color?:   string | null;
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.visible === "boolean") patch.visible = body.visible;
  if (body.color !== undefined)          patch.color   = body.color;

  const { data, error } = await supabase
    .from("user_calendars")
    .update(patch)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 400 });
  }
  return NextResponse.json({ calendar: data });
}

// Remove a single calendar from the user's list. The OAuth credential stays
// intact (other calendars in the same account may still be in use); the user
// can disconnect the whole account from Settings → Integrations. A re-sync
// will repopulate this row if the calendar still exists upstream — we don't
// keep a "soft-removed" flag, so removing a calendar the user still has in
// Google/Outlook only sticks until the next sync. If that's a problem, the
// next iteration is a `tombstoned` boolean.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id  = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("user_calendars")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
