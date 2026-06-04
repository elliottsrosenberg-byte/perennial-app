// Public booking endpoint. Validates the requested slot is genuinely open
// (re-checking live busy times to guard against a slot taken since the page
// loaded), creates the calendar event on the organizer's target calendar
// with a Meet/Teams link + the invitee as an attendee, records the booking,
// and (single-use links) closes the link. No auth — keyed by slug.

import { NextResponse } from "next/server";
import { loadPublicLink, linkClosedReason } from "@/lib/scheduling/public-link";
import { fetchBusy } from "@/lib/scheduling/busy";
import { computeOpenSlots, type Interval } from "@/lib/scheduling/availability";
import { createBookingEvent } from "@/lib/scheduling/create-booking-event";
import { sendBookingEmails } from "@/lib/scheduling/notify";
import { createServiceClient } from "@/lib/supabase/service";
import type { SchedulingLink } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_MS = 60_000;

interface BookBody {
  start?:    string; // absolute ISO of the chosen slot
  name?:     string;
  email?:    string;
  notes?:    string;
  timezone?: string;
}

function locationText(link: SchedulingLink): string | null {
  switch (link.location_type) {
    case "phone":     return link.location_detail ? `Phone: ${link.location_detail}` : "Phone call";
    case "in_person": return link.location_detail || "In person";
    case "custom":    return link.location_detail || null;
    default:          return null; // google_meet / teams — link comes from the event
  }
}

function conferencingFor(link: SchedulingLink): "google_meet" | "teams" | "none" {
  if (link.location_type === "google_meet") return "google_meet";
  if (link.location_type === "teams")       return "teams";
  return "none";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const bundle = await loadPublicLink(slug);
  if (!bundle) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const now = new Date();
  const closed = linkClosedReason(bundle, now);
  if (closed) return NextResponse.json({ error: closed === "expired" ? "This link has expired." : "This link is fully booked." }, { status: 410 });

  const { link } = bundle;
  const body = (await req.json().catch(() => ({}))) as BookBody;
  const email = (body.email ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!body.start) return NextResponse.json({ error: "Pick a time." }, { status: 400 });
  if (!name)       return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const startMs = new Date(body.start).getTime();
  if (!Number.isFinite(startMs)) return NextResponse.json({ error: "Invalid time." }, { status: 400 });
  const endMs = startMs + link.duration_minutes * MIN_MS;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  // Re-validate the slot against fresh availability — the page may have been
  // open a while, or someone else may have just taken it.
  const supabase = createServiceClient();
  const busyMin = new Date(startMs - 24 * 60 * MIN_MS).toISOString();
  const busyMax = new Date(endMs + 24 * 60 * MIN_MS).toISOString();
  const [busy, { data: existing }] = await Promise.all([
    fetchBusy(link.user_id, link.conflict_calendar_ids, busyMin, busyMax),
    supabase
      .from("scheduling_bookings")
      .select("start_at, end_at")
      .eq("link_id", link.id)
      .eq("status", "confirmed")
      .gte("start_at", busyMin).lte("start_at", busyMax),
  ]);
  const bookings: Interval[] = (existing ?? []).map((b) => ({ start: b.start_at, end: b.end_at }));
  const open = computeOpenSlots(link, { from: new Date(startMs), to: new Date(endMs + MIN_MS), now, busy, bookings });
  if (!open.some((s) => s.start === startIso)) {
    return NextResponse.json({ error: "That time is no longer available. Please pick another." }, { status: 409 });
  }

  // Create the calendar event (best-effort; a provider hiccup shouldn't lose
  // the booking, but we do surface a hard failure to the invitee).
  let externalEventId: string | null = null;
  let meetUrl: string | null = null;
  if (link.target_calendar_id) {
    try {
      const result = await createBookingEvent({
        userId:       link.user_id,
        calendarId:   link.target_calendar_id,
        title:        `${link.title} — ${name}`,
        description:  [link.description, body.notes ? `Notes: ${body.notes}` : null, "Booked via Perennial"]
                        .filter(Boolean).join("\n\n"),
        location:     locationText(link),
        startIso, endIso,
        attendees:    [email],
        conferencing: conferencingFor(link),
      });
      externalEventId = result.externalEventId;
      meetUrl = result.meetUrl;
    } catch (e) {
      console.error("[book] event create failed:", e);
      return NextResponse.json({ error: "Couldn't reach the organizer's calendar. Please try again." }, { status: 502 });
    }
  }

  const { data: booking, error } = await supabase
    .from("scheduling_bookings")
    .insert({
      link_id:            link.id,
      user_id:            link.user_id,
      invitee_name:       name,
      invitee_email:      email,
      invitee_notes:      body.notes ?? null,
      start_at:           startIso,
      end_at:             endIso,
      timezone:           body.timezone ?? link.timezone,
      status:             "confirmed",
      external_event_id:  externalEventId,
      target_calendar_id: link.target_calendar_id,
      meet_url:           meetUrl,
    })
    .select()
    .single();
  if (error) {
    console.error("[book] booking insert failed:", error);
    return NextResponse.json({ error: "Couldn't save the booking." }, { status: 500 });
  }

  // Single-use links close after the first booking.
  if (link.single_use) {
    await supabase.from("scheduling_links").update({ active: false }).eq("id", link.id);
  }

  // Perennial-branded confirmation emails (best-effort; the calendar provider
  // also sends its own invite via sendUpdates=all).
  await sendBookingEmails(booking.id);

  return NextResponse.json({
    ok: true,
    booking: {
      start: startIso,
      end:   endIso,
      meet_url: meetUrl,
      location: locationText(link),
      organizer: bundle.organizer.name,
    },
  });
}
