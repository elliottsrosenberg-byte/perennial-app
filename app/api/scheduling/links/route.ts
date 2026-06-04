// Owner-facing CRUD for scheduling links. GET lists the signed-in user's
// links (with a booking count); POST creates a new link, minting a unique
// public slug from the title. All access is gated by the regular Supabase
// session + RLS (users manage own scheduling links).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mintSlug } from "@/lib/scheduling/slug";
import type { SchedulingLinkKind, SchedulingLocationType, SchedulingAvailability } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: links, error } = await supabase
    .from("scheduling_links")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Confirmed-booking counts per link, so the panel can show "3 booked".
  const { data: bookings } = await supabase
    .from("scheduling_bookings")
    .select("link_id")
    .eq("user_id", user.id)
    .eq("status", "confirmed");
  const counts: Record<string, number> = {};
  for (const b of bookings ?? []) counts[b.link_id] = (counts[b.link_id] ?? 0) + 1;

  return NextResponse.json({
    links: (links ?? []).map((l) => ({ ...l, booking_count: counts[l.id] ?? 0 })),
  });
}

interface CreateBody {
  title?:                  string;
  description?:            string | null;
  kind?:                   SchedulingLinkKind;
  duration_minutes?:       number;
  slot_increment_minutes?: number | null;
  location_type?:          SchedulingLocationType;
  location_detail?:        string | null;
  timezone?:               string;
  availability?:           SchedulingAvailability;
  buffer_before_minutes?:  number;
  buffer_after_minutes?:   number;
  min_notice_minutes?:     number;
  booking_window_days?:    number;
  target_calendar_id?:     string | null;
  conflict_calendar_ids?:  string[] | null;
  expires_at?:             string | null;
  single_use?:             boolean;
  max_bookings?:           number | null;
  active?:                 boolean;
}

// A sensible default weekly availability: Mon–Fri, 9–5 in the link's tz.
const DEFAULT_WEEKLY: SchedulingAvailability = {
  weekly_hours: {
    "1": [{ start: "09:00", end: "17:00" }],
    "2": [{ start: "09:00", end: "17:00" }],
    "3": [{ start: "09:00", end: "17:00" }],
    "4": [{ start: "09:00", end: "17:00" }],
    "5": [{ start: "09:00", end: "17:00" }],
  },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const title = (body.title ?? "").trim() || "Meeting";
  const kind: SchedulingLinkKind = body.kind === "one_off" ? "one_off" : "recurring";

  // Default the write-target to the user's default calendar if not specified.
  let targetCal = body.target_calendar_id ?? null;
  if (!targetCal) {
    const { data: profile } = await supabase
      .from("profiles").select("default_calendar_id").eq("user_id", user.id).maybeSingle();
    targetCal = (profile?.default_calendar_id as string | null) ?? null;
  }

  const row = {
    user_id:                user.id,
    slug:                   mintSlug(title),
    title,
    description:            body.description ?? null,
    kind,
    duration_minutes:       body.duration_minutes ?? 30,
    slot_increment_minutes: body.slot_increment_minutes ?? null,
    location_type:          body.location_type ?? "google_meet",
    location_detail:        body.location_detail ?? null,
    timezone:               body.timezone ?? "America/New_York",
    availability:           body.availability ?? (kind === "one_off" ? { windows: [] } : DEFAULT_WEEKLY),
    buffer_before_minutes:  body.buffer_before_minutes ?? 0,
    buffer_after_minutes:   body.buffer_after_minutes ?? 0,
    min_notice_minutes:     body.min_notice_minutes ?? 240,
    booking_window_days:    body.booking_window_days ?? 30,
    target_calendar_id:     targetCal,
    conflict_calendar_ids:  body.conflict_calendar_ids ?? null,
    expires_at:             body.expires_at ?? null,
    single_use:             body.single_use ?? false,
    max_bookings:           body.max_bookings ?? null,
    active:                 body.active ?? true,
  };

  const { data, error } = await supabase
    .from("scheduling_links")
    .insert(row)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ link: { ...data, booking_count: 0 } });
}
