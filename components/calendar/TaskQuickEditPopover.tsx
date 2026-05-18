"use client";

// Anchored popover for editing a task without leaving the Calendar.
// Triggered from the tasks ribbon (day pills) and the left-rail task
// list. Owns its own writes to the tasks table — the parent only needs
// to update its local list via onUpdated/onCompleted/onDeleted.
//
// Intentionally minimal compared to the full TasksClient editor: title,
// due date, priority, complete. "Open in Tasks" is the escape hatch.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Calendar as CalendarIcon, ExternalLink, Flag, Trash2 } from "lucide-react";
import DatePicker from "@/components/ui/DatePicker";
import type { Task } from "@/types/database";

interface Props {
  task:     Task;
  x:        number;
  y:        number;
  onClose:  () => void;
  onUpdated:  (task: Task) => void;
  onCompleted?: (id: string, completed: boolean) => void;
  onDeleted?:   (id: string) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high:   "var(--color-red-orange)",
  medium: "#a07800",
  low:    "var(--color-sage)",
};

function pad(n: number): string { return n.toString().padStart(2, "0"); }
function toIso(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TaskQuickEditPopover({
  task: initial, x, y, onClose, onUpdated, onCompleted, onDeleted,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const [task, setTask] = useState(initial);
  const [titleBuf, setTitleBuf] = useState(initial.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onMouse(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown",   onKey);
    };
  }, [onClose]);

  async function patchTask(patch: Partial<Task>): Promise<void> {
    setSaving(true);
    const next = { ...task, ...patch } as Task;
    setTask(next);
    onUpdated(next);
    await supabase.from("tasks").update(patch).eq("id", task.id);
    setSaving(false);
  }

  async function saveTitle() {
    if (titleBuf.trim() === task.title) return;
    await patchTask({ title: titleBuf.trim() } as Partial<Task>);
  }

  async function setDue(date: Date | null) {
    await patchTask({ due_date: toIso(date) } as Partial<Task>);
  }

  async function setPriority(p: "high" | "medium" | "low" | null) {
    await patchTask({ priority: p } as Partial<Task>);
  }

  async function toggleComplete() {
    const next = !task.completed;
    setTask((prev) => ({ ...prev, completed: next }));
    onCompleted?.(task.id, next);
    await supabase.from("tasks").update({ completed: next }).eq("id", task.id);
  }

  async function del() {
    if (!window.confirm("Delete this task?")) return;
    await supabase.from("tasks").delete().eq("id", task.id);
    onDeleted?.(task.id);
    onClose();
  }

  // Position: clamp to viewport so opening near the right edge doesn't
  // push the popover off-screen.
  const W = 280;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top  = Math.min(y, window.innerHeight - 280);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: `${Math.max(8, top)}px`,
        left: `${Math.max(8, left)}px`,
        zIndex: 80,
        width: W,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        padding: 14,
        fontFamily: "inherit",
        opacity: saving ? 0.96 : 1,
      }}
    >
      {/* Title — autoselect, blur to save */}
      <input
        autoFocus
        value={titleBuf}
        onChange={(e) => setTitleBuf(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        }}
        style={{
          width: "100%",
          fontSize: 13, fontWeight: 600,
          color: "var(--color-charcoal)",
          background: "transparent",
          border: "none", borderBottom: "0.5px solid var(--color-border)",
          padding: "2px 0 7px",
          marginBottom: 12,
          outline: "none",
          fontFamily: "inherit",
        }}
      />

      {/* Due date */}
      <div style={{ marginBottom: 12 }}>
        <label style={{
          display: "block", fontSize: 10, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--color-grey)", marginBottom: 5,
        }}>
          <CalendarIcon size={10} style={{ display: "inline", marginRight: 4 }} />
          Due
        </label>
        <DatePicker
          value={task.due_date ? new Date(task.due_date + "T00:00:00") : null}
          onChange={(d) => setDue(d)}
          placeholder="No due date"
        />
      </div>

      {/* Priority pills */}
      <div style={{ marginBottom: 12 }}>
        <label style={{
          display: "block", fontSize: 10, fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--color-grey)", marginBottom: 5,
        }}>
          <Flag size={10} style={{ display: "inline", marginRight: 4 }} />
          Priority
        </label>
        <div style={{ display: "flex", gap: 4 }}>
          {(["high", "medium", "low"] as const).map((p) => {
            const active = task.priority === p;
            const color = PRIORITY_COLORS[p];
            return (
              <button
                key={p}
                onClick={() => setPriority(active ? null : p)}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: 10.5, fontWeight: 500,
                  textTransform: "capitalize",
                  background: active ? `${color}1c` : "transparent",
                  color: active ? color : "var(--color-text-tertiary)",
                  border: `0.5px solid ${active ? color : "var(--color-border)"}`,
                  borderRadius: 6, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={toggleComplete}
          style={{
            flex: 1,
            padding: "7px 10px", fontSize: 11.5, fontWeight: 500,
            background: task.completed ? "var(--color-cream)" : "var(--color-sage)",
            color: task.completed ? "var(--color-text-secondary)" : "white",
            border: task.completed ? "0.5px solid var(--color-border)" : "none",
            borderRadius: 7, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {task.completed ? "Undo complete" : "Mark complete"}
        </button>
        <button
          onClick={del}
          aria-label="Delete task"
          title="Delete task"
          style={{
            width: 30, height: 30, borderRadius: 7,
            background: "transparent",
            border: "0.5px solid var(--color-border)",
            color: "var(--color-text-tertiary)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-red-orange)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <Link
        href={`/tasks?taskId=${task.id}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          marginTop: 10,
          fontSize: 10.5, color: "var(--color-text-tertiary)",
          textDecoration: "none",
        }}
      >
        <ExternalLink size={10} />
        Open in Tasks
      </Link>
    </div>
  );
}
