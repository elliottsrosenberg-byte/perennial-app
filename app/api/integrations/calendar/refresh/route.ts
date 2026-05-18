// Manual "Refresh calendars" button in the Calendar topbar menu hits
// this. Re-syncs the per-account calendar list from every connected
// provider into public.user_calendars (preserving the user's visible
// choices) and bumps `last_synced_at` on each integration row so the
// Settings UI's "last synced" stays honest.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserCalendarList } from "@/lib/calendar/sync-calendar-list";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", user.id)
    .in("provider", ["google_calendar", "google", "microsoft"]);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, refreshed: 0, message: "No calendars connected." });
  }

  const sync = await syncUserCalendarList(user.id);

  const now = new Date().toISOString();
  await Promise.all(
    rows.map((r) =>
      supabase.from("integrations").update({ last_synced_at: now }).eq("id", r.id),
    ),
  );

  return NextResponse.json({
    ok:        true,
    refreshed: sync.count,
    providers: sync.providers,
    message:   sync.count > 0
      ? `Synced ${sync.count} calendar${sync.count === 1 ? "" : "s"} across ${sync.providers.length} provider${sync.providers.length === 1 ? "" : "s"}.`
      : "Calendars are up to date.",
  });
}
