// Creates the calendar event for a confirmed booking. The public booking
// flow has no user session, so this uses the service-role token helpers
// (the shared createEvent() in lib/calendar/write-event.ts is session-based).
// It also captures the conferencing join URL (Meet/Teams), which the generic
// writer doesn't surface, so we can email it to the invitee and store it.

import { createServiceClient } from "@/lib/supabase/service";
import {
  getValidGoogleAccessTokenService,
  getValidMicrosoftAccessTokenService,
} from "@/lib/integrations/service-tokens";

export interface BookingEventInput {
  userId:        string;
  calendarId:    string;        // user_calendars.id to write into
  title:         string;
  description:   string | null;
  location:      string | null; // free-text location (phone/address/custom)
  startIso:      string;        // absolute UTC
  endIso:        string;
  attendees:     string[];      // invitee email(s)
  conferencing:  "google_meet" | "teams" | "none";
}

export interface BookingEventResult {
  externalEventId: string | null;
  meetUrl:         string | null;
  htmlLink:        string | null;
}

interface CalRow {
  id: string; provider: string; account_email: string | null;
  external_id: string; writable: boolean;
}

/** Resolves the target calendar + its active integration, then creates the
 *  event with the organizer's service token. Returns nulls on any failure
 *  (booking still records; the organizer can follow up) — callers treat the
 *  event as best-effort but should surface a hard failure if they prefer. */
export async function createBookingEvent(input: BookingEventInput): Promise<BookingEventResult> {
  const supabase = createServiceClient();

  const { data: cal } = await supabase
    .from("user_calendars")
    .select("id, provider, account_email, external_id, writable")
    .eq("id", input.calendarId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!cal) throw new Error("target calendar not found");
  const c = cal as CalRow;

  const fam = c.provider === "google_calendar" ? "google" : c.provider;
  const { data: intgs } = await supabase
    .from("integrations")
    .select("id, provider, account_name, status, scopes")
    .eq("user_id", input.userId)
    .eq("provider", fam);
  const intg =
    (intgs ?? []).find((i) => (i.account_name ?? null) === c.account_email) ??
    (intgs ?? [])[0];
  if (!intg) throw new Error("no integration for target calendar");

  if (fam === "google") return createGoogle(intg.id, c, input);
  if (fam === "microsoft") return createMicrosoft(intg.id, c, input);
  throw new Error(`provider ${fam} not supported`);
}

async function createGoogle(integrationId: string, cal: CalRow, input: BookingEventInput): Promise<BookingEventResult> {
  const token = await getValidGoogleAccessTokenService(integrationId);
  const wantMeet = input.conferencing === "google_meet";
  const body: Record<string, unknown> = {
    summary:     input.title,
    description: input.description ?? "",
    location:    input.location ?? "",
    start:       { dateTime: input.startIso, timeZone: "UTC" },
    end:         { dateTime: input.endIso,   timeZone: "UTC" },
    attendees:   input.attendees.map((email) => ({ email })),
  };
  if (wantMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `perennial-book-${input.startIso}-${cal.id}`.slice(0, 64),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  // sendUpdates=all → Google emails the invitee a calendar invite.
  const qs = `?sendUpdates=all${wantMeet ? "&conferenceDataVersion=1" : ""}`;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.external_id)}/events${qs}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`google event create failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const e = (await res.json()) as {
    id?: string; htmlLink?: string; hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const meet =
    e.hangoutLink ??
    e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
    null;
  return { externalEventId: e.id ?? null, meetUrl: meet, htmlLink: e.htmlLink ?? null };
}

async function createMicrosoft(integrationId: string, cal: CalRow, input: BookingEventInput): Promise<BookingEventResult> {
  const token = await getValidMicrosoftAccessTokenService(integrationId);
  const wantTeams = input.conferencing === "teams";
  const body: Record<string, unknown> = {
    subject:   input.title,
    body:      { contentType: "text", content: input.description ?? "" },
    location:  { displayName: input.location ?? "" },
    start:     { dateTime: input.startIso.replace(/Z$/, ""), timeZone: "UTC" },
    end:       { dateTime: input.endIso.replace(/Z$/, ""),   timeZone: "UTC" },
    attendees: input.attendees.map((email) => ({ emailAddress: { address: email }, type: "required" })),
  };
  if (wantTeams) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(cal.external_id)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`microsoft event create failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const e = (await res.json()) as { id?: string; webLink?: string; onlineMeeting?: { joinUrl?: string } };
  return { externalEventId: e.id ?? null, meetUrl: e.onlineMeeting?.joinUrl ?? null, htmlLink: e.webLink ?? null };
}
