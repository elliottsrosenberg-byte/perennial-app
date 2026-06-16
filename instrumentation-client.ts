// Client-side Sentry init. Runs after the HTML loads, before React hydration.
// Session replay is intentionally left to PostHog — Sentry here is errors +
// performance only, so we don't run two replay recorders at once.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Low traffic during the beta — capture every transaction. Dial down later.
  tracesSampleRate: 1.0,

  enableLogs: true,

  debug: false,
});

// Lets Sentry instrument App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
