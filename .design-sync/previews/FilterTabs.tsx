import { FilterTabs } from 'perennial-app';

const TABS = [
  { key: 'all', label: 'All', count: 48 },
  { key: 'active', label: 'Active', count: 12 },
  { key: 'leads', label: 'Leads', count: 7 },
  { key: 'archived', label: 'Archived', count: 29 },
];

export const Default = () => (
  <FilterTabs tabs={TABS} active="active" onSelect={() => {}} />
);

export const WithCounts = () => (
  <FilterTabs tabs={TABS} active="all" onSelect={() => {}} showCount />
);
