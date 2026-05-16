// Gmail sync: pulls recent message metadata, matches sender/recipient
// emails against the user's Perennial contacts, and writes one
// `contact_activities` row per matched contact per message. Dedup is
// enforced by a partial unique index on
// (contact_id, metadata->>'gmail_message_id').
//
// v1 design:
//   - First sync: 30-day lookback (q=after:<ts>)
//   - Subsequent syncs: anchored on sync_state.gmail_last_synced_at
//   - Hard cap of 500 messages per run to keep latency bounded
//   - Body is NEVER stored in this v1; the "store linked email bodies"
//     opt-in (sub-scope `store_email_bodies`) lands in a follow-up
//
// Webhook upgrade path (deferred): Gmail Push notifications via Pub/Sub
// in Google Cloud project perennial-app-496001 → topic →
// /api/integrations/google/gmail/webhook.

import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "./google-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import type { IntegrationRow } from "./types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const FIRST_SYNC_LOOKBACK_DAYS = 30;
const MAX_MESSAGES_PER_RUN     = 500;
const PAGE_SIZE                = 100;

interface GmailListResponse {
  messages?:      { id: string; threadId: string }[];
  nextPageToken?: string;
}

interface GmailMessageDetail {
  id:           string;
  threadId:     string;
  internalDate: string; // ms since epoch as string
  snippet?:     string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
}

/** Extract bare email addresses from header values like:
 *    "Jenna Kim <jenna@friedman.com>, press@studiomag.com"
 *  Returns lowercased addresses. */
