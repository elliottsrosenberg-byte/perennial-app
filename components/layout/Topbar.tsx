import GreetingBlock from "./GreetingBlock";

interface TopbarProps {
  /** A plain string renders as the page title. Pass a ReactNode for a
   *  custom left-side element (e.g. a segmented view-toggle on the People
   *  page that flips between Contacts and Leads). */
  title: React.ReactNode;
  actions?: React.ReactNode;
  greeting?: boolean;
}

export default function Topbar({ title, actions, greeting }: TopbarProps) {
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
          <GreetingBlock />
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
