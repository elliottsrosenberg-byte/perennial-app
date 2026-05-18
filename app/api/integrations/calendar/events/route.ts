// Aggregator: returns calendar events from every connected calendar
// provider the user owns. Today that means:
//   - google_calendar (legacy standalone — kept for users who connected
//     before the unified `google` integration shipped)
//   - google (unified) with the `calendar` sub-scope
//   - microsoft with the `calendar` sub-scope
//
// The CalendarClient calls this once per week-change and gets a single
// merged list back, so the UI doesn't have to know about provider sprawl.
//
// Returned shape is the same CalendarEvent type both readers produce — a
// thin normalization over Google's events.get and Microsoft Graph's
// calendarView. `colorId` is provider-specific; the UI falls back to a
// per-provider default color when it's null.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/integrations/google-tokens";
import { getValidMicrosoftAccessToken } from "@/lib/integrations/microsoft-tokens";
import { syncUserCalendarList } from "@/lib/calendar/sync-calendar-list";
import type { IntegrationRow } from "@/lib/integrations/types";

export const runtime = "nodejs";

interface CalendarEvent {
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

// ── Legacy gcal token refresh (mirror of the existing events route) ──────
async function refreshLegacyGcalToken(integration: LegacyIntegrationRow): Promise<string | null> {
  const now     = new Date();
  const expires = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  if (expires && expires > now && integration.access_token) return integration.access_token;
  if (!integration.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
    }),
  });
  if (!res.ok) return null;
  const { access_token, expires_in } = await res.json() as { access_token: string; expires_in: number };

  const supabase = await createClient();
  await supabase.from("integrations").update({
    access_token,
    token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  }).eq("id", integration.id);

  return access_token;
}

async function fetchGoogleEvents(
  token: string,
  accountName: string | null,
  timeMin: string,
  timeMax: string,
  calendarIds: string[] = ["primary"],
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy:      "startTime",
    maxResults:   "100",
  });
  const lists = await Promise.all(
    calendarIds.map(async (calId) => {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return [] as GCalApiEvent[];
      const data = await res.json() as { items?: GCalApiEvent[] };
      return data.items ?? [];
    }),
  );
  return lists.flat()
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id:          e.id,
      title:       e.summary ?? "(No title)",
      start:       e.start.dateTime ?? e.start.date ?? "",
      end:         e.end.dateTime   ?? e.end.date   ?? "",
      allDay:      !!e.start.date,
      description: e.description ?? null,
      location:    e.location ?? null,
      htmlLink:    e.htmlLink ?? null,
      colorId:     e.colorId ?? null,
      source:      "google",
      accountName,
    }));
}

