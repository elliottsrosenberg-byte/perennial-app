// Manually trigger a Gmail + Calendar sync for the calling user. Used by the
// "Sync now" button in Settings → Integrations and by the sync-on-open path in
// the contact Activity tab. Runs in the user's session context; the background
// pg_cron job (`/api/cron/integrations-sync`) calls the same `safeSync*`
// entries under the service-role context for every account on a schedule.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeSyncGmail } from "@/lib/integrations/google-gmail";
import { safeSyncGoogleCalendar } from "@/lib/integrations/google-calendar";
import type { IntegrationRow } from "@/lib/integrations/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // The user may have multiple Google accounts connected — accept an
  // optional `account_id` query/body param to target a specific one,
  // otherwise sync every active Google integration the user owns.
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");

  let query = supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .eq("status", "active");
  if (accountId) query = query.eq("account_id", accountId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "no active google integration" }, { status: 404 });
  }

  // Per-account, run gmail + calendar in parallel. Each helper handles its
  // own scope gate (returns 0s if the user has the sub-scope toggled off).
  const results = [];
  for (const row of rows as IntegrationRow[]) {
    const [gmail, calendar] = await Promise.all([
      safeSyncGmail(row),
      safeSyncGoogleCalendar(row),
    ]);
    results.push({
      integration_id: row.id,
      account_name:   row.account_name,
      gmail,
      calendar,
    });
  }

  return NextResponse.json({ results });
}
