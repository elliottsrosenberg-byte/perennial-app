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
