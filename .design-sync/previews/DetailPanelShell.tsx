import { DetailPanelShell } from 'perennial-app';

const Row = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '10px 0',
      borderBottom: '0.5px solid var(--color-border)',
    }}
  >
    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</span>
  </div>
);

export const Default = () => (
  <DetailPanelShell maximized={false} onClose={() => {}}>
    <div style={{ flex: 1, minWidth: 0, padding: '28px 32px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
          marginBottom: 8,
        }}
      >
        Organization
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--color-text-primary)',
          marginBottom: 20,
        }}
      >
        Atelier Foster
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Row label="Primary contact" value="Mara Foster" />
        <Row label="Active projects" value="3" />
        <Row label="Lifetime value" value="$86,400" />
        <Row label="Status" value="Active client" />
      </div>
    </div>
  </DetailPanelShell>
);
