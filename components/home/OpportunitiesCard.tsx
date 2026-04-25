import Link from "next/link";

const OPPS = [
  {
    title: "Design Miami application",
    meta: "Deadline Apr 28 · 13 days",
    color: "var(--color-red-orange)",
  },
  {
    title: "ICFF 2026",
    meta: "May 19–23 · Exhibiting",
    color: "var(--color-sage)",
  },
];

export default function OpportunitiesCard() {
  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px]"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Opportunities</span>
        <span
          className="text-[10px] px-[7px] py-[1px] rounded-full"
          style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
        >
          2 active
        </span>
        <div className="flex-1" />
        <Link href="/calendar" className="text-[11px] hover:underline" style={{ color: "#2563ab" }}>
          View all →
        </Link>
      </div>

      {OPPS.map((opp, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-[14px] py-[9px]"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}
        >
          <div
            className="w-3.5 h-3.5 rounded-[3px] shrink-0 mt-[2px]"
            style={{ background: opp.color }}
          />
          <div className="flex flex-col gap-[2px]">
            <span className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{opp.title}</span>
            <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{opp.meta}</span>
          </div>
        </div>
      ))}

      {/* Ash suggestion */}
      <div
        className="flex items-center justify-between px-[14px] py-[9px] text-[11px]"
        style={{
          background: "rgba(155,163,122,0.07)",
          borderTop: "0.5px solid rgba(155,163,122,0.18)",
          color: "#6b6860",
        }}
      >
        <span>Ash: Want me to draft the Design Miami application?</span>
        <span className="ml-2 cursor-pointer hover:underline shrink-0" style={{ color: "#2563ab" }}>Draft →</span>
      </div>
    </div>
  );
}
