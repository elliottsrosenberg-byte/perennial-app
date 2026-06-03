"use client";

import { useState } from "react";
import type { BankTransaction } from "@/types/database";
import { X } from "lucide-react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import { CANONICAL_CATEGORIES } from "./plaidCategoryDisplay";

interface Props {
  /** Today's date (YYYY-MM-DD) — passed in so the component stays free of
   *  the disallowed argless `new Date()` in some runtimes. */
  today: string;
  onClose: () => void;
  onCreated: (tx: BankTransaction) => void;
}

const PAYMENT_METHODS = [
  { value: "cash",  label: "Cash" },
  { value: "venmo", label: "Venmo" },
  { value: "card",  label: "Card" },
  { value: "bank",  label: "Bank account" },
  { value: "other", label: "Other" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Uncategorized" },
  ...CANONICAL_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
];

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function ManualTransactionModal({ today, onClose, onCreated }: Props) {
  const [type, setType]               = useState<"debit" | "credit">("debit");
  const [name, setName]               = useState("");
  const [amount, setAmount]           = useState("");
  const [date, setDate]               = useState(today);
  const [category, setCategory]       = useState("");
  const [paymentMethod, setPayment]   = useState("cash");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) { setError("Enter a name and a valid amount."); return; }
    setLoading(true); setError(null);
    const res = await fetch("/api/finance/banking/transactions/manual", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        type, amount: amt, name: name.trim(), date,
        category: category || null,
        payment_method: paymentMethod || null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.error ?? `Failed (HTTP ${res.status})`);
      setLoading(false);
      return;
    }
    const { transaction } = await res.json() as { transaction: BankTransaction };
    onCreated(transaction);
    onClose();
  }

  // Segmented debit/credit toggle.
  const seg = (val: "debit" | "credit", label: string) => {
    const active = type === val;
    return (
      <button type="button" onClick={() => setType(val)}
        className="flex-1 py-2 text-[12px] font-medium transition-colors"
        style={{
          background: active ? "var(--color-sage)" : "transparent",
          color:      active ? "white" : "var(--color-grey)",
          border:     "none", cursor: "pointer",
        }}>
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* overflow visible so the date picker dropdown isn't clipped */}
      <div className="w-full max-w-sm rounded-2xl shadow-2xl"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Add transaction</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Debit / credit */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
            {seg("debit", "Money out (expense)")}
            <div style={{ width: "0.5px", background: "var(--color-border)" }} />
            {seg("credit", "Money in (payment)")}
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={type === "debit" ? "e.g. Lumber yard (cash)" : "e.g. Client deposit (Venmo)"}
              className={inputCls} style={inputStyle} autoFocus />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "var(--color-grey)" }}>$</span>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00" className={`${inputCls} pl-6`} style={inputStyle} />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Paid via</label>
              <Select value={paymentMethod} onChange={setPayment} options={PAYMENT_METHODS} />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Date</label>
              <DatePicker
                value={date ? new Date(date + "T12:00:00") : null}
                onChange={(d) => {
                  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                  setDate(`${y}-${m}-${day}`);
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Category</label>
              <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} placeholder="Uncategorized" />
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
            disabled={loading || !name.trim() || !amount}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}>
            {loading ? "Adding…" : "Add transaction"}
          </button>
        </div>
      </div>
    </div>
  );
}
