"use client";

// Project options (status / type / priority) are user-customisable. The
// authoritative copy lives in profiles.project_options (jsonb), seeded with
// sensible defaults at signup. This context fetches once per Projects page
// mount, lets consumers read the current lists, and persists edits.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Shape ─────────────────────────────────────────────────────────────────────

export interface ProjectOption {
  /** Stable key stored in projects.status / .type / .priority. Never renamed
   *  once a project is using it — only the label changes. */
  key:   string;
  label: string;
  color: string;
}

export type OptionDimension = "status" | "type" | "priority";

export interface ProjectOptions {
  status:   ProjectOption[];
  type:     ProjectOption[];
  priority: ProjectOption[];
}

// ── Defaults (mirror the migration) ──────────────────────────────────────────

export const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
  status: [
    { key: "planning",    label: "Planning",    color: "var(--color-grey)"        },
    { key: "in_progress", label: "In Progress", color: "var(--color-sage)"        },
    { key: "on_hold",     label: "On Hold",     color: "var(--color-warm-yellow)" },
    { key: "complete",    label: "Complete",    color: "var(--color-green)"       },
    { key: "cut",         label: "Cut",         color: "var(--color-red-orange)"  },
  ],
  type: [
    { key: "furniture",      label: "Furniture", color: "#b8860b" },
    { key: "sculpture",      label: "Sculpture", color: "#b8860b" },
    { key: "painting",       label: "Painting",  color: "#6d4fa3" },
    { key: "client_project", label: "Client",    color: "#2563ab" },
  ],
  priority: [
    { key: "high",   label: "High",   color: "var(--color-red-orange)" },
    { key: "medium", label: "Medium", color: "#b8860b"                 },
    { key: "low",    label: "Low",    color: "var(--color-sage)"       },
  ],
};

// ── Palette for the colour picker ────────────────────────────────────────────

export const OPTION_PALETTE: { name: string; value: string }[] = [
  { name: "Sage",    value: "var(--color-sage)"        },
  { name: "Grey",    value: "var(--color-grey)"        },
  { name: "Yellow",  value: "var(--color-warm-yellow)" },
  { name: "Green",   value: "var(--color-green)"       },
  { name: "Orange",  value: "var(--color-red-orange)"  },
  { name: "Gold",    value: "#b8860b"                  },
  { name: "Purple",  value: "#6d4fa3"                  },
  { name: "Blue",    value: "#2563ab"                  },
];

// ── Context ──────────────────────────────────────────────────────────────────

interface ProjectOptionsCtx {
  options: ProjectOptions;
  loading: boolean;
  /** Replace the full list for a single dimension and persist. */
  setDimension: (dim: OptionDimension, next: ProjectOption[]) => Promise<void>;
  /** Convenience: look up a single option by its key. Falls back to a
   *  synthesised "Unknown" option so projects with a deleted key still render. */
  resolve: (dim: OptionDimension, key: string | null | undefined) => ProjectOption;
}

const Ctx = createContext<ProjectOptionsCtx | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function ProjectOptionsProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ProjectOptions>(DEFAULT_PROJECT_OPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("project_options")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const raw = data?.project_options as Partial<ProjectOptions> | null;
      // Merge with defaults so a missing dimension doesn't blow up the UI.
      setOptions({
        status:   raw?.status   && raw.status.length   ? raw.status   : DEFAULT_PROJECT_OPTIONS.status,
        type:     raw?.type     && raw.type.length     ? raw.type     : DEFAULT_PROJECT_OPTIONS.type,
        priority: raw?.priority && raw.priority.length ? raw.priority : DEFAULT_PROJECT_OPTIONS.priority,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const setDimension = useCallback(async (dim: OptionDimension, next: ProjectOption[]) => {
    setOptions((prev) => {
      const updated = { ...prev, [dim]: next };
      // Fire-and-forget persistence. UI is optimistic; we don't block on the
      // network round trip because option edits are low-stakes and revert is
      // straightforward via the same UI.
      (async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from("profiles")
          .update({ project_options: updated })
          .eq("user_id", user.id);
      })();
      return updated;
    });
  }, []);

  const resolve = useCallback((dim: OptionDimension, key: string | null | undefined): ProjectOption => {
    if (!key) return { key: "", label: "—", color: "var(--color-grey)" };
    const found = options[dim].find((o) => o.key === key);
    if (found) return found;
    // Project references an option that was deleted — synthesise a stub so
    // the card still renders with a readable label.
    return { key, label: humanise(key), color: "var(--color-grey)" };
  }, [options]);

  return (
    <Ctx.Provider value={{ options, loading, setDimension, resolve }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProjectOptions(): ProjectOptionsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useProjectOptions must be used within <ProjectOptionsProvider>");
  }
  return ctx;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function humanise(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Slug a free-text label into a stable key. Keeps existing options' keys
 *  stable so we don't break in-flight projects when the label is renamed —
 *  only used when creating a new option. */
export function slugifyOptionKey(label: string, existingKeys: string[]): string {
  const base = label.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "option";
  if (!existingKeys.includes(base)) return base;
  let i = 2;
  while (existingKeys.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
