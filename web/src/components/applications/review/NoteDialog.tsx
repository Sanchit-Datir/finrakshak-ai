import { useState } from 'react';
import { Button } from '../../ui/Button.js';
import { Dialog } from '../../ui/Dialog.js';
import { TextArea } from '../../ui/Field.js';

/** "Add a note" on the review step. The typed note survives closing the dialog. */
export function NoteDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (note: string) => void;
}): React.JSX.Element {
  const [note, setNote] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a note"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={note.trim() === ''}
            onClick={() => {
              onAdd(note.trim());
              setNote('');
            }}
          >
            Add note
          </Button>
        </>
      }
    >
      <TextArea
        label="Note"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
        }}
      />
    </Dialog>
  );
}
