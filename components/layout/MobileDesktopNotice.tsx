// Full-screen "use me on desktop" gate for the authed app. Rendered inside
// the (app) layout, so it ONLY covers the dashboard — the public client-facing
// routes (/book, /i, /share) live outside (app) and stay usable on mobile.
//
// Pure CSS visibility (`md:hidden`): always in the DOM, shown only below the
// `md` breakpoint — the same breakpoint the Sidebar/MobileNav switch on. No JS,
// no hydration flicker. Hard wall by design (no dismiss) pre-launch, so nobody
// hits a half-responsive dashboard on a phone.

import { Monitor } from "lucide-react";

export default function MobileDesktopNotice() {
  return (
    <div
      className="md:hidden fixed inset-0 z-[200] flex flex-col items-center justify-center text-center"
      style={{ background: "var(--color-surface-app)", padding: "32px 28px" }}
    >
      <div
        style={{
          width: 60, height: 60, borderRadius: 18, marginBottom: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(var(--color-sage-rgb),0.12)",
        }}
      >
        <Monitor size={28} strokeWidth={1.5} style={{ color: "var(--color-sage)" }} />
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display)", fontSize: 23, lineHeight: 1.2,
          color: "var(--color-charcoal)", marginBottom: 10,
        }}
      >
        Best on a bigger screen
      </h1>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-text-secondary)", maxWidth: 300 }}
      >
        Perennial is built for desktop right now. Open it on your computer to manage your
        projects, finances, and network — a phone-friendly version is on the way.
      </p>
    </div>
  );
}
