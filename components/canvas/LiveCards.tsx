"use client";

// Interactive, live-data reference cards. Each fetches fresh on mount. Task
// lists and the note body mutate the DB. Interactive controls stopPropagation
// on pointer-down so they don't start an object drag.

import { useEffect, useRef, useState } from "react";
import { ListChecks, FileText, Check, Plus } from "lucide-react";
import type { CanvasObject, ReferenceContent } from "./types";
import {
  fetchProject,
  fetchContact,
  fetchNote,
  saveNote,
  fetchScopeTasks,
  toggleTask,
  addScopeTask,
  type LiveProject,
  type LiveContact,
  type LiveTask,
  type TaskScope,
} from "@/lib/canvas/live";

const FONT = "var(--font-sans)";

const cardStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--color-surface-raised)",
  border: "0.5px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-md)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  overflow: "hidden",
};
const titleStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const metaStyle: React.CSSProperties = { fontFamily: FONT, fontSize: 11, color: "var(--color-text-tertiary)" };
const stop = (e: React.PointerEvent) => e.stopPropagation();

function Tile({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: "var(--radius-md)",
        background: muted ? "var(--color-surface-sunken)" : "rgba(var(--color-sage-rgb), 0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: muted ? "var(--color-text-tertiary)" : "var(--color-sage-text)",
      }}
    >
      {children}
    </div>
  );
}

type LoadState = "loading" | "ok" | "missing";

// Shown when a card's referenced entity no longer exists (it was deleted after
// the card was placed). Renders the last-known title, struck through.
function MissingCard({ title, icon }: { title?: string; icon: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Tile muted>{icon}</Tile>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ ...titleStyle, color: "var(--color-text-tertiary)", textDecoration: "line-through" }}>
            {title || "Untitled"}
          </span>
          <span style={metaStyle}>No longer available</span>
        </div>
      </div>
    </div>
  );
}

