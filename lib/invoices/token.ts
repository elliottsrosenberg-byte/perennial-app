// Public-token helper for the hosted invoice view at /i/[token]. Tokens
// are 32-byte base64url strings (~256 bits of entropy) — wide enough that
// brute-forcing the URL is not a realistic attack vector, which lets the
// /i/[token] page skip auth entirely.

import { randomBytes } from "crypto";

export function mintPublicInvoiceToken(): string {
  return randomBytes(24).toString("base64url");
}
