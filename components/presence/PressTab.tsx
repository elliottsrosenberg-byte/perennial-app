"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PressMention, PressType } from "@/types/database";
import { Plus, X, ExternalLink, Trash2, ChevronDown, Newspaper } from "lucide-react";

const TYPE_META: Record<PressType, { label: string; color: string; bg: string }> = {
  feature:   { label: "Feature",   color: "var(--color-sage)", bg: "rgba(155,163,122,0.14)" },
  interview: { label: "Interview", color: "#7f6f9c",           bg: "rgba(173,163,192,0.20)" },
  award:     { label: "Award",     color: "#a37f12",           bg: "rgba(232,197,71,0.18)" },
  roundup:   { label: "Round-up",  color: "#2563ab",           bg: "rgba(37,99,171,0.12)" },
  mention:   { label: "Mention",   color: "var(--color-grey)", bg: "rgba(31,33,26,0.06)" },
  other:     { label: "Other",     color: "var(--color-grey)", bg: "rgba(31,33,26,0.06)" },
};
const TYPE_ORDER: PressType[] = ["feature", "interview", "award", "roundup", "mention", "other"];

const cardStyle: React.CSSProperties = {
  background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
  borderRadius: 12, boxShadow: "0 2px 8px rgba(31,33,26,0.04)",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)",
};

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PressTab() {
  const [mentions, setMentions] = useState<PressMention[]>([]);
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("press_mentions")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (!cancelled) { setMentions((data as PressMention[]) ?? []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function remove(id: string) {
    setMentions((m) => m.filter((x) => x.id !== id));
    await createClient().from("press_mentions").delete().eq("id", id);
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 650, fontFamily: "var(--font-display)", color: "var(--color-charcoal)", margin: 0 }}>Press</h2>
          <p style={{ fontSize: 12, color: "var(--color-grey)", marginTop: 2 }}>
            Log your coverage and learn how to earn more. For active pitching, use the Outreach module.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5"
          style={{ padding: "8px 14px", fontSize: 12, fontWeight: 500, borderRadius: 999, border: "none", background: "var(--color-sage)", color: "white", cursor: "pointer", fontFamily: "inherit" }}>
          <Plus size={13} /> Log coverage
        </button>
      </div>

      {/* Summary chips */}
      {mentions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SummaryChip label="Total" value={mentions.length} />
          {TYPE_ORDER.filter((t) => mentions.some((m) => m.type === t)).map((t) => (
            <SummaryChip key={t} label={TYPE_META[t].label} value={mentions.filter((m) => m.type === t).length} color={TYPE_META[t].color} />
          ))}
        </div>
      )}

      {/* Coverage log */}
      <div style={cardStyle}>
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
          <span style={titleStyle}>Coverage log</span>
        </div>
        {loading ? (
          <p style={{ padding: "18px 16px", fontSize: 12, color: "var(--color-grey)" }}>Loading…</p>
        ) : mentions.length === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center" }}>
            <div className="flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, margin: "0 auto 12px", background: "var(--color-cream)", color: "var(--color-sage)" }}>
              <Newspaper size={20} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 4 }}>No coverage logged yet</p>
            <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 14px" }}>
              When a publication features your work, log it here to build a running record you can point clients and galleries to.
            </p>
            <button onClick={() => setAdding(true)}
              style={{ padding: "8px 16px", fontSize: 12, fontWeight: 500, borderRadius: 8, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-charcoal)", cursor: "pointer", fontFamily: "inherit" }}>
              Log your first mention
            </button>
          </div>
        ) : (
          mentions.map((m, i) => {
            const tm = TYPE_META[m.type] ?? TYPE_META.other;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i === 0 ? "none" : "0.5px solid var(--color-border)" }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999, background: tm.bg, color: tm.color, flexShrink: 0 }}>{tm.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.publication}
                  </div>
                  {m.title && <div style={{ fontSize: 11, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>}
                </div>
                {m.published_at && <span style={{ fontSize: 11, color: "var(--color-grey)", flexShrink: 0 }}>{fmtDate(m.published_at)}</span>}
                {m.url && (
                  <a href={m.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-sage)", flexShrink: 0, display: "flex" }} title="Open">
                    <ExternalLink size={13} />
                  </a>
                )}
                <button onClick={() => remove(m.id)} style={{ color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, display: "flex" }} title="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* PR Playbook */}
      <div>
        <span style={{ ...titleStyle, fontSize: 14 }}>PR Playbook</span>
        <p style={{ fontSize: 11.5, color: "var(--color-grey)", marginTop: 2, marginBottom: 12 }}>
          The essentials for earning press as an independent designer.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PLAYBOOK.map((p) => <PlaybookCard key={p.title} item={p} />)}
        </div>
      </div>

      {adding && (
        <LogCoverageModal
          onClose={() => setAdding(false)}
          onCreated={(row) => { setMentions((m) => [row, ...m]); setAdding(false); }}
        />
      )}
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--color-charcoal)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ fontSize: 11, color: "var(--color-grey)" }}>{label}</span>
    </div>
  );
}

