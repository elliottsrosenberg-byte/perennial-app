import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HomeCanvas from "@/components/home/HomeCanvas";
import DashboardTour from "@/components/tour/DashboardTour";
import { ensureCanvas, loadCanvasObjects } from "@/lib/canvas/api";
import { seedHomeCanvas } from "@/lib/canvas/seed-home";

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
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete, profile_setup_complete, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.onboarding_complete) redirect("/onboarding");
    setupComplete = Boolean(profile?.profile_setup_complete);
    firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null;
  }

  // Resolve (creating on first visit) the user's Home board + its objects.
  const canvasId = await ensureCanvas(supabase, { scope: "home" });
  let initialObjects = canvasId ? await loadCanvasObjects(supabase, canvasId) : [];

  // First-run: seed a friendly starter board once, for a freshly-onboarded user
  // whose board is still empty and who hasn't finished guided setup. Because we
  // gate on an empty board + setup-not-complete, it fires at most once and never
  // re-seeds after the user clears the board post-setup.
  if (user && canvasId && initialObjects.length === 0 && !setupComplete) {
    await seedHomeCanvas(supabase, canvasId, user.id, firstName);
    initialObjects = await loadCanvasObjects(supabase, canvasId);
  }

  return (
    <>
      <HomeCanvas canvasId={canvasId} initialObjects={initialObjects} setupComplete={setupComplete} />
      <DashboardTour />
    </>
  );
}
