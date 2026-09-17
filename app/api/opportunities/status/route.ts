// Sets the signed-in user's status on an opportunity (save / apply /
// attend / exhibit / hide, or clear). Statuses live in the per-user
// opportunity_user_status table (RLS: users manage their own rows), so the
// write goes through the user's own client — no service role needed. The
// legacy global opportunities.user_status column is no longer touched.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = status === null
    ? await supabase
        .from("opportunity_user_status")
        .delete()
        .eq("user_id", user.id)
        .eq("opportunity_id", id)
    : await supabase
        .from("opportunity_user_status")
        .upsert(
          { user_id: user.id, opportunity_id: id, status },
          { onConflict: "user_id,opportunity_id" },
        );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
