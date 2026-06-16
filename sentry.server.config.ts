// Sentry init for the Node.js server runtime.
// Loaded from instrumentation.ts `register()` when NEXT_RUNTIME === "nodejs".
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Low traffic during the beta — capture every transaction. Dial down later.
  tracesSampleRate: 1.0,

  // Ship structured logs to Sentry alongside errors.
  enableLogs: true,

  // Only chatter in the console when explicitly debugging the SDK.
  debug: false,
});
