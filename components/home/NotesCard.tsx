"use client";

import Link from "next/link";
import AshMark from "@/components/ui/AshMark";

interface HomeNote {
  id: string;
  title: string | null;
  content: string | null;
  updated_at: string;
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function notePreview(content: string | null): string {
  if (!content) return "";
  return content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

export default function NotesCard({ notes }: { notes: HomeNote[] }) {
  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        gridColumn: "span 2",
        gridRow: "span 2",
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      {/* Quick compose */}
      <div className="px-[18px] pt-[18px] pb-[14px] shrink-0">
        <div
          className="text-[15px] leading-relaxed min-h-[80px] cursor-text"
          style={{ color: "var(--color-grey)" }}
        >
          What&apos;s on your mind?
        </div>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex gap-1.5">
            {(["Note", "Reminder"] as const).map((label) => (
              <button
                key={label}
                className="flex items-center gap-1 px-2.5 py-[5px] rounded-full text-[11px] font-semibold leading-none transition-colors"
                style={{
                  background: label === "Note" ? "var(--color-cream)" : "transparent",
                  color: label === "Note" ? "var(--color-charcoal)" : "var(--color-grey)",
                  border: "0.5px solid var(--color-border)",
                }}
              >
                {label}
              </button>
            ))}
            {/* Ask Ash — distinct Ash visual treatment */}
            <button
              className="flex items-center gap-[5px] px-2.5 py-[5px] rounded-full text-[11px] font-semibold leading-none transition-all"
              style={{
                background:  "linear-gradient(130deg, var(--color-ash) 0%, var(--color-ash-mid) 100%)",
                color:       "white",
                border:      "none",
                boxShadow:   "0 1px 5px var(--color-ash-glow)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 10px var(--color-ash-glow)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 5px var(--color-ash-glow)"; }}
            >
              <AshMark size={11} variant="on-dark" />
              Ask Ash
            </button>
          </div>
          <div className="flex-1" />
          <button
            className="px-3.5 py-[5px] rounded-md text-[11px] font-medium leading-none"
            style={{ background: "var(--color-sage)", color: "white" }}
          >
            Save →
          </button>
        </div>
      </div>

      {/* Divider header */}
      <div
        className="flex items-center px-[15px] py-2 shrink-0"
        style={{
          background: "var(--color-cream)",
          borderTop: "0.5px solid var(--color-border)",
          borderBottom: "0.5px solid var(--color-border)",
        }}
      >
        <span
          className="flex-1 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-grey)" }}
        >
          Recent notes
        </span>
        <Link href="/notes" className="text-[11px] hover:underline" style={{ color: "#2563ab" }}>
          View all →
        </Link>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-6">
            <p className="text-[12px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No notes yet</p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              Use the field above to capture your first thought.
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <Link
              key={note.id}
              href="/notes"
              className="flex items-start gap-2.5 px-[15px] py-[11px] cursor-pointer transition-colors w-full"
              style={{ borderBottom: "0.5px solid var(--color-border)", display: "flex" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-grey)" }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate" style={{ color: "var(--color-charcoal)" }}>
                  {note.title || "Untitled"}
                </div>
                {notePreview(note.content) && (
                  <div className="text-[11px] truncate mt-0.5" style={{ color: "#6b6860" }}>
                    {notePreview(note.content)}
                  </div>
                )}
              </div>
              <div className="text-[10px] shrink-0 whitespace-nowrap" style={{ color: "var(--color-grey)" }}>
                {timeAgo(note.updated_at)}
              </div>
            </Link>
          ))
        )}

        <Link
          href="/notes"
          className="flex items-center px-[15px] py-[10px] w-full transition-colors"
          style={{
            borderTop: "0.5px dashed var(--color-border)",
            color: "var(--color-grey)",
            background: "transparent",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span className="mr-1.5 text-[12px]">+</span>
          <span className="text-[11px]">New note</span>
        </Link>
      </div>
    </div>
  );
}
