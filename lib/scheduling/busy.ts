// Fetches the organizer's busy time blocks for a date range, across the
// calendars a scheduling link is configured to check for conflicts. Runs in
// the public (sessionless) booking flow, so it uses the service-role client +
// service token helpers. Only busy *intervals* are read — never event titles
// or details — and nothing leaves the server except the resulting open slots.
//
// Google:    POST /freeBusy (one call per account, batched calendar ids)
// Microsoft: POST /me/calendar/getSchedule (per account mailbox)

import { createServiceClient } from "@/lib/supabase/service";
import {
  getValidGoogleAccessTokenService,
  getValidMicrosoftAccessTokenService,
} from "@/lib/integrations/service-tokens";
import type { Interval } from "./availability";

interface IntegrationRow {
  id: string;
  provider: string;
  account_name: string | null;
  status: string | null;
  scopes: Record<string, boolean> | null;
}
interface CalRow {
  provider: string;
  account_email: string | null;
  external_id: string;
  visible: boolean;
  removed: boolean;
}

function family(p: string): string {
  return p === "google_calendar" ? "google" : p;
}

/** Busy blocks for `userId` between [timeMin, timeMax], across the link's
 *  conflict calendars (or all visible calendars when conflictIds is null). */
export async function fetchBusy(
  userId: string,
  conflictIds: string[] | null,
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  const supabase = createServiceClient();

  const [{ data: cals }, { data: intgs }] = await Promise.all([
    supabase
      .from("user_calendars")
      .select("provider, account_email, external_id, visible, removed")
      .eq("user_id", userId)
      .eq("removed", false),
    supabase
      .from("integrations")
      .select("id, provider, account_name, status, scopes")
      .eq("user_id", userId)
      .in("provider", ["google", "google_calendar", "microsoft"]),
  ]);

  // Active, calendar-scoped integration per account family.
  const intgByAccount = new Map<string, IntegrationRow>();
  for (const i of (intgs ?? []) as IntegrationRow[]) {
    if (i.status && i.status !== "active") continue;
    if (i.provider !== "google_calendar" && !(i.scopes ?? {}).calendar) continue;
    intgByAccount.set(`${family(i.provider)}::${i.account_name ?? "primary"}`, i);
  }

  // Which calendars to scan: the link's explicit conflict set, or every
  // visible calendar when the link didn't pin a subset.
  let scan: CalRow[];
  if (conflictIds && conflictIds.length > 0) {
    const { data: byId } = await supabase
      .from("user_calendars")
      .select("provider, account_email, external_id, visible, removed")
      .in("id", conflictIds)
      .eq("user_id", userId)
      .eq("removed", false);
    scan = (byId ?? []) as CalRow[];
  } else {
    scan = ((cals ?? []) as CalRow[]).filter((c) => c.visible);
  }

  // Group external ids by account family for batched freeBusy; collect MS
  // mailboxes separately.
  const googleByAccount = new Map<string, string[]>();
  const msAccounts = new Set<string>();
  for (const c of scan) {
    const fam = family(c.provider);
    const key = `${fam}::${c.account_email ?? "primary"}`;
    if (fam === "google") {
      const arr = googleByAccount.get(key) ?? [];
      arr.push(c.external_id);
      googleByAccount.set(key, arr);
    } else if (fam === "microsoft") {
      msAccounts.add(key);
    }
  }

  const jobs: Promise<Interval[]>[] = [];

  for (const [key, ids] of googleByAccount) {
    const intg = intgByAccount.get(key);
    if (!intg) continue;
    jobs.push(googleFreeBusy(intg.id, ids, timeMin, timeMax));
  }
  for (const key of msAccounts) {
    const intg = intgByAccount.get(key);
    if (!intg) continue;
    const email = intg.account_name;
    if (!email) continue;
    jobs.push(microsoftGetSchedule(intg.id, email, timeMin, timeMax));
  }

  const results = await Promise.all(jobs.map((p) => p.catch(() => [] as Interval[])));
  return results.flat();
}

async function googleFreeBusy(
  integrationId: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  const token = await getValidGoogleAccessTokenService(integrationId);
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: calendarIds.map((id) => ({ id })) }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  const out: Interval[] = [];
  for (const cal of Object.values(data.calendars ?? {})) {
    for (const b of cal.busy ?? []) out.push({ start: b.start, end: b.end });
  }
  return out;
}

async function microsoftGetSchedule(
  integrationId: string,
  mailbox: string,
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  const token = await getValidMicrosoftAccessTokenService(integrationId);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify({
      schedules: [mailbox],
      startTime: { dateTime: timeMin.replace(/Z$/, ""), timeZone: "UTC" },
      endTime:   { dateTime: timeMax.replace(/Z$/, ""), timeZone: "UTC" },
      availabilityViewInterval: 15,
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    value?: { scheduleItems?: { status?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[] }[];
  };
  // getSchedule returns naive UTC wall-clock strings (Prefer: UTC above);
  // normalize each to a Z-suffixed ISO instant.
  const asUtc = (dt: string) => (/[Zz]|[+-]\d\d:?\d\d$/.test(dt) ? dt : `${dt}Z`);
  const out: Interval[] = [];
  for (const sched of data.value ?? []) {
    for (const item of sched.scheduleItems ?? []) {
      if (item.status === "free") continue;
      const s = item.start?.dateTime;
      const e = item.end?.dateTime;
      if (s && e) out.push({ start: asUtc(s), end: asUtc(e) });
    }
  }
  return out;
}
