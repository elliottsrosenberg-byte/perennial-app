// First-run starter content for the Home board. We seed a welcome, a "Start
// here" column of interactive CTA cards (tailored by the user's discipline +
// guidance level), a "Your studio" grid of live module cards, and a few light
// canvas flourishes (a hand-drawn underline, accent lines, a connector arrow) so
// a brand-new board already feels alive and demonstrates the canvas's range.
// Every object is a real, editable/deletable canvas object.
//
// Runs server-side from app/(app)/page.tsx exactly once, when the Home canvas is
// first created and the user hasn't finished guided setup yet.

import type { SupabaseClient } from "@supabase/supabase-js";
import { objectToColumns, type CanvasObject, type ActionContent } from "@/components/canvas/types";

function uid(): string {
  return globalThis.crypto.randomUUID();
}

export type GuidanceLevel = "guided" | "balanced" | "expert";

interface SeedOpts {
  firstName:     string | null;
  guidanceLevel: GuidanceLevel | null;
  practiceTypes: string[];
}

const INTEGRATIONS_HREF = "/settings?section=integrations";

// The "Start here" cards — a short, ordered checklist of first moves, tailored by
// guidance level. `guided` leans coaching, `expert` leans migration/utility.
function cardsFor(level: GuidanceLevel, discipline: string): ActionContent[] {
  const work = discipline ? `${discipline} ` : "";

  if (level === "expert") {
    return [
      { label: "Add your active projects", sublabel: `Get the ${work}work you have in flight into Perennial — status, deadlines, and value in one view.`, icon: "project", actionKind: "route", href: "/projects", color: "blue" },
      { label: "Import your contacts", sublabel: "Galleries, clients, press, fabricators — bring your whole network in.", icon: "contact", actionKind: "route", href: "/network", color: "purple" },
      { label: "Connect email, calendar & bank", sublabel: "Wire up integrations so activity and finances flow in automatically.", icon: "calendar", actionKind: "route", href: INTEGRATIONS_HREF, color: "orange" },
    ];
  }

  if (level === "guided") {
    return [
      { label: "Set up your first project", sublabel: `Tell Ash what you're making and it'll build out your ${work}project with tasks and a timeline.`, icon: "project", actionKind: "ash", prompt: "Help me set up my first project — ask me what I'm working on.", color: "blue" },
      { label: "Connect email & calendar", sublabel: "Auto-log messages and meetings, and see every deadline in one place.", icon: "calendar", actionKind: "route", href: INTEGRATIONS_HREF, color: "orange" },
      { label: "Ask Ash where to start", sublabel: "Not sure what matters first? Ash will look at your studio and suggest a plan.", icon: "compass", actionKind: "ash", prompt: "Help me finish setting up", color: "green" },
    ];
  }

  // balanced
  return [
    { label: "Add your current projects", sublabel: `The ${work}work you're making or pitching — Ash can help you set it up.`, icon: "project", actionKind: "ash", prompt: "Help me set up my current projects — ask me what I'm working on.", color: "blue" },
    { label: "Connect email & calendar", sublabel: "Auto-log activity against your contacts and surface upcoming deadlines.", icon: "calendar", actionKind: "route", href: INTEGRATIONS_HREF, color: "orange" },
    { label: "Finish setting up with Ash", sublabel: "A few quick questions so Ash really understands your studio.", icon: "ash", actionKind: "ash", prompt: "Help me finish setting up", color: "green" },
  ];
}

export async function seedHomeCanvas(
  supabase: SupabaseClient,
  canvasId: string,
  userId:   string,
  opts:     SeedOpts,
): Promise<void> {
  const level: GuidanceLevel = opts.guidanceLevel ?? "balanced";
  const discipline = (opts.practiceTypes[0] ?? "").toLowerCase();
  const hi = opts.firstName ? `Welcome, ${opts.firstName}` : "Welcome to Perennial";
  const sub = discipline
    ? `Your ${discipline} studio at a glance — and a space to think. Start with the steps on the left, or ask Ash anything from the bar below.`
    : "Your studio at a glance — and a space to think. Start with the steps on the left, or ask Ash anything from the bar below.";

  const cards = cardsFor(level, discipline);
  const objects: CanvasObject[] = [];

  // World coordinates ≈ screen coordinates on first load (viewport {0,0,1}).
  // Keep everything clear of the left tool dock (~x<80) and the bottom Ash bar.

  // ── Welcome heading + hand-drawn underline + subtitle ──────────────────────
  objects.push({
    id: uid(), type: "text", x: 160, y: 72, width: 540, height: 46, rotation: 0, zIndex: 1,
    content: { text: hi, fontSize: 30, align: "left" }, refType: null, refId: null,
  });
  objects.push({
    // A loose marker underline under the welcome, for personality.
    id: uid(), type: "drawing", x: 162, y: 114, width: 210, height: 14, rotation: 0, zIndex: 2,
    content: { points: [[3, 11], [48, 6], [104, 11], [160, 5], [207, 9]], color: "green", strokeWidth: 3, mode: "marker" },
    refType: null, refId: null,
  });
  objects.push({
    id: uid(), type: "text", x: 160, y: 136, width: 560, height: 48, rotation: 0, zIndex: 3,
    content: { text: sub, fontSize: 15, align: "left", textColor: "grey" }, refType: null, refId: null,
  });

  // ── "Start here" column (left) ─────────────────────────────────────────────
  objects.push({
    id: uid(), type: "text", x: 160, y: 208, width: 260, height: 28, rotation: 0, zIndex: 4,
    content: { text: "Start here", fontSize: 18, align: "left" }, refType: null, refId: null,
  });
  objects.push({
    // Accent underline (line) below the "Start here" label.
    id: uid(), type: "shape", x: 162, y: 240, width: 64, height: 4, rotation: 0, zIndex: 5,
    content: { shape: "line", color: "green", strokeWidth: 3, endCap: "none" }, refType: null, refId: null,
  });
  // A row of tailored CTA cards — the way in for a fresh account. (No live module
  // cards: they read as empty on day one. These are the actionable next steps.)
  const STEP_W = 264, STEP_H = 150, STEP_GAP = 18, STEP_X = 160, STEP_Y = 256;
  cards.forEach((content, i) => {
    objects.push({
      id: uid(), type: "action",
      x: STEP_X + i * (STEP_W + STEP_GAP), y: STEP_Y,
      width: STEP_W, height: STEP_H, rotation: 0, zIndex: 6 + i,
      content, refType: null, refId: null,
    });
  });

  const rows = objects.map((o) => ({
    id:        o.id,
    canvas_id: canvasId,
    user_id:   userId,
    ...objectToColumns(o),
  }));

  await supabase.from("canvas_objects").insert(rows);
}
