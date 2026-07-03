import { AshMark } from 'perennial-app';

export const OnLight = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <AshMark size={16} variant="on-light" />
    <AshMark size={24} variant="on-light" />
    <AshMark size={40} variant="on-light" />
  </div>
);

export const OnDark = () => (
  <div
    style={{
      display: 'flex', gap: 16, alignItems: 'center',
      background: '#2b2a26', padding: '18px 22px', borderRadius: 12,
    }}
  >
    <AshMark size={16} variant="on-dark" />
    <AshMark size={24} variant="on-dark" />
    <AshMark size={40} variant="on-dark" />
  </div>
);
