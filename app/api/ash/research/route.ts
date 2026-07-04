// ─── POST /api/ash/research ──────────────────────────────────────────────────
//
// Kicks off background research on the user's niche and stores findings in their
// private knowledge-base rows. Fired fire-and-forget after onboarding (and later
// on a cadence). Auth-gated; writes go through the service-role client because
// knowledge_base writes are service-role only.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runBackgroundResearch } from "@/lib/ash/research";

export const runtime     = "nodejs";
export const maxDuration = 120;   // web search + embeddings; needs a Vercel plan allowing >60s

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("studio_name, practice_types, work_types, selling_channels, location, price_range, years_in_practice, bio")
      .eq("user_id", user.id)
      .maybeSingle();

    const service = createServiceClient();
    const result = await runBackgroundResearch(service, user.id, {
      studioName:      profile?.studio_name,
      practiceTypes:   profile?.practice_types ?? [],
      workTypes:       profile?.work_types ?? [],
      sellingChannels: profile?.selling_channels ?? [],
      location:        profile?.location,
      priceRange:      profile?.price_range,
      yearsInPractice: profile?.years_in_practice,
      bio:             profile?.bio,
    });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Ash research] error:", err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
