import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField } from '../ui/Field.js';

export function AssignDialog({
  open,
  owner,
  onClose,
  onSave,
}: {
  open: boolean;
  owner: string;
  onClose: () => void;
  onSave: (o: string) => void;
}): React.JSX.Element {
  const [o, setO] = useState(owner);
  const people = ['Farhan Shaikh', 'Neha Joshi', 'Anjali Patil', 'Rahul Kulkarni', 'Deepak Rao'];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign case"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={o === owner}
            onClick={() => {
              onSave(o);
            }}
          >
            Assign
          </Button>
        </>
      }
    >
      <SelectField
        label="Assign to"
        value={o}
        onChange={(e) => {
          setO(e.target.value);
        }}
      >
        {people.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </SelectField>
    </Dialog>
  );
}
