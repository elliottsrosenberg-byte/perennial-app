// Place-autocomplete proxy backed by Nominatim (OpenStreetMap). Used by
// the Calendar event card's Location field. Picked over Google Places to
// avoid API key + billing setup — Nominatim is free and the user's spec
// doesn't need directions or embed.
//
// Nominatim usage policy: identify the app via User-Agent, and don't
// hammer the service. We auth-gate the route (logged-in users only) and
// cache responses for 1 hour via Next's `fetch({ next: { revalidate } })`
// so a hot query doesn't re-hit Nominatim.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface NominatimResult {
  osm_type?:     string;
  osm_id?:       number | string;
  place_id?:     number | string;
  display_name?: string;
}

interface Suggestion {
  id:    string;
  label: string;
  sub:   string;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q   = (url.searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ suggestions: [] });

  const nominatim = new URL("https://nominatim.openstreetmap.org/search");
  nominatim.searchParams.set("q",              q);
  nominatim.searchParams.set("format",         "jsonv2");
  nominatim.searchParams.set("addressdetails", "1");
  nominatim.searchParams.set("limit",          "6");

  try {
    const res = await fetch(nominatim.toString(), {
      headers: {
        // Required by Nominatim's usage policy — identifies the app so
        // they can rate-limit us correctly and contact us if we misbehave.
        "User-Agent": "Perennial-App/1.0 (elliott@perennial.design)",
        "Accept":     "application/json",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return Response.json({ suggestions: [] });
    }
    const raw = (await res.json()) as NominatimResult[];
    const suggestions: Suggestion[] = (Array.isArray(raw) ? raw : [])
      .map((r): Suggestion | null => {
        const display = (r.display_name ?? "").trim();
        if (!display) return null;
        // Split on the first comma so we get a short headline + the rest
        // of the address components as the sub-label.
        const ix    = display.indexOf(",");
        const label = ix === -1 ? display : display.slice(0, ix).trim();
        const sub   = ix === -1 ? ""      : display.slice(ix + 1).trim();
        // Prefer `osm_type:osm_id` for a stable id; fall back to place_id
        // when osm_type is missing (Nominatim sometimes omits it for
        // interpolated address points).
        const id = r.osm_type && r.osm_id != null
          ? `${r.osm_type}:${r.osm_id}`
          : `place:${r.place_id ?? display}`;
        return { id, label, sub };
      })
      .filter((s): s is Suggestion => s !== null);

    return Response.json({ suggestions });
  } catch {
    return Response.json({ suggestions: [] });
  }
}