// ── PR Playbook content ───────────────────────────────────────────────────────
interface Play { title: string; summary: string; points: string[]; }
const PLAYBOOK: Play[] = [
  {
    title: "Build a press kit that gets opened",
    summary: "A tight, downloadable kit a journalist can use without emailing you back.",
    points: [
      "A short bio (2–3 sentences) plus a longer 'about' paragraph.",
      "5–10 high-res images (300dpi), each captioned with title, materials, dimensions, and photo credit.",
      "A one-page fact sheet: what it is, materials, sizes, price, availability, where it's made.",
      "A high-res logo and a headshot.",
      "One easy contact line and a single Drive/Dropbox link to everything.",
    ],
  },
  {
    title: "Pitch like a human",
    summary: "Personal, specific, and easy to say yes to beats a mass blast every time.",
    points: [
      "Research the writer — reference a recent piece of theirs and why your work fits their beat.",
      "Subject line is concrete and visual: 'Hand-spun brass pendant, made in Brooklyn'.",
      "Lead with the hook in two sentences. Attach 1–2 images and link the press kit — don't make them ask.",
      "Timing: pitch print 6–8 weeks out, online a few days to a week ahead.",
      "Send one polite follow-up after ~5–7 days, then move on.",
    ],
  },
  {
    title: "Where to pitch, by discipline",
    summary: "Build a hit list of outlets that actually cover your kind of work.",
    points: [
      "Furniture / Lighting / Product: Dezeen, Sight Unseen, Design Milk, Wallpaper*, Core77, Dwell, Cool Hunting, Frame, Domus.",
      "Architecture & Interiors: Architectural Digest, Interior Design, Metropolis, ArchDaily, Sight Unseen.",
      "Fine Art: Hyperallergic, Artsy, Juxtapoz, Colossal.",
      "Always check the masthead for the right editor or section, and start with newsletters/blogs that move faster than print.",
    ],
  },
  {
    title: "Awards & fairs worth targeting",
    summary: "Recognition and showings that journalists and buyers actually watch.",
    points: [
      "Awards: ICFF Editors' Awards, Core77 Design Awards, Wallpaper* Design Awards, A' Design Award.",
      "Fairs: ICFF & NYCxDesign (New York), Salone del Mobile (Milan), Design Miami, 3daysofdesign (Copenhagen).",
      "Apply early — most have deadlines months ahead — and reuse your press kit for submissions.",
      "Log any win or showing here so it compounds into your story over time.",
    ],
  },
];

function PlaybookCard({ item }: { item: Play }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={cardStyle}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)" }}>{item.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--color-grey)", marginTop: 2 }}>{item.summary}</div>
        </div>
        <ChevronDown size={15} style={{ color: "var(--color-grey)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease", flexShrink: 0 }} />
      </button>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 16px 14px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
          {item.points.map((pt, i) => (
            <li key={i} style={{ display: "flex", gap: 9, fontSize: 12, color: "var(--color-charcoal)", lineHeight: 1.5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--color-sage)", marginTop: 6, flexShrink: 0 }} />
              <span>{pt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Log coverage modal ────────────────────────────────────────────────────────
function LogCoverageModal({ onClose, onCreated }: { onClose: () => void; onCreated: (row: PressMention) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [publication, setPublication] = useState("");
  const [title, setTitle]             = useState("");
  const [url, setUrl]                 = useState("");
  const [type, setType]               = useState<PressType>("feature");
  const [date, setDate]               = useState(today);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" } as const;

  async function save() {
    if (!publication.trim()) { setError("Add the publication name."); return; }
    setSaving(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setSaving(false); return; }
    const { data, error: err } = await supabase.from("press_mentions").insert({
      user_id: user.id,
      publication: publication.trim(),
      title: title.trim() || null,
      url: url.trim() || null,
      type,
      published_at: date || null,
    }).select("*").single();
    if (err || !data) { setError(err?.message ?? "Couldn't save."); setSaving(false); return; }
    onCreated(data as PressMention);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Log coverage</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "var(--color-grey)" }}><X size={14} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Publication *</label>
            <input value={publication} onChange={(e) => setPublication(e.target.value)} placeholder="e.g. Dezeen" className={inputCls} style={inputStyle} autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Headline</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title of the piece" className={inputCls} style={inputStyle} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as PressType)} className={inputCls} style={{ ...inputStyle, appearance: "auto" }}>
                {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={{ ...inputStyle, appearance: "auto" }} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Link</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputCls} style={inputStyle} />
          </div>
          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button onClick={onClose} className="px-4 py-2 text-[13px] rounded-lg" style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}>Cancel</button>
          <button onClick={save} disabled={saving || !publication.trim()} className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50" style={{ background: "var(--color-sage)" }}>
            {saving ? "Saving…" : "Log coverage"}
          </button>
        </div>
      </div>
    </div>
  );
}
