"use client";

import type { InvoiceStatus } from "@/types/database";

/** Stripe Payment Element placeholder. Replaced in the next commit with
 *  the real Elements + PaymentElement mount; kept here as a clearly-labeled
 *  pass-through so the surrounding layout can be reviewed independent of
 *  the payment wiring. */
export default function PaymentSection({
  invoiceId, token, amount, status,
}: {
  invoiceId: string;
  token:     string;
  amount:    number;
  status:    InvoiceStatus;
}) {
  // Suppress unused-var noise until commit 4 wires these into Stripe.
  void invoiceId; void token; void amount;

  if (status === "paid") {
    return (
      <div
        style={{
          background: "rgba(61,107,79,0.12)", color: "#3d6b4f",
          padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        }}
      >
        Paid — thank you.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "white", padding: "12px 14px", borderRadius: 8,
        fontSize: 12, color: "#6b6860", lineHeight: 1.55,
      }}
    >
      Card payment will be enabled here once the studio finishes its Stripe setup.
    </div>
  );
}
