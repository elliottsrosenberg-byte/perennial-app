// Ties calendars to their backing integration. When a calendar account is
// disconnected/removed in Settings, its user_calendars rows linger — without
// this, those orphans keep showing in the rail and get fanned out (uselessly)
// by the events fetch. Both the calendars list and the events route filter to
// "live" accounts: an active integration that still has the calendar scope.

interface IntegrationLike {
  provider: string;
  account_name: string | null;
  status?: string | null;
  scopes?: Record<string, boolean> | null;
}

function family(provider: string): string {
  return provider === "google_calendar" ? "google" : provider;
}

/** Set of `${family}::${account}` keys for accounts with a live calendar integration. */
export function liveAccountKeys(integrations: IntegrationLike[]): Set<string> {
  const keys = new Set<string>();
  for (const intg of integrations) {
    if (intg.status && intg.status !== "active") continue;
    const fam = family(intg.provider);
    if (fam !== "google" && fam !== "microsoft") continue;
    // Legacy google_calendar has no scopes column; unified providers must
    // still carry the calendar scope.
    if (intg.provider !== "google_calendar" && !(intg.scopes ?? {}).calendar) continue;
    keys.add(`${fam}::${intg.account_name ?? "primary"}`);
  }
  return keys;
}

/** Key for a user_calendars row, to test membership against liveAccountKeys. */
export function calendarAccountKey(provider: string, accountEmail: string | null): string {
  return `${family(provider)}::${accountEmail ?? "primary"}`;
}
