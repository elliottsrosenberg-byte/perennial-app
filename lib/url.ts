// Small URL helpers shared by the OAuth routes (and anywhere else that
// needs to construct an absolute URL for the app).

/** Returns the app's absolute origin, normalizing a few common
 *  misconfigurations of `NEXT_PUBLIC_APP_URL`:
 *    - missing scheme       ("app.perennial.design" → "https://app.perennial.design")
 *    - trailing slash       ("https://x.com/"        → "https://x.com")
 *    - whitespace
 *
 *  Falls back to the request's own origin if the env var is unset.
 *  Pass the request so we can derive a sensible fallback in development.
 */
export function appOrigin(req?: Request): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    return withScheme.replace(/\/+$/, "");
  }
  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      // fallthrough
    }
  }
  // Last-resort default — should never hit in practice because either
  // the env var or the request is always available.
  return "https://app.perennial.design";
}
