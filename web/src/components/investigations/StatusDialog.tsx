import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField, TextArea } from '../ui/Field.js';
import { CASE_STATUS_LABEL } from '../../domain/labels.js';
import { CaseStatusSchema } from '../../domain/schemas.js';
import type { Case, CaseStatus } from '../../domain/schemas.js';

export function StatusDialog({
  open,
  c,
  onClose,
  onSave,
}: {
  open: boolean;
  c: Case;
  onClose: () => void;
  onSave: (s: CaseStatus, reason: string, outcome?: string) => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<CaseStatus>(c.status);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState(c.outcome ?? '');
  const closing = status === 'resolved' || status === 'closed';
  const invalid = status === c.status || reason.trim() === '' || (closing && outcome.trim() === '');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change case status"
      description="Every status change records who, when and why."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={invalid}
            onClick={() => {
              onSave(status, reason.trim(), closing ? outcome.trim() : undefined);
              setReason('');
            }}
          >
            Save status
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectField
          label="New status"
          value={status}
          onChange={(e) => {
            setStatus(CaseStatusSchema.parse(e.target.value));
          }}
        >
          {CaseStatusSchema.options.map((s) => (
            <option key={s} value={s}>
              {CASE_STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <TextArea
          label="Reason for change"
          required
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
        {closing && (
          <TextArea
            label="Outcome (required)"
            required
            value={outcome}
            hint="Describe what verified evidence showed. Do not state guilt; use 'concern confirmed by …' or 'no concern found'."
            onChange={(e) => {
              setOutcome(e.target.value);
            }}
          />
        )}
      </div>
    </Dialog>
  );
}
