"use client";

// Lightweight CSS animations for the Finance intro modal slides. Same scale
// and visual language as Projects/Contacts/Outreach so the walkthroughs feel
// like one family. Each loop demonstrates a distinct affordance of the
// Finance module: live timer ticking, expenses landing into a project,
// time/expenses pulling into an invoice as line items, and a bank account
// connecting via Teller.

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ─── Slide 1: live timer ticking on a project ──────────────────────────────
export function TimerTick() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ft-pulse  { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: 0.5; } }
        @keyframes ft-fill   { 0% { width: 0; } 100% { width: 100%; } }
        @keyframes ft-tick   { 0% { content: "0:01:42"; } 25% { content: "0:01:47"; } 50% { content: "0:01:52"; } 75% { content: "0:01:57"; } 100% { content: "0:02:02"; } }

        .ft-dot        { animation: ft-pulse 1.2s ease-in-out infinite; }
        .ft-bar        { animation: ft-fill  5s   linear         infinite; }
        .ft-ticker::after { content: "0:01:42"; animation: ft-tick 5s steps(5,end) infinite; }
      `}</style>

      <div style={{
        width: 280, padding: "14px 16px",
        background: "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 2px 8px rgba(31,33,26,0.05)",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ft-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-sage)" }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-sage)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Running</span>
          <span style={{ marginLeft: "auto", fontSize: 17, fontWeight: 700, color: "var(--color-sage)", fontVariantNumeric: "tabular-nums" }} className="ft-ticker" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)" }}>Wireframing nav overhaul</span>
          <span style={{ fontSize: 9, color: "var(--color-grey)" }}>Walnut credenza · billable</span>
        </div>
        <div style={{ height: 4, background: "var(--color-cream)", borderRadius: 2, overflow: "hidden" }}>
          <div className="ft-bar" style={{ height: "100%", background: "var(--color-sage)", borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: an expense lands and attaches to a project ────────────────────
export function ExpenseLand() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ft-drop    { 0% { opacity: 0; transform: translateY(-14px); } 40%,100% { opacity: 1; transform: translateY(0); } }
        @keyframes ft-pop     { 0%,30% { opacity: 0; transform: scale(0.7); } 60%,100% { opacity: 1; transform: scale(1); } }
        @keyframes ft-shimmer { 0%,40% { background: var(--color-cream); } 60%,100% { background: rgba(61,107,79,0.12); } }

        .ft-row-0 { animation: ft-drop    0.6s ease-out 0.0s both; }
        .ft-row-1 { animation: ft-drop    0.6s ease-out 0.3s both; }
        .ft-row-2 { animation: ft-drop    0.6s ease-out 0.6s both; }
        .ft-chip  { animation: ft-pop     0.5s ease-out 1.0s both; }
        .ft-total { animation: ft-shimmer 1.4s ease-out 1.0s both; }
      `}</style>

      <div style={{
        width: 280,
        background: "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        {[
          { initial: "M", color: "#3d6b4f", bg: "rgba(61,107,79,0.1)", label: "Walnut samples", project: "Credenza", amount: "$148" },
          { initial: "T", color: "#2563ab", bg: "rgba(37,99,171,0.1)", label: "Studio drive",   project: "Credenza", amount: "$32"  },
          { initial: "S", color: "#6d4fa3", bg: "rgba(109,79,163,0.1)", label: "Figma seat",   project: "—",         amount: "$15"  },
        ].map((e, i) => (
          <div key={i} className={`ft-row-${i}`} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px",
            borderBottom: "0.5px solid var(--color-border)",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: e.bg, color: e.color,
              fontSize: 9, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{e.initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-charcoal)" }}>{e.label}</p>
              <p style={{ fontSize: 8, color: e.project === "—" ? "#b8860b" : "var(--color-grey)" }}>
                {e.project === "—" ? "Unattached" : e.project}
              </p>
            </div>
            {i === 0 && (
              <span className="ft-chip" style={{
                fontSize: 8, fontWeight: 700,
                background: "rgba(61,107,79,0.12)", color: "var(--color-sage)",
                padding: "1px 5px", borderRadius: 3,
              }}>+CREDENZA</span>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)", fontVariantNumeric: "tabular-nums" }}>{e.amount}</span>
          </div>
        ))}
        <div className="ft-total" style={{
          display: "flex", alignItems: "center", padding: "8px 12px",
          background: "var(--color-cream)",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-grey)", textTransform: "uppercase", letterSpacing: "0.05em", flex: 1 }}>By project · Credenza</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-charcoal)", fontVariantNumeric: "tabular-nums" }}>$180</span>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: time + expenses pull into an invoice as line items ────────────
