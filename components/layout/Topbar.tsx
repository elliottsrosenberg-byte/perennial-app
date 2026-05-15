interface TopbarProps {
  /** A plain string renders as the page title. Pass a ReactNode for a
   *  custom left-side element (e.g. a segmented view-toggle on the People
   *  page that flips between Contacts and Leads). */
  title: React.ReactNode;
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
        ) : typeof title === "string" ? (
          <h1 className="font-semibold" style={{ fontSize: "14px", color: "var(--color-charcoal)" }}>
            {title}
          </h1>
        ) : (
          title
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
