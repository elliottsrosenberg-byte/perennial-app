"use client";

// Ties the PostHog identity to the Supabase session: identify on sign-in so
// events, replays, and funnels attach to a real person; reset on sign-out so
// the next person on the device starts a fresh anonymous profile.
import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { createClient } from "@/lib/supabase/client";

export default function PostHogAuth() {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    const supabase = createClient();

    const identify = (user: { id: string; email?: string } | null) => {
      if (user) {
        posthog.identify(user.id, { email: user.email });
      }
    };

    // Identify whoever is already signed in when the app loads.
    supabase.auth.getUser().then(({ data }) => identify(data.user));

    // React to later sign-in / sign-out within the same tab.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        posthog.reset();
      } else if (session?.user) {
        identify(session.user);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [posthog]);

  return null;
}
