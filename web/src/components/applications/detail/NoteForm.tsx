import { useState } from 'react';
import { Button } from '../../ui/Button.js';
import { TextArea } from '../../ui/Field.js';

export function NoteForm({
  onSubmit,
  label = 'Note',
}: {
  onSubmit: (text: string) => void;
  label?: string;
}): React.JSX.Element {
  const [text, setText] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() !== '') {
          onSubmit(text.trim());
          setText('');
        }
      }}
    >
      <TextArea
        label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <Button type="submit" variant="primary" disabled={text.trim() === ''}>
        Save note
      </Button>
    </form>
  );
}
