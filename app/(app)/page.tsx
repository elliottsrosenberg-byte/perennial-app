import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HomeCanvas from "@/components/home/HomeCanvas";
import DashboardTour from "@/components/tour/DashboardTour";
import { ensureCanvas, loadCanvasObjects } from "@/lib/canvas/api";
import { seedHomeCanvas, type GuidanceLevel } from "@/lib/canvas/seed-home";

// PER-70: Home is now a full-page spatial canvas ("board") with Ash overlaid,
// replacing the old read-only dashboard of module snapshot cards.
export default async function HomePage() {
  const supabase = await createClient();

  // Force onboarding before Home renders. The proxy guarantees a session here,
  // so we only need to check completion.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let setupComplete = false;
  let firstName: string | null = null;
  let guidanceLevel: GuidanceLevel | null = null;
  let practiceTypes: string[] = [];
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete, profile_setup_complete, display_name, guidance_level, practice_types")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.onboarding_complete) redirect("/onboarding");
    setupComplete = Boolean(profile?.profile_setup_complete);
    firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
    guidanceLevel = (profile?.guidance_level as GuidanceLevel | null) ?? null;
    practiceTypes = profile?.practice_types ?? [];
  }

  // Resolve (creating on first visit) the user's Home board + its objects.
  const canvasId = await ensureCanvas(supabase, { scope: "home" });
  let initialObjects = canvasId ? await loadCanvasObjects(supabase, canvasId) : [];

  // First-run: seed a friendly starter board once, for a freshly-onboarded user
  // whose board is still empty and who hasn't finished guided setup. We claim the
  // right to seed atomically via canvases.seeded_at — an UPDATE ... WHERE
  // seeded_at IS NULL that returns the row only for the single request that wins,
  // so concurrent renders can't double-seed. We still require an empty board so we
  // never add starter content on top of a user's real work.
  if (user && canvasId && initialObjects.length === 0 && !setupComplete) {
    const { data: claim } = await supabase
      .from("canvases")
      .update({ seeded_at: new Date().toISOString() })
      .eq("id", canvasId)
      .is("seeded_at", null)
      .select("id")
      .maybeSingle();
    if (claim) {
      try {
        await seedHomeCanvas(supabase, canvasId, user.id, { firstName, guidanceLevel, practiceTypes });
        initialObjects = await loadCanvasObjects(supabase, canvasId);
      } catch {
        // Seeding failed after we claimed it — release the claim so the next
        // load can retry instead of leaving the board permanently empty.
        await supabase.from("canvases").update({ seeded_at: null }).eq("id", canvasId);
      }
    }
  }

  return (
    <>
      <HomeCanvas canvasId={canvasId} initialObjects={initialObjects} setupComplete={setupComplete} />
      <DashboardTour />
    </>
  );
}
