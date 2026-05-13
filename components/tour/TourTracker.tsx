"use client";

// Watches pathname changes and marks the matching module as visited in
// profiles.tour_visited the first time the user lands on it. Broadcasts a
// "tour-visited" event so the sidebar widget and floating callout can
// rerender without needing to re-fetch the profile.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TOUR_MODULES, type TourVisited } from "@/lib/tour";

const MODULE_BY_PATH = Object.fromEntries(TOUR_MODULES.map((m) => [m.href, m.key]));

export default function TourTracker() {
  const pathname = usePathname();
  const seenInSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pathname) return;
    // Match the deepest matching base path so /projects/abc-123 still counts as projects
    const matchKey =
      MODULE_BY_PATH[pathname] ??
      Object.entries(MODULE_BY_PATH).find(([href]) => pathname.startsWith(href + "/"))?.[1];
    if (!matchKey) return;
    // Modules with their own walkthrough mark themselves visited only when
    // the user completes (or skips) the in-module modal/tour. Auto-marking
    // here on navigation would race with that and break the sidebar
    // callout hand-off.
    if (matchKey === "home")     return;
    if (matchKey === "projects") return;
    if (seenInSession.current.has(matchKey)) return;
    seenInSession.current.add(matchKey);

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("tour_visited")
        .eq("user_id", user.id)
        .maybeSingle();
      const visited = (prof?.tour_visited ?? {}) as TourVisited;
      if (visited[matchKey]) return;
      const next: TourVisited = { ...visited, [matchKey]: new Date().toISOString() };
      await supabase.from("profiles").update({ tour_visited: next }).eq("user_id", user.id);
      window.dispatchEvent(new CustomEvent("tour-visited", { detail: { visited: next } }));
    })();
  }, [pathname]);

  return null;
}
