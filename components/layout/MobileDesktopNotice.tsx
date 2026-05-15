"use client";

// Thin, dismissible notice shown on small screens explaining that the app is
// best on desktop and that mobile support is coming. Dismissal persists in
// localStorage so it only appears once per device.

import { useState, useSyncExternalStore } from "react";
import { X, Monitor } from "lucide-react";

const STORAGE_KEY = "perennial-desktop-notice-dismissed";

// `useSyncExternalStore` is the idiomatic way to read a one-shot client value
// without flickering on SSR — we get false on the server (notice hidden), and
// the real localStorage value on the client. A separate state tracks an
// in-session dismissal so the button works without round-tripping localStorage.
function readStoredDismissed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}
function subscribeStored() {
  return () => {};
}

export default function MobileDesktopNotice() {
  const stored = useSyncExternalStore(
    subscribeStored,
    readStoredDismissed,
    () => true, // SSR snapshot: assume dismissed so nothing renders server-side
  );
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const visible = !stored && !dismissedThisSession;

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissedThisSession(true);
  }

  return (
    <div
      className="md:hidden flex items-center gap-2 px-3 py-2 shrink-0"
      style={{
        background: "rgba(155,163,122,0.10)",
        borderBottom: "0.5px solid var(--color-border)",
        color: "var(--color-charcoal)",
      }}
    >
      <Monitor size={13} strokeWidth={1.75} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
      <span className="text-[11px] leading-snug flex-1" style={{ color: "var(--color-charcoal)" }}>
        Perennial is best on desktop right now. Mobile support is coming soon.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss notice"
        style={{
          background: "none", border: "none", padding: 4, cursor: "pointer",
          color: "var(--color-grey)", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
