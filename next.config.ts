import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
