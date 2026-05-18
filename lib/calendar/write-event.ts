// Write-side helpers for the Calendar module. Mirrors the read-side
// aggregator's normalized CalendarEvent shape so the UI can optimistically
// merge a created/updated event without re-fetching the whole week.
//
// Provider behavior:
//   - google:           POST/PATCH/DELETE /calendar/v3/calendars/{id}/events
//   - microsoft:        POST/PATCH/DELETE /me/calendars/{id}/events
//   - google_calendar:  legacy — read-only by design, write requests 412
//
// All three return a typed result so the route handlers can map 401/403
// from the provider to a friendly 412 `scope_upgrade_required` payload
// the client renders as "Reconnect to enable write access".

import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken }    from "@/lib/integrations/google-tokens";
import { getValidMicrosoftAccessToken } from "@/lib/integrations/microsoft-tokens";
import type { UserCalendar } from "@/types/database";

export interface NormalizedCalendarEvent {
  id:          string;
  title:       string;
  start:       string;
  end:         string;
  allDay:      boolean;
  description: string | null;
  location:    string | null;
  htmlLink:    string | null;
  colorId:     string | null;
  source:      "google" | "microsoft";
  accountName: string | null;
}

export interface CalendarEventInput {
  title:        string;
  start_iso:    string;
  end_iso:      string;
  all_day:      boolean;
  description?: string | null;
  location?:    string | null;
  attendees?:   string[];
}

export type CalendarWriteResult =
  | { kind: "ok"; event: NormalizedCalendarEvent }
  | { kind: "ok_noop" }
  | { kind: "scope_upgrade_required"; provider: "google" | "microsoft"; reconnect_url: string }
  | { kind: "not_writable_calendar" }
  | { kind: "provider_error"; status: number; message: string };

interface CalendarLookup {
  cal:           UserCalendar;
  integrationId: string | null;
  accountName:   string | null;
}

/** Look up the user_calendars row + the matching integration row id so the
 *  caller can refresh tokens. Returns null if the calendar doesn't belong
 *  to the user or has no matching integration (e.g. provider removed). */
export async function resolveWritableCalendar(
  userId:     string,
  calendarId: string,
): Promise<CalendarLookup | null> {
  const supabase = await createClient();

  const { data: cal } = await supabase
    .from("user_calendars")
    .select("*")
    .eq("id", calendarId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!cal) return null;

  // Match by provider + account_email so the user with multiple Google
  // accounts hits the correct integration row.
  const { data: intgs } = await supabase
    .from("integrations")
    .select("id, account_name, scopes")
    .eq("user_id", userId)
    .eq("provider", cal.provider);

  const candidate =
    intgs?.find((i) => (i.account_name ?? null) === cal.account_email) ??
    intgs?.[0] ?? null;

  return {
    cal:           cal as UserCalendar,
    integrationId: candidate?.id ?? null,
    accountName:   candidate?.account_name ?? null,
  };
}

export async function createEvent(
  lookup: CalendarLookup,
  input:  CalendarEventInput,
): Promise<CalendarWriteResult> {
  if (!lookup.cal.writable) return { kind: "not_writable_calendar" };
  if (!lookup.integrationId) return { kind: "provider_error", status: 400, message: "no integration" };

  if (lookup.cal.provider === "google" || lookup.cal.provider === "google_calendar") {
    return createGoogleEvent(lookup, input);
  }
  if (lookup.cal.provider === "microsoft") {
    return createMicrosoftEvent(lookup, input);
  }
  return { kind: "provider_error", status: 400, message: `provider ${lookup.cal.provider} not supported` };
}

export async function patchEvent(
  lookup:           CalendarLookup,
  externalEventId:  string,
  input:            Partial<CalendarEventInput>,
): Promise<CalendarWriteResult> {
  if (!lookup.cal.writable) return { kind: "not_writable_calendar" };
  if (!lookup.integrationId) return { kind: "provider_error", status: 400, message: "no integration" };

  if (lookup.cal.provider === "google" || lookup.cal.provider === "google_calendar") {
    return patchGoogleEvent(lookup, externalEventId, input);
  }
  if (lookup.cal.provider === "microsoft") {
    return patchMicrosoftEvent(lookup, externalEventId, input);
  }
  return { kind: "provider_error", status: 400, message: `provider ${lookup.cal.provider} not supported` };
}

export async function deleteEvent(
  lookup:          CalendarLookup,
  externalEventId: string,
): Promise<CalendarWriteResult> {
  if (!lookup.cal.writable) return { kind: "not_writable_calendar" };
  if (!lookup.integrationId) return { kind: "provider_error", status: 400, message: "no integration" };

  if (lookup.cal.provider === "google" || lookup.cal.provider === "google_calendar") {
    return deleteGoogleEvent(lookup, externalEventId);
  }
  if (lookup.cal.provider === "microsoft") {
    return deleteMicrosoftEvent(lookup, externalEventId);
  }
  return { kind: "provider_error", status: 400, message: `provider ${lookup.cal.provider} not supported` };
}

