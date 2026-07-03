import { Button } from 'perennial-app';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button variant="primary">Save changes</Button>
    <Button variant="dark">Publish</Button>
    <Button variant="secondary">Cancel</Button>
    <Button variant="ghost">Skip for now</Button>
    <Button variant="danger">Delete project</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <Button disabled>Disabled</Button>
    <Button variant="primary" disabled>Saving…</Button>
  </div>
);
