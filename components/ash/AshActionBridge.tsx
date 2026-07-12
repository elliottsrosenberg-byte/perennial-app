"use client";

// Executes Ash-emitted navigation actions app-wide. useAshChat dispatches a
// `perennial:ash-action` window event when Ash calls the `navigate` tool; this
// bridge (mounted in the persistent app layout, so it survives route changes and
// works on Home too) resolves the action to an href and routes there — landing
// the user in a module or opening a "new X" form via the module's ?new= deep
// link. It renders nothing.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveAshHref, type AshNavAction } from "@/lib/ash/app-navigation";

export default function AshActionBridge() {
  const router = useRouter();

  useEffect(() => {
    function handler(e: Event) {
      const action = (e as CustomEvent<AshNavAction>).detail;
      if (!action) return;
      const href = resolveAshHref(action);
      if (href) router.push(href);
    }
    window.addEventListener("perennial:ash-action", handler);
    return () => window.removeEventListener("perennial:ash-action", handler);
  }, [router]);

  return null;
}
