// Single source of truth for the Banking category taxonomy.
//
// We lean on Plaid's `personal_finance_category.primary` enum but collapse
// it into a deduped, brand-styled set of "canonical" categories used
// EVERYWHERE in Banking: the row chip, the filter dropdown, and the manual
// category picker. Before this, three surfaces spoke three different
// vocabularies (Plaid's 16 primaries with duplicate labels, our 5
// ExpenseCategory buckets, and custom categories) — now they all read from
// CANONICAL_CATEGORIES.
//
// Each canonical category:
//   - has a stable `key` stored in bank_transactions.manual_category when a
//     user overrides the auto-detected category (that column is plain text);
//   - maps from zero or more Plaid primaries (so TRANSPORTATION + TRAVEL both
//     resolve to "Travel", deduping the old double entries; an empty list
//     means manual-only, e.g. Software, which Plaid never auto-detects);
//   - carries an `expense` bucket so converting a row to an Expense still
//     lands in one of the five ExpenseCategory buckets the expense form uses.
//
// Reference for the full Plaid taxonomy:
// https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv

import type { ExpenseCategory } from "@/types/database";

export interface CategoryDisplay {
  label: string;
  /** lucide-react icon name — caller imports + renders. */
  icon:  string;
  bg:    string;
  fg:    string;
}

export interface CanonicalCategory extends CategoryDisplay {
  /** Stable id persisted to bank_transactions.manual_category on override. */
  key:       string;
  /** Plaid primaries that auto-resolve to this category. [] = manual-only. */
  primaries: string[];
  /** Bucket used when a row is converted into an Expense. */
  expense:   ExpenseCategory;
}

// ── Local color constants ──────────────────────────────────────────────────
// Anchors for chip tints. Keep these in sync with the brand palette in
// app/globals.css if it shifts.

const SAGE_FG     = "var(--color-sage)";
const SAGE_BG     = "rgba(155,163,122,0.12)";
const LAVENDER_FG = "#7f6f9c";
const LAVENDER_BG = "rgba(173,163,192,0.18)";
const YELLOW_FG   = "#a37f12";
const YELLOW_BG   = "rgba(232,197,71,0.15)";
const RED_FG      = "var(--color-red-orange)";
const RED_BG      = "rgba(220,62,13,0.10)";
const GREY_FG     = "var(--color-grey)";
const GREY_BG     = "rgba(31,33,26,0.06)";
const NEUTRAL_FG  = "var(--color-charcoal)";
const NEUTRAL_BG  = "rgba(31,33,26,0.05)";

// ── Canonical taxonomy ───────────────────────────────────────────────────────
// Order drives both the filter dropdown and the picker grid.

export const CANONICAL_CATEGORIES: CanonicalCategory[] = [
  { key: "travel",        label: "Travel",          icon: "Plane",          bg: SAGE_BG,     fg: SAGE_FG,     primaries: ["TRAVEL", "TRANSPORTATION"], expense: "travel"     },
  { key: "dining",        label: "Dining & Drinks", icon: "Utensils",       bg: LAVENDER_BG, fg: LAVENDER_FG, primaries: ["FOOD_AND_DRINK"],           expense: "other"      },
  { key: "shopping",      label: "Shopping",        icon: "ShoppingBag",    bg: YELLOW_BG,   fg: YELLOW_FG,   primaries: ["GENERAL_MERCHANDISE"],      expense: "materials"  },
  { key: "materials",     label: "Materials",       icon: "Wrench",         bg: YELLOW_BG,   fg: YELLOW_FG,   primaries: ["HOME_IMPROVEMENT"],         expense: "materials"  },
  { key: "software",      label: "Software",        icon: "Laptop",         bg: NEUTRAL_BG,  fg: NEUTRAL_FG,  primaries: [],                           expense: "software"   },
  { key: "services",      label: "Services",        icon: "Briefcase",      bg: NEUTRAL_BG,  fg: NEUTRAL_FG,  primaries: ["GENERAL_SERVICES"],         expense: "production" },
  { key: "entertainment", label: "Entertainment",   icon: "Music",          bg: LAVENDER_BG, fg: LAVENDER_FG, primaries: ["ENTERTAINMENT"],            expense: "production" },
  { key: "utilities",     label: "Utilities",       icon: "Lightbulb",      bg: NEUTRAL_BG,  fg: NEUTRAL_FG,  primaries: ["RENT_AND_UTILITIES"],       expense: "other"      },
  { key: "personal_care", label: "Personal Care",   icon: "User",           bg: NEUTRAL_BG,  fg: NEUTRAL_FG,  primaries: ["PERSONAL_CARE"],            expense: "other"      },
  { key: "health",        label: "Health",          icon: "HeartPulse",     bg: NEUTRAL_BG,  fg: NEUTRAL_FG,  primaries: ["MEDICAL"],                  expense: "other"      },
  { key: "income",        label: "Income",          icon: "ArrowDownToLine", bg: SAGE_BG,    fg: SAGE_FG,     primaries: ["INCOME"],                   expense: "other"      },
  { key: "transfer",      label: "Transfer",        icon: "ArrowLeftRight", bg: GREY_BG,     fg: GREY_FG,     primaries: ["TRANSFER_IN", "TRANSFER_OUT"], expense: "other"   },
  { key: "loan",          label: "Loan",            icon: "Landmark",       bg: GREY_BG,     fg: GREY_FG,     primaries: ["LOAN_PAYMENTS"],            expense: "other"      },
  { key: "bank_fees",     label: "Bank fees",       icon: "Receipt",        bg: RED_BG,      fg: RED_FG,      primaries: ["BANK_FEES"],                expense: "other"      },
  { key: "gov",           label: "Gov & NGO",       icon: "Landmark",       bg: GREY_BG,     fg: GREY_FG,     primaries: ["GOVERNMENT_AND_NON_PROFIT"], expense: "other"     },
];

const BY_KEY     = new Map(CANONICAL_CATEGORIES.map((c) => [c.key, c]));
const BY_PRIMARY = new Map<string, CanonicalCategory>();
for (const c of CANONICAL_CATEGORIES) {
  for (const p of c.primaries) BY_PRIMARY.set(p, c);
}

/** Stable list of canonical keys — for API validation. */
export const CANONICAL_CATEGORY_KEYS: string[] = CANONICAL_CATEGORIES.map((c) => c.key);

const UNCATEGORIZED: CategoryDisplay = {
  label: "Uncategorized",
  icon:  "Tag",
  bg:    GREY_BG,
  fg:    GREY_FG,
};

/** Look up a canonical category by its stored override key. */
export function canonicalByKey(key?: string | null): CanonicalCategory | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

/** Resolve a Plaid primary to its canonical category. */
export function canonicalForPrimary(primary?: string | null): CanonicalCategory | null {
  if (!primary) return null;
  return BY_PRIMARY.get(primary) ?? null;
}

/** Chip display for a raw Plaid primary — Uncategorized when unmapped/absent. */
export function categoryFor(primary?: string | null): CategoryDisplay {
  return canonicalForPrimary(primary) ?? UNCATEGORIZED;
}

/** Plaid primaries belonging to a canonical key — for server-side filtering. */
export function primariesForKey(key: string): string[] {
  return BY_KEY.get(key)?.primaries ?? [];
}

/** ExpenseCategory bucket for converting a row to an Expense. Override key
 *  wins over the Plaid primary; falls back to "other". */
export function expenseForCategory(
  key?: string | null,
  primary?: string | null,
): ExpenseCategory {
  return (canonicalByKey(key) ?? canonicalForPrimary(primary))?.expense ?? "other";
}
