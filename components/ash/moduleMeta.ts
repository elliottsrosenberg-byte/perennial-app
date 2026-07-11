// Per-module display labels + starter suggestions for Ash surfaces. Shared by
// the bottom-center AshDock (and previously the docked AshPanel) so the copy
// stays in one place.

export const MODULE_LABELS: Record<string, string> = {
  home: "Home", projects: "Projects", contacts: "Network", network: "Network",
  outreach: "Outreach", notes: "Notes", calendar: "Calendar",
  finance: "Finance", presence: "Presence", resources: "Resources",
  tasks: "Tasks", settings: "Settings",
};

export const SUGGESTIONS: Record<string, string[]> = {
  home:      ["What should I prioritize today?", "Give me a business snapshot", "What's been neglected?"],
  projects:  ["Which projects need attention?", "Help me plan a commission", "What's my current workload?"],
  contacts:  ["Who should I follow up with?", "Help me write a gallery pitch", "How's my relationship health?"],
  network:   ["Who should I follow up with?", "Help me write a gallery pitch", "How's my relationship health?"],
  outreach:  ["What's in my pipeline right now?", "Who should I reach out to next?", "Help me write a cold email to a gallery"],
  finance:   ["How's my cash flow?", "What's outstanding?", "Help me write a payment follow-up"],
  notes:     ["Summarize my recent notes", "Help me develop this idea", "What patterns do you see?"],
  calendar:  ["What's coming up this week?", "What deadlines am I close to?", "Help me plan my schedule"],
  tasks:     ["What's overdue?", "Help me prioritize my tasks", "What should I tackle first today?"],
  presence:  ["What opportunities are coming up?", "Help me write an open call application", "What fairs should I apply to?"],
  resources: ["What documents am I missing?", "Help me write an artist statement", "Review my contracts"],
  default:   ["What should I focus on today?", "Give me a business snapshot", "What's overdue?"],
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? "Perennial";
}

export function moduleSuggestions(module: string): string[] {
  return SUGGESTIONS[module] ?? SUGGESTIONS.default;
}
