/** Render an invoice number for display, honoring the user's `profiles.invoice_prefix`.
 *
 *  - With a prefix:    "INV-007"
 *  - Without a prefix: "#007"
 *
 *  Surfaces using this: print page, hosted invoice page, send-invoice email + subject.
 */
export function formatInvoiceNumber(num: number, prefix: string | null | undefined): string {
  const padded = String(num).padStart(3, "0");
  const trimmed = (prefix ?? "").trim();
  return trimmed ? `${trimmed}${padded}` : `#${padded}`;
}

/** Human-readable label for a captured Stripe payment method, e.g.
 *  "Visa •••• 4242", "Bank •••• 6789", "Cash App Pay". Returns null when no
 *  method was captured (e.g. an invoice marked paid manually). */
export function paymentMethodLabel(
  type: string | null | undefined,
  brand: string | null | undefined,
  last4: string | null | undefined,
): string | null {
  if (!type) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (type === "card") {
    const b = brand ? cap(brand) : "Card";
    return last4 ? `${b} •••• ${last4}` : b;
  }
  if (type === "us_bank_account") return last4 ? `Bank •••• ${last4}` : "Bank account";
  if (type === "cashapp")  return "Cash App Pay";
  if (type === "klarna")   return "Klarna";
  if (type === "link")     return "Link";
  return cap(type.replace(/_/g, " "));
}
