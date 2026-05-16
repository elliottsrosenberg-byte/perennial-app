// Outlook Mail sync via Microsoft Graph. Same shape as google-gmail.ts:
// pull recent messages, match sender/recipients against People contacts,
// dedup by Graph message id. Bodies are not stored in v1.

import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftAccessToken } from "./microsoft-tokens";
import { recordSyncSuccess, recordSyncError } from "./storage";
import type { IntegrationRow } from "./types";

const GRAPH_MESSAGES = "https://graph.microsoft.com/v1.0/me/messages";
const FIRST_SYNC_LOOKBACK_DAYS = 30;
const MAX_MESSAGES_PER_RUN     = 500;
const PAGE_SIZE                = 100;

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}
interface GraphMessage {
  id:                string;
  subject?:          string;
  bodyPreview?:      string;
  from?:             GraphRecipient;
  toRecipients?:     GraphRecipient[];
  ccRecipients?:     GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?:     string;
  conversationId?:   string;
}
interface GraphMessageListResponse {
  value:           GraphMessage[];
  "@odata.nextLink"?: string;
}

interface SyncResult {
  messagesScanned: number;
  activitiesCreated: number;
  contactsMatched: number;
}

function recipientsToEmails(rs: GraphRecipient[] | undefined): string[] {
  if (!rs) return [];
  return rs
    .map((r) => r.emailAddress?.address?.trim().toLowerCase())
    .filter((e): e is string => !!e && e.includes("@"));
}

export async function syncMicrosoftMail(integration: IntegrationRow): Promise<SyncResult> {
  if (integration.provider !== "microsoft" || !integration.scopes?.mail) {
    return { messagesScanned: 0, activitiesCreated: 0, contactsMatched: 0 };
  }

  const supabase = await createClient();
  const userId   = integration.user_id;

  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("user_id", userId)
    .eq("archived", false)
    .not("email", "is", null);
  if (contactsErr) throw new Error(`syncMicrosoftMail: load contacts failed: ${contactsErr.message}`);

  const emailToContactIds = new Map<string, string[]>();
  for (const c of contacts ?? []) {
    if (!c.email) continue;
    const key = c.email.trim().toLowerCase();
    const arr = emailToContactIds.get(key) ?? [];
    arr.push(c.id);
    emailToContactIds.set(key, arr);
  }

  if (emailToContactIds.size === 0) {
    await recordSyncSuccess(integration.id, {
      ...integration.sync_state,
      outlook_mail_last_synced_at: new Date().toISOString(),
      outlook_mail_last_messages:  0,
    });
    return { messagesScanned: 0, activitiesCreated: 0, contactsMatched: 0 };
  }

  const token   = await getValidMicrosoftAccessToken(integration.id);
  const ownEmail = integration.account_name?.toLowerCase() ?? null;

  const lastSyncIso = (integration.sync_state?.outlook_mail_last_synced_at as string | undefined) ?? null;
  const sinceIso    = lastSyncIso
    ?? new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86400_000).toISOString();

  // Graph: $filter uses ISO 8601 with single quotes, $select trims payload
  let nextUrl: string | null =
    `${GRAPH_MESSAGES}?$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}` +
    `&$select=${encodeURIComponent("id,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,conversationId")}` +
    `&$top=${PAGE_SIZE}&$orderby=receivedDateTime asc`;

  const messages: GraphMessage[] = [];
  while (nextUrl && messages.length < MAX_MESSAGES_PER_RUN) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph /me/messages ${res.status}: ${body.slice(0, 300)}`);
    }
    const list = await res.json() as GraphMessageListResponse;
    if (list.value?.length) messages.push(...list.value);
    nextUrl = list["@odata.nextLink"] ?? null;
  }

  let activitiesCreated = 0;
  const matchedContactIds = new Set<string>();
  let latestSyncedAt: string = sinceIso;

  for (const m of messages) {
    const fromEmails = m.from?.emailAddress?.address
      ? [m.from.emailAddress.address.trim().toLowerCase()]
      : [];
    const toEmails = recipientsToEmails(m.toRecipients);
    const ccEmails = recipientsToEmails(m.ccRecipients);

    const matchedThisMessage = new Set<string>();
    for (const e of [...fromEmails, ...toEmails, ...ccEmails]) {
      const ids = emailToContactIds.get(e);
      if (ids) ids.forEach((id) => matchedThisMessage.add(id));
    }
    if (matchedThisMessage.size === 0) continue;

    const isOutbound = ownEmail !== null && fromEmails.some((e) => e === ownEmail);
    const direction  = isOutbound ? "out" : "in";

    const occurredAtIso = m.receivedDateTime ?? m.sentDateTime ?? new Date().toISOString();
    const occurredTs    = new Date(occurredAtIso).getTime();
    if (occurredAtIso > latestSyncedAt) latestSyncedAt = occurredAtIso;

    const subject = m.subject ?? "(no subject)";
    const snippet = (m.bodyPreview ?? "").trim();
    const content = snippet ? `${subject} — ${snippet}` : subject;

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
            source:           "microsoft_mail",
            integration_id:   integration.id,
            // Reuse the gmail_message_id key so the existing dedup index
            // and any UI that reads "external email id" works for both
            // providers without a second index.
            gmail_message_id: m.id,
            graph_conversation_id: m.conversationId ?? null,
            from: m.from?.emailAddress?.address ?? null,
            to:   recipientsToEmails(m.toRecipients).join(", "),
            cc:   recipientsToEmails(m.ccRecipients).join(", "),
            subject, snippet, direction,
          },
        });

      if (insertErr) {
        if (insertErr.code === "23505") continue;
        throw new Error(`contact_activities insert failed: ${insertErr.message}`);
      }
      activitiesCreated++;

      if (occurredTs <= Date.now() + 60_000) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("last_contacted_at")
          .eq("id", contactId)
          .single();
        const existingTs = contact?.last_contacted_at ? new Date(contact.last_contacted_at).getTime() : 0;
        if (occurredTs > existingTs) {
          await supabase.from("contacts").update({ last_contacted_at: occurredAtIso }).eq("id", contactId);
        }
      }
    }
  }

  await recordSyncSuccess(integration.id, {
    ...integration.sync_state,
    outlook_mail_last_synced_at: latestSyncedAt,
    outlook_mail_last_messages:  messages.length,
    outlook_mail_last_activities: activitiesCreated,
  });

  return { messagesScanned: messages.length, activitiesCreated, contactsMatched: matchedContactIds.size };
}

export async function safeSyncMicrosoftMail(integration: IntegrationRow): Promise<{ ok: true; result: SyncResult } | { ok: false; error: string }> {
  try {
    const result = await syncMicrosoftMail(integration);
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncError(integration.id, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}
