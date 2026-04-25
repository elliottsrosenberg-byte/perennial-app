"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import AshPanel from "./AshPanel";
import AshMark from "@/components/ui/AshMark";

function getModule(pathname: string): string {
  if (pathname === "/") return "home";
  return pathname.split("/")[1] || "home";
}

export default function AshContainer() {
  const pathname = usePathname();
  const [open,     setOpen]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const module = getModule(pathname);

  const handleClose    = useCallback(() => { setOpen(false); setExpanded(false); }, []);
  const handleExpand   = useCallback(() => setExpanded(true),  []);
  const handleCollapse = useCallback(() => setExpanded(false), []);

  return (
    <>
      {/* Floating Ash button — fades out when panel is open */}
      <button
        onClick={() => setOpen(true)}
        title="Ask Ash"
        aria-label="Open Ash"
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
        open={open}
        expanded={expanded}
        onClose={handleClose}
        onExpand={handleExpand}
        onCollapse={handleCollapse}
        module={module}
      />
    </>
  );
}
