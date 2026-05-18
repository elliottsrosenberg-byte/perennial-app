// Manual "Refresh calendars" button in the Calendar topbar menu hits
// this. Today it's a thin endpoint that just bumps `last_synced_at` on
// every connected calendar integration so the Settings UI's "last
// synced" stays honest, and the CalendarClient re-pulls its event
// window via a window event the menu fires after we return ok.
//
// When per-account calendar lists land (Phase B), this is where we'll
// upsert into `user_calendars` from each provider's calendarList /
// /me/calendars endpoint. For now the lighter version is enough — the
// aggregator route reads fresh events on the next fetch.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows } = await supabase
    .from("integrations")
    .select("id, provider")
    .eq("user_id", user.id)
    .in("provider", ["google_calendar", "google", "microsoft"]);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, refreshed: 0, message: "No calendars connected." });
  }

  const now = new Date().toISOString();
  await Promise.all(
    rows.map((r) =>
      supabase.from("integrations").update({ last_synced_at: now }).eq("id", r.id),
    ),
  );

  return NextResponse.json({
    ok: true,
    refreshed: rows.length,
    message: `Refreshed ${rows.length} calendar source${rows.length === 1 ? "" : "s"}.`,
  });
}
