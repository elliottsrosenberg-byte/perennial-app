// Builds the `stripe_user[...]` prefill params for the Stripe Connect
// OAuth handoff. Stripe reads these to pre-populate the onboarding form,
// so the more we can pass from what the user already told Perennial, the
// less they retype. Everything here is best-effort: any field we can't
// fill cleanly is simply omitted (Stripe then asks for it), and the user
// can always correct a prefilled value on Stripe's side.
//
// Param names follow Stripe's OAuth reference (the `stripe_user[<key>]`
// form): business_name, first_name, last_name, email, url, phone_number,
// street_address / city / state / zip, product_description, currency,
// country.

/** The subset of `profiles` columns we pull for prefill. */
export interface StripePrefillProfile {
  studio_name?:   string | null;
  display_name?:  string | null;
  phone?:         string | null;
  website?:       string | null;
  tagline?:       string | null;
  bio?:           string | null;
  currency?:      string | null;
  business_type?: string | null;
  country?:       string | null;
  // Structured address (preferred). `address` is the legacy freeform
  // column, used only as a fallback when the structured fields are blank.
  address?:        string | null;
  address_line1?:  string | null;
  address_line2?:  string | null;
  address_city?:   string | null;
  address_state?:  string | null;
  address_zip?:    string | null;
}

/** Split a single display name into a best-effort first / last. One word
 *  → first name only; multiple → first token is the first name, the rest
 *  is the surname. */
function splitName(displayName: string): { first: string; last: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Pull a US-style "City, ST 12345" tail off a multi-line address so we
 *  can hand Stripe structured street/city/state/zip instead of one blob.
 *  Falls back to passing the whole address as the street line when it
 *  doesn't match the expected shape — never guesses city/state/zip. */
function parseAddress(address: string): {
  street_address?: string;
  city?:  string;
  state?: string;
  zip?:   string;
} {
  const lines = address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return {};

  const last = lines[lines.length - 1];
  // "Brooklyn, NY 11201" / "Brooklyn NY 11201-1234"
  const m = last.match(/^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m && lines.length >= 2) {
    return {
      street_address: lines.slice(0, -1).join(", "),
      city:  m[1].trim(),
      state: m[2].toUpperCase(),
      zip:   m[3],
    };
  }
  // No recognizable city/state/zip tail — pass the whole thing as the
  // street line and let the user fill the rest on Stripe.
  return { street_address: lines.join(", ") };
}

/** Assemble the `stripe_user[...]` prefill map. Empty / missing fields are
 *  left out entirely. */
export function buildStripeConnectPrefill(
  profile: StripePrefillProfile | null,
  email:   string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) out[`stripe_user[${key}]`] = v;
  };

  set("email", email);
  set("business_name", profile?.studio_name);
  set("url", profile?.website);
  set("phone_number", profile?.phone);
  set("product_description", profile?.tagline || profile?.bio);
  set("business_type", profile?.business_type);
  if (profile?.country) set("country", profile.country.toUpperCase());

  // Stripe wants the currency lowercased (e.g. "usd").
  if (profile?.currency) set("currency", profile.currency.toLowerCase());

  if (profile?.display_name) {
    const { first, last } = splitName(profile.display_name);
    set("first_name", first);
    set("last_name", last);
  }

  // Prefer the structured address; only parse the legacy freeform blob
  // when none of the structured parts are filled in.
  const hasStructured =
    profile?.address_line1 || profile?.address_city || profile?.address_state || profile?.address_zip;
  if (hasStructured) {
    const line = [profile?.address_line1, profile?.address_line2].map((s) => s?.trim()).filter(Boolean).join(", ");
    set("street_address", line);
    set("city",  profile?.address_city);
    set("state", profile?.address_state);
    set("zip",   profile?.address_zip);
  } else if (profile?.address) {
    const a = parseAddress(profile.address);
    set("street_address", a.street_address);
    set("city",  a.city);
    set("state", a.state);
    set("zip",   a.zip);
  }

  return out;
}
