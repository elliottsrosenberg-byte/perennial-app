// Google Calendar sync: pulls events in a sliding window, matches
// attendees against the user's Perennial contacts, and writes one
// `contact_activities` row per matched contact per event. Dedup is
// enforced by a partial unique index on
// (contact_id, metadata->>'gcal_event_id').
//
// v1 design:
//   - Window: last 30 days + next 90 days (so scheduled meetings show
//     up in the activity feed with the "Scheduled" badge ActivityTab
//     already renders)
//   - singleEvents=true expands recurring series into instances so
//     each instance gets its own activity
//   - Hard cap of 500 events per run

import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "./google-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import type { IntegrationRow } from "./types";

const GCAL_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const WINDOW_PAST_DAYS   = 30;
const WINDOW_FUTURE_DAYS = 90;
const MAX_EVENTS_PER_RUN = 500;
const PAGE_SIZE          = 250;

interface GCalAttendee {
  email?:         string;
  displayName?:   string;
  responseStatus?: string;
  self?:          boolean;
}

interface GCalEvent {
  id:           string;
  summary?:     string;
  description?: string;
  location?:    string;
  start?:       { dateTime?: string; date?: string };
  end?:         { dateTime?: string; date?: string };
  attendees?:   GCalAttendee[];
  htmlLink?:    string;
  status?:      string; // "confirmed" | "tentative" | "cancelled"
}

interface GCalListResponse {
  items?:         GCalEvent[];
  nextPageToken?: string;
}

interface SyncResult {
  eventsScanned:     number;
  activitiesCreated: number;
  contactsMatched:   number;
}

function eventStartIso(e: GCalEvent): string {
  const s = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
  return s ?? new Date().toISOString();
}

export async function syncGoogleCalendar(integration: IntegrationRow): Promise<SyncResult> {
  if (integration.provider !== "google" || !integration.scopes?.calendar) {
    return { eventsScanned: 0, activitiesCreated: 0, contactsMatched: 0 };
  }

  const supabase = await createClient();
  const userId   = integration.user_id;

  // Load matchable contacts (lowercase email → contact ids)
  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("user_id", userId)
    .eq("archived", false)
    .not("email", "is", null);
  if (contactsErr) throw new Error(`syncGoogleCalendar: load contacts failed: ${contactsErr.message}`);

  const emailToContactIds = new Map<string, string[]>();
  for (const c of contacts ?? []) {
    if (!c.email) continue;
    const key = c.email.trim().toLowerCase();
    const arr = emailToContactIds.get(key) ?? [];
    arr.push(c.id);
    emailToContactIds.set(key, arr);
  }

  if (emailToContactIds.size === 0) {
    await recordSyncSuccess(integration.id, {
      ...integration.sync_state,
      gcal_last_synced_at: new Date().toISOString(),
      gcal_last_events:    0,
    });
    return { eventsScanned: 0, activitiesCreated: 0, contactsMatched: 0 };
  }

  const token   = await getValidGoogleAccessToken(integration.id);
  const ownEmail = integration.account_name?.toLowerCase() ?? null;

  const now     = new Date();
  const timeMin = new Date(now.getTime() - WINDOW_PAST_DAYS   * 86400_000).toISOString();
  const timeMax = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86400_000).toISOString();

  // ── Pull events (paginated) ────────────────────────────────────────
  const events: GCalEvent[] = [];
  let pageToken: string | undefined = undefined;

  while (events.length < MAX_EVENTS_PER_RUN) {
    const url = new URL(GCAL_API);
    url.searchParams.set("timeMin",      timeMin);
    url.searchParams.set("timeMax",      timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy",      "startTime");
    url.searchParams.set("maxResults",   String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Calendar events.list ${res.status}: ${body.slice(0, 300)}`);
    }
    const list = await res.json() as GCalListResponse;
    if (list.items?.length) events.push(...list.items);
    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }

  // ── Match + write ──────────────────────────────────────────────────
  let activitiesCreated = 0;
  const matchedContactIds = new Set<string>();

  for (const e of events) {
    if (e.status === "cancelled") continue;
    if (!e.attendees || e.attendees.length === 0) continue;

    const matchedThisEvent = new Set<string>();
    for (const a of e.attendees) {
      if (!a.email) continue;
      const ids = emailToContactIds.get(a.email.trim().toLowerCase());
      if (ids) ids.forEach((id) => matchedThisEvent.add(id));
    }
    if (matchedThisEvent.size === 0) continue;

    const occurredAtIso = eventStartIso(e);
    const occurredTs    = new Date(occurredAtIso).getTime();
    const summary       = e.summary ?? "(no title)";
    const location      = e.location ?? null;
    const description   = e.description ? e.description.slice(0, 500) : null;

    const content = location
      ? `${summary} — ${location}`
      : summary;

    for (const contactId of matchedThisEvent) {
      matchedContactIds.add(contactId);

      const { error: insertErr } = await supabase
        .from("contact_activities")
        .insert({
          user_id:     userId,
          contact_id:  contactId,
          type:        "meeting",
          content,
          occurred_at: occurredAtIso,
          metadata: {
            source:         "google_calendar",
            integration_id: integration.id,
            gcal_event_id:  e.id,
            summary, location, description,
            attendees:      e.attendees?.map((a) => ({ email: a.email, name: a.displayName, response: a.responseStatus })),
            html_link:      e.htmlLink ?? null,
          },
        });

      if (insertErr) {
        if (insertErr.code === "23505") continue; // dedup
        throw new Error(`contact_activities insert failed: ${insertErr.message}`);
      }
      activitiesCreated++;

      // Bump last_contacted_at only for past-or-now meetings; scheduled
      // future events shouldn't mark the contact as freshly contacted.
      if (occurredTs <= Date.now() + 60_000) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("last_contacted_at")
          .eq("id", contactId)
          .single();
        const existingTs = contact?.last_contacted_at ? new Date(contact.last_contacted_at).getTime() : 0;
        if (occurredTs > existingTs) {
          await supabase.from("contacts")
            .update({ last_contacted_at: occurredAtIso })
            .eq("id", contactId);
        }
      }
    }
  }

  await recordSyncSuccess(integration.id, {
    ...integration.sync_state,
    gcal_last_synced_at:   new Date().toISOString(),
    gcal_last_events:      events.length,
    gcal_last_activities:  activitiesCreated,
  });

  return { eventsScanned: events.length, activitiesCreated, contactsMatched: matchedContactIds.size };
}

export async function safeSyncGoogleCalendar(integration: IntegrationRow): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  try {
    const result = await syncGoogleCalendar(integration);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}
