// Next.js server instrumentation hook (App Router).
// Wires Sentry into both the Node.js and Edge runtimes, and forwards
// server-side request errors to Sentry via `onRequestError`.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
