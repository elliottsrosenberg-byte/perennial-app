import { MonthGrid } from 'perennial-app';

export const Default = () => (
  <div
    style={{
      width: 252,
      padding: 14,
      background: 'var(--color-surface-raised)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-md)',
    }}
  >
    <MonthGrid selected={new Date(2026, 4, 14)} onSelect={() => {}} />
  </div>
);
