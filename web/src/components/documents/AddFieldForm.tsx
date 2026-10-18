import { useState } from 'react';
import type { FtDocument } from '../../domain/schemas.js';
import { fieldTemplatesFor } from '../../lib/doc-catalog.js';
import { addManualField } from '../../state/actions.js';
import { Button } from '../ui/Button.js';
import { SelectField, TextField } from '../ui/Field.js';

export function AddFieldForm({
  doc,
  actor,
  onDone,
}: {
  doc: FtDocument;
  actor: string;
  onDone: () => void;
}): React.JSX.Element {
  const templates = fieldTemplatesFor(doc.docType);
  const [key, setKey] = useState(templates[0]?.key ?? 'document_number');
  const [value, setValue] = useState('');
  const [page, setPage] = useState(1);
  const label = templates.find((t) => t.key === key)?.label ?? key;
  return (
    <form
      className="border-line space-y-3 rounded-xl border border-dashed p-3"
      onSubmit={(e) => {
        e.preventDefault();
        addManualField(doc.id, actor, key, label, value.trim(), page - 1);
        setValue('');
        onDone();
      }}
    >
      <p className="text-sm font-semibold">Add field manually</p>
      <SelectField
        label="Field"
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
        }}
      >
        {templates.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Value (type exactly as written; Devanagari allowed)"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        hint="Leave empty and save to record the value as unclear."
      />
      <TextField
        label="Page"
        type="number"
        min={1}
        max={doc.pages.length}
        value={page}
        onChange={(e) => {
          setPage(Math.min(doc.pages.length, Math.max(1, Number(e.target.value) || 1)));
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary">
          Add field
        </Button>
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
