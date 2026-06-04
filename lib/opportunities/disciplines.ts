// Shared discipline vocabulary + mapping from onboarding practice types to
// opportunity tags. Used by the Presence Opportunities tab and the Calendar
// to power discipline filtering + "Recommended" matching.

export const PRACTICE_TAG_MAP: Record<string, string[]> = {
  "Furniture": ["furniture"], "Objects & lighting": ["lighting", "product"],
  "Ceramics & glass": ["ceramics", "glass"], "Textiles": ["textiles"],
  "Jewelry": ["jewelry"], "Painting": ["painting", "fine-art"],
  "Illustration": ["illustration"], "Sculpture": ["sculpture", "fine-art"],
  "Printmaking": ["printmaking", "fine-art"], "Video": ["video", "fine-art"],
  "Client-based work": ["interiors", "hospitality"],
};

export function tagsForPractices(practices: string[]): string[] {
  const s = new Set<string>();
  for (const p of practices) for (const t of (PRACTICE_TAG_MAP[p] ?? [])) s.add(t);
  return [...s];
}

export function disciplineLabel(t: string): string {
  return t === "fine-art" ? "Fine art" : t.charAt(0).toUpperCase() + t.slice(1);
}
