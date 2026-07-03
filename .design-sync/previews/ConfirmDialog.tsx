import { ConfirmDialog } from 'perennial-app';

export const Danger = () => (
  <ConfirmDialog
    open
    tone="danger"
    title="Delete project?"
    body="This permanently removes the project and all its tasks. This can't be undone."
    confirmLabel="Delete"
    onConfirm={() => {}}
    onCancel={() => {}}
  />
);