// ── project ──────────────────────────────────────────────────────────────────
export function LiveProjectCard({ object }: { object: CanvasObject }) {
  const c = object.content as ReferenceContent;
  const [p, setP] = useState<LiveProject | null>(null);
  const [state, setState] = useState<LoadState>(() => (object.refId ? "loading" : "ok"));
  useEffect(() => {
    if (!object.refId) return;
    let live = true;
    (async () => {
      const r = await fetchProject(object.refId!);
      if (!live) return;
      setP(r);
      setState(r ? "ok" : "missing");
    })();
    return () => {
      live = false;
    };
  }, [object.refId]);

  if (state === "missing") return <MissingCard title={c.title} icon={<ListChecks size={16} strokeWidth={1.75} />} />;
  const loading = state === "loading";
  const progress = p && p.total ? p.done / p.total : 0;
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Tile>
          <ListChecks size={16} strokeWidth={1.75} />
        </Tile>
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={titleStyle}>{p?.title ?? c.title}</span>
          <span style={{ ...metaStyle, textTransform: "capitalize" }}>
            {loading ? "…" : [p?.status, p?.total ? `${p.done}/${p.total} tasks` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      {p && p.total > 0 && (
        <div style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--color-surface-sunken)", overflow: "hidden" }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", background: "var(--color-sage)" }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, overflow: "hidden" }}>
        {(p?.tasks ?? []).slice(0, 4).map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 13, height: 13, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${t.completed ? "var(--color-sage)" : "var(--color-border-strong)"}`, background: t.completed ? "var(--color-sage)" : "transparent" }} />
            <span style={{ fontFamily: FONT, fontSize: 12, color: t.completed ? "var(--color-text-tertiary)" : "var(--color-text-secondary)", textDecoration: t.completed ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── contact ──────────────────────────────────────────────────────────────────
export function LiveContactCard({ object }: { object: CanvasObject }) {
  const c = object.content as ReferenceContent;
  const [ct, setCt] = useState<LiveContact | null>(null);
  const [state, setState] = useState<LoadState>(() => (object.refId ? "loading" : "ok"));
  useEffect(() => {
    if (!object.refId) return;
    let live = true;
    (async () => {
      const r = await fetchContact(object.refId!);
      if (!live) return;
      setCt(r);
      setState(r ? "ok" : "missing");
    })();
    return () => {
      live = false;
    };
  }, [object.refId]);

  if (state === "missing")
    return (
      <MissingCard
        title={c.title}
        icon={<span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>{c.initials ?? "?"}</span>}
      />
    );
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "var(--radius-full)", background: "rgba(var(--color-sage-rgb), 0.16)", color: "var(--color-sage-text)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
          {ct?.initials ?? c.initials ?? "?"}
        </div>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={titleStyle}>{ct?.name ?? c.title}</span>
          {(ct?.org ?? c.subtitle) && <span style={metaStyle}>{ct?.org ?? c.subtitle}</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, overflow: "hidden" }}>
        {ct && ct.activities.length === 0 && <span style={metaStyle}>No recent activity</span>}
        {(ct?.activities ?? []).map((a) => (
          <div key={a.id} style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: FONT, fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ textTransform: "capitalize", color: "var(--color-text-tertiary)" }}>{a.type}</span>
              {a.content ? ` · ${a.content}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── note (editable) ──────────────────────────────────────────────────────────
export function LiveNoteCard({ object }: { object: CanvasObject }) {
  const c = object.content as ReferenceContent;
  const [note, setNote] = useState<{ title: string | null; content: string | null } | null>(null);
  const [state, setState] = useState<LoadState>(() => (object.refId ? "loading" : "ok"));
  const bodyRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!object.refId) return;
    let live = true;
    (async () => {
      const n = await fetchNote(object.refId!);
      if (!live) return;
      if (n) {
        setNote(n);
        setState("ok");
        if (bodyRef.current) bodyRef.current.innerHTML = n.content ?? "";
      } else {
        setState("missing");
      }
    })();
    return () => {
      live = false;
    };
  }, [object.refId]);

  // Flush/clear the pending save on unmount so a debounced write can't fire
  // against a torn-down card.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onInput = () => {
    if (!object.refId || !bodyRef.current) return;
    const html = bodyRef.current.innerHTML;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveNote(object.refId!, html).catch((e) => console.error("note save failed", e));
    }, 700);
  };

  if (state === "missing") return <MissingCard title={c.title} icon={<FileText size={16} strokeWidth={1.75} />} />;
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Tile>
          <FileText size={16} strokeWidth={1.75} />
        </Tile>
        <span style={titleStyle}>{note?.title || c.title || "Untitled note"}</span>
      </div>
      <div
        ref={bodyRef}
        className="canvas-rich"
        contentEditable
        suppressContentEditableWarning
        onPointerDown={stop}
        onInput={onInput}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ flex: 1, minHeight: 0, overflow: "auto", outline: "none", fontFamily: FONT, fontSize: 12, lineHeight: 1.4, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word", userSelect: "text" }}
      />
    </div>
  );
}

// ── task list (scoped, completable, add) ─────────────────────────────────────
export function LiveTaskListCard({ object }: { object: CanvasObject }) {
  const c = object.content as ReferenceContent;
  const scope: TaskScope = c.scopeType === "contact" ? "contact" : "project";
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      if (object.refId) {
        const r = await fetchScopeTasks(scope, object.refId);
        if (live) setTasks(r);
      }
    })();
    return () => {
      live = false;
    };
  }, [object.refId, scope]);

  const toggle = (t: LiveTask) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    toggleTask(t.id, !t.completed).catch((e) => console.error("task toggle failed", e));
  };
  const add = async () => {
    const title = draft.trim();
    if (!title || !object.refId) return;
    setDraft("");
    const created = await addScopeTask(scope, object.refId, title);
    if (created) setTasks((prev) => [...prev, created]);
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Tile>
          <ListChecks size={16} strokeWidth={1.75} />
        </Tile>
        <span style={titleStyle}>{c.title}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {tasks.map((t) => (
          <button key={t.id} onPointerDown={stop} onClick={() => toggle(t)} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: "2px 0", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", border: `1.5px solid ${t.completed ? "var(--color-sage)" : "var(--color-border-strong)"}`, background: t.completed ? "var(--color-sage)" : "transparent" }}>
              {t.completed && <Check size={11} strokeWidth={3} />}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 12.5, color: t.completed ? "var(--color-text-tertiary)" : "var(--color-text-secondary)", textDecoration: t.completed ? "line-through" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title}
            </span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "0.5px solid var(--color-border)", paddingTop: 8 }}>
        <Plus size={14} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
        <input
          value={draft}
          onPointerDown={stop}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") add();
          }}
          placeholder="Add a task…"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: FONT, fontSize: 12.5, color: "var(--color-text-primary)" }}
        />
      </div>
    </div>
  );
}
