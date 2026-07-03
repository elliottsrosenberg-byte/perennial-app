"use client";

import { useRef, useState } from "react";
import type { BankAccount, BankTransaction } from "@/types/database";
import { Paperclip, Trash2 } from "lucide-react";
import Select from "@/components/ui/Select";
import Checkbox from "@/components/ui/Checkbox";
import DatePicker from "@/components/ui/DatePicker";
import Modal from "@/components/ui/Modal";
import { uploadReceipt } from "@/lib/uploads/receipt";
import { CANONICAL_CATEGORIES } from "./plaidCategoryDisplay";

interface Props {
  /** Today's date (YYYY-MM-DD). */
  today: string;
  /** Connected accounts — offered as "paid/received via" options. */
  accounts: BankAccount[];
  onClose: () => void;
  onCreated: (tx: BankTransaction) => void;
}

const METHOD_OPTIONS = [
  { value: "cash",  label: "Cash" },
  { value: "venmo", label: "Venmo" },
  { value: "card",  label: "Card" },
  { value: "other", label: "Other" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Uncategorized" },
  ...CANONICAL_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
];

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function ManualTransactionModal({ today, accounts, onClose, onCreated }: Props) {
  const [type, setType]               = useState<"debit" | "credit">("debit");
  const [name, setName]               = useState("");
  const [amount, setAmount]           = useState("");
  const [date, setDate]               = useState(today);
  const [category, setCategory]       = useState("");
  const [via, setVia]                 = useState("cash"); // "cash"|"venmo"|"card"|"other"|"acct:<id>"
  const [viaDetail, setViaDetail]     = useState("");
  const [billable, setBillable]       = useState(false);
  const [receiptUrl, setReceiptUrl]   = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isDebit = type === "debit";
  const isAccount = via.startsWith("acct:");

  const viaOptions = [
    ...accounts.map((a) => ({ value: `acct:${a.id}`, label: `${a.institution}${a.last_four ? ` ••${a.last_four}` : ""}` })),
    ...METHOD_OPTIONS,
  ];

  async function handleReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const up = await uploadReceipt(file);
      setReceiptUrl(up.url); setReceiptPath(up.path); setReceiptName(up.name);
    } catch {
      setError("Receipt upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(log: boolean) {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) { setError("Enter a name and a valid amount."); return; }
    setLoading(true); setError(null);
    const res = await fetch("/api/finance/banking/transactions/manual", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        type, amount: amt, name: name.trim(), date,
        category: category || null,
        bank_account_id: isAccount ? via.slice(5) : null,
        payment_method:  isAccount ? null : via,
        payment_detail:  isAccount ? null : (viaDetail.trim() || null),
        receipt_url:  receiptUrl,
        receipt_path: receiptPath,
        billable: isDebit ? billable : false,
        log: log && isDebit,
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

  const seg = (val: "debit" | "credit", label: string) => {
    const active = type === val;
    return (
      <button type="button" onClick={() => setType(val)}
        className="flex-1 py-2 text-[12px] font-medium transition-colors"
        style={{ background: active ? "var(--color-sage)" : "transparent", color: active ? "white" : "var(--color-grey)", border: "none", cursor: "pointer" }}>
        {label}
      </button>
    );
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title="Add transaction"
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Cancel</button>
          <button type="button" onClick={() => submit(false)}
            disabled={loading || !name.trim() || !amount}
            className="px-4 py-2 text-[13px] font-medium rounded-lg disabled:opacity-50"
            style={{ background: isDebit ? "var(--color-cream)" : "var(--color-sage)", color: isDebit ? "var(--color-charcoal)" : "white", border: isDebit ? "0.5px solid var(--color-border)" : "none" }}>
            {loading ? "Adding…" : "Add"}
          </button>
          {isDebit && (
            <button type="button" onClick={() => submit(true)}
              disabled={loading || !name.trim() || !amount}
              className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-sage)" }}>
              {loading ? "…" : "Add + Log"}
            </button>
          )}
        </>
      }
    >
        <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="px-5 py-4 space-y-4">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
            {seg("debit", "Money out (expense)")}
            <div style={{ width: "0.5px", background: "var(--color-border)" }} />
            {seg("credit", "Money in (payment)")}
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={isDebit ? "e.g. Lumber yard" : "e.g. Client deposit"}
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
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>
                {isDebit ? "Paid via" : "Received via"}
              </label>
              <Select value={via} onChange={setVia} options={viaOptions} />
            </div>
          </div>

          {/* Free-text detail for which card/account, when not a linked account. */}
          {!isAccount && (
            <input type="text" value={viaDetail} onChange={(e) => setViaDetail(e.target.value)}
              placeholder="Card / account details (optional) — e.g. Amex ••1234"
              className={inputCls} style={inputStyle} />
          )}

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

          {/* Billable — debits only. */}
          {isDebit && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox checked={billable} onChange={() => setBillable((v) => !v)} />
              <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>
                Billable to client
                <span className="ml-1.5 text-[11px]" style={{ color: "var(--color-grey)" }}>— can be added to an invoice</span>
              </span>
            </label>
          )}

          {/* Receipt */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Receipt</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              style={{ display: "none" }} onChange={handleReceipt} />
            {receiptUrl ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
                <Paperclip size={12} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
                <a href={receiptUrl} target="_blank" rel="noreferrer" className="flex-1 text-[12px] truncate"
                  style={{ color: "var(--color-sage)", textDecoration: "none" }}>{receiptName ?? "Receipt"}</a>
                <button type="button" onClick={() => { setReceiptUrl(null); setReceiptPath(null); setReceiptName(null); }}
                  style={{ color: "var(--color-grey)", border: "none", background: "transparent", cursor: "pointer" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors"
                style={{ border: "0.5px dashed var(--color-border)", color: "var(--color-grey)", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <Paperclip size={12} />
                {uploading ? "Uploading…" : "Attach receipt"}
              </button>
            )}
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>
    </Modal>
  );
}
