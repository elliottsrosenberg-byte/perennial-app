import { Modal, Button } from 'perennial-app';

export const Default = () => (
  <Modal
    open
    onClose={() => {}}
    title="New project"
    size="lg"
    footer={
      <>
        <Button variant="secondary">Cancel</Button>
        <Button variant="primary">Create project</Button>
      </>
    }
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          Project name
        </span>
        <div
          style={{
            padding: '9px 12px',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            background: 'var(--color-surface-sunken)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 8,
          }}
        >
          Atelier Foster — Brand Identity
        </div>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          Client
        </span>
        <div
          style={{
            padding: '9px 12px',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            background: 'var(--color-surface-sunken)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 8,
          }}
        >
          Foster & Co.
        </div>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>
          Budget
        </span>
        <div
          style={{
            padding: '9px 12px',
            fontSize: 13,
            color: 'var(--color-text-primary)',
            background: 'var(--color-surface-sunken)',
            border: '0.5px solid var(--color-border-strong)',
            borderRadius: 8,
          }}
        >
          $24,000
        </div>
      </label>
    </div>
  </Modal>
);
