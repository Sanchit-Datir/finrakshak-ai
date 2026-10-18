import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { FtDocument } from '../../domain/schemas.js';
import { Button } from '../ui/Button.js';
import { Notice } from '../ui/States.js';
import { FieldRow } from './FieldRow.js';
import { AddFieldForm } from './AddFieldForm.js';

export function FieldList({
  doc,
  selectedFieldId,
  onSelectField,
  actor,
}: {
  doc: FtDocument;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  actor: string;
}): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {doc.sampleId === null && (
        <Notice tone="warn" title="Manual entry required">
          Automatic extraction (OCR / Gemini) is not connected. Read the document in the viewer and
          add the key fields below.
        </Notice>
      )}
      {doc.fields.length === 0 && !adding && (
        <p className="text-muted text-sm">No fields recorded for this document yet.</p>
      )}
      <ul className="space-y-2">
        {doc.fields.map((f) => (
          <FieldRow
            key={f.id}
            doc={doc}
            field={f}
            selected={f.id === selectedFieldId}
            onSelect={() => {
              onSelectField(f.id === selectedFieldId ? null : f.id);
            }}
            actor={actor}
          />
        ))}
      </ul>
      {adding ? (
        <AddFieldForm
          doc={doc}
          actor={actor}
          onDone={() => {
            setAdding(false);
          }}
        />
      ) : (
        <Button
          size="sm"
          icon={Plus}
          onClick={() => {
            setAdding(true);
          }}
        >
          Add field manually
        </Button>
      )}
    </div>
  );
}
