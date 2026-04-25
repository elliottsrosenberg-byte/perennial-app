"use client";

import Link from "next/link";
import { useState } from "react";
import { Palette } from "lucide-react";

export default function DesignSystemLink() {
  const [hov, setHov] = useState(false);

  return (
    <Link
      href="/design"
      title="Design system"
      style={{
        position: "fixed",
        bottom: 24,
        left: 72,   // 56px sidebar + 16px gap
        zIndex: 20,
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        boxShadow: hov ? "0 4px 16px rgba(0,0,0,0.16)" : "0 2px 8px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "box-shadow 0.15s ease",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <Palette size={15} strokeWidth={1.5} color="var(--color-grey)" />
    </Link>
  );
}