// ── Google ─────────────────────────────────────────────────────────────────

function googleReconnectUrl(): string {
  return "/api/auth/google?next=/calendar";
}

function googleBody(input: Partial<CalendarEventInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title       !== undefined) body.summary     = input.title;
  if (input.description !== undefined) body.description = input.description ?? "";
  if (input.location    !== undefined) body.location    = input.location ?? "";
  if (input.start_iso || input.end_iso || input.all_day !== undefined) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (input.all_day) {
      if (input.start_iso) body.start = { date: input.start_iso.slice(0, 10) };
      if (input.end_iso)   body.end   = { date: input.end_iso.slice(0, 10) };
    } else {
      if (input.start_iso) body.start = { dateTime: input.start_iso, timeZone: tz };
      if (input.end_iso)   body.end   = { dateTime: input.end_iso,   timeZone: tz };
    }
  }
  if (input.attendees && input.attendees.length > 0) {
    body.attendees = input.attendees.map((email) => ({ email }));
  }
  return body;
}

async function createGoogleEvent(lookup: CalendarLookup, input: CalendarEventInput): Promise<CalendarWriteResult> {
  const token = await getValidGoogleAccessToken(lookup.integrationId!).catch(() => null);
  if (!token) return { kind: "scope_upgrade_required", provider: "google", reconnect_url: googleReconnectUrl() };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(lookup.cal.external_id)}/events`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(googleBody(input)),
    },
  );

  if (res.status === 401 || res.status === 403) {
    return { kind: "scope_upgrade_required", provider: "google", reconnect_url: googleReconnectUrl() };
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { kind: "provider_error", status: res.status, message: txt.slice(0, 280) };
  }
  const e = await res.json() as GCalApiEvent;
  return { kind: "ok", event: normalizeGoogleEvent(e, lookup.accountName) };
}

async function patchGoogleEvent(lookup: CalendarLookup, eventId: string, input: Partial<CalendarEventInput>): Promise<CalendarWriteResult> {
  const token = await getValidGoogleAccessToken(lookup.integrationId!).catch(() => null);
  if (!token) return { kind: "scope_upgrade_required", provider: "google", reconnect_url: googleReconnectUrl() };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(lookup.cal.external_id)}/events/${encodeURIComponent(eventId)}`,
    {
      method:  "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(googleBody(input)),
    },
  );

  if (res.status === 401 || res.status === 403) {
    return { kind: "scope_upgrade_required", provider: "google", reconnect_url: googleReconnectUrl() };
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { kind: "provider_error", status: res.status, message: txt.slice(0, 280) };
  }
  const e = await res.json() as GCalApiEvent;
  return { kind: "ok", event: normalizeGoogleEvent(e, lookup.accountName) };
}

async function deleteGoogleEvent(lookup: CalendarLookup, eventId: string): Promise<CalendarWriteResult> {
  const token = await getValidGoogleAccessToken(lookup.integrationId!).catch(() => null);
  if (!token) return { kind: "scope_upgrade_required", provider: "google", reconnect_url: googleReconnectUrl() };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(lookup.cal.external_id)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 401 || res.status === 403) {
    return { kind: "scope_upgrade_required", provider: "google", reconnect_url: googleReconnectUrl() };
  }
  // Google returns 204 No Content on success; 410 Gone is also fine
  // (the event was already deleted out-of-band — treat as success).
  if (res.ok || res.status === 204 || res.status === 410) {
    return { kind: "ok_noop" };
  }
  const txt = await res.text().catch(() => "");
  return { kind: "provider_error", status: res.status, message: txt.slice(0, 280) };
}

function normalizeGoogleEvent(e: GCalApiEvent, accountName: string | null): NormalizedCalendarEvent {
  const allDay = !!e.start?.date;
  return {
    id:          e.id,
    title:       e.summary ?? "(No title)",
    start:       e.start?.dateTime ?? e.start?.date ?? "",
    end:         e.end?.dateTime   ?? e.end?.date   ?? "",
    allDay,
    description: e.description ?? null,
    location:    e.location ?? null,
    htmlLink:    e.htmlLink ?? null,
    colorId:     e.colorId ?? null,
    source:      "google",
    accountName,
  };
}

interface GCalApiEvent {
  id:           string;
  summary?:     string;
  description?: string;
  location?:    string;
  colorId?:     string;
  htmlLink?:    string;
  start?:       { dateTime?: string; date?: string };
  end?:         { dateTime?: string; date?: string };
}

// ── Microsoft ──────────────────────────────────────────────────────────────

function microsoftReconnectUrl(): string {
  return "/api/auth/microsoft?next=/calendar";
}

