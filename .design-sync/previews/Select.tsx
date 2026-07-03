import { Select } from 'perennial-app';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'complete', label: 'Complete' },
];

export const Default = () => (
  <div style={{ width: 220 }}>
    <Select value="active" onChange={() => {}} options={STATUS_OPTIONS} />
  </div>
);

export const Placeholder = () => (
  <div style={{ width: 220 }}>
    <Select
      value=""
      onChange={() => {}}
      options={STATUS_OPTIONS}
      placeholder="Set project status…"
    />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 220 }}>
    <Select value="complete" onChange={() => {}} options={STATUS_OPTIONS} disabled />
  </div>
);
