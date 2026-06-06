// Theme handling. The app paints from `data-theme="light|dark"` on <html>.
// Two stored preferences:
//   - perennial-theme       → the base theme the sidebar toggles ("light"|"dark")
//   - perennial-theme-auto  → "1" when auto mode is on (dark at night)
// When auto is on, the painted theme follows the time of day. Manually picking
// a theme in the sidebar turns auto off (an explicit choice), matching how
// macOS behaves.

export type BaseTheme = "light" | "dark";

const BASE_KEY = "perennial-theme";
const AUTO_KEY = "perennial-theme-auto";

/** Night window: 7pm–6:59am local time resolves to dark. */
export function isNight(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= 19 || h < 7;
}

export function getBaseTheme(): BaseTheme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(BASE_KEY) === "dark" ? "dark" : "light";
}

export function isAutoTheme(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTO_KEY) === "1";
}

/** The concrete theme to paint right now. */
export function resolvedTheme(): BaseTheme {
  return isAutoTheme() ? (isNight() ? "dark" : "light") : getBaseTheme();
}

/** Paint the resolved theme onto <html>. */
export function paintCurrentTheme(): BaseTheme {
  const t = resolvedTheme();
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
  return t;
}

function broadcast() {
  window.dispatchEvent(new CustomEvent("perennial-theme-changed", {
    detail: { base: getBaseTheme(), auto: isAutoTheme() },
  }));
}

/** Sidebar light/dark switch: set the base theme. A manual pick turns auto off. */
export function setBaseTheme(t: BaseTheme): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BASE_KEY, t);
  localStorage.setItem(AUTO_KEY, "0");
  paintCurrentTheme();
  broadcast();
}

/** Settings toggle: turn auto mode on/off. */
export function setAutoTheme(on: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  paintCurrentTheme();
  broadcast();
}