export function InvoicePull() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ft-slide  { 0%,30% { opacity: 0; transform: translateX(20px); } 60%,100% { opacity: 1; transform: translateX(0); } }
        @keyframes ft-glow   { 0%,40% { box-shadow: 0 0 0 0 rgba(155,163,122,0); } 60% { box-shadow: 0 0 0 4px rgba(155,163,122,0.18); } 100% { box-shadow: 0 0 0 0 rgba(155,163,122,0); } }
        @keyframes ft-arrow  { 0%,30% { opacity: 0; transform: translateX(-4px); } 50% { opacity: 1; transform: translateX(0); } 80%,100% { opacity: 0; transform: translateX(4px); } }
        @keyframes ft-total  { 0%,55% { opacity: 0; transform: translateY(4px); } 75%,100% { opacity: 1; transform: translateY(0); } }

        .ft-li-0 { animation: ft-slide 1.2s ease-out 0.2s both; }
        .ft-li-1 { animation: ft-slide 1.2s ease-out 0.6s both; }
        .ft-li-2 { animation: ft-slide 1.2s ease-out 1.0s both; }
        .ft-pull { animation: ft-glow  2.4s ease-in-out 0.2s infinite; }
        .ft-arr  { animation: ft-arrow 2.4s ease-in-out 0.2s infinite; }
        .ft-tot  { animation: ft-total 2.4s ease-in-out 0.2s infinite; }
      `}</style>

      <div style={{
        width: 290,
        background: "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
          borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-off-white)",
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-grey)", textTransform: "uppercase", letterSpacing: "0.05em", flex: 1 }}>Invoice #007 · Hawthorn Gallery</span>
          <span className="ft-pull" style={{ fontSize: 8, fontWeight: 700, color: "var(--color-charcoal)", padding: "2px 6px", borderRadius: 4, border: "0.5px solid var(--color-border)" }}>
            <span className="ft-arr" style={{ display: "inline-block", marginRight: 3 }}>↓</span>
            Pull
          </span>
        </div>
        {[
          { desc: "Wireframing nav overhaul", source: "TIME", qty: "8.5", amt: "$680" },
          { desc: "Design review · sketches",  source: "TIME", qty: "4.0", amt: "$320" },
          { desc: "Walnut samples",            source: "EXP",  qty: "1",   amt: "$148" },
        ].map((li, i) => (
          <div key={i} className={`ft-li-${i}`} style={{
            display: "grid", gridTemplateColumns: "1fr 28px 36px 48px", gap: 8,
            alignItems: "center", padding: "6px 12px",
            borderBottom: "0.5px solid var(--color-border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 10, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.desc}</span>
              <span style={{
                fontSize: 7, fontWeight: 700,
                padding: "1px 3px", borderRadius: 2,
                background: li.source === "TIME" ? "rgba(61,107,79,0.12)" : "rgba(184,134,11,0.12)",
                color:      li.source === "TIME" ? "var(--color-sage)"    : "#b8860b",
              }}>{li.source}</span>
            </div>
            <span style={{ fontSize: 9, color: "var(--color-grey)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{li.qty}</span>
            <span style={{ fontSize: 9, color: "var(--color-grey)", textAlign: "right" }}>—</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-charcoal)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{li.amt}</span>
          </div>
        ))}
        <div className="ft-tot" style={{
          display: "flex", alignItems: "center", padding: "8px 12px",
          background: "var(--color-cream)",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-charcoal)", flex: 1 }}>Total</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-charcoal)", fontVariantNumeric: "tabular-nums" }}>$1,148</span>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: bank account connects, balance + a few transactions land ─────
export function BankConnect() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ft-handshake { 0% { opacity: 0; transform: scale(0.85); } 30% { opacity: 1; transform: scale(1.02); } 50%,100% { opacity: 1; transform: scale(1); } }
        @keyframes ft-bal-in    { 0%,40% { opacity: 0; transform: translateY(6px); } 60%,100% { opacity: 1; transform: translateY(0); } }
        @keyframes ft-tx        { 0%,60% { opacity: 0; transform: translateX(-8px); } 80%,100% { opacity: 1; transform: translateX(0); } }

        .ft-hs   { animation: ft-handshake 0.8s ease-out 0.0s both; }
        .ft-bal  { animation: ft-bal-in    0.9s ease-out 0.6s both; }
        .ft-tx-0 { animation: ft-tx        0.6s ease-out 1.1s both; }
        .ft-tx-1 { animation: ft-tx        0.6s ease-out 1.4s both; }
      `}</style>

      <div style={{
        width: 280,
        background: "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        overflow: "hidden",
      }}>
        <div className="ft-hs" style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px",
          borderBottom: "0.5px solid var(--color-border)",
        }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(37,99,171,0.10)", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563ab" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)" }}>Chase · Studio checking</p>
            <p style={{ fontSize: 9, color: "var(--color-grey)" }}>••••4291 · Updated just now</p>
          </div>
          <span className="ft-bal" style={{ fontSize: 12, fontWeight: 700, color: "var(--color-charcoal)", fontVariantNumeric: "tabular-nums" }}>$12,408.50</span>
        </div>

        {[
          { desc: "Hawthorn Gallery", date: "May 18", amt: "+$2,400.00", credit: true },
          { desc: "McMaster-Carr",    date: "May 17", amt: "−$87.42",    credit: false },
        ].map((tx, i) => (
          <div key={i} className={`ft-tx-${i}`} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 12px",
            borderBottom: i === 0 ? "0.5px solid var(--color-border)" : "none",
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: tx.credit ? "var(--color-sage)" : "rgba(31,33,26,0.25)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-charcoal)" }}>{tx.desc}</p>
              <p style={{ fontSize: 8, color: "var(--color-grey)" }}>{tx.date}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: tx.credit ? "var(--color-sage)" : "var(--color-charcoal)", fontVariantNumeric: "tabular-nums" }}>{tx.amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
