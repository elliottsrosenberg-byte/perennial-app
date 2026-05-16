// Connect a Mailchimp account by API key. Validates the key against
// /ping, then upserts an integrations row and stores the key in the
// vault. Mailchimp keys are formatted "<random>-<datacenter>" where the
// datacenter (e.g. "us21") selects the API host.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertIntegrationRow } from "@/lib/integrations/storage";
import { setIntegrationSecret } from "@/lib/integrations/vault";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body;
  try {
    body = await req.json() as { api_key?: string; list_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const apiKey = body.api_key?.trim();
  const listId = body.list_id?.trim() ?? null;
  if (!apiKey) return NextResponse.json({ error: "api_key_required" }, { status: 400 });

  const dc = apiKey.split("-").pop();
  if (!dc || !/^[a-z0-9]+$/i.test(dc)) {
    return NextResponse.json({ error: "invalid_api_key_format" }, { status: 400 });
  }

  // Verify against /ping. Mailchimp uses HTTP Basic with any username
  // and the API key as the password.
  const ping = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
    headers: { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}` },
  });
  if (!ping.ok) {
    return NextResponse.json({ error: "mailchimp_rejected_key", status: ping.status }, { status: 400 });
  }

  // Fetch the account email/id so we can label the connection.
  let accountId = user.id;     // fallback
  let accountName = user.email ?? "Mailchimp";
  try {
    const root = await fetch(`https://${dc}.api.mailchimp.com/3.0/`, {
      headers: { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}` },
    });
    if (root.ok) {
      const j = await root.json() as { account_id?: string; email?: string; account_name?: string };
      if (j.account_id) accountId = j.account_id;
      if (j.email)      accountName = j.email;
      else if (j.account_name) accountName = j.account_name;
    }
  } catch {
    // non-fatal
  }

  const row = await upsertIntegrationRow({
    userId:   user.id,
    provider: "mailchimp",
    account:  { accountId, accountName },
    scopes:   { newsletter_stats: true },
    metadata: { datacenter: dc, list_id: listId },
  });

  await setIntegrationSecret(row.id, "access_token", apiKey);

  return NextResponse.json({ ok: true, integration_id: row.id });
}
