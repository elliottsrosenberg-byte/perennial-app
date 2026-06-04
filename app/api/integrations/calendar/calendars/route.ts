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

  async function readCalendars() {
    const { data } = await supabase
      .from("user_calendars")
      .select("*")
      .eq("user_id", user!.id)
      .eq("removed", false)
      .order("account_email", { ascending: true })
      .order("is_primary",    { ascending: false })
      .order("name",          { ascending: true });
    return data ?? [];
  }

  let cals = await readCalendars();

  // Self-heal: if any connected calendar integration has no matching
  // user_calendars rows under its account name, run a sync. This covers:
  //   - first-load after a fresh OAuth (the callback already awaits sync
  //     but its 5s cap may have fired)
  //   - any prior connection whose sync silently errored (transient
  //     Google API hiccup; the catch in syncUserCalendarList logs but
  //     doesn't surface)
  //   - users with `removed=false` rows on one account but a brand-new
  //     account that has none yet
  // Cheap O(N integrations) check; only fans out to the network when a
  // skew is detected. Tombstoned-only users still hit this when they
  // connect a new account, which is correct.
  const { data: integrations } = await supabase
    .from("integrations")
    .select("provider, account_name, status, scopes")
    .eq("user_id", user.id)
    .in("provider", ["google", "google_calendar", "microsoft"]);

  const haveAccounts = new Set<string>();
  for (const c of cals) haveAccounts.add(`${c.provider}::${c.account_email ?? "primary"}`);

  const needsSync = (integrations ?? []).some((intg) => {
    if (intg.status && intg.status !== "active") return false;
    // For legacy google_calendar there's no scopes column; for unified
    // providers, only count rows that actually have the calendar scope.
    if (intg.provider !== "google_calendar") {
      const scopes = (intg.scopes ?? {}) as Record<string, boolean>;
      if (!scopes.calendar) return false;
    }
    const provider = intg.provider as "google" | "google_calendar" | "microsoft";
    const key = `${provider}::${intg.account_name ?? "primary"}`;
    return !haveAccounts.has(key);
  });

  if (needsSync) {
    try {
      await syncUserCalendarList(user.id);
      cals = await readCalendars();
    } catch (e) {
      console.error("[calendars GET] self-heal sync failed:", e);
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

  // Also return removed (tombstoned) calendars so the rail can offer to
  // re-add them — previously they vanished with no path back.
  const { data: removed } = await supabase
    .from("user_calendars")
    .select("*")
    .eq("user_id", user.id)
    .eq("removed", true)
    .order("account_email", { ascending: true })
    .order("name", { ascending: true });

  return NextResponse.json({ calendars: cals ?? [], removed_calendars: removed ?? [], default_calendar_id: defaultId });
}

// Manually re-sync the calendar list from the connected providers (re-fetches
// each account's calendars). Tombstoned (removed) calendars stay removed.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await syncUserCalendarList(user.id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
  const { data: cals } = await supabase
    .from("user_calendars").select("*").eq("user_id", user.id).eq("removed", false)
    .order("account_email", { ascending: true }).order("is_primary", { ascending: false }).order("name", { ascending: true });
  const { data: removed } = await supabase
    .from("user_calendars").select("*").eq("user_id", user.id).eq("removed", true)
    .order("account_email", { ascending: true }).order("name", { ascending: true });
  return NextResponse.json({ ok: true, calendars: cals ?? [], removed_calendars: removed ?? [] });
}

interface PatchBody {
  id?:          string;
  visible?:     boolean;
  color?:       string | null;
  /** Un-remove (re-add) or remove a calendar. false → re-adds + makes visible. */
  removed?:     boolean;
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
  if (typeof body.removed === "boolean") {
    patch.removed = body.removed;
    // Re-adding a calendar should make it visible again.
    if (body.removed === false && typeof body.visible !== "boolean") patch.visible = true;
  }

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
