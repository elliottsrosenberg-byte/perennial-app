"use client";

// Light-green "Visit" CTA used in home dashboard cards in place of the old
// blue "View all →" text link. Same affordance, more inviting.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface Props {
  href:     string;
  label?:   string;
  ariaLabel?: string;
}

export default function VisitButton({ href, label = "Visit", ariaLabel }: Props) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel ?? `${label} ${href}`}
      className="inline-flex items-center gap-[3px] shrink-0"
      style={{
        fontSize: 10, fontWeight: 600, fontFamily: "inherit",
        padding: "3px 9px",
        borderRadius: 999,
        background: "rgba(155,163,122,0.16)",
        color: "#5d6b3d",
        border: "0.5px solid rgba(155,163,122,0.32)",
        textDecoration: "none",
        transition: "background 0.12s ease, color 0.12s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(155,163,122,0.28)";
        e.currentTarget.style.color = "#4a5630";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(155,163,122,0.16)";
        e.currentTarget.style.color = "#5d6b3d";
      }}
    >
      {label}
      <ArrowUpRight size={10} strokeWidth={2} />
    </Link>
  );
}
