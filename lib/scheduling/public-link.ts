// Loads a scheduling link for the public booking surface (page + slots/book
// endpoints), keyed by the unguessable slug, via the service-role client. Also
// pulls the organizer's display identity and the confirmed-booking count so
// callers can enforce single-use / max-bookings caps.

import { createServiceClient } from "@/lib/supabase/service";
import type { SchedulingLink } from "@/types/database";

export interface PublicOrganizer {
  name:        string;
  studio:      string | null;
  avatar_url:  string | null;
  brand_color: string | null;
}

export interface PublicLinkBundle {
  link:            SchedulingLink;
  organizer:       PublicOrganizer;
  confirmed_count: number;
  /** Organizer-level conferencing settings (e.g. a saved Zoom link). */
  conferencing:    { zoom_url: string | null };
}

export async function loadPublicLink(slug: string): Promise<PublicLinkBundle | null> {
  const supabase = createServiceClient();

  const { data: link } = await supabase
    .from("scheduling_links")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!link || !link.active) return null;

  const [{ data: profile }, { count }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, studio_name, avatar_url, brand_color, conferencing")
      .eq("user_id", link.user_id)
      .maybeSingle(),
    supabase
      .from("scheduling_bookings")
      .select("id", { count: "exact", head: true })
      .eq("link_id", link.id)
      .eq("status", "confirmed"),
  ]);

  return {
    link: link as SchedulingLink,
    organizer: {
      name:        profile?.display_name || profile?.studio_name || "Perennial",
      studio:      profile?.studio_name ?? null,
      avatar_url:  profile?.avatar_url ?? null,
      brand_color: profile?.brand_color ?? null,
    },
    confirmed_count: count ?? 0,
    conferencing: {
      zoom_url: ((profile?.conferencing as { zoom_url?: string } | null)?.zoom_url ?? null) || null,
    },
  };
}

/** True when the link can no longer take bookings (expired or at capacity). */
export function linkClosedReason(bundle: PublicLinkBundle, now: Date): "expired" | "full" | null {
  const { link, confirmed_count } = bundle;
  if (link.expires_at && now.getTime() > new Date(link.expires_at).getTime()) return "expired";
  const cap = link.single_use ? 1 : link.max_bookings ?? null;
  if (cap !== null && confirmed_count >= cap) return "full";
  return null;
}
