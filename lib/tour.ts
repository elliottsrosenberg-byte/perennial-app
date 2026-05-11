// Shared definitions for the post-onboarding "getting started" module tour.
// Order here drives the callout sequence in the sidebar.

export interface TourModule {
  key:    string;
  label:  string;
  href:   string;
  blurb:  string;
}

export const TOUR_MODULES: TourModule[] = [
  { key: "home",      label: "Home dashboard", href: "/",      blurb: "A quick tour of your daily lens — what each card shows and how to use it." },
  { key: "projects",  label: "Projects",  href: "/projects",  blurb: "Track every piece of work — editions, commissions, client jobs." },
  { key: "contacts",  label: "Contacts",  href: "/contacts",  blurb: "Galleries, collectors, press, fabricators. Your relationship graph." },
  { key: "outreach",  label: "Outreach",  href: "/outreach",  blurb: "Pipeline for gallery submissions, press pitches, fair applications." },
  { key: "notes",     label: "Notes",     href: "/notes",     blurb: "Free-form thinking, meeting notes, drafts. Searchable and pinnable." },
  { key: "tasks",     label: "Tasks",     href: "/tasks",     blurb: "Quick to-dos, linked to projects, contacts, or opportunities." },
  { key: "calendar",  label: "Calendar",  href: "/calendar",  blurb: "Deadlines, fair dates, reminders — connected to your projects." },
  { key: "finance",   label: "Finance",   href: "/finance",   blurb: "Time tracking, expenses, and invoicing for your studio." },
  { key: "presence",  label: "Presence",  href: "/presence",  blurb: "Track opportunities — fairs, open calls, grants, residencies." },
  { key: "resources", label: "Resources", href: "/resources", blurb: "Your studio documents, brand assets, and reference files." },
];

export type TourVisited = Record<string, string>;

export function nextUnvisited(visited: TourVisited): TourModule | null {
  return TOUR_MODULES.find((m) => !visited[m.key]) ?? null;
}

export function progress(visited: TourVisited): { done: number; total: number } {
  return {
    done:  TOUR_MODULES.filter((m) => visited[m.key]).length,
    total: TOUR_MODULES.length,
  };
}
