// Connect an iCloud account using an app-specific password the user
// generated at appleid.apple.com. We store the password as the
// "access_token" in the vault (there's no refresh token concept for
// IMAP/CalDAV/CardDAV) and stamp the integration row.
//
// We do NOT validate the credentials here in v1 because that would
// require an IMAP roundtrip; the first sync will surface auth errors
// via the integrations.status='error' surface.

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
    body = await req.json() as { email?: string; app_password?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email       = body.email?.trim().toLowerCase();
  const appPassword = body.app_password?.trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }
  if (!appPassword) {
    return NextResponse.json({ error: "app_password_required" }, { status: 400 });
  }
  // Apple app passwords are 16 chars in 4-4-4-4 format (with or
  // without dashes). Be lenient: strip whitespace + dashes, require
  // 16 alphanumeric chars.
  const normalized = appPassword.replace(/[\s-]/g, "");
  if (!/^[A-Za-z0-9]{16}$/.test(normalized)) {
    return NextResponse.json({ error: "invalid_app_password_format" }, { status: 400 });
  }

  const row = await upsertIntegrationRow({
    userId:   user.id,
    provider: "apple_icloud",
    account:  { accountId: email, accountName: email },
    scopes:   { mail: true, calendar: true, contacts: true, store_email_bodies: false },
    metadata: {
      imap_host:    "imap.mail.me.com",
      imap_port:    993,
      caldav_host:  "caldav.icloud.com",
      carddav_host: "contacts.icloud.com",
    },
  });

  await setIntegrationSecret(row.id, "access_token", normalized);

  return NextResponse.json({ ok: true, integration_id: row.id });
}
