"use client";

// Mounts PostHog (analytics + session replay + autocapture) around the whole
// app. Initialization is handled by the library provider from the apiKey +
// options; PostHogAuth wires identity to the Supabase session.
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { POSTHOG_KEY, POSTHOG_OPTIONS } from "@/lib/posthog/config";
import PostHogAuth from "./PostHogAuth";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // No key configured (local dev without the env var) → skip PostHog entirely.
  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <PHProvider apiKey={POSTHOG_KEY} options={POSTHOG_OPTIONS}>
      <PostHogAuth />
      {children}
    </PHProvider>
  );
}
