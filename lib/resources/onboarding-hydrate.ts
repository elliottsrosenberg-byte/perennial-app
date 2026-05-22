// Server-side onboarding hydration for Resources.
//
// When a user opens Resources, we pre-fill any *empty* structured fields with
// the onboarding answers they already gave during signup. The user can edit
// or replace these — we never overwrite a value the user has typed.
//
// Hydrated cards graduate from status "empty" → "partial" so the user can see
// they have a head start. We persist the hydration back to the row so this
// only runs once per (resource, key).
//
// IMPORTANT: prompt labels here MUST match those in `MODALS` inside
// `components/resources/ResourcesClient.tsx` — they're the storage keys inside
// `resources.fields`.

import type { Resource } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface HydrationProfile {
  studio_name:        string | null;
  display_name:       string | null;
  tagline:            string | null;
  bio:                string | null;
  location:           string | null;
  practice_types:     string[] | null;
  selling_channels:   string[] | null;
  work_types:         string[] | null;
  perennial_goals:    string[] | null;
}

// Per modal_key, build a partial `fields` patch from the profile. Keys MUST
// match the `MODALS[<key>].prompts[].label` strings in ResourcesClient.
// Returning {} means "no hydration for this card".
function buildPatch(modalKey: string, p: HydrationProfile): Record<string, string> {
  switch (modalKey) {
    case "missionvision": {
      const patch: Record<string, string> = {};
      if (p.practice_types?.length) {
        patch["What do you make?"] =
          `My practice covers ${humanList(p.practice_types)}.` +
          (p.work_types?.length ? ` Typical formats: ${humanList(p.work_types)}.` : "");
      }
      if (p.bio) patch["Who is it for?"] = p.bio; // best-effort placeholder
      return patch;
    }
    case "mediakit": {
      const patch: Record<string, string> = {};
      if (p.bio) patch["Short bio (100 words)"] = p.bio;
      if (p.bio || p.practice_types?.length) {
        const parts: string[] = [];
        if (p.bio) parts.push(p.bio);
        if (p.practice_types?.length && !p.bio) {
          parts.push(`A studio working across ${humanList(p.practice_types)}.`);
        }
        if (p.location) parts.push(`Based in ${p.location}.`);
        patch["Practice description"] = parts.join(" ");
      }
      return patch;
    }
    case "positioning": {
      const patch: Record<string, string> = {};
      if (p.tagline) patch["Tagline (optional)"] = p.tagline;
      if (p.selling_channels?.length) {
        patch["Target audience"] =
          `Primary channels: ${humanList(p.selling_channels)}.`;
      }
      return patch;
    }
    case "bizinfo": {
      // The seeded prompts here are "Registered agent" / "Fiscal year end" —
      // neither maps cleanly to onboarding answers. Leave alone.
      return {};
    }
    case "bizplan": {
      const patch: Record<string, string> = {};
      if (p.perennial_goals?.length) {
        patch["Top 3 priorities"] = humanList(p.perennial_goals);
      }
      return patch;
    }
    default:
      return {};
  }
}

function humanList(items: string[]): string {
  const cleaned = items.filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

/** Walk the user's resources, hydrate empty fields from profile, and persist
 *  any new values back to the DB. Returns the in-memory list with patches
 *  applied so the page can render without a second fetch. */
export async function hydrateResourcesFromProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public">,
  resources: Resource[],
  profile: HydrationProfile,
  userId: string,
): Promise<Resource[]> {
  const updates: { id: string; fields: Record<string, unknown>; status: Resource["status"] }[] = [];
  const next = resources.map(r => ({ ...r }));

  for (const r of next) {
    if (!r.modal_key) continue;
    if (r.user_id !== userId) continue;
    const patch = buildPatch(r.modal_key, profile);
    if (Object.keys(patch).length === 0) continue;

    const existing = (r.fields ?? {}) as Record<string, unknown>;
    let changed = false;
    const merged: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      const cur = merged[k];
      // Only fill when the slot is empty. Once the user types something we
      // never touch it again, even on later hydrations.
      const isEmpty = typeof cur !== "string" || cur.trim().length === 0;
      if (isEmpty && v && v.trim().length > 0) {
        merged[k] = v;
        changed = true;
      }
    }
    if (!changed) continue;

    // Graduate status if we just filled at least one field on a previously
    // empty card. Don't downgrade a "complete" card.
    const nextStatus: Resource["status"] =
      r.status === "complete" ? "complete" : "partial";

    r.fields = merged;
    r.status = nextStatus;
    updates.push({ id: r.id, fields: merged, status: nextStatus });
  }

  if (updates.length > 0) {
    // Fire-and-forget per row — Supabase doesn't support multi-row distinct
    // updates in a single call without RPC. Keep these awaited so the page
    // render reflects persisted state.
    await Promise.all(
      updates.map(u =>
        supabase.from("resources")
          .update({ fields: u.fields, status: u.status })
          .eq("id", u.id),
      ),
    );
  }

  return next;
}
