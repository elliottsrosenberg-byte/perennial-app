import { EmptyState } from 'perennial-app';
import { FolderOpen, Upload } from 'lucide-react';

export const Default = () => (
  <EmptyState
    icon={<FolderOpen size={22} />}
    heading="No projects yet"
    body="Track a shoot, a brand identity, or a client engagement from first brief to final invoice. Everything for a piece of work lives in one project."
    action={{ label: "New project", onClick: () => {} }}
  />
);

export const WithTips = () => (
  <EmptyState
    icon={<FolderOpen size={22} />}
    heading="No clients yet"
    body="Add the studios and brands you work with so their contacts, deals, and invoices roll up in one place."
    action={{ label: "Add client", onClick: () => {} }}
    secondaryAction={{ label: "Import from CSV", onClick: () => {}, icon: <Upload size={13} /> }}
    tips={[
      "Log a client once and every invoice, deal, and note links back to them.",
      "Import your contacts from a spreadsheet to get set up in seconds.",
      "Ash can draft a follow-up the moment a client goes quiet.",
    ]}
  />
);
