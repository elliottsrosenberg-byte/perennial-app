// Central PostHog client config. Shared by the provider so init stays in one
// place. Key is public (NEXT_PUBLIC_*) — PostHog project keys are write-only
// and safe to ship to the browser.
import type { PostHogConfig } from "posthog-js";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export const POSTHOG_OPTIONS: Partial<PostHogConfig> = {
  // Same-origin reverse proxy (see the `/ingest` rewrites in next.config.ts) so
  // ad blockers don't drop analytics + session replay. `ui_host` keeps the
  // "view in PostHog" deep-links pointed at the real app (US cloud).
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",

  // Opt into PostHog's latest recommended defaults: SPA pageviews on history
  // change, pageleave capture, identified-only person profiles, etc.
  defaults: "2026-05-30",

  // Sentry owns error/exception capture — don't double-report from PostHog.
  capture_exceptions: false,

  debug: false,
};

// Client-only: is the current browser session an admin impersonation ("View
// as")? `/auth/confirm` sets the `ph_impersonated` cookie when the magic link
// was minted by the admin support tool. We use it to keep PostHog fully off
// during impersonation so the admin's session never pollutes the impersonated
// user's analytics or session replays.
export function isImpersonationSession(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").includes("ph_impersonated=1");
}
