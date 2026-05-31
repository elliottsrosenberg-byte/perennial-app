"use client";

import { useEffect } from "react";

/** Fires window.print() shortly after mount so the user lands directly in
 *  the print dialog, and renders the on-screen "Print / Save PDF" button
 *  (which the page can't render itself, because the page is a Server
 *  Component and onClick handlers there throw at render time — the bug
 *  that previously blanked this page). */
export default function PrintTrigger({ preview = false }: { preview?: boolean }) {
  useEffect(() => {
    // In preview mode (embedded as an in-app PDF view) we never auto-print.
    if (preview) return;
    // Small delay so styles + remote fonts have a frame to settle before
    // the OS print dialog snapshots the page.
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [preview]);

  // No on-screen print button when embedded as a preview.
  if (preview) return null;

  return (
    <button
      className="print-btn no-print"
      type="button"
      onClick={() => window.print()}
    >
      Print / Save PDF
    </button>
  );
}
