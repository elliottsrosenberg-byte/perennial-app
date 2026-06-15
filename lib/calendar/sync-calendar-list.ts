// Sync the per-user calendar list from every connected provider into
// public.user_calendars. Idempotent — uses (user_id, provider,
// external_id) as the natural key and upserts on top, preserving the
// user's `visible` choice when a row already exists.
//
// Called from:
//   - the integration OAuth callbacks, right after token persistence
//   - the manual "Refresh calendars" button in the Calendar topbar menu
//   - the events aggregator, lazily, when it sees no rows for a
//     provider the user has connected (back-fill for accounts that
//     connected before this feature shipped)

import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/integrations/google-tokens";
import { getValidMicrosoftAccessToken } from "@/lib/integrations/microsoft-tokens";
import type { IntegrationRow } from "@/lib/integrations/types";

type SupportedProvider = "google" | "google_calendar" | "microsoft";

interface UpsertRow {
  user_id:       string;
  provider:      SupportedProvider;
  external_id:   string;
  account_email: string | null;
  name:          string;
  color:         string | null;
  is_primary:    boolean;
  writable:      boolean;
}

// Legacy gcal row shape — kept inline because lib/integrations doesn't
// export a type for the pre-vault token storage.
interface LegacyGcalRow {
  id:               string;
  access_token:     string;
  refresh_token:    string | null;
  token_expires_at: string | null;
  account_name:     string | null;
}

async function refreshLegacyGcalToken(integration: LegacyGcalRow): Promise<string | null> {
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
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };

  const supabase = await createClient();
  await supabase.from("integrations").update({
    access_token,
    token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  }).eq("id", integration.id);

  return access_token;
}

interface GoogleCalendarListItem {
  id:               string;
  summary?:         string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?:         boolean;
  accessRole?:      string;
}

async function fetchGoogleCalendars(token: string): Promise<GoogleCalendarListItem[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: GoogleCalendarListItem[] };
  return data.items ?? [];
}

interface GraphCalendar {
  id:           string;
  name?:        string;
  isDefaultCalendar?: boolean;
  canEdit?:     boolean;
  hexColor?:    string;
  owner?:       { name?: string; address?: string };
}

async function fetchMicrosoftCalendars(token: string): Promise<GraphCalendar[]> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isDefaultCalendar,canEdit,hexColor,owner&$top=250",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { value?: GraphCalendar[] };
  return data.value ?? [];
}

/** Sync the calendar list for one user. Returns the number of calendars
 *  written (insert + update combined). Safe to call repeatedly — the
 *  `visible` flag on existing rows is preserved. */
export async function syncUserCalendarList(userId: string): Promise<{ count: number; providers: string[] }> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .in("provider", ["google_calendar", "google", "microsoft"]);

  if (!rows || rows.length === 0) return { count: 0, providers: [] };

  const upserts: UpsertRow[] = [];
  const providers = new Set<string>();

  for (const r of rows) {
    if (r.provider === "google_calendar") {
      const legacy = r as unknown as LegacyGcalRow;
      const token = await refreshLegacyGcalToken(legacy);
      if (!token) continue;
      const list = await fetchGoogleCalendars(token);
      providers.add("google_calendar");
      for (const c of list) {
        upserts.push({
          user_id:       userId,
          provider:      "google_calendar",
          external_id:   c.id,
          account_email: legacy.account_name ?? null,
          name:          c.summaryOverride ?? c.summary ?? c.id,
          color:         c.backgroundColor ?? null,
          is_primary:    !!c.primary,
          // The legacy google_calendar provider never requested the
          // calendar.events scope; it's read-only by design. Users who
          // want write should reconnect through the unified Google flow.
          writable:      false,
        });
      }
    } else if (r.provider === "google") {
      const row = r as unknown as IntegrationRow;
      if (row.status !== "active" || !row.scopes?.calendar) continue;
      // Per-calendar writability requires *both* a writer/owner role on
      // that specific calendar and the calendar.events scope on the
      // integration overall. Older connections without the write scope
      // get writable=false everywhere even on calendars they own.
      const canWrite = !!row.scopes?.calendar_write;
      try {
        const token = await getValidGoogleAccessToken(row.id);
        const list  = await fetchGoogleCalendars(token);
        providers.add("google");
        for (const c of list) {
          const roleWritable = c.accessRole === "writer" || c.accessRole === "owner";
          upserts.push({
            user_id:       userId,
            provider:      "google",
            external_id:   c.id,
            account_email: row.account_name ?? null,
            name:          c.summaryOverride ?? c.summary ?? c.id,
            color:         c.backgroundColor ?? null,
            is_primary:    !!c.primary,
            writable:      canWrite && roleWritable,
          });
        }
      } catch (e) {
        console.error("[syncUserCalendarList] google failed:", e);
      }
    } else if (r.provider === "microsoft") {
      const row = r as unknown as IntegrationRow;
      if (row.status !== "active" || !row.scopes?.calendar) continue;
      const canWrite = !!row.scopes?.calendar_write;
      try {
        const token = await getValidMicrosoftAccessToken(row.id);
        const list  = await fetchMicrosoftCalendars(token);
        providers.add("microsoft");
        for (const c of list) {
          upserts.push({
            user_id:       userId,
            provider:      "microsoft",
            external_id:   c.id,
            account_email: c.owner?.address ?? row.account_name ?? null,
            name:          c.name ?? "(Untitled calendar)",
            color:         c.hexColor || null,
            is_primary:    !!c.isDefaultCalendar,
            writable:      canWrite && !!c.canEdit,
          });
        }
      } catch (e) {
        console.error("[syncUserCalendarList] microsoft failed:", e);
      }
    }
  }

  if (upserts.length === 0) return { count: 0, providers: Array.from(providers) };

  // Split into new vs already-known calendars so we don't clobber the user's
  // own choices on re-sync. `visible`/`removed` are already safe (never in the
  // payload), but `color` IS in the payload — so on existing rows we must omit
  // it, or every sync (self-heal / backfill / Resync / reconnect) overwrites a
  // user-picked colour with the provider default. New calendars still seed
  // their initial colour from the provider.
  const key = (p: string, x: string) => `${p}:${x}`;
  const { data: existing } = await supabase
    .from("user_calendars")
    .select("provider, external_id")
    .eq("user_id", userId);
  const existingKeys = new Set((existing ?? []).map((e) => key(e.provider, e.external_id)));

  const toInsert = upserts.filter((u) => !existingKeys.has(key(u.provider, u.external_id)));
  // Existing rows: refresh only provider-owned fields; strip `color` so the
  // user's choice survives. (on-conflict only sets the columns present.)
  const toUpdate = upserts
    .filter((u) => existingKeys.has(key(u.provider, u.external_id)))
    .map(({ color: _color, ...providerOwned }) => providerOwned);

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("user_calendars")
      .upsert(toInsert, { onConflict: "user_id,provider,external_id", ignoreDuplicates: false });
    if (error) console.error("[syncUserCalendarList] insert failed:", error);
  }
  if (toUpdate.length > 0) {
    const { error } = await supabase
      .from("user_calendars")
      .upsert(toUpdate, { onConflict: "user_id,provider,external_id", ignoreDuplicates: false });
    if (error) console.error("[syncUserCalendarList] update failed:", error);
  }

  return { count: upserts.length, providers: Array.from(providers) };
}
