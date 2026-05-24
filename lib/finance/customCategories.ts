// Custom transaction categories — user-defined extensions to the built-in
// ExpenseCategory enum. Stored on `profiles.custom_categories` (jsonb) so
// every BankingTab can read them without a join.
//
// The built-in five (materials / travel / production / software / other)
// remain the canonical persistence target for `bank_transactions.manual_category`
// — that column is a typed enum. Customs are persisted as a UUID *prefixed*
// with "custom:" in `manual_category_id` (added later if we want true
// custom-persistence). For now the picker writes the matched built-in to
// `manual_category` when a custom is chosen, since the schema constrains
// us, and the custom only changes the *display* (label + colour). When
// the schema grows a `manual_category_id text` column, this module is the
// single seam to read it.

import type { ExpenseCategory } from "@/types/database";

/** A single user-defined category. Persisted as JSON on profiles.custom_categories. */
export interface CustomCategory {
  /** Stable UUID — never reused, never renamed. */
  id:    string;
  /** Display label. Editable. */
  label: string;
  /** Hex colour for the chip fill/text. Editable. Pick from CATEGORY_PALETTE. */
  color: string;
  /** Underlying built-in this custom routes into for expense persistence.
   *  Defaults to "other" — the user can change this when editing. */
  routesTo: ExpenseCategory;
}

/** Brand-coherent palette for custom categories. Eight muted tones that
 *  read as chip-friendly at ~60% saturation against warm-white. */
export const CATEGORY_PALETTE: { name: string; value: string }[] = [
  { name: "Sage",     value: "#9BA37A" },
  { name: "Forest",   value: "#3d6b4f" },
  { name: "Gold",     value: "#b8860b" },
  { name: "Rust",     value: "#a13a1f" },
  { name: "Plum",     value: "#7f6f9c" },
  { name: "Slate",    value: "#5a6470" },
  { name: "Teal",     value: "#2a8a8a" },
  { name: "Rose",     value: "#c93a6a" },
];

/** Render a hex colour at low alpha for the chip background. */
export function tintForColor(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "rgba(31,33,26,0.06)";
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},0.18)`;
}

/** Look up a custom by id from a list — null if not present (e.g. deleted). */
export function findCustom(customs: CustomCategory[], id: string | null | undefined): CustomCategory | null {
  if (!id) return null;
  return customs.find((c) => c.id === id) ?? null;
}

/** Parse a raw value from the profile column. Tolerant of nulls / wrong shapes. */
export function parseCustomCategories(raw: unknown): CustomCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomCategory[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const item = r as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.label !== "string" || typeof item.color !== "string") continue;
    const routesTo = (typeof item.routesTo === "string" ? item.routesTo : "other") as ExpenseCategory;
    out.push({ id: item.id, label: item.label, color: item.color, routesTo });
  }
  return out;
}
