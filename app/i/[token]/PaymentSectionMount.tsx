"use client";

import PaymentSection from "./PaymentSection";
import type { InvoiceStatus } from "@/types/database";

/** Thin client wrapper so the Server Component page can hand props to
 *  PaymentSection without itself crossing the client boundary. Kept
 *  separate from PaymentSection so any future client-only setup (Stripe
 *  appearance config, locale, etc.) lives here. */
export default function PaymentSectionMount({
  invoiceId, token, amount, status,
}: {
  invoiceId: string;
  token:     string;
  amount:    number;
  status:    InvoiceStatus;
}) {
  return <PaymentSection invoiceId={invoiceId} token={token} amount={amount} status={status} />;
}
