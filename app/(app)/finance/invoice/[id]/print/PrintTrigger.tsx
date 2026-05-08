"use client";

import { useEffect } from "react";

export default function PrintTrigger() {
  useEffect(() => {
    // Small delay to allow styles to render
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
