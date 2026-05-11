"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import AshPanel from "./AshPanel";
import AshMark from "@/components/ui/AshMark";

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
  const [expanded,    setExpanded]    = useState(false);
  const [convKey,     setConvKey]     = useState(0);
  const [autoMessage, setAutoMessage] = useState<string | undefined>(undefined);
  const [projectCtx,  setProjectCtx]  = useState<ProjectCtxState | undefined>(undefined);

  const module = getModule(pathname);

  const handleClose = useCallback(() => {
    setOpen(false);
    setExpanded(false);
    // If this Ash session was opened by the post-onboarding dashboard tour,
    // clearing the waiting flag here lets the sidebar TourCallout begin.
    if (typeof window !== "undefined" && sessionStorage.getItem("perennial-tour-waiting-ash") === "1") {
      sessionStorage.removeItem("perennial-tour-waiting-ash");
      window.dispatchEvent(new Event("tour-ash-closed"));
    }
  }, []);
  const handleExpand   = useCallback(() => setExpanded(true),  []);
  const handleCollapse = useCallback(() => setExpanded(false), []);

  // Listen for "open-ash" events (with optional auto-message and project context)
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ message?: string; project?: ProjectCtxState }>).detail ?? {};
      if (detail.message) {
        // New conversation keyed so AshPanel resets state and auto-sends
        setConvKey(k => k + 1);
        setAutoMessage(detail.message);
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

  return (
    <>
      {/* Floating Ash button — fades out when panel is open */}
      <button
        onClick={() => setOpen(true)}
        title="Ask Ash"
        aria-label="Open Ash"
        className="ash-fab"
        style={{
          position:       "fixed",
          bottom:         24,
          right:          24,
          width:          44,
          height:         44,
          borderRadius:   "50%",
          border:         "none",
          cursor:         "pointer",
          zIndex:         open ? 0 : 40,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          background:     "linear-gradient(145deg, #a8b886 0%, var(--color-ash-mid) 60%, var(--color-ash-dark) 100%)",
          boxShadow:      "0 2px 10px rgba(155,163,122,0.38), 0 1px 3px rgba(0,0,0,0.12)",
          animation:      "ash-glow 4.5s ease-in-out infinite",
          transition:     "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
          flexShrink:     0,
          opacity:        open ? 0 : 1,
          pointerEvents:  open ? "none" : "auto",
        }}
        onMouseEnter={(e) => {
          if (open) return;
          e.currentTarget.style.transform          = "scale(1.07)";
          e.currentTarget.style.animationPlayState = "paused";
          e.currentTarget.style.boxShadow          =
            "0 6px 24px rgba(155,163,122,0.65), 0 2px 6px rgba(0,0,0,0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform          = "scale(1)";
          e.currentTarget.style.animationPlayState = "running";
          e.currentTarget.style.boxShadow          =
            "0 2px 10px rgba(155,163,122,0.38), 0 1px 3px rgba(0,0,0,0.12)";
        }}
      >
        <AshMark size={26} variant="on-dark" animate />
      </button>

      <AshPanel
        key={convKey}
        open={open}
        expanded={expanded}
        onClose={handleClose}
        onExpand={handleExpand}
        onCollapse={handleCollapse}
        module={module}
        autoMessage={autoMessage}
        projectContext={projectCtx}
      />
    </>
  );
}
