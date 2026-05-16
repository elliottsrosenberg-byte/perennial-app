// DELETE /api/integrations/:id → disconnect an integration. Cleans up
// vault tokens via the SECURITY DEFINER RPC and flips the row to
// status='disconnected'. The row itself is retained so any already-
// synced contact_activities that reference it via metadata.integration_id
// remain meaningful.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnectIntegration } from "@/lib/integrations/storage";
import { googleAdapter } from "@/lib/integrations/google";
import { readIntegrationSecret } from "@/lib/integrations/vault";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Verify ownership before doing anything destructive. RLS already
  // gates this, but the explicit check gives us a cleaner error code.
  const { data: row } = await supabase
    .from("integrations")
    .select("id, user_id, provider")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Best-effort: revoke the access token at the provider so the
  // user's grant is also cleaned up on their side. Swallows errors —
  // local disconnect must succeed even if the provider call fails.
  try {
    if (row.provider === "google") {
      const accessToken = await readIntegrationSecret(id, "access_token");
      if (accessToken) await googleAdapter.revoke?.(accessToken);
    }
    // Microsoft has no equivalent simple revoke endpoint; the user
    // can revoke from microsoft.com/consent if they want.
  } catch {
    // ignore
  }

  await disconnectIntegration(id);
  return NextResponse.json({ ok: true });
}
