"use client";

// Ties the PostHog identity to the Supabase session: identify on sign-in so
// events, replays, and funnels attach to a real person; reset on sign-out so
// the next person on the device starts a fresh anonymous profile.
import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { createClient } from "@/lib/supabase/client";
import { isImpersonationSession } from "@/lib/posthog/config";

export default function PostHogAuth() {
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;

    // Admin "View as" session — keep PostHog fully off (no capture, replay, or
    // identify) so it never pollutes the impersonated user's data.
    if (isImpersonationSession()) {
      posthog.opt_out_capturing();
      return;
    }

    // Normal session: recover if a prior impersonation left this browser opted
    // out, then wire identity to the Supabase session.
    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();

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
        document.cookie = "ph_impersonated=; path=/; max-age=0";
        posthog.reset();
      } else if (session?.user) {
        identify(session.user);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [posthog]);

  return null;
}
