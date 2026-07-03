import { Toggle } from 'perennial-app';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    {children}
    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
    <Row label="Send payment reminders">
      <Toggle checked onChange={() => {}} />
    </Row>
    <Row label="Auto-archive projects">
      <Toggle checked={false} onChange={() => {}} />
    </Row>
    <Row label="Weekly digest (locked)">
      <Toggle checked disabled onChange={() => {}} />
    </Row>
  </div>
);
