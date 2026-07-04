// Search the user's entities (projects / tasks / notes / contacts / events) for
// the canvas reference-card picker. Each result carries a denormalized
// ReferenceContent snapshot so cards render without a join, plus refType/refId
// for linking back. "event" maps to the app's DB-backed events (opportunities).

import { createClient } from "@/lib/supabase/client";
import type { CanvasRefType } from "@/types/database";
import type { ReferenceContent } from "@/components/canvas/types";

export type EntityKind = "project" | "task" | "note" | "contact" | "event";

export interface EntityResult {
  refType: CanvasRefType;
  refId: string;
  content: ReferenceContent;
  width: number;
  height: number;
}

export const ENTITY_KINDS: { kind: EntityKind; label: string }[] = [
  { kind: "project", label: "Projects" },
  { kind: "task", label: "Tasks" },
  { kind: "note", label: "Notes" },
  { kind: "contact", label: "Contacts" },
  { kind: "event", label: "Events" },
];

function fmtDate(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function stripHtml(s: string | null): string {
  return (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchEntities(kind: EntityKind, query: string): Promise<EntityResult[]> {
  const supabase = createClient();
  const q = query.trim();
  const like = `%${q}%`;

  switch (kind) {
    case "project": {
      const { data } = await supabase
        .from("projects")
        .select("id, title, status, due_date, tasks(id, completed)")
        .ilike("title", like)
        .order("updated_at", { ascending: false })
        .limit(20);
      return (data ?? []).map((p): EntityResult => {
        const tasks = (p.tasks ?? []) as { completed: boolean }[];
        const done = tasks.filter((t) => t.completed).length;
        return {
          refType: "project",
          refId: p.id,
          width: 300,
          height: 150,
          content: {
            title: p.title,
            status: p.status ?? undefined,
            progress: tasks.length ? done / tasks.length : 0,
            subtitle: tasks.length ? `${done} of ${tasks.length} tasks` : undefined,
            meta: p.due_date ? `Due ${fmtDate(p.due_date)}` : undefined,
            color: "green",
          },
        };
      });
    }

    case "task": {
      // A task card is a completable task LIST scoped to a project.
      const { data } = await supabase
        .from("projects")
        .select("id, title, tasks(id, completed)")
        .ilike("title", like)
        .order("updated_at", { ascending: false })
        .limit(20);
      return (data ?? []).map((p): EntityResult => {
        const tasks = (p.tasks ?? []) as { completed: boolean }[];
        const open = tasks.filter((t) => !t.completed).length;
        return {
          refType: "task",
          refId: p.id,
          width: 280,
          height: 210,
          content: {
            title: p.title,
            subtitle: `${open} open · ${tasks.length} tasks`,
            scopeType: "project",
            color: "blue",
          },
        };
      });
    }

    case "note": {
      const { data } = await supabase
        .from("notes")
        .select("id, title, content, updated_at")
        .or(`title.ilike.${like},content.ilike.${like}`)
        .order("updated_at", { ascending: false })
        .limit(20);
      return (data ?? []).map((n): EntityResult => {
        const snippet = stripHtml(n.content).slice(0, 140);
        return {
          refType: "note",
          refId: n.id,
          width: 280,
          height: 132,
          content: {
            title: n.title || "Untitled note",
            snippet: snippet || undefined,
            meta: n.updated_at ? `Edited ${fmtDate(n.updated_at)}` : undefined,
            color: "yellow",
          },
        };
      });
    }

    case "contact": {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, organization:organizations(name)")
        .eq("archived", false)
        .or(`first_name.ilike.${like},last_name.ilike.${like}`)
        .order("last_contacted_at", { ascending: false, nullsFirst: false })
        .limit(20);
      return (data ?? []).map((c): EntityResult => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed";
        const org = c.organization as unknown as { name: string } | null;
        const initials = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "?";
        return {
          refType: "contact",
          refId: c.id,
          width: 260,
          height: 92,
          content: { title: name, subtitle: org?.name ?? undefined, initials, color: "purple" },
        };
      });
    }

    case "event": {
      const { data } = await supabase
        .from("opportunities")
        .select("id, title, category, start_date, application_deadline")
        .ilike("title", like)
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(20);
      return (data ?? []).map((o): EntityResult => {
        const when = o.start_date ?? o.application_deadline;
        return {
          refType: "event",
          refId: o.id,
          width: 280,
          height: 100,
          content: {
            title: o.title,
            subtitle: o.category ?? undefined,
            meta: when ? fmtDate(when) : undefined,
            color: "purple",
          },
        };
      });
    }
  }
}
