// ─── Ash → app navigation (shared client + server) ──────────────────────────────
//
// When Ash wants to take the user somewhere — land them in a module, or pop a
// module's "new X" form so they can fill it in — it calls the `navigate` tool.
// The server streams the action as an SSE `action` event; the client (AshAction
// bridge) resolves it to an href and routes there. Create targets are the same
// deep-links the modules already open their create modals from (?new=1, …).
//
// Dependency-free so both the browser bundle and the API route can import it.

// Modules Ash can land the user in.
export const NAV_MODULE_PATHS: Record<string, string> = {
  home:      "/",
  projects:  "/projects",
  network:   "/network",
  finance:   "/finance",
  calendar:  "/calendar",
  outreach:  "/outreach",
  notes:     "/notes",
  presence:  "/presence",
  resources: "/resources",
  tasks:     "/tasks",
  settings:  "/settings?section=integrations",
};

// "New X" deep-links — each opens that entity's create form on its module page.
// These mirror the ?new= handlers the module clients read on mount.
export const NAV_CREATE_TARGETS: Record<string, string> = {
  project:         "/projects?new=1",
  contact:         "/network?new=1&view=contacts",
  lead:            "/network?new=1&view=leads",
  organization:    "/network?new=1&view=organizations",
  note:            "/notes?new=1",
  invoice:         "/finance?new=invoice",
  time_entry:      "/finance?new=time",
  expense:         "/finance?new=expense",
  task:            "/calendar?new=task",
  event:           "/calendar?new=event",
  outreach_target: "/outreach?new=target",
};

export const NAV_MODULES        = Object.keys(NAV_MODULE_PATHS);
export const NAV_CREATE_ENTITIES = Object.keys(NAV_CREATE_TARGETS);

export interface AshNavAction {
  /** Where to land the user. */
  module?: string;
  /** If set, open this entity's "new" form (implies its module). */
  create?: string;
}

/** Coerce loose tool input into a valid nav action, or null if it resolves nowhere. */
export function normalizeNavAction(input: unknown): AshNavAction | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const create = typeof raw.create === "string" && NAV_CREATE_TARGETS[raw.create] ? raw.create : undefined;
  const mod    = typeof raw.module === "string" && NAV_MODULE_PATHS[raw.module] ? raw.module : undefined;
  if (!create && !mod) return null;
  return { module: mod, create };
}

/** Resolve a nav action to an in-app href. Create target wins over bare module. */
export function resolveAshHref(action: AshNavAction): string | null {
  if (action.create && NAV_CREATE_TARGETS[action.create]) return NAV_CREATE_TARGETS[action.create];
  if (action.module && NAV_MODULE_PATHS[action.module])   return NAV_MODULE_PATHS[action.module];
  return null;
}

/** A short past-tense confirmation fed back to the model so it can keep guiding. */
export function describeNavAction(action: AshNavAction): string {
  if (action.create) {
    const label = action.create.replace(/_/g, " ");
    return `Opened the new-${label} form for the user. Now guide them through filling it in — tell them, in their terms, exactly what to put where; don't assume it saved.`;
  }
  const mod = action.module ?? "app";
  return `Took the user to the ${mod} page. Continue guiding them there.`;
}
