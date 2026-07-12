"use client";

// Executes Ash-emitted navigation actions app-wide. useAshChat dispatches a
// `perennial:ash-action` window event when Ash calls the `navigate` tool; this
// bridge (mounted in the persistent app layout, so it survives route changes and
// works on Home too) resolves the action to an href and routes there — landing
// the user in a module or opening a "new X" form via the module's ?new= deep
// link.
//
// Continuity: the Ash dock lives in the persistent layout, so a module→module
// hop keeps the same conversation automatically. Home is different — its Ash is
// the on-canvas surface, which unmounts on navigation. So when Ash navigates the
// user OFF Home, we hand the live conversation to the dock (open-ash with its
// id) so the onboarding conversation continues without a break.
//
// Renders nothing.

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { resolveAshHref, type AshNavAction } from "@/lib/ash/app-navigation";

interface AshActionDetail {
  action:          AshNavAction;
  conversationId?: string | null;
}

export default function AshActionBridge() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<AshActionDetail>).detail;
      // Back-compat: earlier the detail WAS the action itself.
      const action = detail?.action ?? (detail as unknown as AshNavAction);
      if (!action) return;
      const href = resolveAshHref(action);
      if (!href) return;

      const leavingHome = pathname === "/";
      router.push(href);

      // Hand the conversation off to the dock when leaving the home canvas, so
      // it picks up right where the on-canvas Ash left it.
      if (leavingHome && detail?.conversationId) {
        const convId = detail.conversationId;
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("open-ash", { detail: { conversationId: convId, handoff: true } }));
        }, 120);
      }
    }
    window.addEventListener("perennial:ash-action", handler);
    return () => window.removeEventListener("perennial:ash-action", handler);
  }, [router, pathname]);

  return null;
}
