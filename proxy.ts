import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Skip auth check if Supabase env vars aren't configured yet
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || supabaseUrl.startsWith("your-")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Legacy /contacts → /people (the module was renamed; old shared links,
  // bookmarks, and inline-Ash deep-links from before the move land here).
  // Preserves search + hash.
  if (pathname === "/contacts" || pathname.startsWith("/contacts/") || pathname.startsWith("/contacts?")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/contacts/, "/people");
    return NextResponse.redirect(url);
  }

  // Routes that must work without a session
  const PUBLIC_PREFIXES = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth",    // OAuth + magic-link callback
    "/share",   // public note-share pages
    "/legal",   // privacy policy / terms — must be reachable to Google's OAuth verification crawler
  ];
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  // Pages where a signed-in user should be bounced to the app
  const isEntryRoute = pathname === "/login" || pathname === "/signup";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isEntryRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
