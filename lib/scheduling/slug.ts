// Public booking links get a human-readable, unguessable slug: a kebab of the
// title plus a short random suffix. The suffix keeps slugs unique across
// users (the column is globally unique) and prevents enumeration of someone's
// links by guessing titles.

import { randomBytes } from "crypto";

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "meet";
}

export function mintSlug(title: string): string {
  return `${slugify(title)}-${randomBytes(3).toString("hex")}`;
}
