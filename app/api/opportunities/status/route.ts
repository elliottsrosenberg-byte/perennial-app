// Sets the signed-in user's status on an opportunity (save / apply /
// attend / exhibit / hide, or clear). The opportunities write policy is
// service_role-only — curated rows are shared — so the authenticated
// browser client can't UPDATE them directly: its write matches zero rows
// and silently no-ops. This route does the write with the service-role
// client after an auth check, and only ever touches `user_status`.
//
// Note: `user_status` is a single global column on the shared feed row.
// That's the current single-tenant design. A multi-user build will need a
// per-user opportunity-state table instead.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "saved", "applied", "attending", "exhibiting", "hidden",
]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // null clears the status; otherwise it must be one of the known values.
  const status = body?.status == null ? null : String(body.status);
  if (status !== null && !ALLOWED.has(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("opportunities")
    .update({ user_status: status })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
