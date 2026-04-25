"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Expense, ExpenseCategory, Project } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onClose: () => void;
  onCreated: (expense: Expense) => void;
}

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "materials",  label: "Materials"  },
  { value: "travel",     label: "Travel"     },
  { value: "production", label: "Production" },
  { value: "software",   label: "Software"   },
  { value: "other",      label: "Other"      },
];

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function AddExpenseModal({ projects, onClose, onCreated }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [description, setDescription] = useState("");
  const [category, setCategory]       = useState<ExpenseCategory>("materials");
  const [amount, setAmount]           = useState("");
  const [date, setDate]               = useState(today);
  const [projectId, setProjectId]     = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!description.trim() || isNaN(amt) || amt <= 0) { setError("Enter a description and valid amount."); return; }
    setLoading(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }
    const { data, error: dbErr } = await supabase
      .from("expenses")
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        description: description.trim(),
        category,
        amount: amt,
        date,
      })
      .select("*, project:projects(id, title, type, rate)")
      .single();
    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    onCreated(data as Expense);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Add expense</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Description *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Walnut samples" className={inputCls} style={inputStyle} autoFocus />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls} style={inputStyle}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "var(--color-grey)" }}>$</span>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-6`} style={inputStyle} />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">None (unattached)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Cancel</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || !description.trim() || !amount}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-charcoal)" }}>
            {loading ? "Saving…" : "Add expense"}
          </button>
        </div>
      </div>
    </div>
  );
}
