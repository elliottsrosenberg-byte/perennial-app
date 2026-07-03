import { Card } from 'perennial-app';

const Heading = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
    {children}
  </div>
);

const Body = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{children}</div>
);

export const Raised = () => (
  <Card variant="raised">
    <Heading>Brand identity — Meridian Studio</Heading>
    <Body>Due in 5 days · 3 tasks remaining</Body>
  </Card>
);

export const Flat = () => (
  <Card variant="flat">
    <Heading>Invoice #1042</Heading>
    <Body>Sent to Harborline Coffee · $3,200</Body>
  </Card>
);

export const Sunken = () => (
  <Card variant="sunken">
    <Heading>Notes</Heading>
    <Body>Client prefers warm neutrals and serif type.</Body>
  </Card>
);

export const Interactive = () => (
  <Card variant="raised" interactive onClick={() => {}}>
    <Heading>Autumn Lookbook gallery</Heading>
    <Body>Click to open · 24 photos</Body>
  </Card>
);
