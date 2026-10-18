import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField } from '../ui/Field.js';
import type { FtDocument } from '../../domain/schemas.js';
import { useDb } from '../../state/store.js';

export function LinkDialog({
  doc,
  onClose,
  onLink,
}: {
  doc: FtDocument | null;
  onClose: () => void;
  onLink: (appId: string) => void;
}): React.JSX.Element {
  const db = useDb();
  const [appId, setAppId] = useState('');
  const choice = appId === '' ? (db.applications[0]?.id ?? '') : appId;
  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title="Link to application"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={choice === ''}
            onClick={() => {
              onLink(choice);
            }}
          >
            Link document
          </Button>
        </>
      }
    >
      <SelectField
        label="Application"
        value={choice}
        onChange={(e) => {
          setAppId(e.target.value);
        }}
      >
        {db.applications.map((a) => (
          <option key={a.id} value={a.id}>
            {a.id} — {a.data.business.businessName || a.data.applicant.fullName || 'Untitled'}
          </option>
        ))}
      </SelectField>
      {(doc?.applicationId ?? null) !== null && (
        <p className="text-muted mt-2 text-xs">
          Currently linked to {doc?.applicationId}; linking moves it.
        </p>
      )}
    </Dialog>
  );
}
