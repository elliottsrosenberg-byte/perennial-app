// First-run starter content for the Home board. Seeds a small, friendly
// arrangement — a welcome heading, a few sticky-note hints, a live module card,
// and an arrow — so a brand-new user lands on a board that already feels alive
// and demonstrates the canvas's range. Every object is a real, editable canvas
// object: the user can drag, edit, or delete any of it.
//
// Runs server-side from app/(app)/page.tsx exactly once, when the Home canvas is
// first created and the user hasn't finished guided setup yet.

import type { SupabaseClient } from "@supabase/supabase-js";
import { objectToColumns, type CanvasObject } from "@/components/canvas/types";

function uid(): string {
  // Web Crypto global — available in the Next.js server runtime and the browser.
  return globalThis.crypto.randomUUID();
}

export async function seedHomeCanvas(
  supabase: SupabaseClient,
  canvasId: string,
  userId:   string,
  firstName: string | null,
): Promise<void> {
  const hi = firstName ? `Welcome, ${firstName} 🌱` : "Welcome to your board 🌱";

  // World coordinates ≈ screen coordinates on first load (initial viewport is
  // {x:0, y:0, scale:1}). Keep everything in the visible top-left region, clear
  // of the left tool dock (~x<80) and the bottom Ash bar.
  const objects: CanvasObject[] = [
    {
      id: uid(), type: "text", x: 150, y: 96, width: 470, height: 60, rotation: 0, zIndex: 1,
      content: { text: hi, fontSize: 34, align: "left" },
      refType: null, refId: null,
    },
    {
      id: uid(), type: "text", x: 150, y: 152, width: 450, height: 46, rotation: 0, zIndex: 2,
      content: {
        text: "This is your home board — a space to think, plan, and pull your studio together.",
        fontSize: 15, align: "left", textColor: "grey",
      },
      refType: null, refId: null,
    },
    {
      id: uid(), type: "sticky", x: 150, y: 232, width: 220, height: 168, rotation: 0, zIndex: 3,
      content: { text: "Drag me around. Double-click to edit. Delete anything you don't want — this board is yours.", color: "green" },
      refType: null, refId: null,
    },
    {
      id: uid(), type: "sticky", x: 390, y: 232, width: 220, height: 168, rotation: 0, zIndex: 4,
      content: { text: "Add notes, text, shapes, and arrows from the toolbar on the left.", color: "blue" },
      refType: null, refId: null,
    },
    {
      id: uid(), type: "sticky", x: 630, y: 232, width: 220, height: 150, rotation: 0, zIndex: 5,
      content: { text: "Pull in live cards from your studio — like this one ↓", color: "orange" },
      refType: null, refId: null,
    },
    {
      // Line/arrow geometry is the bounding box; the arrow runs corner-to-corner
      // and the endCap points at the module card below the orange sticky.
      id: uid(), type: "shape", x: 726, y: 386, width: 26, height: 30, rotation: 0, zIndex: 6,
      content: { shape: "arrow", color: "grey", startCap: "none", endCap: "arrow", dash: "solid", strokeWidth: 2 },
      refType: null, refId: null,
    },
    {
      id: uid(), type: "module", x: 630, y: 420, width: 300, height: 190, rotation: 0, zIndex: 7,
      content: { moduleKey: "projects" },
      refType: null, refId: null,
    },
  ];

  const rows = objects.map((o) => ({
    id:        o.id,
    canvas_id: canvasId,
    user_id:   userId,
    ...objectToColumns(o),
  }));

  await supabase.from("canvas_objects").insert(rows);
}
