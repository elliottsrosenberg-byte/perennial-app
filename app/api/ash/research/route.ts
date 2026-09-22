// ─── POST /api/ash/research ──────────────────────────────────────────────────
//
// Kicks off background research on the user's niche and stores findings in their
// private knowledge-base rows. Fired fire-and-forget after onboarding (and later
// on a cadence). Auth-gated; writes go through the service-role client because
// knowledge_base writes are service-role only.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runBackgroundResearch } from "@/lib/ash/research";
import { getCreditState, debitCredits } from "@/lib/ash/credits";
import { ASH_CREDIT_COSTS } from "@/lib/plans";

export const runtime     = "nodejs";
export const maxDuration = 120;   // web search + embeddings; needs a Vercel plan allowing >60s

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    // A research run is the most expensive thing Ash does (web search + several
    // Sonnet turns). Skip it rather than run it when the week's credits are
    // gone — it's fire-and-forget, so there's no user waiting on a result.
    const credits = await getCreditState(supabase, user.id);
    if (credits.exhausted) return Response.json({ ok: false, reason: "credits_exhausted" });

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

    if (!credits.unlimited) {
      await debitCredits(user.id, ASH_CREDIT_COSTS.research, "research");
    }

    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Ash research] error:", err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
