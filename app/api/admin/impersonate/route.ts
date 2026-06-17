// Admin support tooling: mint a one-time login link for a target user so the
// owner can see exactly what that user sees (their data, through real RLS).
//
// Security model:
//   - Gated to the ADMIN_USER_IDS allowlist (getAdminUser). A non-admin session
//     gets a 403; an anonymous one too.
//   - The gate runs HERE, at generation time, using the admin's own session
//     cookies. The returned link is self-authenticating (a Supabase magic-link
//     token_hash) so it can be opened in a separate/incognito window WITHOUT
//     the admin's cookies — which is what keeps the admin's own session intact.
//   - Every generation is logged with both ids.
//
// The returned URL points at /auth/confirm (our SSR verifyOtp handler), which
// sets the target user's session cookie in whatever browser opens it.

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (userId === admin.id) {
    return NextResponse.json({ error: "that's you" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: target, error: lookupErr } = await service.auth.admin.getUserById(userId);
  const email = target?.user?.email;
  if (lookupErr || !email) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const origin = appOrigin(req);
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/` },
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkErr?.message ?? "could not generate link" },
      { status: 500 },
    );
  }

  const url =
    `${origin}/auth/confirm` +
    `?token_hash=${encodeURIComponent(link.properties.hashed_token)}` +
    `&type=magiclink&next=/&impersonated=1`;

  console.log(`[impersonate] admin=${admin.id} -> user=${userId} (${email})`);

  return NextResponse.json({ url, email });
}
