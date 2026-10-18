import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField, TextArea, TextField } from '../ui/Field.js';
import { EVIDENCE_STATUS_LABEL, EVIDENCE_TYPE_LABEL } from '../../domain/labels.js';
import { EvidenceSchema } from '../../domain/schemas.js';
import type { Evidence } from '../../domain/schemas.js';

export function EvidenceDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (e: Omit<Evidence, 'id' | 'collectedAt'>) => void;
}): React.JSX.Element {
  const [ev, setEv] = useState<Omit<Evidence, 'id' | 'collectedAt'>>({
    sourceName: '',
    sourceType: 'internal_record',
    reference: '',
    excerpt: '',
    status: 'user_provided',
    link: null,
  });
  const invalid =
    ev.sourceName.trim() === '' || ev.excerpt.trim() === '' || ev.reference.trim() === '';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add evidence"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={invalid}
            onClick={() => {
              onSave(ev);
              setEv({ ...ev, sourceName: '', reference: '', excerpt: '' });
            }}
          >
            Add evidence
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextField
          label="Source name"
          required
          value={ev.sourceName}
          onChange={(e) => {
            setEv({ ...ev, sourceName: e.target.value });
          }}
        />
        <SelectField
          label="Source type"
          value={ev.sourceType}
          onChange={(e) => {
            setEv({ ...ev, sourceType: EvidenceSchema.shape.sourceType.parse(e.target.value) });
          }}
        >
          {EvidenceSchema.shape.sourceType.options.map((t) => (
            <option key={t} value={t}>
              {EVIDENCE_TYPE_LABEL[t]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Reference (page / paragraph / transaction ID)"
          required
          value={ev.reference}
          onChange={(e) => {
            setEv({ ...ev, reference: e.target.value });
          }}
        />
        <TextArea
          label="Exact excerpt or field"
          required
          value={ev.excerpt}
          onChange={(e) => {
            setEv({ ...ev, excerpt: e.target.value });
          }}
        />
        <SelectField
          label="Evidence status"
          value={ev.status}
          onChange={(e) => {
            setEv({ ...ev, status: EvidenceSchema.shape.status.parse(e.target.value) });
          }}
        >
          {EvidenceSchema.shape.status.options.map((s) => (
            <option key={s} value={s}>
              {EVIDENCE_STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <p className="text-muted text-xs">
          Mark public-source material “Verified source” only after checking the original. No
          external lookups are performed by this prototype.
        </p>
      </div>
    </Dialog>
  );
}
