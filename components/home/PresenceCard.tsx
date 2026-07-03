import VisitButton from "@/components/ui/VisitButton";

const ROWS = [
  {
    label: "Website",
    value: "1,240 visits · ↑18%",
    iconBg: "rgba(var(--color-blue-rgb),0.12)",
    iconColor: "var(--color-blue)",
    icon: "🌐",
  },
  {
    label: "Socials",
    value: "8,400 reach · 4.2% eng.",
    iconBg: "rgba(var(--color-purple-rgb),0.12)",
    iconColor: "var(--color-purple)",
    icon: "📸",
  },
  {
    label: "Newsletter",
    value: "47% open rate · 312 subs",
    iconBg: "rgba(var(--color-red-rgb),0.12)",
    iconColor: "var(--color-red-orange)",
    icon: "✉️",
  },
  {
    label: "Next event",
    value: "ICFF in 34 days",
    iconBg: "rgba(var(--color-teal-rgb),0.12)",
    iconColor: "var(--color-teal)",
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
        <VisitButton href="/presence" />
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
            <span style={{ color: "var(--color-text-secondary)" }}>{row.label}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{row.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
