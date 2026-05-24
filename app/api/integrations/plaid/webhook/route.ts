// Plaid webhook endpoint. Plaid POSTs here for transaction updates,
// item-needs-reauth events, and a few others. For now we log + acknowledge.
// A future iteration can trigger a server-side transactions sync from
// here (instead of waiting for the user to open the Banking tab) and
// surface ITEM_LOGIN_REQUIRED to the UI as a "Reconnect" badge.
//
// NOTE: Plaid webhooks aren't authenticated by default; production
// should verify the `Plaid-Verification` JWT header against Plaid's
// JWKS. We accept all bodies for now and just log — deferred until we
// move past Sandbox.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown = null;
  try { body = await req.json(); } catch { /* tolerate empty / invalid bodies */ }
  console.log("[plaid/webhook]", JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
