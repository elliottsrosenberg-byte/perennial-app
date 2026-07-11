"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import AshDock from "./AshDock";
import AshMark from "@/components/ui/AshMark";
import { ASH_GRADIENT } from "./theme";

function getModule(pathname: string): string {
  if (pathname === "/") return "home";
  return pathname.split("/")[1] || "home";
}

interface ProjectCtxState {
  title:    string;
  status:   string;
  priority: string;
}

export default function AshContainer() {
  const pathname = usePathname();
  const [open,        setOpen]        = useState(false);
  const [convKey,     setConvKey]     = useState(0);
  const [autoMessage, setAutoMessage] = useState<string | undefined>(undefined);
  const [loadConvId,  setLoadConvId]  = useState<string | null>(null);
  const [projectCtx,  setProjectCtx]  = useState<ProjectCtxState | undefined>(undefined);

  const module = getModule(pathname);

  const handleClose = useCallback(() => {
    setOpen(false);
    // A chat likely just happened — nudge the Sidebar history list to refresh.
    if (typeof window !== "undefined") window.dispatchEvent(new Event("ash-history-refresh"));
    // If this Ash session was opened by the post-onboarding dashboard tour,
    // clearing the waiting flag here lets the sidebar TourCallout begin.
    if (typeof window !== "undefined" && sessionStorage.getItem("perennial-tour-waiting-ash") === "1") {
      sessionStorage.removeItem("perennial-tour-waiting-ash");
      window.dispatchEvent(new Event("tour-ash-closed"));
    }
  }, []);

  // Listen for "open-ash" events (auto-message, project context, or a past
  // conversation id from the Sidebar history).
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ message?: string; project?: ProjectCtxState; conversationId?: string }>).detail ?? {};
      if (detail.message) {
        // New session keyed so the dock resets state and auto-sends.
        setConvKey(k => k + 1);
        setAutoMessage(detail.message);
        setLoadConvId(null);
      }
      if (detail.conversationId) {
        // New session keyed so the dock remounts and loads the past chat.
        setConvKey(k => k + 1);
        setLoadConvId(detail.conversationId);
        setAutoMessage(undefined);
      }
      if (detail.project) setProjectCtx(detail.project);
      setOpen(true);
    }
    window.addEventListener("open-ash", handler);
    return () => window.removeEventListener("open-ash", handler);
  }, []);

  // Track which project is currently open so the floating button also gets context
  useEffect(() => {
    function setCtx(e: Event) { setProjectCtx((e as CustomEvent<ProjectCtxState>).detail); }
    function clearCtx()        { setProjectCtx(undefined); setAutoMessage(undefined); }
    window.addEventListener("set-project-context",   setCtx);
    window.addEventListener("clear-project-context", clearCtx);
    return () => {
      window.removeEventListener("set-project-context",   setCtx);
      window.removeEventListener("clear-project-context", clearCtx);
    };
  }, []);

  // Home is the full-page canvas with its own inline Ash surface — the global
  // floating button + right panel are hidden there (PER-70).
  if (pathname === "/") return null;

  return (
    <>
      {/* Launcher — a centered pill at the bottom, in the same spot the dock
          rises from, so opening Ash reads as one motion rather than a jump from
          a corner. Fades out while the dock is open. */}
      <div
        style={{
          position: "fixed",
          left: "var(--sidebar-width, 52px)", right: 0, bottom: 24,
          zIndex: open ? 0 : 40,
          display: "flex", justifyContent: "center",
          pointerEvents: "none",
          opacity: open ? 0 : 1,
          transition: "opacity 0.18s ease",
        }}
      >
        <button
          onClick={() => setOpen(true)}
          title="Ask Ash"
          aria-label="Open Ash"
          className="ash-fab"
          style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: "9px 17px 9px 11px",
            borderRadius: "var(--radius-lg)",
            border: "none", cursor: "pointer",
            background: ASH_GRADIENT,
            color: "#fff",
            fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600,
            boxShadow: "0 4px 16px rgba(var(--color-sage-rgb),0.42), 0 1px 3px rgba(0,0,0,0.12)",
            animation: "ash-glow 4.5s ease-in-out infinite",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            pointerEvents: open ? "none" : "auto",
          }}
          onMouseEnter={(e) => {
            if (open) return;
            e.currentTarget.style.transform          = "translateY(-1px)";
            e.currentTarget.style.animationPlayState = "paused";
            e.currentTarget.style.boxShadow          =
              "0 8px 26px rgba(var(--color-sage-rgb),0.6), 0 2px 6px rgba(0,0,0,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform          = "translateY(0)";
            e.currentTarget.style.animationPlayState = "running";
            e.currentTarget.style.boxShadow          =
              "0 4px 16px rgba(var(--color-sage-rgb),0.42), 0 1px 3px rgba(0,0,0,0.12)";
          }}
        >
          <span style={{
            width: 26, height: 26, borderRadius: "var(--radius-md)",
            background: "rgba(255,255,255,0.18)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AshMark size={16} variant="on-dark" animate />
          </span>
          Ask Ash
        </button>
      </div>

      <AshDock
        key={convKey}
        open={open}
        onClose={handleClose}
        module={module}
        autoMessage={autoMessage}
        projectContext={projectCtx}
        loadConversationId={loadConvId}
      />
    </>
  );
}
