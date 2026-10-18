import { useState } from 'react';
import { Button } from '../ui/Button.js';
import { Checkbox, TextField } from '../ui/Field.js';
import type { Case } from '../../domain/schemas.js';
import { addCaseTask, toggleCaseTask } from '../../state/actions.js';

export function Checklist({ c, actor }: { c: Case; actor: string }): React.JSX.Element {
  const [text, setText] = useState('');
  return (
    <div className="space-y-2">
      {c.checklist.length === 0 && <p className="text-muted text-sm">No tasks yet.</p>}
      {c.checklist.map((t) => (
        <Checkbox
          key={t.id}
          label={<span className={t.done ? 'text-muted line-through' : ''}>{t.text}</span>}
          checked={t.done}
          onChange={() => {
            toggleCaseTask(c.id, t.id, actor);
          }}
        />
      ))}
      <form
        className="flex gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() !== '') {
            addCaseTask(c.id, actor, text.trim());
            setText('');
          }
        }}
      >
        <TextField
          label="New task"
          className="flex-1"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <Button type="submit" size="sm" className="self-end" disabled={text.trim() === ''}>
          Add
        </Button>
      </form>
    </div>
  );
}
