interface TopbarProps {
  title: string;
  actions?: React.ReactNode;
  greeting?: boolean;
}

function formatGreetingDate() {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

export default function Topbar({ title, actions, greeting }: TopbarProps) {
  const hour = new Date().getHours();
  const greetingText =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <header
      className="flex items-center justify-between px-6 shrink-0"
      style={{
        height: "52px",
        borderBottom: "0.5px solid var(--color-border)",
        background: "var(--color-off-white)",
      }}
    >
      <div className="flex items-center gap-2">
        {greeting ? (
          <>
            <h1 className="font-semibold" style={{ fontSize: "15px", color: "var(--color-charcoal)" }}>
              {greetingText}.
            </h1>
            <span style={{ color: "var(--color-grey)", fontSize: "12px" }}>·</span>
            <span style={{ fontSize: "12px", color: "var(--color-grey)" }}>{formatGreetingDate()}</span>
          </>
        ) : (
          <h1 className="font-semibold" style={{ fontSize: "14px", color: "var(--color-charcoal)" }}>
            {title}
          </h1>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
