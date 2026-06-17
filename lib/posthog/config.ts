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
