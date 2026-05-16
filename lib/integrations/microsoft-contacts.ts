// Microsoft Graph contacts → Perennial contacts importer. Mirror of
// google-contacts.ts with Graph's contact shape.

import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftAccessToken } from "./microsoft-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import type { IntegrationRow } from "./types";

const GRAPH_CONTACTS = "https://graph.microsoft.com/v1.0/me/contacts";
const PAGE_SIZE      = 100;

interface GraphEmailAddress { name?: string; address?: string }
interface GraphContact {
  id?:             string;
  givenName?:      string;
  surname?:        string;
  displayName?:    string;
  emailAddresses?: GraphEmailAddress[];
  businessPhones?: string[];
  mobilePhone?:    string;
  companyName?:    string;
  jobTitle?:       string;
  businessAddress?: { city?: string; countryOrRegion?: string };
  homeAddress?:    { city?: string; countryOrRegion?: string };
  personalNotes?:  string;
}
interface GraphContactListResponse {
  value:               GraphContact[];
  "@odata.nextLink"?:  string;
}

interface ImportResult { fetched: number; imported: number; skipped: number }

export async function importMicrosoftContacts(integration: IntegrationRow): Promise<ImportResult> {
  if (integration.provider !== "microsoft" || !integration.scopes?.contacts) {
    return { fetched: 0, imported: 0, skipped: 0 };
  }

  const supabase = await createClient();
  const userId   = integration.user_id;
  const token    = await getValidMicrosoftAccessToken(integration.id);

  const { data: existing, error: existingErr } = await supabase
    .from("contacts")
    .select("email")
    .eq("user_id", userId)
    .not("email", "is", null);
  if (existingErr) throw new Error(`importMicrosoftContacts: load existing failed: ${existingErr.message}`);

  const seen = new Set<string>(
    (existing ?? []).map((c) => (c.email as string).trim().toLowerCase()),
  );

  // Pull all contacts (paginated)
  const all: GraphContact[] = [];
  let nextUrl: string | null =
    `${GRAPH_CONTACTS}?$select=${encodeURIComponent("id,givenName,surname,displayName,emailAddresses,businessPhones,mobilePhone,companyName,jobTitle,businessAddress,homeAddress")}` +
    `&$top=${PAGE_SIZE}`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph /me/contacts ${res.status}: ${body.slice(0, 300)}`);
    }
    const list = await res.json() as GraphContactListResponse;
    if (list.value?.length) all.push(...list.value);
    nextUrl = list["@odata.nextLink"] ?? null;
  }

  let skipped = 0;
  const rowsToInsert: Array<{
    user_id:    string;
    first_name: string;
    last_name:  string;
    email:      string | null;
    phone:      string | null;
    title:      string | null;
    location:   string | null;
    status:     "active";
    tags:       string[];
  }> = [];

  for (const c of all) {
    const email = c.emailAddresses?.[0]?.address?.trim();
    const phone = c.mobilePhone?.trim() ?? c.businessPhones?.[0]?.trim() ?? null;

    if (!c.givenName && !c.surname && !c.displayName && !email) {
      skipped++;
      continue;
    }
    if (email) {
      const key = email.toLowerCase();
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
    }

    const firstName = (c.givenName ?? c.displayName?.split(" ")[0] ?? email ?? "Unknown").trim();
    const lastName  = (c.surname ?? c.displayName?.split(" ").slice(1).join(" ") ?? "").trim();

    rowsToInsert.push({
      user_id:    userId,
      first_name: firstName,
      last_name:  lastName,
      email:      email ?? null,
      phone,
      title:      c.jobTitle ?? null,
      location:   c.businessAddress?.city ?? c.homeAddress?.city ?? null,
      status:     "active",
      tags:       ["imported-from-microsoft"],
    });
  }

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
    microsoft_contacts_last_imported_at: new Date().toISOString(),
    microsoft_contacts_last_count:       imported,
  });

  return { fetched: all.length, imported, skipped };
}

export async function safeImportMicrosoftContacts(integration: IntegrationRow): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  try {
    const result = await importMicrosoftContacts(integration);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}
