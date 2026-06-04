// Public open-slots endpoint. The booking page calls this as the visitor
// navigates months. Returns absolute UTC instants; the client formats them in
// whatever timezone the visitor picks. No auth — keyed by the link slug.

import { NextResponse } from "next/server";
import { loadPublicLink, linkClosedReason } from "@/lib/scheduling/public-link";
import { fetchBusy } from "@/lib/scheduling/busy";
import { computeOpenSlots, type Interval } from "@/lib/scheduling/availability";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const bundle = await loadPublicLink(slug);
  if (!bundle) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const now = new Date();
  const closed = linkClosedReason(bundle, now);
  if (closed) return NextResponse.json({ slots: [], closed, timezone: bundle.link.timezone });

  const { link } = bundle;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : now;
  const maxReach = now.getTime() + (link.kind === "one_off" ? 365 : link.booking_window_days) * DAY_MS;
  const to = url.searchParams.get("to")
    ? new Date(Math.min(new Date(url.searchParams.get("to")!).getTime(), maxReach))
    : new Date(maxReach);

  // Pad the busy query by a day on each side so events straddling the range
  // edges are still subtracted.
  const busyMin = new Date(Math.max(from.getTime(), now.getTime()) - DAY_MS).toISOString();
  const busyMax = new Date(to.getTime() + DAY_MS).toISOString();

  const supabase = createServiceClient();
  const [busy, { data: existing }] = await Promise.all([
    link.avoid_conflicts ? fetchBusy(link.user_id, link.conflict_calendar_ids, busyMin, busyMax) : Promise.resolve([]),
    supabase
      .from("scheduling_bookings")
      .select("start_at, end_at")
      .eq("link_id", link.id)
      .eq("status", "confirmed")
      .gte("start_at", busyMin)
      .lte("start_at", busyMax),
  ]);

  const bookings: Interval[] = (existing ?? []).map((b) => ({ start: b.start_at, end: b.end_at }));
  const slots = computeOpenSlots(link, { from, to, now, busy, bookings });

  return NextResponse.json({ slots, timezone: link.timezone });
}
