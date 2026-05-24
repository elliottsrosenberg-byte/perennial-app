import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tellerFetch, TellerNotConfiguredError } from "@/lib/integrations/teller";

// Run on the Node runtime so we can attach the mTLS Agent — Edge can't
// install client certificates.
export const runtime = "nodejs";

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

  // Fetch accounts from Teller using the new access token. Teller requires
  // mTLS on every API call (yes — even in sandbox); without the client
  // certificate the TLS handshake fails before the request lands. Routes
  // surface a clean 503 when the cert isn't installed so the UI can
  // explain it instead of silently 502'ing.
  console.log("[teller/enroll] starting", { env, hasCert: !!process.env.TELLER_CERT_PEM, hasKey: !!process.env.TELLER_KEY_PEM, enrollmentId, institutionName });
  let accountsRes: Response;
  try {
    accountsRes = await tellerFetch("/accounts", accessToken);
  } catch (e) {
    if (e instanceof TellerNotConfiguredError) {
      console.error("[teller/enroll] not configured:", e.message);
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    // mTLS handshake failures, DNS, etc. land here. Surface the underlying
    // message so the UI can show something more useful than a generic
    // "Connection failed" — and so the dev-server log shows the cause.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("[teller/enroll] network/TLS error:", msg, e);
    return NextResponse.json({ error: `Teller request failed: ${msg}` }, { status: 502 });
  }

  if (!accountsRes.ok) {
    const err = await accountsRes.text();
    console.error("[teller/enroll] accounts fetch failed", accountsRes.status, err);
    return NextResponse.json({ error: `Teller responded ${accountsRes.status}: ${err.slice(0, 200)}` }, { status: 502 });
  }

  console.log("[teller/enroll] accounts fetch OK");
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
