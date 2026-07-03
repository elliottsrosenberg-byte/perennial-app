import { Menu } from 'perennial-app';
import { Pencil, Copy, Share2, Trash2 } from 'lucide-react';

export const ActionMenu = () => (
  <div style={{ width: 200 }}>
    <Menu
      items={[
        { label: 'Edit project', icon: Pencil, onClick: () => {} },
        { label: 'Duplicate', icon: Copy, onClick: () => {} },
        'divider',
        { label: 'Delete project', icon: Trash2, danger: true, onClick: () => {} },
      ]}
      onClose={() => {}}
    />
  </div>
);

export const WithBadgesAndLink = () => (
  <div style={{ width: 200 }}>
    <Menu
      items={[
        { label: 'Share gallery', icon: Share2, badge: 'Pro', onClick: () => {} },
        { label: 'Open in Stripe', icon: Copy, href: 'https://stripe.com', external: true },
        'divider',
        { label: 'Archive (locked)', disabled: true },
      ]}
      onClose={() => {}}
    />
  </div>
);
