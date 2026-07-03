import { Badge } from 'perennial-app';

export const Status = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Badge tone="sage">Active</Badge>
    <Badge tone="green">Complete</Badge>
    <Badge tone="amber">On hold</Badge>
    <Badge tone="red">Overdue</Badge>
    <Badge tone="blue">Sent</Badge>
    <Badge tone="neutral">Planning</Badge>
  </div>
);

export const Tags = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Badge tone="blue" variant="tag">gallery</Badge>
    <Badge tone="sage" variant="tag">client</Badge>
    <Badge tone="purple" variant="tag">press</Badge>
    <Badge tone="gold" variant="tag">lead</Badge>
    <Badge tone="teal" variant="tag">event</Badge>
  </div>
);

export const Solid = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Badge tone="neutral" variant="solid">Draft</Badge>
    <Badge tone="blue" variant="solid">Sent</Badge>
    <Badge tone="green" variant="solid">Paid</Badge>
    <Badge tone="red" variant="solid">Overdue</Badge>
  </div>
);
