export default function ComingSoonOverlay({
  module,
  description,
}: {
  module: string;
  description: string;
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center"
      style={{ background: "rgba(249,250,244,0.83)", backdropFilter: "blur(5px)" }}
    >
      <div
        className="flex flex-col items-center text-center rounded-2xl px-10 py-9"
        style={{
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          boxShadow: "0 4px 28px rgba(0,0,0,0.09)",
          maxWidth: 340,
        }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-5"
          style={{ background: "rgba(155,163,122,0.15)", color: "var(--color-sage)" }}
        >
          Coming soon
        </span>
        <h2
          className="text-[22px] font-bold mb-2"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-charcoal)" }}
        >
          {module}
        </h2>
        <p className="text-[12px] leading-relaxed" style={{ color: "#6b6860" }}>
          {description}
        </p>
      </div>
    </div>
  );
}
