// Gmail sync: pulls message metadata, matches sender/recipient emails
// against the user's Perennial contacts, and writes one `contact_activities`
// row per matched contact per message. Dedup is enforced by a partial unique
// index on (contact_id, metadata->>'gmail_message_id'), so every run is
// idempotent.
//
// Each run does two things:
//   1. Incremental slice — messages newer than `sync_state.gmail_last_synced_at`
//      (a small, cheap query) so freshly-arrived mail shows up promptly, even
//      while a large backfill is still in flight.
//   2. Backfill chunk — a bounded page of the *entire* mailbox, walked
//      newest→oldest via a stored Gmail `pageToken`. This is resumable across
//      runs: the cron (or the sync-on-open path) chips away one page at a time
//      until the whole history has been imported. Progress lives in
//      `sync_state.gmail_backfill` so the UI can surface it.
//
// The sync runs in one of two auth contexts (see sync-context.ts): the
// interactive path uses the user's session; the background pg_cron job uses
// the service-role client + `*_service` vault RPCs. Message bodies are never
// stored in this v1 — only headers + snippet.

import { getValidGoogleAccessToken } from "./google-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import { resolveSyncContext, type SyncContext } from "./sync-context";
import type { IntegrationRow } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const FIRST_SYNC_LOOKBACK_DAYS = 30;
const INCREMENTAL_MAX = 300;   // cap on the "new mail" slice per run
const BACKFILL_BATCH  = 200;   // mailbox pages walked per run (Gmail max 500)
const DETAIL_CONCURRENCY = 8;  // parallel messages.get fetches (well under quota)

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

/** Resumable backfill cursor persisted in `sync_state.gmail_backfill`. */
interface GmailBackfillState {
  status:     "running" | "done";
  page_token: string | null;
  scanned:    number;
  activities: number;
  started_at: string;
  updated_at: string;
}

/** Extract bare email addresses from header values like:
 *    "Jenna Kim <jenna@friedman.com>, press@studiomag.com"
 *  Returns lowercased addresses. */
