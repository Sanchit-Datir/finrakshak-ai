import { useState } from 'react';
import { Button } from '../../ui/Button.js';
import { Dialog } from '../../ui/Dialog.js';
import { Checkbox, TextArea } from '../../ui/Field.js';
import type { Application, Db } from '../../../domain/schemas.js';
import { applicationDocs } from '../../../lib/checks.js';
import { docTypeLabel } from '../../../lib/doc-catalog.js';

export function RequestInfoDialog({
  open,
  app,
  db,
  onClose,
  onSubmit,
}: {
  open: boolean;
  app: Application;
  db: Db;
  onClose: () => void;
  onSubmit: (msg: string) => void;
}): React.JSX.Element {
  const missing = db.settings.checklists[app.data.loan.product].filter(
    (t) => !applicationDocs(app, db).some((d) => d.docType === t),
  );
  const [items, setItems] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const text = [...items.map(docTypeLabel), msg.trim()].filter((x) => x !== '').join('; ');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Request information"
      description="Records the request on the application. Sending SMS / email is not connected."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={text === ''}
            onClick={() => {
              onSubmit(text);
              setItems([]);
              setMsg('');
            }}
          >
            Record request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {missing.length > 0 && (
          <p className="text-sm font-medium">Documents not on file for this product:</p>
        )}
        {missing.map((t) => (
          <Checkbox
            key={t}
            label={docTypeLabel(t)}
            checked={items.includes(t)}
            onChange={(e) => {
              setItems((xs) => (e.target.checked ? [...xs, t] : xs.filter((x) => x !== t)));
            }}
          />
        ))}
        <TextArea
          label="Message / other information needed"
          value={msg}
          onChange={(e) => {
            setMsg(e.target.value);
          }}
        />
      </div>
    </Dialog>
  );
}
