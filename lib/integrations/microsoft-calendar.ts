// Outlook Calendar sync via Microsoft Graph. Mirror of
// google-calendar.ts — same matching/dedup/window strategy.

import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftAccessToken } from "./microsoft-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import type { IntegrationRow } from "./types";

const GRAPH_EVENTS = "https://graph.microsoft.com/v1.0/me/events";
const WINDOW_PAST_DAYS   = 30;
const WINDOW_FUTURE_DAYS = 90;
const MAX_EVENTS_PER_RUN = 500;
const PAGE_SIZE          = 100;

interface GraphAttendee {
  emailAddress?: { name?: string; address?: string };
  status?:       { response?: string };
}
interface GraphEvent {
  id:           string;
  subject?:     string;
  bodyPreview?: string;
  start?:       { dateTime?: string; timeZone?: string };
  end?:         { dateTime?: string; timeZone?: string };
  location?:    { displayName?: string };
  attendees?:   GraphAttendee[];
  webLink?:     string;
  isCancelled?: boolean;
}
interface GraphEventListResponse {
  value:           GraphEvent[];
  "@odata.nextLink"?: string;
}

interface SyncResult {
  eventsScanned: number;
  activitiesCreated: number;
  contactsMatched: number;
}

export async function syncMicrosoftCalendar(integration: IntegrationRow): Promise<SyncResult> {
  if (integration.provider !== "microsoft" || !integration.scopes?.calendar) {
    return { eventsScanned: 0, activitiesCreated: 0, contactsMatched: 0 };
  }

  const supabase = await createClient();
  const userId   = integration.user_id;

  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("user_id", userId)
    .eq("archived", false)
    .not("email", "is", null);
  if (contactsErr) throw new Error(`syncMicrosoftCalendar: load contacts failed: ${contactsErr.message}`);

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
      outlook_calendar_last_synced_at: new Date().toISOString(),
      outlook_calendar_last_events:    0,
    });
    return { eventsScanned: 0, activitiesCreated: 0, contactsMatched: 0 };
  }

  const token = await getValidMicrosoftAccessToken(integration.id);

  const now     = new Date();
  const startIso = new Date(now.getTime() - WINDOW_PAST_DAYS   * 86400_000).toISOString();
  const endIso   = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86400_000).toISOString();

  // calendarView endpoint expands recurrences for us in the requested
  // window — equivalent to gcal's singleEvents=true.
  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${encodeURIComponent(startIso)}` +
    `&endDateTime=${encodeURIComponent(endIso)}` +
    `&$select=${encodeURIComponent("id,subject,bodyPreview,start,end,location,attendees,webLink,isCancelled")}` +
    `&$top=${PAGE_SIZE}&$orderby=start/dateTime asc`;

  const events: GraphEvent[] = [];
  while (nextUrl && events.length < MAX_EVENTS_PER_RUN) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph /me/calendarView ${res.status}: ${body.slice(0, 300)}`);
    }
    const list = await res.json() as GraphEventListResponse;
    if (list.value?.length) events.push(...list.value);
    nextUrl = list["@odata.nextLink"] ?? null;
  }

  let activitiesCreated = 0;
  const matchedContactIds = new Set<string>();

  for (const e of events) {
    if (e.isCancelled) continue;
    if (!e.attendees || e.attendees.length === 0) continue;

    const matchedThisEvent = new Set<string>();
    for (const a of e.attendees) {
      const email = a.emailAddress?.address?.trim().toLowerCase();
      if (!email) continue;
      const ids = emailToContactIds.get(email);
      if (ids) ids.forEach((id) => matchedThisEvent.add(id));
    }
    if (matchedThisEvent.size === 0) continue;

    // Graph dateTime is unzoned ISO; combine with timeZone for accuracy.
    // For matching/sorting we just use the dateTime as-is (UTC-equivalent).
    const occurredAtIso = e.start?.dateTime
      ? new Date(e.start.dateTime + "Z").toISOString()
      : new Date().toISOString();
    const occurredTs    = new Date(occurredAtIso).getTime();
    const subject       = e.subject ?? "(no title)";
    const location      = e.location?.displayName ?? null;
    const description   = e.bodyPreview ? e.bodyPreview.slice(0, 500) : null;
    const content       = location ? `${subject} — ${location}` : subject;

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
            source:         "microsoft_calendar",
            integration_id: integration.id,
            // Reuse gcal_event_id key so the existing dedup index covers
            // both providers.
            gcal_event_id:  e.id,
            subject, location, description,
            attendees:      e.attendees.map((a) => ({
              email:    a.emailAddress?.address,
              name:     a.emailAddress?.name,
              response: a.status?.response,
            })),
            web_link:       e.webLink ?? null,
          },
        });

      if (insertErr) {
        if (insertErr.code === "23505") continue;
        throw new Error(`contact_activities insert failed: ${insertErr.message}`);
      }
      activitiesCreated++;

      if (occurredTs <= Date.now() + 60_000) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("last_contacted_at")
          .eq("id", contactId)
          .single();
        const existingTs = contact?.last_contacted_at ? new Date(contact.last_contacted_at).getTime() : 0;
        if (occurredTs > existingTs) {
          await supabase.from("contacts").update({ last_contacted_at: occurredAtIso }).eq("id", contactId);
        }
      }
    }
  }

  await recordSyncSuccess(integration.id, {
    ...integration.sync_state,
    outlook_calendar_last_synced_at: new Date().toISOString(),
    outlook_calendar_last_events:    events.length,
    outlook_calendar_last_activities: activitiesCreated,
  });

  return { eventsScanned: events.length, activitiesCreated, contactsMatched: matchedContactIds.size };
}

export async function safeSyncMicrosoftCalendar(integration: IntegrationRow): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  try {
    const result = await syncMicrosoftCalendar(integration);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}
