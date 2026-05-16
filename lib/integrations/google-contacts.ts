// Google Contacts (People API) → Perennial contacts importer. v1 is a
// one-shot batch import triggered by the user (not a continuous sync).
// Dedup is by lowercased email — we don't overwrite existing Perennial
// contacts, only insert new ones.
//
// Future: a "review + select" preview UI before committing the insert;
// for v1 we just import everyone with a name + at least one email.

import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "./google-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import type { IntegrationRow } from "./types";

const PEOPLE_API_BASE = "https://people.googleapis.com/v1/people/me/connections";
const PAGE_SIZE       = 200;   // People API caps at 1000 but smaller pages = better progress

interface PeopleName {
  givenName?:    string;
  familyName?:   string;
  displayName?:  string;
  metadata?:     { primary?: boolean };
}
interface PeopleEmail   { value?: string; metadata?: { primary?: boolean } }
interface PeoplePhone   { value?: string; metadata?: { primary?: boolean } }
interface PeopleOrg     { name?:  string; title?:   string; metadata?: { primary?: boolean } }
interface PeopleAddress { formattedValue?: string; city?: string; country?: string; metadata?: { primary?: boolean } }
interface PeopleUrl     { value?: string; metadata?: { primary?: boolean } }
interface Person {
  resourceName?:  string;
  names?:         PeopleName[];
  emailAddresses?: PeopleEmail[];
  phoneNumbers?:  PeoplePhone[];
  organizations?: PeopleOrg[];
  addresses?:     PeopleAddress[];
  urls?:          PeopleUrl[];
}
interface ConnectionsResponse {
  connections?:     Person[];
  nextPageToken?:   string;
  totalPeople?:     number;
}

function pickPrimary<T extends { metadata?: { primary?: boolean } }>(arr?: T[]): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.find((x) => x.metadata?.primary) ?? arr[0];
}

interface ImportResult {
  fetched:  number;
  imported: number;
  skipped:  number;     // missing required fields, or already exist
}

export async function importGoogleContacts(integration: IntegrationRow): Promise<ImportResult> {
  if (integration.provider !== "google" || !integration.scopes?.contacts) {
    return { fetched: 0, imported: 0, skipped: 0 };
  }

  const supabase = await createClient();
  const userId   = integration.user_id;
  const token    = await getValidGoogleAccessToken(integration.id);

  // ── Build dedup index of existing Perennial contact emails ─────────
  const { data: existing, error: existingErr } = await supabase
    .from("contacts")
    .select("email")
    .eq("user_id", userId)
    .not("email", "is", null);
  if (existingErr) throw new Error(`importGoogleContacts: load existing failed: ${existingErr.message}`);

  const seen = new Set<string>(
    (existing ?? []).map((c) => (c.email as string).trim().toLowerCase()),
  );

  // ── Pull all connections (paginated) ───────────────────────────────
  const allPeople: Person[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL(PEOPLE_API_BASE);
    url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations,addresses,urls");
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google People API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json() as ConnectionsResponse;
    if (json.connections?.length) allPeople.push(...json.connections);
    pageToken = json.nextPageToken;
  } while (pageToken);

  // ── Build insert payloads ──────────────────────────────────────────
  let skipped = 0;
  const rowsToInsert: Array<{
    user_id:    string;
    first_name: string;
    last_name:  string;
    email:      string | null;
    phone:      string | null;
    title:      string | null;
    location:   string | null;
    website:    string | null;
    status:     "active";
    tags:       string[];
  }> = [];

  for (const p of allPeople) {
    const name  = pickPrimary(p.names);
    const email = pickPrimary(p.emailAddresses)?.value?.trim();
    const phone = pickPrimary(p.phoneNumbers)?.value?.trim() ?? null;
    const org   = pickPrimary(p.organizations);
    const addr  = pickPrimary(p.addresses);
    const url   = pickPrimary(p.urls)?.value?.trim() ?? null;

    // Need at least a name OR email to be useful in Perennial.
    if (!name?.givenName && !name?.familyName && !name?.displayName && !email) {
      skipped++;
      continue;
    }
    // Dedup by email — primary signal we use elsewhere for matching.
    if (email) {
      const key = email.toLowerCase();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
    }

    const firstName = (name?.givenName ?? name?.displayName?.split(" ")[0] ?? email ?? "Unknown").trim();
    const lastName  = (name?.familyName ?? name?.displayName?.split(" ").slice(1).join(" ") ?? "").trim();

    rowsToInsert.push({
      user_id:    userId,
      first_name: firstName,
      last_name:  lastName,
      email:      email ?? null,
      phone,
      title:      org?.title ?? null,
      location:   addr?.city ?? addr?.formattedValue ?? null,
      website:    url,
      status:     "active",
      tags:       ["imported-from-google"],
    });
  }

  // ── Insert in batches (Supabase handles up to ~1000 rows per insert) ─
  let imported = 0;
  if (rowsToInsert.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < rowsToInsert.length; i += BATCH) {
      const slice = rowsToInsert.slice(i, i + BATCH);
      const { error: insertErr, count } = await supabase
        .from("contacts")
        .insert(slice, { count: "exact" });
      if (insertErr) throw new Error(`contacts insert failed: ${insertErr.message}`);
      imported += count ?? slice.length;
    }
  }

  await recordSyncSuccess(integration.id, {
    ...integration.sync_state,
    google_contacts_last_imported_at: new Date().toISOString(),
    google_contacts_last_count:       imported,
  });

  return { fetched: allPeople.length, imported, skipped };
}

export async function safeImportGoogleContacts(integration: IntegrationRow): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  try {
    const result = await importGoogleContacts(integration);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}
