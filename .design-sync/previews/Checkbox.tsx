import { Checkbox } from 'perennial-app';

const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    {children}
    <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{label}</span>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <Item label="Draft shot list">
      <Checkbox checked onChange={() => {}} />
    </Item>
    <Item label="Confirm venue booking">
      <Checkbox checked={false} onChange={() => {}} />
    </Item>
    <Item label="Send final invoice (locked)">
      <Checkbox checked disabled onChange={() => {}} />
    </Item>
  </div>
);
