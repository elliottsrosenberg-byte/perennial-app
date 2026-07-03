import { EditableField } from 'perennial-app';

export const Group = () => (
  <div style={{ maxWidth: 340, display: 'flex', flexDirection: 'column' }}>
    <EditableField label="Name" value="Sarah Chen" onSave={() => {}} />
    <EditableField label="Role" value={null} placeholder="Creative Director" onSave={() => {}} />
    <EditableField label="Website" value="https://sarahchen.studio" isLink onSave={() => {}} />
    <EditableField
      label="Notes"
      value="Met at the Aperture opening — art directs the Kinfolk print editorials, prefers email over calls."
      multiline
      onSave={() => {}}
    />
  </div>
);
