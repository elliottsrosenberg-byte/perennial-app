// Shared by the per-module intro modals: the "Set up with Ash" choice opens the
// Ash dock (scoped to the current module route) and auto-sends a setup prompt,
// kicking off Ash-guided module setup (get_module_status → ask_user → navigate /
// write tools). See lib/ash/system-prompt.ts "Setting up a single module".

export function launchAshSetup(moduleLabel: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("open-ash", { detail: { message: `Help me set up my ${moduleLabel}` } }),
  );
}
