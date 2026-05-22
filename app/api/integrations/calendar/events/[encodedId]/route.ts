// PATCH/DELETE for a single external calendar event. `encodedId` is the
// URL-encoded form of `${provider}:${external_event_id}` so a single
// route handles both Google and Microsoft events without needing two
// separate paths.
//
// The body for PATCH accepts the same fields as POST /events, all
// optional — pass only the ones that changed.
//
// Both routes also require `calendar_id` (the user_calendars.id) so we
// can resolve the right integration, validate writability, and pick the
// right provider endpoint.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveWritableCalendar, patchEvent, deleteEvent } from "@/lib/calendar/write-event";

export const runtime = "nodejs";

interface PatchBody {
  calendar_id?:  string;
  title?:        string;
  start_iso?:    string;
  end_iso?:      string;
  all_day?:      boolean;
  description?:  string | null;
  location?:     string | null;
  attendees?:    string[];
  recurrence?:   string[] | null;
}

function decodeEventRef(encoded: string): { provider: string; externalId: string } | null {
  const raw = decodeURIComponent(encoded);
  const ix  = raw.indexOf(":");
  if (ix < 1) return null;
  return { provider: raw.slice(0, ix), externalId: raw.slice(ix + 1) };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ encodedId: string }> }) {
  const { encodedId } = await ctx.params;
  const ref = decodeEventRef(encodedId);
  if (!ref) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (!body.calendar_id) return NextResponse.json({ error: "calendar_id required" }, { status: 400 });

  const lookup = await resolveWritableCalendar(user.id, body.calendar_id);
  if (!lookup) return NextResponse.json({ error: "calendar not found" }, { status: 404 });

  const result = await patchEvent(lookup, ref.externalId, {
    title:       body.title,
    start_iso:   body.start_iso,
    end_iso:     body.end_iso,
    all_day:     body.all_day,
    description: body.description,
    location:    body.location,
    attendees:   body.attendees,
    recurrence:  body.recurrence ?? undefined,
  });

  if (result.kind === "ok")        return NextResponse.json({ event: result.event });
  if (result.kind === "ok_noop")   return NextResponse.json({ ok: true });
  if (result.kind === "not_writable_calendar") {
    return NextResponse.json({ error: "not_writable_calendar" }, { status: 400 });
  }
  if (result.kind === "scope_upgrade_required") {
    return NextResponse.json(
      { error: "scope_upgrade_required", provider: result.provider, reconnect_url: result.reconnect_url },
      { status: 412 },
    );
  }
  return NextResponse.json({ error: result.message }, { status: result.status });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ encodedId: string }> }) {
  const { encodedId } = await ctx.params;
  const ref = decodeEventRef(encodedId);
  if (!ref) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // DELETE has no body in some clients; accept calendar_id from either
  // body or query string for flexibility.
  let calendarId: string | undefined;
  try {
    const body = await req.json() as { calendar_id?: string };
    calendarId = body.calendar_id;
  } catch {
    // ignore — fall through to query
  }
  if (!calendarId) {
    const url = new URL(req.url);
    calendarId = url.searchParams.get("calendar_id") ?? undefined;
  }
  if (!calendarId) return NextResponse.json({ error: "calendar_id required" }, { status: 400 });

  const lookup = await resolveWritableCalendar(user.id, calendarId);
  if (!lookup) return NextResponse.json({ error: "calendar not found" }, { status: 404 });

  const result = await deleteEvent(lookup, ref.externalId);

  if (result.kind === "ok_noop")   return NextResponse.json({ ok: true });
  if (result.kind === "ok")        return NextResponse.json({ ok: true });
  if (result.kind === "not_writable_calendar") {
    return NextResponse.json({ error: "not_writable_calendar" }, { status: 400 });
  }
  if (result.kind === "scope_upgrade_required") {
    return NextResponse.json(
      { error: "scope_upgrade_required", provider: result.provider, reconnect_url: result.reconnect_url },
      { status: 412 },
    );
  }
  return NextResponse.json({ error: result.message }, { status: result.status });
}
