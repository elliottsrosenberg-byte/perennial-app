import { DatePillField } from 'perennial-app';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', width: 90 }}>{label}</span>
    {children}
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Row label="Due date">
      <DatePillField value={new Date(2026, 4, 14)} onChange={() => {}} onClear={() => {}} />
    </Row>
    <Row label="Overdue">
      <DatePillField value={new Date(2026, 3, 2)} onChange={() => {}} onClear={() => {}} alert />
    </Row>
    <Row label="Not set">
      <DatePillField value={null} onChange={() => {}} />
    </Row>
  </div>
);
