import type { NextConfig } from "next";

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

export default nextConfig;
