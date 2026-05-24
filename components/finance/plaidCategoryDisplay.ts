// Visual mapping for Plaid's `personal_finance_category.primary` enum.
//
// This is the cousin of plaidCategoryMap.ts — that one maps to our
// internal ExpenseCategory taxonomy; this one drives the chip render in
// the Banking transaction table. Each entry returns:
//
//   - label : a human-friendly noun phrase (Rocket Money-style)
//   - icon  : a lucide-react icon component name (the consumer imports it)
//   - bg    : muted tint (~0.10–0.15 alpha) for the chip background
//   - fg    : the full color for the icon + label text
//
// Tints are intentionally muted so the chips don't dominate the row. The
// palette pulls from the brand vars in globals.css where possible and
// introduces only a handful of local tint constants to avoid polluting
// the global stylesheet for this one surface.

export interface CategoryDisplay {
  label: string;
  /** lucide-react icon name — caller imports + renders. */
  icon:  string;
  bg:    string;
  fg:    string;
}

// ── Local color constants ──────────────────────────────────────────────────
// Anchors for chip tints. Keep these in sync with the brand palette in
// app/globals.css if it shifts. Format: { full, tinted } pairs where the
// tint is the same hue at ~12% alpha.

const SAGE_FG    = "var(--color-sage)";
const SAGE_BG    = "rgba(155,163,122,0.12)";

const LAVENDER_FG = "#7f6f9c";              // muted plum-lavender
const LAVENDER_BG = "rgba(173,163,192,0.18)"; // #ada3c0 family @ ~18%

const YELLOW_FG  = "#a37f12";               // ink-on-paper version of warm yellow
const YELLOW_BG  = "rgba(232,197,71,0.15)"; // warm-yellow @ 15%

const RED_FG     = "var(--color-red-orange)";
const RED_BG     = "rgba(220,62,13,0.10)";

const GREY_FG    = "var(--color-grey)";
const GREY_BG    = "rgba(31,33,26,0.06)";

const NEUTRAL_FG = "var(--color-charcoal)";
const NEUTRAL_BG = "rgba(31,33,26,0.05)";

// ── Mapping ────────────────────────────────────────────────────────────────

const MAP: Record<string, CategoryDisplay> = {
  TRANSPORTATION:        { label: "Travel",            icon: "Car",            bg: SAGE_BG,     fg: SAGE_FG    },
  TRAVEL:                { label: "Travel",            icon: "Plane",          bg: SAGE_BG,     fg: SAGE_FG    },
  FOOD_AND_DRINK:        { label: "Dining & Drinks",   icon: "Utensils",       bg: LAVENDER_BG, fg: LAVENDER_FG},
  GENERAL_MERCHANDISE:   { label: "Shopping",          icon: "ShoppingBag",    bg: YELLOW_BG,   fg: YELLOW_FG  },
  HOME_IMPROVEMENT:      { label: "Materials",         icon: "Wrench",         bg: YELLOW_BG,   fg: YELLOW_FG  },
  GENERAL_SERVICES:      { label: "Services",          icon: "Briefcase",      bg: NEUTRAL_BG,  fg: NEUTRAL_FG },
  ENTERTAINMENT:         { label: "Entertainment",     icon: "Music",          bg: LAVENDER_BG, fg: LAVENDER_FG},
  RENT_AND_UTILITIES:    { label: "Utilities",         icon: "Lightbulb",      bg: NEUTRAL_BG,  fg: NEUTRAL_FG },
  PERSONAL_CARE:         { label: "Personal Care",     icon: "User",           bg: NEUTRAL_BG,  fg: NEUTRAL_FG },
  MEDICAL:               { label: "Health",            icon: "HeartPulse",     bg: NEUTRAL_BG,  fg: NEUTRAL_FG },
  INCOME:                { label: "Income",            icon: "ArrowDownToLine",bg: SAGE_BG,     fg: SAGE_FG    },
  TRANSFER_IN:           { label: "Transfer",          icon: "ArrowLeftRight", bg: GREY_BG,     fg: GREY_FG    },
  TRANSFER_OUT:          { label: "Transfer",          icon: "ArrowLeftRight", bg: GREY_BG,     fg: GREY_FG    },
  LOAN_PAYMENTS:         { label: "Loan",              icon: "Landmark",       bg: GREY_BG,     fg: GREY_FG    },
  BANK_FEES:             { label: "Bank fees",         icon: "Receipt",        bg: RED_BG,      fg: RED_FG     },
  GOVERNMENT_AND_NON_PROFIT: { label: "Gov & NGO",     icon: "Landmark",       bg: GREY_BG,     fg: GREY_FG    },
};

const UNCATEGORIZED: CategoryDisplay = {
  label: "Uncategorized",
  icon:  "Tag",
  bg:    GREY_BG,
  fg:    GREY_FG,
};

export function categoryFor(primary?: string | null): CategoryDisplay {
  if (!primary) return UNCATEGORIZED;
  return MAP[primary] ?? UNCATEGORIZED;
}

/** Stable, alphabetised list of the Plaid primaries we render — for the
 *  filter dropdown. Caller is free to prepend an "All" option. */
export const PLAID_PRIMARY_KEYS: string[] = Object.keys(MAP).sort();
