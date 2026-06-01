// Shared studio business-identity vocabulary + helpers. These back the
// structured address / country / business-type fields on `profiles` that
// feed Stripe Connect onboarding (and, for the address, the invoice
// "From" block). Kept framework-free so Settings, the onboarding flow,
// the OAuth start route, and the prefill builder all speak the same
// values.

/** Business-type options. The `value` is exactly what Stripe's
 *  `stripe_user[business_type]` OAuth param accepts, so it can be passed
 *  straight through with no mapping. */
export const BUSINESS_TYPES: { value: string; label: string }[] = [
  { value: "sole_prop",   label: "Individual / sole proprietor" },
  { value: "llc",         label: "LLC" },
  { value: "corporation", label: "Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "non_profit",  label: "Nonprofit" },
];

/** Countries Stripe supports for Connect onboarding. `code` is the
 *  2-letter ISO code Stripe's `stripe_user[country]` expects. US is first
 *  since it's the common case. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "AT", name: "Austria" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CH", name: "Switzerland" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HR", name: "Croatia" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "LV", name: "Latvia" },
  { code: "MT", name: "Malta" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "NZ", name: "New Zealand" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
];

/** Friendly country name for a stored 2-letter code (returns the code
 *  itself if unknown). */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}

/** The structured studio-address fields, as stored on `profiles`. */
export interface StudioAddressFields {
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?:  string | null;
  address_state?: string | null;
  address_zip?:   string | null;
  country?:       string | null;
}

/** Compose the structured fields into the multi-line display string the
 *  invoice "From" block renders (via `profiles.address`). US addresses
 *  omit the country line — it's implied — to keep domestic invoices
 *  clean. Returns "" when there's nothing to show. */
export function composeStudioAddress(f: StudioAddressFields): string {
  const lines: string[] = [];
  const line1 = f.address_line1?.trim();
  const line2 = f.address_line2?.trim();
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);

  const city  = f.address_city?.trim();
  const state = f.address_state?.trim();
  const zip   = f.address_zip?.trim();
  // "City, ST 12345" — graceful when only some parts are present.
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(city && (state || zip) ? ", " : "");
  if (cityLine) lines.push(cityLine);

  const code = f.country?.trim().toUpperCase();
  if (code && code !== "US") lines.push(countryName(code));

  return lines.join("\n");
}
