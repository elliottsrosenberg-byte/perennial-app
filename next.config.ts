import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Same-origin reverse proxy for PostHog so ad blockers don't drop analytics
  // and session replay. The browser talks to /ingest on our own domain; Next
  // forwards to PostHog US cloud. See lib/posthog/config.ts (api_host).
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // Required by PostHog: its endpoints (e.g. /flags) must not be trailing-slash
  // redirected.
  skipTrailingSlashRedirect: true,
};

export default withSentryConfig(nextConfig, {
  org: "perennial-app",
  project: "javascript-nextjs",

  // Quiet the build logs unless we're on CI (Vercel) where the upload matters.
  silent: !process.env.CI,

  // Upload a wider set of client bundles so stack traces fully de-minify.
  // Source-map upload runs after the Turbopack build (needs SENTRY_AUTH_TOKEN).
  widenClientFileUpload: true,
});
