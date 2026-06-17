// SSR magic-link / OTP confirmation handler. Verifies a `token_hash` and sets
// the resulting session cookie on whatever browser opens it, then redirects.
//
// Used by the admin impersonation flow (open the generated link in an
// incognito window to sign in as a user), and safe for any standard Supabase
// email OTP link too. Lives under the public `/auth` prefix because it has to
// be reachable WITHOUT a session — it's what creates one.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;
  const next = searchParams.get("next") ?? "/";

  if (token_hash) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      // Admin impersonation ("View as") links carry impersonated=1. Flag the
      // session so client analytics opt out (no PostHog capture/replay while
      // viewing as a user). Readable by client JS — it's just a flag, no secret.
      if (searchParams.get("impersonated") === "1") {
        res.cookies.set("ph_impersonated", "1", {
          path: "/",
          maxAge: 60 * 60, // ~ the impersonation session window
          sameSite: "lax",
        });
      }
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
