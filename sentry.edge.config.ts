// Sentry init for the Edge runtime (proxy.ts, edge route handlers).
// Loaded from instrumentation.ts `register()` when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Low traffic during the beta — capture every transaction. Dial down later.
  tracesSampleRate: 1.0,

  enableLogs: true,

  debug: false,
});
