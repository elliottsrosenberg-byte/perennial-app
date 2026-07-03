import { DatePicker } from 'perennial-app';

export const WithValue = () => (
  <div style={{ width: 220 }}>
    <DatePicker value={new Date(2026, 4, 14)} onChange={() => {}} />
  </div>
);

export const Empty = () => (
  <div style={{ width: 220 }}>
    <DatePicker value={null} onChange={() => {}} placeholder="Set a due date…" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 220 }}>
    <DatePicker value={new Date(2026, 4, 14)} onChange={() => {}} disabled />
  </div>
);
