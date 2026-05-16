// Tiny endpoint that returns the list of provider slugs the calling
// user has actively connected. Used by the onboarding integration
// step (and anywhere else that needs a quick "is X connected?" check)
// to show the right CTA without loading the full Settings page state.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ providers: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("integrations")
    .select("provider")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) return NextResponse.json({ providers: [], error: error.message }, { status: 500 });

  const providers = Array.from(new Set((data ?? []).map((r) => r.provider as string)));
  return NextResponse.json({ providers });
}
