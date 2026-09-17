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
  home:      ["Help me finish setting up", "What should I prioritize today?", "Give me a business snapshot"],
  projects:  ["Help me set up my projects", "Which projects need attention?", "Help me plan a commission"],
  contacts:  ["Help me set up my network", "Who should I follow up with?", "Help me write a gallery pitch"],
  network:   ["Help me set up my network", "Who should I follow up with?", "Help me write a gallery pitch"],
  outreach:  ["Help me set up my outreach", "What's in my pipeline right now?", "Who should I reach out to next?"],
  finance:   ["Help me set up my finances", "How's my cash flow?", "What's outstanding?"],
  notes:     ["Summarize my recent notes", "Help me develop this idea", "What patterns do you see?"],
  calendar:  ["Help me set up my calendar", "What's coming up this week?", "What deadlines am I close to?"],
  tasks:     ["What's overdue?", "Help me prioritize my tasks", "What should I tackle first today?"],
  presence:  ["Help me set up my presence", "What opportunities are coming up?", "What fairs should I apply to?"],
  resources: ["Help me set up my resources", "What documents am I missing?", "Help me write an artist statement"],
  default:   ["What should I focus on today?", "Give me a business snapshot", "What's overdue?"],
};

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? "Perennial";
}

export function moduleSuggestions(module: string): string[] {
  return SUGGESTIONS[module] ?? SUGGESTIONS.default;
}
