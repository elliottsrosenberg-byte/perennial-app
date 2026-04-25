import Link from "next/link";

const ROWS = [
  {
    label: "Website",
    value: "1,240 visits · ↑18%",
    iconBg: "rgba(37,99,171,0.12)",
    iconColor: "#2563ab",
    icon: "🌐",
  },
  {
    label: "Socials",
    value: "8,400 reach · 4.2% eng.",
    iconBg: "rgba(109,79,163,0.12)",
    iconColor: "#6d4fa3",
    icon: "📸",
  },
  {
    label: "Newsletter",
    value: "47% open rate · 312 subs",
    iconBg: "rgba(220,62,13,0.12)",
    iconColor: "var(--color-red-orange)",
    icon: "✉️",
  },
  {
    label: "Next event",
    value: "ICFF in 34 days",
    iconBg: "rgba(20,140,140,0.12)",
    iconColor: "#148c8c",
    icon: "📅",
  },
];

export default function PresenceCard() {
  const now = new Date();
  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()];

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
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Presence</span>
        <span
          className="text-[10px] px-[7px] py-[1px] rounded-full"
          style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
        >
          {month}
        </span>
        <div className="flex-1" />
        <Link href="/presence" className="text-[11px] hover:underline" style={{ color: "#2563ab" }}>
          View all →
        </Link>
      </div>

      {ROWS.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-[9px] px-[14px] py-[7px] text-[11px]"
          style={{ borderBottom: i < ROWS.length - 1 ? "0.5px solid var(--color-border)" : "none" }}
        >
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0"
            style={{ background: row.iconBg, color: row.iconColor }}
          >
            {row.icon}
          </div>
          <div className="flex flex-col gap-[1px]">
            <span style={{ color: "#6b6860" }}>{row.label}</span>
            <span style={{ color: "#6b6860" }}>{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