async function fetchMicrosoftEvents(
  token: string,
  accountName: string | null,
  startIso: string,
  endIso: string,
  calendarIds: string[] | null = null,
): Promise<CalendarEvent[]> {
  const select = encodeURIComponent("id,subject,bodyPreview,start,end,location,webLink,isAllDay,isCancelled");
  async function fetchOne(path: string): Promise<GraphApiEvent[]> {
    const url =
      `https://graph.microsoft.com/v1.0${path}` +
      `?startDateTime=${encodeURIComponent(startIso)}` +
      `&endDateTime=${encodeURIComponent(endIso)}` +
      `&$select=${select}` +
      `&$top=100&$orderby=start/dateTime asc`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = (await res.json()) as { value?: GraphApiEvent[] };
    return data.value ?? [];
  }
  const lists = calendarIds && calendarIds.length > 0
    ? await Promise.all(calendarIds.map((id) => fetchOne(`/me/calendars/${encodeURIComponent(id)}/calendarView`)))
    : [await fetchOne(`/me/calendarView`)];
  return lists.flat()
    .filter((e) => !e.isCancelled)
    .map((e) => {
      const isAllDay = !!e.isAllDay;
      // Graph returns dateTime as unzoned ISO; the UI parses these as
      // local, which matches Outlook's user-facing display for non-all-day
      // events. For all-day, just keep the date portion.
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
    });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate   = searchParams.get("endDate");
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const timeMin = new Date(startDate + "T00:00:00").toISOString();
  const timeMax = new Date(endDate   + "T23:59:59").toISOString();

  const { data: rows } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .in("provider", ["google_calendar", "google", "microsoft"]);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ connected: false, events: [], sources: [] });
  }

  // Pull the per-account calendar list with visibility flags. If a user
  // has any rows here for a given provider we honor `visible`; if they
  // have none (e.g. they connected before user_calendars shipped) we
  // fall back to primary-only and trigger a background sync so the
  // next request has the full list.
  const { data: userCalendars } = await supabase
    .from("user_calendars")
    .select("provider, external_id, visible")
    .eq("user_id", user.id);
  const calendarsByProvider = new Map<string, { ids: string[]; hasAny: boolean }>();
  for (const c of userCalendars ?? []) {
    const entry = calendarsByProvider.get(c.provider) ?? { ids: [], hasAny: false };
    entry.hasAny = true;
    if (c.visible) entry.ids.push(c.external_id);
    calendarsByProvider.set(c.provider, entry);
  }

  const work: Promise<CalendarEvent[]>[] = [];
  const sources: { provider: string; accountName: string | null }[] = [];
  let needsBackfill = false;

  for (const r of rows) {
    if (r.provider === "google_calendar") {
      const legacy = r as unknown as LegacyIntegrationRow;
      sources.push({ provider: "google_calendar", accountName: legacy.account_name ?? null });
      const entry = calendarsByProvider.get("google_calendar");
      if (!entry) needsBackfill = true;
      const ids = entry?.hasAny && entry.ids.length > 0 ? entry.ids : ["primary"];
      work.push((async () => {
        const token = await refreshLegacyGcalToken(legacy);
        if (!token) return [];
        return fetchGoogleEvents(token, legacy.account_name ?? null, timeMin, timeMax, ids);
      })());
    } else if (r.provider === "google") {
      const row = r as unknown as IntegrationRow;
      if (row.status !== "active" || !row.scopes?.calendar) continue;
      sources.push({ provider: "google", accountName: row.account_name ?? null });
      const entry = calendarsByProvider.get("google");
      if (!entry) needsBackfill = true;
      const ids = entry?.hasAny && entry.ids.length > 0 ? entry.ids : ["primary"];
      work.push((async () => {
        try {
          const token = await getValidGoogleAccessToken(row.id);
          return await fetchGoogleEvents(token, row.account_name ?? null, timeMin, timeMax, ids);
        } catch {
          return [];
        }
      })());
    } else if (r.provider === "microsoft") {
      const row = r as unknown as IntegrationRow;
      if (row.status !== "active" || !row.scopes?.calendar) continue;
      sources.push({ provider: "microsoft", accountName: row.account_name ?? null });
      const entry = calendarsByProvider.get("microsoft");
      if (!entry) needsBackfill = true;
      const ids = entry?.hasAny && entry.ids.length > 0 ? entry.ids : null;
      work.push((async () => {
        try {
          const token = await getValidMicrosoftAccessToken(row.id);
          return await fetchMicrosoftEvents(token, row.account_name ?? null, timeMin, timeMax, ids);
        } catch {
          return [];
        }
      })());
    }
  }

  // Fire-and-forget back-fill for providers that don't yet have rows in
  // user_calendars. The current request returns primary-only; the next
  // one will see the full list. We don't block on this — the user
  // shouldn't pay the latency of a calendar-list sync to load events.
  if (needsBackfill) {
    void syncUserCalendarList(user.id).catch(() => {});
  }

  const all = (await Promise.all(work)).flat();

  // Best-effort timestamp update on every queried integration so the
  // Settings UI's "last synced" stays accurate.
  await Promise.all(
    rows.map((r) =>
      supabase.from("integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", r.id),
    ),
  );

  return NextResponse.json({ connected: sources.length > 0, events: all, sources });
}

// ── Provider-shaped types ─────────────────────────────────────────────────

interface LegacyIntegrationRow {
  id:               string;
  access_token:     string;
  refresh_token:    string | null;
  token_expires_at: string | null;
  account_name:     string | null;
}

interface GCalApiEvent {
  id:           string;
  summary?:     string;
  description?: string;
  location?:    string;
  status?:      string;
  colorId?:     string;
  htmlLink?:    string;
  start:        { dateTime?: string; date?: string };
  end:          { dateTime?: string; date?: string };
}

interface GraphApiEvent {
  id:           string;
  subject?:     string;
  bodyPreview?: string;
  isAllDay?:    boolean;
  isCancelled?: boolean;
  webLink?:     string;
  location?:    { displayName?: string };
  start?:       { dateTime?: string; timeZone?: string };
  end?:         { dateTime?: string; timeZone?: string };
}
