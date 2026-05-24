// Map Plaid's personal_finance_category.primary → our ExpenseCategory.
//
// Plaid's enum is much broader than our five-bucket taxonomy
// (materials | travel | production | software | other), so this is a
// best-effort triage to seed the AddExpenseModal when a Banking row is
// converted to an Expense. Users can always change it before saving.
//
// Reference for the full Plaid taxonomy:
// https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv

import type { ExpenseCategory } from "@/types/database";

// Exported so the Plaid sync route can look up an unmapped primary and
// skip seeding `manual_category` when the primary isn't in the table —
// vs. `plaidCategoryToExpenseCategory` which always falls back to "other".
// The sync wants "set only when we have a real mapping", so it uses
// `plaidCategoryMap` directly.
export const plaidCategoryMap: Record<string, ExpenseCategory> = {
  TRANSPORTATION:        "travel",
  TRAVEL:                "travel",
  FOOD_AND_DRINK:        "other",   // meals not a category yet — bucket as Other
  GENERAL_MERCHANDISE:   "materials",
  HOME_IMPROVEMENT:      "materials",
  RENT_AND_UTILITIES:    "other",
  PERSONAL_CARE:         "other",
  GENERAL_SERVICES:      "production",
  ENTERTAINMENT:         "production",
  MEDICAL:               "other",
  GOVERNMENT_AND_NON_PROFIT: "other",
  LOAN_PAYMENTS:         "other",
  BANK_FEES:             "other",
  TRANSFER_IN:           "other",
  TRANSFER_OUT:          "other",
  INCOME:                "other",
};

export function plaidCategoryToExpenseCategory(
  primary: string | null | undefined,
): ExpenseCategory {
  if (!primary) return "other";
  return plaidCategoryMap[primary] ?? "other";
}

/** Human label for the Plaid primary, e.g. "FOOD_AND_DRINK" → "Food & Drink". */
export function prettyPlaidPrimary(primary: string | null | undefined): string | null {
  if (!primary) return null;
  return primary
    .toLowerCase()
    .split("_")
    .map((w) => (w === "and" ? "&" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
