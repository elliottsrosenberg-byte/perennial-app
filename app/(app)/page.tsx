import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HomeCanvas from "@/components/home/HomeCanvas";
import DashboardTour from "@/components/tour/DashboardTour";
import { ensureCanvas, loadCanvasObjects } from "@/lib/canvas/api";

// PER-70: Home is now a full-page spatial canvas ("board") with Ash overlaid,
// replacing the old read-only dashboard of module snapshot cards.
export default async function HomePage() {
  const supabase = await createClient();

  // Force onboarding before Home renders. The proxy guarantees a session here,
  // so we only need to check completion.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.onboarding_complete) redirect("/onboarding");
  }

  // Resolve (creating on first visit) the user's Home board + its objects.
  const canvasId = await ensureCanvas(supabase, { scope: "home" });
  const initialObjects = canvasId ? await loadCanvasObjects(supabase, canvasId) : [];

  return (
    <>
      <HomeCanvas canvasId={canvasId} initialObjects={initialObjects} />
      <DashboardTour />
    </>
  );
}