function extractEmails(headerValue: string): string[] {
  if (!headerValue) return [];
  const out: string[] = [];
  // Match either "<email@x>" or bare "email@x"
  const re = /<([^>]+)>|([^,\s<>"']+@[^,\s<>"']+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(headerValue)) !== null) {
    const e = (m[1] ?? m[2] ?? "").trim().toLowerCase();
    if (e.includes("@")) out.push(e);
  }
  return out;
}

interface SyncResult {
  messagesScanned: number;
  activitiesCreated: number;
  contactsMatched:   number;
  latestMessageTs:   number; // ms since epoch
}

/** Run a Gmail sync for one integration. Returns a result summary. */
export async function syncGmail(integration: IntegrationRow): Promise<SyncResult> {
  if (integration.provider !== "google" || !integration.scopes?.gmail) {
    return { messagesScanned: 0, activitiesCreated: 0, contactsMatched: 0, latestMessageTs: 0 };
  }

  const supabase = await createClient();
  const userId   = integration.user_id;

  // ── Load matchable contacts (one query, in-memory map) ──────────────
  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("user_id", userId)
    .eq("archived", false)
    .not("email", "is", null);
  if (contactsErr) throw new Error(`syncGmail: load contacts failed: ${contactsErr.message}`);

  const emailToContactIds = new Map<string, string[]>();
  for (const c of contacts ?? []) {
    if (!c.email) continue;
    const key = c.email.trim().toLowerCase();
    const arr = emailToContactIds.get(key) ?? [];
    arr.push(c.id);
    emailToContactIds.set(key, arr);
  }

  if (emailToContactIds.size === 0) {
    // Nothing to match against — bail early but still record a successful
    // sync run so the user sees recent activity in Settings.
    await recordSyncSuccess(integration.id, {
      ...integration.sync_state,
      gmail_last_synced_at: new Date().toISOString(),
      gmail_last_messages:  0,
    });
    return { messagesScanned: 0, activitiesCreated: 0, contactsMatched: 0, latestMessageTs: 0 };
  }

  // ── Auth ────────────────────────────────────────────────────────────
  const token = await getValidGoogleAccessToken(integration.id);

  // ── Build the query window ─────────────────────────────────────────
  const lastSyncIso = (integration.sync_state?.gmail_last_synced_at as string | undefined) ?? null;
  const lastSyncTs  = lastSyncIso
    ? Math.floor(new Date(lastSyncIso).getTime() / 1000)
    : Math.floor((Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86400_000) / 1000);

  const ownEmail = integration.account_name?.toLowerCase() ?? null;

  // ── Pull message IDs (paginated) ───────────────────────────────────
  let pageToken: string | undefined = undefined;
  const messageIds: { id: string; threadId: string }[] = [];

  while (messageIds.length < MAX_MESSAGES_PER_RUN) {
    const listUrl = new URL(`${GMAIL_API}/messages`);
    listUrl.searchParams.set("q",          `after:${lastSyncTs}`);
    listUrl.searchParams.set("maxResults", String(PAGE_SIZE));
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) {
      const body = await listRes.text().catch(() => "");
      throw new Error(`Gmail messages.list ${listRes.status}: ${body.slice(0, 300)}`);
    }
    const list = await listRes.json() as GmailListResponse;
    if (list.messages?.length) messageIds.push(...list.messages);
    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }

  // ── Fetch each message's metadata and write activities ─────────────
  let activitiesCreated = 0;
  const matchedContactIds = new Set<string>();
  let latestMessageTs = lastSyncTs * 1000;

  for (const m of messageIds) {
    const detailUrl = new URL(`${GMAIL_API}/messages/${m.id}`);
    detailUrl.searchParams.set("format", "metadata");
    for (const h of ["From", "To", "Cc", "Subject", "Date"]) {
      detailUrl.searchParams.append("metadataHeaders", h);
    }

    const detailRes = await fetch(detailUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!detailRes.ok) continue;  // skip individual failures, don't poison the whole run
    const detail = await detailRes.json() as GmailMessageDetail;

    const headers = new Map<string, string>(
      (detail.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
    );

    const from    = headers.get("from")    ?? "";
    const to      = headers.get("to")      ?? "";
    const cc      = headers.get("cc")      ?? "";
    const subject = headers.get("subject") ?? "(no subject)";
    const dateHdr = headers.get("date");
    const snippet = (detail.snippet ?? "").trim();

    // Match contacts against From/To/Cc
    const fromEmails = extractEmails(from);
    const toEmails   = extractEmails(to);
    const ccEmails   = extractEmails(cc);
    const allEmails  = [...fromEmails, ...toEmails, ...ccEmails];

    const matchedThisMessage = new Set<string>();
    for (const e of allEmails) {
      const ids = emailToContactIds.get(e);
      if (ids) ids.forEach((id) => matchedThisMessage.add(id));
    }
    if (matchedThisMessage.size === 0) continue;

    // Direction: outbound if the connected account is the sender,
    // otherwise inbound.
    const isOutbound = ownEmail !== null && fromEmails.some((e) => e === ownEmail);
    const direction  = isOutbound ? "out" : "in";

    const occurredAtIso = dateHdr ? new Date(dateHdr).toISOString() : new Date().toISOString();
    const occurredTs    = new Date(occurredAtIso).getTime();
    if (occurredTs > latestMessageTs) latestMessageTs = occurredTs;

    const content = snippet
      ? `${subject} — ${snippet}`
      : subject;

    for (const contactId of matchedThisMessage) {
      matchedContactIds.add(contactId);

      const { error: insertErr } = await supabase
        .from("contact_activities")
        .insert({
          user_id:     userId,
          contact_id:  contactId,
          type:        "email",
          content,
          occurred_at: occurredAtIso,
          metadata: {
            source:           "google_gmail",
            integration_id:   integration.id,
            gmail_message_id: m.id,
            gmail_thread_id:  m.threadId,
            from, to, cc, subject, snippet,
            direction,
          },
        });

      if (insertErr) {
        // 23505 = unique_violation → already synced, fine to skip
        if (insertErr.code === "23505") continue;
        // Other errors bubble up so the sync run is recorded as errored
        throw new Error(`contact_activities insert failed: ${insertErr.message}`);
      }
      activitiesCreated++;

      // Bump last_contacted_at — only when message is in the past and
      // newer than the existing value (matches the manual-log path).
      if (occurredTs <= Date.now() + 60_000) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("last_contacted_at")
          .eq("id", contactId)
          .single();
        const existingTs = contact?.last_contacted_at ? new Date(contact.last_contacted_at).getTime() : 0;
        if (occurredTs > existingTs) {
          await supabase
            .from("contacts")
            .update({ last_contacted_at: occurredAtIso })
            .eq("id", contactId);
        }
      }
    }
  }

  // ── Persist sync state ─────────────────────────────────────────────
  await recordSyncSuccess(integration.id, {
    ...integration.sync_state,
    gmail_last_synced_at: new Date(latestMessageTs).toISOString(),
    gmail_last_messages:  messageIds.length,
    gmail_last_activities: activitiesCreated,
  });

  return {
    messagesScanned:   messageIds.length,
    activitiesCreated,
    contactsMatched:   matchedContactIds.size,
    latestMessageTs,
  };
}

/** Top-level entry for the sync route. Catches errors and records them
 *  on the integration so the Settings UI can surface a readable status. */
export async function safeSyncGmail(integration: IntegrationRow): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  try {
    const result = await syncGmail(integration);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}
