import { NumberStepper } from 'perennial-app';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</span>
    {children}
  </div>
);

export const Plain = () => (
  <Field label="Revision rounds">
    <NumberStepper value={3} onChange={() => {}} />
  </Field>
);

export const WithPrefixSuffix = () => (
  <Field label="Hourly rate">
    <NumberStepper value={125} onChange={() => {}} prefix="$" suffix="/hr" step={5} />
  </Field>
);

export const Disabled = () => (
  <Field label="Seats (locked)">
    <NumberStepper value={1} onChange={() => {}} disabled />
  </Field>
);
