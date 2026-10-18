import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField, TextArea, TextField } from '../ui/Field.js';
import { PRIORITY_LABEL } from '../../domain/labels.js';
import { PrioritySchema } from '../../domain/schemas.js';
import type { Priority } from '../../domain/schemas.js';
import { createCase } from '../../state/actions.js';
import { useActor } from '../../state/hooks.js';
import { useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

export function NewCaseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const db = useDb();
  const actor = useActor();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<Priority>('needs_attention');
  const [borrowerId, setBorrowerId] = useState('');
  const [touched, setTouched] = useState(false);
  const submit = (): void => {
    setTouched(true);
    if (title.trim() === '') return;
    const b = db.borrowers.find((x) => x.id === borrowerId);
    const id = createCase(actor, {
      title: title.trim(),
      summary: summary.trim(),
      priority,
      branchId: b?.branchId ?? db.branches[0]?.id ?? '',
      source: 'referral',
      borrowerIds: b === undefined ? [] : [b.id],
      entityIds: b === undefined ? [] : [b.entityId],
      loanIds: db.loans.filter((l) => l.borrowerId === borrowerId).map((l) => l.id),
      applicationIds: db.applications.filter((a) => a.borrowerId === borrowerId).map((a) => a.id),
      alertIds: [],
    });
    toast.push({ tone: 'success', title: `${id} opened` });
    setTitle('');
    setSummary('');
    setTouched(false);
    onClose();
    void navigate(`/investigations/${id}`);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Open a new case"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Open case
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextField
          label="Title"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          error={touched && title.trim() === '' ? 'Enter a short, neutral title.' : null}
          hint="Describe the concern neutrally — do not label anyone guilty."
        />
        <TextArea
          label="Summary"
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
          }}
        />
        <SelectField
          label="Review priority"
          value={priority}
          onChange={(e) => {
            setPriority(PrioritySchema.parse(e.target.value));
          }}
        >
          {PrioritySchema.options.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Linked borrower (optional)"
          value={borrowerId}
          onChange={(e) => {
            setBorrowerId(e.target.value);
          }}
        >
          <option value="">None</option>
          {db.borrowers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>
    </Dialog>
  );
}
