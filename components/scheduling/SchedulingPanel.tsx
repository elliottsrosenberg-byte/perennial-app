"use client";

// Calendar left-rail "Scheduling" section. Lists the user's booking links with
// a copy-link affordance and booking count, plus the two create CTAs. Editing
// happens in SchedulingLinkModal. Mirrors the Notion Calendar scheduling pane.

import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Repeat, Zap } from "lucide-react";
import SchedulingLinkModal from "./SchedulingLinkModal";
import type { SchedulingLink, SchedulingLinkKind } from "@/types/database";

interface LinkRow extends SchedulingLink { booking_count?: number }
interface CalOpt { id: string; name: string; provider: string; account_email: string | null; }

interface Props {
  /** Enter the in-grid compose flow (drag windows) for a new link. When
   *  omitted, the create buttons fall back to the modal editor. */
  onCompose?: (kind: SchedulingLinkKind) => void;
}

export default function SchedulingPanel({ onCompose }: Props) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [calendars, setCalendars] = useState<CalOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ link: LinkRow | null; kind: SchedulingLinkKind } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lr, cr] = await Promise.all([
        fetch("/api/scheduling/links").then((r) => r.json()),
        fetch("/api/integrations/calendar/calendars").then((r) => r.json()).catch(() => ({ calendars: [] })),
      ]);
      setLinks(lr.links ?? []);
      setCalendars(((cr.calendars ?? []) as (CalOpt & { writable: boolean })[]).filter((c) => c.writable));
    } catch { /* leave empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // The in-grid compose flow dispatches this when a link is created so the
  // list refreshes without a full remount.
  useEffect(() => {
    const h = () => load();
    window.addEventListener("scheduling:refresh", h);
    return () => window.removeEventListener("scheduling:refresh", h);
  }, [load]);

  const startCreate = (kind: SchedulingLinkKind) =>
    onCompose ? onCompose(kind) : setEditing({ link: null, kind });

  function copyLink(slug: string) {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500);
  }

  const recurring = links.filter((l) => l.kind === "recurring");
  const oneOff = links.filter((l) => l.kind === "one_off");

  return (
    <div style={{ padding: "10px 0 4px" }}>
      <div style={{ padding: "0 14px 8px" }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-grey)" }}>
          Scheduling
        </span>
      </div>

      <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
        <button onClick={() => startCreate("recurring")}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium text-white"
          style={{ background: "var(--color-sage)" }}>
          <Repeat size={13} /> Create recurring link
        </button>
        <button onClick={() => startCreate("one_off")}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-medium"
          style={{ border: "1px solid var(--color-border-strong)", color: "var(--color-text-secondary)" }}>
          <Zap size={13} /> Create one-off link
        </button>
      </div>

      {loading ? (
        <p style={{ padding: "4px 14px", fontSize: 11.5, color: "var(--color-text-tertiary)" }}>Loading…</p>
      ) : (
        <>
          {recurring.length > 0 && <Group title="Recurring links" links={recurring} onOpen={(l) => setEditing({ link: l, kind: l.kind })} onCopy={copyLink} copied={copied} />}
          {oneOff.length > 0 && <Group title="One-off links" links={oneOff} onOpen={(l) => setEditing({ link: l, kind: l.kind })} onCopy={copyLink} copied={copied} />}
          {links.length === 0 && (
            <p style={{ padding: "2px 14px 6px", fontSize: 11.5, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
              Create a link to let people book time with you. Availability comes from your connected calendars.
            </p>
          )}
        </>
      )}

      {editing && (
        <SchedulingLinkModal
          link={editing.link}
          kind={editing.kind}
          calendars={calendars}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setLinks((prev) => {
              const exists = prev.some((l) => l.id === saved.id);
              return exists ? prev.map((l) => (l.id === saved.id ? { ...l, ...saved } : l)) : [{ ...saved, booking_count: 0 }, ...prev];
            });
            setEditing(null);
          }}
          onDeleted={(id) => { setLinks((prev) => prev.filter((l) => l.id !== id)); setEditing(null); }}
        />
      )}
    </div>
  );
}

function Group({ title, links, onOpen, onCopy, copied }: {
  title: string; links: LinkRow[]; onOpen: (l: LinkRow) => void;
  onCopy: (slug: string) => void; copied: string | null;
}) {
  return (
    <div style={{ paddingBottom: 4 }}>
      <p style={{ padding: "4px 14px 2px", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)" }}>{title}</p>
      {links.map((l) => (
        <div key={l.id}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 14px", cursor: "pointer", borderRadius: 6 }}
          onClick={() => onOpen(l)}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: l.active ? "var(--color-sage)" : "var(--color-border-strong)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)" }}>
              {l.duration_minutes} min{!l.active ? " · inactive" : ""}{l.booking_count ? ` · ${l.booking_count} booked` : ""}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(l.slug); }}
            title="Copy booking link"
            style={{ padding: 4, color: copied === l.slug ? "var(--color-sage)" : "var(--color-text-tertiary)", flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = copied === l.slug ? "var(--color-sage)" : "var(--color-text-tertiary)")}>
            {copied === l.slug ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
      ))}
    </div>
  );
}
