// Background sync for every user's connected mail/calendar. Driven by a
// Supabase pg_cron job that POSTs here on a short interval (see
// docs/architecture/operations.md → "Cron / scheduled jobs"). Bearer-auth
// with CRON_SECRET; runs under the service-role admin context so it can read
// each user's vault tokens via the `*_service` RPCs without a session.
//
// Work is bounded per invocation: we process the N integrations that were
// least-recently synced, each doing a small "new mail" slice plus one page of
// its resumable full-inbox backfill. Because the cron fires frequently, every
// account is serviced within a few ticks and large histories fill in
// progressively without any single request running long.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminSyncContext } from "@/lib/integrations/sync-context";
import { safeSyncGmail } from "@/lib/integrations/google-gmail";
import { safeSyncGoogleCalendar } from "@/lib/integrations/google-calendar";
import type { IntegrationRow } from "@/lib/integrations/types";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds — backfill pages can take a while

const MAX_INTEGRATIONS_PER_RUN = 10;

function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}`;
}

async function run() {
  const admin = createAdminClient();
  const ctx   = adminSyncContext();

  // Least-recently-synced first (nulls first) so work rotates fairly across
  // every connected account and no one starves.
  const { data: rows, error } = await admin
    .from("integrations")
    .select("*")
    .eq("provider", "google")
    .eq("status", "active")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_INTEGRATIONS_PER_RUN);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const row of (rows ?? []) as IntegrationRow[]) {
    // Sequential per-integration to keep total concurrency (and Gmail quota
    // pressure) predictable; each helper self-gates on its sub-scope.
    const gmail    = await safeSyncGmail(row, ctx);
    const calendar = await safeSyncGoogleCalendar(row, ctx);
    results.push({ integration_id: row.id, account_name: row.account_name, gmail, calendar });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function POST(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

// Allow manual triggering / uptime checks with the same bearer auth.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}
