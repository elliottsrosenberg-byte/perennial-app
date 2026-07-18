// ─── Navigation tool ────────────────────────────────────────────────────────────
//
// `navigate` takes the user to a module, and can open a module's "new X" form so
// they can fill it in themselves. Like `ask_user`, the API route special-cases
// this tool: it streams the action to the client (which routes there) and feeds
// back a short confirmation so Ash keeps guiding. The handler here is a safety
// fallback and isn't reached on the happy path.

import type { AshToolDefinition } from "./types";
import { NAV_MODULES, NAV_CREATE_ENTITIES } from "@/lib/ash/app-navigation";

export const NAVIGATE_TOOL_NAME = "navigate";

export const navigateTool: AshToolDefinition = {
  name: NAVIGATE_TOOL_NAME,
  description:
    "Take the user somewhere in Perennial — land them in a module, and optionally pop that module's " +
    "'new X' form so they can fill it in. Use this during setup and onboarding to move WITH the user " +
    "instead of just telling them where to click: when you're helping them set up an area, navigate " +
    "them into it; when it's time to add their first project / contact / invoice / note, open the form " +
    "with `create` so it's right in front of them. This is the 'do it with me' path — the form opens " +
    "for the user to complete. (The other path is doing it FOR them: gather with ask_user and write it " +
    "yourself with create_project / create_contact / etc. Offer whichever fits — some people want to " +
    "type it themselves, some want you to just handle it.) After opening a form, tell them plainly what " +
    "to put where. Don't claim a record was saved — the form is theirs to submit.",
  input_schema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        enum: NAV_MODULES,
        description: "Which module to land the user in.",
      },
      create: {
        type: "string",
        enum: NAV_CREATE_ENTITIES,
        description: "Optionally, open this entity's 'new' form (implies its module). Omit to just navigate.",
      },
    },
  },
  // Never invoked on the happy path (the route intercepts `navigate`).
  handler: async () => "Navigation requested.",
};
