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
    .eq("removed", false)
    .order("account_email", { ascending: true })
    .order("is_primary",    { ascending: false })
    .order("name",          { ascending: true });

  // First load after a fresh integration may have zero rows — sync once
  // and re-read so the UI sees something useful immediately. A user
  // with only tombstoned rows (everything removed) will also fall into
  // this branch; that's fine because sync preserves the `removed` flag
  // for existing rows, so the re-read still returns nothing.
  if (!cals || cals.length === 0) {
    const sync = await syncUserCalendarList(user.id);
    if (sync.count > 0) {
      const reread = await supabase
        .from("user_calendars")
        .select("*")
        .eq("user_id", user.id)
        .eq("removed", false)
        .order("account_email", { ascending: true })
        .order("is_primary",    { ascending: false })
        .order("name",          { ascending: true });
      cals = reread.data ?? [];
    }
  }

  // Read the user's default_calendar_id from profiles so the rail can
  // mark the right row. Stored on profiles (not user_calendars) because
  // it's a user-level singleton across all accounts.
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_calendar_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const defaultId = (profile?.default_calendar_id as string | null | undefined) ?? null;

  return NextResponse.json({ calendars: cals ?? [], default_calendar_id: defaultId });
}

interface PatchBody {
  id?:          string;
  visible?:     boolean;
  color?:       string | null;
  /** Mark this calendar as the user's default for new events. Writes to
   *  profiles.default_calendar_id, not user_calendars. */
  set_default?: boolean;
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // set_default is a profiles-side write, so handle it independently of
  // the user_calendars patch (which may still also be in the payload).
  if (body.set_default === true) {
    // Confirm the calendar belongs to the user before pointing profiles at it.
    const { data: cal } = await supabase
      .from("user_calendars")
      .select("id")
      .eq("id", body.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!cal) return NextResponse.json({ error: "calendar not found" }, { status: 404 });

    const { error: pErr } = await supabase
      .from("profiles")
      .update({ default_calendar_id: body.id })
      .eq("user_id", user.id);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.visible === "boolean") patch.visible = body.visible;
  if (body.color !== undefined)          patch.color   = body.color;

  let updated = null;
  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
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
    updated = data;
  } else if (body.set_default !== true) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  return NextResponse.json({ calendar: updated, ok: true });
}

// Remove a single calendar from the user's list. The OAuth credential
// stays intact (other calendars in the same account may still be in
// use); the user can disconnect the whole account from
// Settings → Integrations.
//
// Implemented as a soft-delete by flipping `removed = true` instead of
// dropping the row. The natural key (user_id, provider, external_id)
// stays in place, so the next syncUserCalendarList sees a conflicting
// row and the upsert (which doesn't touch `removed`) leaves the
// tombstone intact. A re-sync therefore respects user intent — the
// calendar stays gone until the user explicitly re-adds it from
// Settings → Integrations or the manual "Refresh calendars" path.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id  = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("user_calendars")
    .update({ removed: true, visible: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
