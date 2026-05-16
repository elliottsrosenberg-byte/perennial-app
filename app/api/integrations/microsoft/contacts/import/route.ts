// POST /api/integrations/microsoft/contacts/import — one-shot batch
// import from Outlook Contacts via Microsoft Graph. Mirror of the
// Google contacts import route.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeImportMicrosoftContacts } from "@/lib/integrations/microsoft-contacts";
import type { IntegrationRow } from "@/lib/integrations/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");

  let query = supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "microsoft")
    .eq("status", "active");
  if (accountId) query = query.eq("account_id", accountId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "no active microsoft integration" }, { status: 404 });
  }

  const results = [];
  for (const row of rows as IntegrationRow[]) {
    results.push({
      integration_id: row.id,
      account_name:   row.account_name,
      ...(await safeImportMicrosoftContacts(row)),
    });
  }
  return NextResponse.json({ results });
}