function microsoftBody(input: Partial<CalendarEventInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title       !== undefined) body.subject  = input.title;
  if (input.location    !== undefined) body.location = { displayName: input.location ?? "" };
  if (input.description !== undefined) body.body     = { contentType: "text", content: input.description ?? "" };
  if (input.all_day !== undefined) body.isAllDay = !!input.all_day;
  if (input.start_iso || input.end_iso || input.all_day !== undefined) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (input.all_day) {
      // Graph requires all-day events to start/end at midnight in the
      // specified timeZone. Caller passes a date-only or midnight ISO;
      // we coerce to midnight regardless.
      if (input.start_iso) body.start = { dateTime: input.start_iso.slice(0, 10) + "T00:00:00", timeZone: tz };
      if (input.end_iso)   body.end   = { dateTime: input.end_iso.slice(0, 10)   + "T00:00:00", timeZone: tz };
    } else {
      if (input.start_iso) body.start = { dateTime: input.start_iso, timeZone: tz };
      if (input.end_iso)   body.end   = { dateTime: input.end_iso,   timeZone: tz };
    }
  }
  if (input.attendees && input.attendees.length > 0) {
    body.attendees = input.attendees.map((email) => ({
      emailAddress: { address: email },
      type:         "required",
    }));
  }
  return body;
}

async function createMicrosoftEvent(lookup: CalendarLookup, input: CalendarEventInput): Promise<CalendarWriteResult> {
  const token = await getValidMicrosoftAccessToken(lookup.integrationId!).catch(() => null);
  if (!token) return { kind: "scope_upgrade_required", provider: "microsoft", reconnect_url: microsoftReconnectUrl() };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(lookup.cal.external_id)}/events`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(microsoftBody(input)),
    },
  );

  if (res.status === 401 || res.status === 403) {
    return { kind: "scope_upgrade_required", provider: "microsoft", reconnect_url: microsoftReconnectUrl() };
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { kind: "provider_error", status: res.status, message: txt.slice(0, 280) };
  }
  const e = await res.json() as GraphApiEvent;
  return { kind: "ok", event: normalizeMicrosoftEvent(e, lookup.accountName) };
}

async function patchMicrosoftEvent(lookup: CalendarLookup, eventId: string, input: Partial<CalendarEventInput>): Promise<CalendarWriteResult> {
  const token = await getValidMicrosoftAccessToken(lookup.integrationId!).catch(() => null);
  if (!token) return { kind: "scope_upgrade_required", provider: "microsoft", reconnect_url: microsoftReconnectUrl() };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(lookup.cal.external_id)}/events/${encodeURIComponent(eventId)}`,
    {
      method:  "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(microsoftBody(input)),
    },
  );

  if (res.status === 401 || res.status === 403) {
    return { kind: "scope_upgrade_required", provider: "microsoft", reconnect_url: microsoftReconnectUrl() };
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { kind: "provider_error", status: res.status, message: txt.slice(0, 280) };
  }
  const e = await res.json() as GraphApiEvent;
  return { kind: "ok", event: normalizeMicrosoftEvent(e, lookup.accountName) };
}

async function deleteMicrosoftEvent(lookup: CalendarLookup, eventId: string): Promise<CalendarWriteResult> {
  const token = await getValidMicrosoftAccessToken(lookup.integrationId!).catch(() => null);
  if (!token) return { kind: "scope_upgrade_required", provider: "microsoft", reconnect_url: microsoftReconnectUrl() };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(lookup.cal.external_id)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 401 || res.status === 403) {
    return { kind: "scope_upgrade_required", provider: "microsoft", reconnect_url: microsoftReconnectUrl() };
  }
  if (res.ok || res.status === 204 || res.status === 404) {
    return { kind: "ok_noop" };
  }
  const txt = await res.text().catch(() => "");
  return { kind: "provider_error", status: res.status, message: txt.slice(0, 280) };
}

function normalizeMicrosoftEvent(e: GraphApiEvent, accountName: string | null): NormalizedCalendarEvent {
  const isAllDay = !!e.isAllDay;
  const startStr = isAllDay
    ? (e.start?.dateTime ?? "").slice(0, 10)
    : (e.start?.dateTime ?? "");
  const endStr   = isAllDay
    ? (e.end?.dateTime   ?? "").slice(0, 10)
    : (e.end?.dateTime   ?? "");
  return {
    id:          e.id,
    title:       e.subject ?? "(No title)",
    start:       startStr,
    end:         endStr,
    allDay:      isAllDay,
    description: e.bodyPreview ?? null,
    location:    e.location?.displayName ?? null,
    htmlLink:    e.webLink ?? null,
    colorId:     null,
    source:      "microsoft",
    accountName,
  };
}

interface GraphApiEvent {
  id:           string;
  subject?:     string;
  bodyPreview?: string;
  isAllDay?:    boolean;
  webLink?:     string;
  location?:    { displayName?: string };
  start?:       { dateTime?: string; timeZone?: string };
  end?:         { dateTime?: string; timeZone?: string };
}
