// First-run starter content for the Home board. Instead of static hints, we seed
// a welcome + a small set of interactive CTA cards ("action" objects) chosen by
// the user's discipline and guidance level, so a brand-new board already leads
// to action: talk to Ash, create a project, connect an integration, etc. Every
// object is a real, editable/deletable canvas object.
//
// Runs server-side from app/(app)/page.tsx exactly once, when the Home canvas is
// first created and the user hasn't finished guided setup yet.

import type { SupabaseClient } from "@supabase/supabase-js";
import { objectToColumns, type CanvasObject, type ActionContent, type StickyColor } from "@/components/canvas/types";

function uid(): string {
  // Web Crypto global — available in the Next.js server runtime and the browser.
  return globalThis.crypto.randomUUID();
}

export type GuidanceLevel = "guided" | "balanced" | "expert";

interface SeedOpts {
  firstName:     string | null;
  guidanceLevel: GuidanceLevel | null;
  practiceTypes: string[];
}

// The four CTA cards, tailored by guidance level. `guided` leans coaching +
// learning; `expert` leans migration/utility; `balanced` mixes the two.
function cardsFor(level: GuidanceLevel, discipline: string): ActionContent[] {
  const work = discipline ? `${discipline} ` : "";

  if (level === "expert") {
    return [
      { label: "Create your active projects", sublabel: `Set up the ${work}work you have in flight.`, icon: "project", actionKind: "route", href: "/projects", color: "blue" },
      { label: "Import your contacts", sublabel: "Galleries, clients, press, fabricators.", icon: "contact", actionKind: "route", href: "/network", color: "purple" },
      { label: "Connect email & calendar", sublabel: "Auto-log activity and see deadlines.", icon: "calendar", actionKind: "route", href: "/settings?section=integrations", color: "orange" },
      { label: "Ask Ash anything", sublabel: "It has full context on your studio.", icon: "ash", actionKind: "ash", prompt: "What can you help me with?", color: "green" },
    ];
  }

  if (level === "guided") {
    return [
      { label: "Where should I start?", sublabel: "Tell Ash what's on your plate — it'll help you prioritize.", icon: "compass", actionKind: "ash", prompt: "I just set up Perennial. Help me figure out what to focus on first.", color: "green" },
      { label: "Set up your first project", sublabel: `Ash will build out your ${work}project with you.`, icon: "project", actionKind: "ash", prompt: "Help me set up my first project — ask me what I'm working on.", color: "blue" },
      { label: "Learn: pricing your work", sublabel: "One of the hardest parts — Ash can walk you through it.", icon: "sparkles", actionKind: "ash", prompt: `Teach me how to think about pricing my ${work}work.`, color: "purple" },
      { label: "Connect your calendar", sublabel: "So deadlines and events land in one place.", icon: "calendar", actionKind: "route", href: "/settings?section=integrations", color: "orange" },
    ];
  }

  // balanced
  return [
    { label: "What should I set up first?", sublabel: "Ash will tailor a quick plan to your studio.", icon: "compass", actionKind: "ash", prompt: "Help me set up Perennial for my studio — where should I start?", color: "green" },
    { label: "Add your current projects", sublabel: `The ${work}work you're making or pitching.`, icon: "project", actionKind: "route", href: "/projects", color: "blue" },
    { label: "Connect email & calendar", sublabel: "Auto-log activity and surface deadlines.", icon: "calendar", actionKind: "route", href: "/settings?section=integrations", color: "orange" },
    { label: "Finish setting up with Ash", sublabel: "A few quick questions so Ash gets your studio.", icon: "ash", actionKind: "ash", prompt: "Help me finish setting up", color: "purple" },
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
  const hi = opts.firstName ? `Welcome, ${opts.firstName} 🌱` : "Welcome to Perennial 🌱";
  const sub = discipline
    ? `Your ${discipline} studio, in one place. Start with a card below — or just ask Ash.`
    : "Your studio, in one place. Start with a card below — or just ask Ash.";

  const cards = cardsFor(level, discipline);

  // World coordinates ≈ screen coordinates on first load (initial viewport is
  // {x:0, y:0, scale:1}). Keep everything in the visible top-left region, clear
  // of the left tool dock (~x<80) and the bottom Ash bar.
  const objects: CanvasObject[] = [
    {
      id: uid(), type: "text", x: 150, y: 90, width: 500, height: 52, rotation: 0, zIndex: 1,
      content: { text: hi, fontSize: 32, align: "left" },
      refType: null, refId: null,
    },
    {
      id: uid(), type: "text", x: 150, y: 144, width: 470, height: 46, rotation: 0, zIndex: 2,
      content: { text: sub, fontSize: 15, align: "left", textColor: "grey" as StickyColor },
      refType: null, refId: null,
    },
  ];

  // 2×2 grid of CTA cards.
  const CARD_W = 250, CARD_H = 132, GAP = 20, X0 = 150, Y0 = 220;
  cards.forEach((content, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    objects.push({
      id: uid(), type: "action",
      x: X0 + col * (CARD_W + GAP),
      y: Y0 + row * (CARD_H + GAP),
      width: CARD_W, height: CARD_H, rotation: 0, zIndex: 3 + i,
      content,
      refType: null, refId: null,
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