function extractEmails(headerValue: string): string[] {
  if (!headerValue) return [];
  const out: string[] = [];
  const re = /<([^>]+)>|([^,\s<>"']+@[^,\s<>"']+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(headerValue)) !== null) {
    const e = (m[1] ?? m[2] ?? "").trim().toLowerCase();
    if (e.includes("@")) out.push(e);
  }
  return out;
}

/** Run an async mapper over `items` with a bounded number of workers. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

interface SyncResult {
  messagesScanned:   number;
  activitiesCreated: number;
  contactsMatched:   number;
  latestMessageTs:   number; // ms since epoch
  backfill?: { status: "running" | "done"; scanned: number };
}

/** Everything a single message-processing pass needs. */
interface ProcessCtx {
  supabase:          SupabaseClient;
  token:             string;
  userId:            string;
  integrationId:     string;
  ownEmail:          string | null;
  emailToContactIds: Map<string, string[]>;
}

/** Fetch metadata for a batch of message ids, match against contacts, and
 *  write activities. Returns counts. Idempotent via the dedup unique index. */
async function processMessages(
  ctx: ProcessCtx,
  messageIds: { id: string; threadId: string }[],
): Promise<{ activitiesCreated: number; latestMessageTs: number; matchedContactIds: Set<string> }> {
  let activitiesCreated = 0;
  let latestMessageTs = 0;
  const matchedContactIds = new Set<string>();

  await mapPool(messageIds, DETAIL_CONCURRENCY, async (m) => {
    const detailUrl = new URL(`${GMAIL_API}/messages/${m.id}`);
    detailUrl.searchParams.set("format", "metadata");
    for (const h of ["From", "To", "Cc", "Subject", "Date"]) {
      detailUrl.searchParams.append("metadataHeaders", h);
    }

    const detailRes = await fetch(detailUrl.toString(), {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!detailRes.ok) return; // skip individual failures, don't poison the run
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

    const fromEmails = extractEmails(from);
    const allEmails  = [...fromEmails, ...extractEmails(to), ...extractEmails(cc)];

    const matchedThisMessage = new Set<string>();
    for (const e of allEmails) {
      const ids = ctx.emailToContactIds.get(e);
      if (ids) ids.forEach((id) => matchedThisMessage.add(id));
    }
    if (matchedThisMessage.size === 0) return;

    const isOutbound = ctx.ownEmail !== null && fromEmails.some((e) => e === ctx.ownEmail);
    const direction  = isOutbound ? "out" : "in";

    const occurredAtIso = dateHdr ? new Date(dateHdr).toISOString() : new Date().toISOString();
    const occurredTs    = new Date(occurredAtIso).getTime();
    if (Number.isFinite(occurredTs) && occurredTs > latestMessageTs) latestMessageTs = occurredTs;

    const content = snippet ? `${subject} — ${snippet}` : subject;

    for (const contactId of matchedThisMessage) {
      matchedContactIds.add(contactId);

      const { error: insertErr } = await ctx.supabase
        .from("contact_activities")
        .insert({
          user_id:     ctx.userId,
          contact_id:  contactId,
          type:        "email",
          content,
          occurred_at: occurredAtIso,
          metadata: {
            source:           "google_gmail",
            integration_id:   ctx.integrationId,
            gmail_message_id: m.id,
            gmail_thread_id:  m.threadId,
            from, to, cc, subject, snippet,
            direction,
          },
        });

      // Skip on any insert error rather than throwing: 23505 = already synced
      // (dedup), and other per-row failures (e.g. a contact deleted mid-run)
      // must not wedge a large backfill — the run should still advance its
      // cursor. Consistent with skipping individual message-fetch failures.
      if (insertErr) continue;
      activitiesCreated++;

      // Bump last_contacted_at only when the message is past/now and newer
      // than the current value (matches the manual-log path).
      if (occurredTs <= Date.now() + 60_000) {
        const { data: contact } = await ctx.supabase
          .from("contacts")
          .select("last_contacted_at")
          .eq("id", contactId)
          .single();
        const existingTs = contact?.last_contacted_at ? new Date(contact.last_contacted_at).getTime() : 0;
        if (occurredTs > existingTs) {
          await ctx.supabase.from("contacts")
            .update({ last_contacted_at: occurredAtIso })
            .eq("id", contactId);
        }
      }
    }
  });

  return { activitiesCreated, latestMessageTs, matchedContactIds };
}

/** List one page of message ids. `pageToken` resumes a prior walk; `q` filters
 *  (e.g. `after:<unix>`); omit `q` to walk the whole mailbox. */
async function listMessagesPage(
  token: string,
  args: { q?: string; pageToken?: string; maxResults: number },
): Promise<{ messages: { id: string; threadId: string }[]; nextPageToken?: string }> {
  const url = new URL(`${GMAIL_API}/messages`);
  if (args.q) url.searchParams.set("q", args.q);
  url.searchParams.set("maxResults", String(args.maxResults));
  if (args.pageToken) url.searchParams.set("pageToken", args.pageToken);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail messages.list ${res.status}: ${body.slice(0, 300)}`);
  }
  const list = await res.json() as GmailListResponse;
  return { messages: list.messages ?? [], nextPageToken: list.nextPageToken };
}

/** Run a Gmail sync for one integration. Returns a result summary. */
export async function syncGmail(integration: IntegrationRow, context?: SyncContext): Promise<SyncResult> {
  if (integration.provider !== "google" || !integration.scopes?.gmail) {
    return { messagesScanned: 0, activitiesCreated: 0, contactsMatched: 0, latestMessageTs: 0 };
  }

  const ctx      = await resolveSyncContext(context);
  const supabase = ctx.db;
  const userId   = integration.user_id;
  const syncState = { ...(integration.sync_state ?? {}) };

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
    // Nothing to match against — record a successful run but preserve any
    // in-flight backfill cursor so it resumes once contacts exist.
    await recordSyncSuccess(integration.id, {
      ...syncState,
      gmail_last_synced_at: syncState.gmail_last_synced_at ?? new Date().toISOString(),
      gmail_last_messages:  0,
    }, ctx);
    return { messagesScanned: 0, activitiesCreated: 0, contactsMatched: 0, latestMessageTs: 0 };
  }

  // ── Auth + processing context ──────────────────────────────────────
  const token = await getValidGoogleAccessToken(integration.id, ctx);
  const proc: ProcessCtx = {
    supabase, token, userId,
    integrationId:     integration.id,
    ownEmail:          integration.account_name?.toLowerCase() ?? null,
    emailToContactIds,
  };

  const prevBackfill = (syncState.gmail_backfill as GmailBackfillState | undefined) ?? null;
  const firstEver    = !syncState.gmail_last_synced_at && !prevBackfill;

  let totalScanned = 0;
  let totalActivities = 0;
  let latestMessageTs = 0;
  const matchedAll = new Set<string>();

  // ── 1. Incremental slice — mail newer than the anchor ───────────────
  // On the very first run we anchor the incremental cursor at "now" and let
  // the backfill cover everything older; going forward, incremental catches
  // strictly-new arrivals cheaply on every run.
  let incrementalAnchorIso: string = firstEver
    ? new Date().toISOString()
    : (syncState.gmail_last_synced_at as string | undefined)
        ?? new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86400_000).toISOString();

  if (!firstEver) {
    const afterTs = Math.floor(new Date(incrementalAnchorIso).getTime() / 1000);
    const incMessages: { id: string; threadId: string }[] = [];
    let pageToken: string | undefined;
    while (incMessages.length < INCREMENTAL_MAX) {
      const page = await listMessagesPage(token, {
        q: `after:${afterTs}`,
        pageToken,
        maxResults: Math.min(100, INCREMENTAL_MAX - incMessages.length),
      });
      incMessages.push(...page.messages);
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }
    const res = await processMessages(proc, incMessages);
    totalScanned    += incMessages.length;
    totalActivities += res.activitiesCreated;
    res.matchedContactIds.forEach((id) => matchedAll.add(id));
    if (res.latestMessageTs > latestMessageTs) latestMessageTs = res.latestMessageTs;
    // Advance the anchor to the newest message we saw (never move it backwards).
    if (res.latestMessageTs > new Date(incrementalAnchorIso).getTime()) {
      incrementalAnchorIso = new Date(res.latestMessageTs).toISOString();
    }
  }

  // ── 2. Backfill chunk — one page of the whole mailbox, older direction ──
  let backfill = prevBackfill;
  if (!backfill || backfill.status !== "done") {
    const page = await listMessagesPage(token, {
      pageToken:  backfill?.page_token ?? undefined,
      maxResults: BACKFILL_BATCH,
    });
    const res = await processMessages(proc, page.messages);
    totalScanned    += page.messages.length;
    totalActivities += res.activitiesCreated;
    res.matchedContactIds.forEach((id) => matchedAll.add(id));
    if (res.latestMessageTs > latestMessageTs) latestMessageTs = res.latestMessageTs;

    const done = !page.nextPageToken;
    const nowIso = new Date().toISOString();
    backfill = {
      status:     done ? "done" : "running",
      page_token: done ? null : (page.nextPageToken ?? null),
      scanned:    (backfill?.scanned ?? 0) + page.messages.length,
      activities: (backfill?.activities ?? 0) + res.activitiesCreated,
      started_at: backfill?.started_at ?? nowIso,
      updated_at: nowIso,
    };
  }

  // ── Persist sync state ─────────────────────────────────────────────
  await recordSyncSuccess(integration.id, {
    ...syncState,
    gmail_last_synced_at:  incrementalAnchorIso,
    gmail_last_messages:   totalScanned,
    gmail_last_activities: totalActivities,
    gmail_backfill:        backfill,
  }, ctx);

  return {
    messagesScanned:   totalScanned,
    activitiesCreated: totalActivities,
    contactsMatched:   matchedAll.size,
    latestMessageTs,
    backfill: backfill ? { status: backfill.status, scanned: backfill.scanned } : undefined,
  };
}

/** Top-level entry for the sync route. Catches errors and records them
 *  on the integration so the Settings UI can surface a readable status. */
export async function safeSyncGmail(
  integration: IntegrationRow,
  context?: SyncContext,
): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  try {
    const result = await syncGmail(integration, context);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message, context).catch(() => undefined);
    return { ok: false, error: message };
  }
}
