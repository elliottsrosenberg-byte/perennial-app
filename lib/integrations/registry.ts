// Provider registry — the single source of truth for which sub-scopes
// each provider exposes to the user. The Settings UI renders toggles
// from this, the OAuth start route picks the upstream scope strings
// from this, and the sync workers gate behavior on the scope flags
// stored on each integration row.

import type { ProviderId } from "./types";

export type SubScopeKey = string;

export interface SubScope {
  /** Stable key persisted in `integrations.scopes` */
  key:         SubScopeKey;
  /** Human label for the Settings toggle */
  label:       string;
  /** Short description shown under the label */
  description: string;
  /** Upstream OAuth scope strings requested when this sub-scope is on.
   *  Multiple strings are concatenated with spaces at request time. */
  upstreamScopes: string[];
  /** When true, the sub-scope is requested as part of the initial
   *  consent (cannot be toggled off without disconnecting). When false,
   *  the user may opt-in later — but providers like Google require the
   *  scope to have been granted at consent time to use it, so optional
   *  scopes typically still go in the initial request and only the
   *  in-app behavior changes. */
  alwaysOn?: boolean;
}

export interface ProviderDefinition {
  id:           ProviderId;
  name:         string;
  authStyle:    "oauth" | "app_password" | "api_key";
  subScopes:    SubScope[];
  /** App-level toggles that are not OAuth scopes but gate optional
   *  behavior (e.g. "store linked email bodies"). Stored in the same
   *  `integrations.scopes` jsonb. */
  appOptions?:  Pick<SubScope, "key" | "label" | "description">[];
}

const GOOGLE_BASE_SCOPES = ["openid", "email", "profile"];

export const PROVIDERS: Record<string, ProviderDefinition> = {
  google: {
    id:        "google",
    name:      "Google",
    authStyle: "oauth",
    subScopes: [
      {
        key:            "identity",
        label:          "Identity",
        description:    "Read your basic profile so we can label the connection.",
        upstreamScopes: GOOGLE_BASE_SCOPES,
        alwaysOn:       true,
      },
      {
        key:            "gmail",
        label:          "Gmail",
        description:    "Read message metadata and snippets to auto-log activity against matched contacts.",
        upstreamScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      },
      {
        key:            "calendar",
        label:          "Calendar",
        description:    "Surface calendar events in Perennial and log meeting activities for matched contacts.",
        upstreamScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      },
      {
        key:            "contacts",
        label:          "Contacts",
        description:    "Import your Google contacts into the People module.",
        upstreamScopes: ["https://www.googleapis.com/auth/contacts.readonly"],
      },
      {
        key:            "drive",
        label:          "Drive (metadata)",
        description:    "Browse your Google Drive files (names, types, dates only — never file contents) so you can link them as Resources without re-uploading.",
        upstreamScopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
      },
    ],
    appOptions: [
      {
        key:         "store_email_bodies",
        label:       "Store linked email bodies",
        description: "Save the full body of any email matched to a contact in Perennial. Bodies are encrypted at rest and deleted within 24 hours if you disable this. Off by default.",
      },
    ],
  },

  microsoft: {
    id:        "microsoft",
    name:      "Microsoft 365",
    authStyle: "oauth",
    subScopes: [
      {
        key:            "identity",
        label:          "Identity",
        description:    "Read your basic profile so we can label the connection.",
        upstreamScopes: ["openid", "email", "profile", "offline_access", "User.Read"],
        alwaysOn:       true,
      },
      {
        key:            "mail",
        label:          "Outlook Mail",
        description:    "Read message metadata to auto-log activity against matched contacts.",
        upstreamScopes: ["Mail.Read"],
      },
      {
        key:            "calendar",
        label:          "Outlook Calendar",
        description:    "Surface calendar events and log meeting activities for matched contacts.",
        upstreamScopes: ["Calendars.Read"],
      },
      {
        key:            "contacts",
        label:          "Outlook Contacts",
        description:    "Import your Outlook contacts into the People module.",
        upstreamScopes: ["Contacts.Read"],
      },
    ],
    appOptions: [
      {
        key:         "store_email_bodies",
        label:       "Store linked email bodies",
        description: "Save the full body of any email matched to a contact in Perennial. Bodies are encrypted at rest and deleted within 24 hours if you disable this. Off by default.",
      },
    ],
  },

  apple_icloud: {
    id:        "apple_icloud",
    name:      "Apple iCloud",
    authStyle: "app_password",
    subScopes: [
      {
        key:            "mail",
        label:          "iCloud Mail",
        description:    "Read message metadata to auto-log activity against matched contacts.",
        upstreamScopes: [], // app-password based, no OAuth scopes
      },
      {
        key:            "calendar",
        label:          "iCloud Calendar",
        description:    "Surface calendar events and log meeting activities.",
        upstreamScopes: [],
      },
      {
        key:            "contacts",
        label:          "iCloud Contacts",
        description:    "Import your iCloud contacts into the People module.",
        upstreamScopes: [],
      },
    ],
    appOptions: [
      {
        key:         "store_email_bodies",
        label:       "Store linked email bodies",
        description: "Save the full body of any email matched to a contact in Perennial. Off by default.",
      },
    ],
  },

  // ── Legacy / standalone integrations (kept here for the Settings UI
  // to render the existing tiles consistently; their OAuth flows live
  // in older routes until the migration finishes) ─────────────────────

  google_analytics: {
    id:        "google_analytics",
    name:      "Google Analytics",
    authStyle: "oauth",
    subScopes: [],
  },
  google_calendar: {
    id:        "google_calendar",
    name:      "Google Calendar (legacy)",
    authStyle: "oauth",
    subScopes: [],
  },
  instagram:  { id: "instagram",  name: "Instagram",  authStyle: "oauth",   subScopes: [] },
  plausible:  { id: "plausible",  name: "Plausible",  authStyle: "api_key", subScopes: [] },
  mailchimp:  { id: "mailchimp",  name: "Mailchimp",  authStyle: "api_key", subScopes: [] },
  beehiiv:    { id: "beehiiv",    name: "Beehiiv",    authStyle: "api_key", subScopes: [] },
  substack:   { id: "substack",   name: "Substack",   authStyle: "api_key", subScopes: [] },
  teller:     { id: "teller",     name: "Bank account (Teller)", authStyle: "oauth", subScopes: [] },
  stripe:     { id: "stripe",     name: "Stripe",     authStyle: "oauth",   subScopes: [] },
};

/** Compute the union of upstream scope strings to request from a provider
 *  given a sub-scope opt-in map. Always-on sub-scopes are included
 *  automatically. */
export function resolveUpstreamScopes(
  providerId: string,
  enabledSubScopes: Record<string, boolean>,
): string[] {
  const def = PROVIDERS[providerId];
  if (!def) return [];
  const scopes = new Set<string>();
  for (const sub of def.subScopes) {
    if (sub.alwaysOn || enabledSubScopes[sub.key]) {
      sub.upstreamScopes.forEach((s) => scopes.add(s));
    }
  }
  return [...scopes];
}
