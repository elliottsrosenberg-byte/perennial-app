import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchange a Teller enrollment (temporary token) for stored access credentials
// Called after Teller Connect completes in the browser
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accessToken, enrollmentId, institutionName } = await req.json() as {
    accessToken: string;
    enrollmentId: string;
    institutionName: string;
  };

  if (!accessToken || !enrollmentId) {
    return NextResponse.json({ error: "Missing accessToken or enrollmentId" }, { status: 400 });
  }

  const env = process.env.TELLER_ENVIRONMENT ?? "sandbox";
  const apiBase = env === "sandbox"
    ? "https://api.teller.io"
    : "https://api.teller.io";

  // Fetch accounts from Teller using the new access token
  const accountsRes = await fetch(`${apiBase}/accounts`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${accessToken}:`).toString("base64")}`,
    },
  });

  if (!accountsRes.ok) {
    const err = await accountsRes.text();
    console.error("Teller accounts fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch accounts from Teller" }, { status: 502 });
  }

  const tellerAccounts = await accountsRes.json() as TellerAccount[];

  // Store or update the integration
  const { data: integration, error: intErr } = await supabase
    .from("integrations")
    .upsert({
      user_id:      user.id,
      provider:     "teller",
      account_id:   enrollmentId,
      account_name: institutionName,
      access_token: accessToken,
      metadata:     { enrollment_id: enrollmentId, institution: institutionName, environment: env },
      connected_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider,account_id" })
    .select()
    .single();

  if (intErr) {
    console.error("Integration upsert error:", intErr);
    return NextResponse.json({ error: intErr.message }, { status: 500 });
  }

  // Upsert each bank account
  const accountRows = tellerAccounts.map(a => ({
    user_id:        user.id,
    integration_id: integration.id,
    teller_id:      a.id,
    institution:    institutionName,
    name:           a.name,
    type:           a.type,
    subtype:        a.subtype,
    last_four:      a.last_four,
    currency:       a.currency ?? "USD",
  }));

  const { data: bankAccounts, error: baErr } = await supabase
    .from("bank_accounts")
    .upsert(accountRows, { onConflict: "user_id,teller_id" })
    .select();

  if (baErr) {
    console.error("Bank accounts upsert error:", baErr);
  }

  return NextResponse.json({ ok: true, accounts: bankAccounts ?? [] });
}

interface TellerAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  last_four: string;
  currency: string;
  institution: { name: string };
}
