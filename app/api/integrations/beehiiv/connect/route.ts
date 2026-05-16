// Connect a Beehiiv publication by API key + publication ID. Validates
// the key against the publication endpoint, then upserts an integration
// row and stores the key in the vault.

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
    body = await req.json() as { api_key?: string; publication_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const apiKey = body.api_key?.trim();
  const pubId  = body.publication_id?.trim();
  if (!apiKey) return NextResponse.json({ error: "api_key_required" },        { status: 400 });
  if (!pubId)  return NextResponse.json({ error: "publication_id_required" }, { status: 400 });

  // Verify by fetching the publication. 200 means key + id are valid.
  const pubRes = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!pubRes.ok) {
    return NextResponse.json({ error: "beehiiv_rejected_request", status: pubRes.status }, { status: 400 });
  }
  const pub = await pubRes.json() as { data?: { name?: string; organization_name?: string } };

  const row = await upsertIntegrationRow({
    userId:   user.id,
    provider: "beehiiv",
    account:  {
      accountId:   pubId,
      accountName: pub.data?.name ?? pub.data?.organization_name ?? "Beehiiv publication",
    },
    scopes:   { newsletter_stats: true },
    metadata: { publication_id: pubId },
  });

  await setIntegrationSecret(row.id, "access_token", apiKey);

  return NextResponse.json({ ok: true, integration_id: row.id });
}
