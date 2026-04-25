"use client";

export interface Tab {
  key:    string;
  label:  string;
  count?: number;
}

interface FilterTabsProps {
  tabs:       Tab[];
  active:     string;
  onSelect:   (key: string) => void;
  showCount?: boolean;
}

export default function FilterTabs({ tabs, active, onSelect, showCount = false }: FilterTabsProps) {
  return (
    <div style={{
      display:      "flex",
      gap:          2,
      padding:      "6px",
      background:   "rgba(155,163,122,0.08)",
      borderRadius: 10,
      border:       "0.5px solid rgba(155,163,122,0.20)",
      width:        "fit-content",
    }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            style={{
              padding:    "5px 14px",
              borderRadius: 7,
              fontSize:   12,
              border:     "none",
              cursor:     "pointer",
              background: isActive ? "var(--color-surface-raised)" : "transparent",
              color:      isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: isActive ? 600 : 400,
              fontFamily: "inherit",
              transition: "all 0.12s ease",
              display:    "flex",
              alignItems: "center",
              gap:        5,
              boxShadow:  isActive ? "var(--shadow-sm)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
            {showCount && t.count !== undefined && (
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
