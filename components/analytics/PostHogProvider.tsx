"use client";

// Mounts PostHog (analytics + session replay + autocapture) around the whole
// app. Initialization is handled by the library provider from the apiKey +
// options; PostHogAuth wires identity to the Supabase session.
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { POSTHOG_KEY, POSTHOG_OPTIONS, isImpersonationSession } from "@/lib/posthog/config";
import PostHogAuth from "./PostHogAuth";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // No key configured (local dev without the env var) → skip PostHog entirely.
  if (!POSTHOG_KEY) return <>{children}</>;

  // Admin "View as" session → init opted out so we never capture (or replay)
  // the first pageview either. PostHogAuth keeps it off and skips identify.
  const options = isImpersonationSession()
    ? { ...POSTHOG_OPTIONS, opt_out_capturing_by_default: true }
    : POSTHOG_OPTIONS;

  return (
    <PHProvider apiKey={POSTHOG_KEY} options={options}>
      <PostHogAuth />
      {children}
    </PHProvider>
  );
}
