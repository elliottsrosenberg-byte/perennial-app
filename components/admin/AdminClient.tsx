"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Opportunity } from "@/types/database";
import { Plus, X, Pencil, Eye, EyeOff, Archive, Check, ExternalLink } from "lucide-react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

interface Suggestion {
  id: string; title: string; category: string | null; event_type: string | null;
  start_date: string | null; location: string | null; website_url: string | null;
  notes: string | null; status: string; created_at: string;
}

const CATS = ["fair", "openCall", "award", "grant", "residency", "festival"];
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  published: { bg: "rgba(155,163,122,0.16)", fg: "var(--color-sage)" },
  draft:     { bg: "rgba(232,197,71,0.18)",  fg: "#a37f12" },
  archived:  { bg: "rgba(31,33,26,0.07)",    fg: "var(--color-grey)" },
};

const card: React.CSSProperties = { background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 12 };
const titleFont: React.CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--color-charcoal)" };

export default function AdminClient() {
  const [tab, setTab] = useState<"listings" | "suggestions">("listings");
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [editing, setEditing] = useState<Opportunity | "new" | null>(null);

  async function load() {
    const supabase = createClient();
    const [{ data: o }, { data: s }] = await Promise.all([
      supabase.from("opportunities").select("*").order("updated_at", { ascending: false }),
      supabase.from("opportunity_suggestions").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setOpps((o as Opportunity[]) ?? []);
    setSuggestions((s as Suggestion[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveOpp(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) { setEditing(null); load(); }
    return res.ok;
  }
  async function quickStatus(o: Opportunity, status: string) {
    await saveOpp({ id: o.id, title: o.title, status });
  }
  async function actSuggestion(id: string, action: "promote" | "dismiss") {
    setSuggestions((s) => s.filter((x) => x.id !== id));
    await fetch("/api/admin/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    if (action === "promote") load();
  }

  const filtered = useMemo(
    () => opps.filter((o) => statusFilter === "all" || o.status === statusFilter),
    [opps, statusFilter],
  );
  const counts = useMemo(() => ({
    all: opps.length,
    published: opps.filter((o) => o.status === "published").length,
    draft: opps.filter((o) => o.status === "draft").length,
    archived: opps.filter((o) => o.status === "archived").length,
  }), [opps]);

  return (
    <div className="flex-1 overflow-y-auto" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 14px", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ ...titleFont, fontSize: 20, margin: 0 }}>Curate</h1>
          <p style={{ fontSize: 12, color: "var(--color-grey)", marginTop: 2 }}>
            Review suggestions, manage the opportunities feed, and add listings. The monitoring routine writes here too.
          </p>
        </div>
        {tab === "listings" && (
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5"
            style={{ padding: "8px 14px", fontSize: 12, fontWeight: 500, borderRadius: 999, border: "none", background: "var(--color-sage)", color: "white", cursor: "pointer", fontFamily: "inherit" }}>
            <Plus size={13} /> Add listing
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "10px 24px 0", background: "var(--color-off-white)", borderBottom: "0.5px solid var(--color-border)" }}>
        {(["listings", "suggestions"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 14px", fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? "var(--color-charcoal)" : "var(--color-grey)", background: "none", border: "none", borderBottom: tab === t ? "2px solid var(--color-sage)" : "2px solid transparent", cursor: "pointer", fontFamily: "inherit" }}>
            {t === "listings" ? `Listings ${opps.length}` : `Suggestions ${suggestions.length}`}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 24px", flex: 1 }}>
        {loading ? (
          <p style={{ fontSize: 12, color: "var(--color-grey)" }}>Loading…</p>
        ) : tab === "listings" ? (
          <>
            {/* status filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {(["all", "published", "draft", "archived"] as const).map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  style={{ padding: "4px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer", border: "none", textTransform: "capitalize",
                    background: statusFilter === s ? "var(--color-charcoal)" : "rgba(31,33,26,0.06)",
                    color: statusFilter === s ? "white" : "var(--color-grey)", fontWeight: statusFilter === s ? 600 : 400, fontFamily: "inherit" }}>
                  {s} {counts[s]}
                </button>
              ))}
            </div>
            <div style={{ ...card, overflow: "hidden" }}>
              {filtered.length === 0 ? (
                <p style={{ padding: "20px 16px", fontSize: 12, color: "var(--color-grey)" }}>No listings in this view.</p>
              ) : filtered.map((o, i) => {
                const sc = STATUS_COLORS[o.status] ?? STATUS_COLORS.draft;
                const dateLabel = o.application_deadline ? `Deadline ${o.application_deadline}` : o.start_date ? o.start_date : "—";
                return (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: i === 0 ? "none" : "0.5px solid var(--color-border)" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999, background: sc.bg, color: sc.fg, flexShrink: 0 }}>{o.status}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</div>
                      <div style={{ fontSize: 11, color: "var(--color-grey)" }}>{o.category} · {dateLabel}{o.source ? ` · ${o.source}` : ""}</div>
                    </div>
                    {o.website_url && <a href={o.website_url} target="_blank" rel="noreferrer" style={{ color: "var(--color-sage)", flexShrink: 0, display: "flex" }}><ExternalLink size={13} /></a>}
                    {o.status !== "published"
                      ? <button title="Publish" onClick={() => quickStatus(o, "published")} style={iconBtn}><Eye size={14} /></button>
                      : <button title="Unpublish (draft)" onClick={() => quickStatus(o, "draft")} style={iconBtn}><EyeOff size={14} /></button>}
                    <button title="Edit" onClick={() => setEditing(o)} style={iconBtn}><Pencil size={13} /></button>
                    {o.status !== "archived" && <button title="Archive" onClick={() => quickStatus(o, "archived")} style={iconBtn}><Archive size={13} /></button>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ ...card, overflow: "hidden" }}>
            {suggestions.length === 0 ? (
              <p style={{ padding: "20px 16px", fontSize: 12, color: "var(--color-grey)" }}>No pending suggestions.</p>
            ) : suggestions.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i === 0 ? "none" : "0.5px solid var(--color-border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)" }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: "var(--color-grey)" }}>{[s.category, s.location, s.start_date].filter(Boolean).join(" · ") || "—"}</div>
                  {s.notes && <div style={{ fontSize: 11, color: "var(--color-grey)", marginTop: 2 }}>{s.notes}</div>}
                </div>
                {s.website_url && <a href={s.website_url} target="_blank" rel="noreferrer" style={{ color: "var(--color-sage)", flexShrink: 0, display: "flex" }}><ExternalLink size={13} /></a>}
                <button onClick={() => actSuggestion(s.id, "promote")} className="flex items-center gap-1"
                  style={{ padding: "5px 11px", fontSize: 11, fontWeight: 500, borderRadius: 999, border: "none", background: "var(--color-sage)", color: "white", cursor: "pointer", fontFamily: "inherit" }}>
                  <Check size={12} /> Add to feed
                </button>
                <button onClick={() => actSuggestion(s.id, "dismiss")} style={{ padding: "5px 10px", fontSize: 11, borderRadius: 999, border: "0.5px solid var(--color-border)", background: "transparent", color: "var(--color-grey)", cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && <EditModal opp={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={saveOpp} />}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--color-grey)", cursor: "pointer", display: "flex", flexShrink: 0, padding: 2 };

function EditModal({ opp, onClose, onSave }: { opp: Opportunity | null; onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<boolean> }) {
  const [f, setF] = useState({
    title: opp?.title ?? "", category: opp?.category ?? "fair", event_type: opp?.event_type ?? "Event",
    start_date: opp?.start_date ?? "", end_date: opp?.end_date ?? "", application_deadline: opp?.application_deadline ?? "",
    location: opp?.location ?? "", website_url: opp?.website_url ?? "", registration_url: opp?.registration_url ?? "",
    about: opp?.about ?? "", status: opp?.status ?? "published",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const fmtDate = (d: Date) => {
    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" } as const;

  async function submit() {
    if (!f.title.trim()) return;
    setSaving(true);
    const ok = await onSave({ ...(opp ? { id: opp.id } : {}), ...f });
    if (!ok) setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(31,33,26,0.5)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>{opp ? "Edit listing" : "Add listing"}</h2>
          <button onClick={onClose} style={{ ...iconBtn }}><X size={15} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Title *"><input value={f.title} onChange={(e) => set("title", e.target.value)} className={inputCls} style={inputStyle} autoFocus /></Field>
          <div className="flex gap-3">
            <Field label="Category" flex><Select value={f.category} onChange={(v) => set("category", v)} options={CATS.map((c) => ({ value: c, label: c }))} /></Field>
            <Field label="Type" flex><input value={f.event_type} onChange={(e) => set("event_type", e.target.value)} className={inputCls} style={inputStyle} /></Field>
          </div>
          <div className="flex gap-3">
            <Field label="Start" flex><DatePicker value={f.start_date ? new Date(f.start_date + "T12:00:00") : null} onChange={(d) => set("start_date", fmtDate(d))} /></Field>
            <Field label="End" flex><DatePicker value={f.end_date ? new Date(f.end_date + "T12:00:00") : null} onChange={(d) => set("end_date", fmtDate(d))} /></Field>
          </div>
          <Field label="Application deadline"><DatePicker value={f.application_deadline ? new Date(f.application_deadline + "T12:00:00") : null} onChange={(d) => set("application_deadline", fmtDate(d))} /></Field>
          <Field label="Location"><input value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} className={inputCls} style={inputStyle} /></Field>
          <Field label="Website"><input value={f.website_url ?? ""} onChange={(e) => set("website_url", e.target.value)} placeholder="https://…" className={inputCls} style={inputStyle} /></Field>
          <Field label="Registration / apply link"><input value={f.registration_url ?? ""} onChange={(e) => set("registration_url", e.target.value)} placeholder="https://…" className={inputCls} style={inputStyle} /></Field>
          <Field label="About"><textarea value={f.about ?? ""} onChange={(e) => set("about", e.target.value)} rows={3} className={`${inputCls} resize-none`} style={inputStyle} /></Field>
          <Field label="Status"><Select value={f.status} onChange={(v) => set("status", v)} options={[{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }]} /></Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button onClick={onClose} className="px-4 py-2 text-[13px] rounded-lg" style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}>Cancel</button>
          <button onClick={submit} disabled={saving || !f.title.trim()} className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50" style={{ background: "var(--color-sage)" }}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={flex ? { flex: 1 } : undefined}>
      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>{label}</label>
      {children}
    </div>
  );
}
