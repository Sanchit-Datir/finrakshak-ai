import { CircleCheck, CircleHelp, FileSearch, Pencil, Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { LANGUAGE_LABEL } from '../../domain/labels.js';
import type { ExtractedField, FtDocument } from '../../domain/schemas.js';
import { getSample } from '../../demo/samples.js';
import { fieldTemplatesFor } from '../../lib/doc-catalog.js';
import { hasDevanagari, normalizeDigits } from '../../lib/text.js';
import { addManualField, resetField, reviewField } from '../../state/actions.js';
import { useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { SelectField, TextField, inputClass } from '../ui/Field.js';
import { EmptyState, Notice, SimulatedBadge } from '../ui/States.js';
import { FieldStateBadge } from '../ui/StatusBadges.js';
import { Tabs } from '../ui/Tabs.js';
import { cn } from '../ui/cn.js';

const QUALITY: Record<
  ExtractedField['quality'],
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }
> = {
  clear: { label: 'Clear print', tone: 'ok' },
  low: { label: 'Low image quality', tone: 'warn' },
  handwritten: { label: 'Handwritten — lower confidence', tone: 'warn' },
  unreadable: { label: 'Unreadable — enter manually', tone: 'danger' },
  not_applicable: { label: 'Manual entry', tone: 'neutral' },
};

type Tab = 'fields' | 'original' | 'translation' | 'raw';

export function ExtractedFieldsPanel({
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
  const dev = useDb().settings.preferences.developerMode;
  const [tab, setTab] = useState<Tab>('fields');
  const sample = getSample(doc.sampleId);
  const simulated = doc.fields.some((f) => f.origin === 'simulated');
  const reviewed = doc.fields.filter((f) => f.state !== 'unreviewed').length;
  const tabs = [
    { key: 'fields' as const, label: 'Extracted fields', count: doc.fields.length },
    { key: 'original' as const, label: 'Original text' },
    { key: 'translation' as const, label: 'English translation' },
    ...(dev ? [{ key: 'raw' as const, label: 'Raw details' }] : []),
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Machine-extracted text — please verify.</p>
          {simulated && <SimulatedBadge />}
        </div>
        <p className="text-muted mt-0.5 text-xs">
          {reviewed} of {doc.fields.length} field(s) reviewed · Language:{' '}
          {doc.language === null ? 'not set' : LANGUAGE_LABEL[doc.language]} · Reading text does not
          establish that a document is genuine.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Tabs label="Extraction views" tabs={tabs} value={tab} onChange={setTab} className="pt-1">
          {tab === 'fields' && (
            <FieldList
              doc={doc}
              selectedFieldId={selectedFieldId}
              onSelectField={onSelectField}
              actor={actor}
            />
          )}
          {tab === 'original' &&
            (sample === undefined ? (
              <EmptyState icon={FileSearch} title="No machine-extracted text">
                Automatic text extraction is not connected, so no text has been read from this file.
                Compare the image with the fields you enter manually.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <section>
                  <h4 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                    Original (as on document)
                  </h4>
                  <pre
                    lang={doc.language === 'en' ? 'en' : 'mr'}
                    className="bg-surface-2 border-line font-deva rounded-lg border p-3 text-sm whitespace-pre-wrap"
                  >
                    {sample.originalText}
                  </pre>
                </section>
                {sample.transliteration !== null && (
                  <section>
                    <h4 className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                      Transliteration (Latin script)
                    </h4>
                    <pre className="bg-surface-2 border-line rounded-lg border p-3 font-sans text-sm whitespace-pre-wrap">
                      {sample.transliteration}
                    </pre>
                  </section>
                )}
                <p className="text-muted text-xs">
                  Simulated output. The original text is preserved; transliteration and translation
                  are shown separately and never overwrite it.
                </p>
              </div>
            ))}
          {tab === 'translation' &&
            ((sample?.translation ?? null) === null ? (
              <EmptyState icon={FileSearch} title="No translation available">
                {doc.language === 'en'
                  ? 'This document is in English.'
                  : 'Translation needs extracted text, which is not available for this file.'}
              </EmptyState>
            ) : (
              <div className="space-y-2">
                <Notice>
                  Machine translation (simulated). Use it as a reading aid only — the Marathi
                  original is authoritative.
                </Notice>
                <pre className="bg-surface-2 border-line rounded-lg border p-3 font-sans text-sm whitespace-pre-wrap">
                  {sample?.translation}
                </pre>
              </div>
            ))}
          {tab === 'raw' && (
            <pre className="bg-surface-2 border-line overflow-x-auto rounded-lg border p-3 text-xs">
              {JSON.stringify({ id: doc.id, sampleId: doc.sampleId, fields: doc.fields }, null, 2)}
            </pre>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function FieldList({
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

function FieldRow({
  doc,
  field: f,
  selected,
  onSelect,
  actor,
}: {
  doc: FtDocument;
  field: ExtractedField;
  selected: boolean;
  onSelect: () => void;
  actor: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.value);
  const toast = useToast();
  const deva = hasDevanagari(f.value);
  const normalized = normalizeDigits(f.value);
  const q = QUALITY[f.quality];
  const save = (): void => {
    reviewField(doc.id, f.id, actor, { state: 'confirmed', value: draft.trim() });
    setEditing(false);
    toast.push({
      tone: 'success',
      title: 'Field saved',
      detail: `${f.label} recorded as reviewed by you.`,
    });
  };
  return (
    <li
      className={cn(
        'rounded-xl border p-3',
        selected ? 'border-primary bg-primary-soft/40' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-muted text-xs font-semibold">{f.label}</p>
        <FieldStateBadge state={f.state} />
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <label className="sr-only" htmlFor={`edit-${f.id}`}>
            {f.label}
          </label>
          <input
            id={`edit-${f.id}`}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            className={cn(inputClass, deva && 'font-deva')}
            lang={deva ? 'mr' : undefined}
          />
          {f.machineValue !== null && (
            <p className="text-muted text-xs">
              Machine-extracted value:{' '}
              <span lang={hasDevanagari(f.machineValue) ? 'mr' : undefined}>
                “{f.machineValue || '(empty)'}”
              </span>{' '}
              — kept in the audit history.
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={save} disabled={draft.trim() === ''}>
              Save correction
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDraft(f.value);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p
            className={cn('mt-1 text-[15px] font-medium break-words', deva && 'font-deva')}
            lang={deva ? 'mr' : undefined}
          >
            {f.value === '' ? (
              <span className="text-muted italic">No value — needs manual entry</span>
            ) : (
              f.value
            )}
          </p>
          {deva && normalized !== f.value && /\d/.test(normalized) && (
            <p className="text-muted tabular text-xs">
              Digits read as: {normalized} (original kept)
            </p>
          )}
          {f.state === 'corrected' && f.machineValue !== null && (
            <p className="text-info text-xs">
              Corrected from “<span lang="mr">{f.machineValue}</span>”
            </p>
          )}
        </>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone={q.tone}>{q.label}</Badge>
        <span className="text-muted">Page {f.page + 1}</span>
        {f.reviewedBy !== null && <span className="text-muted">· by {f.reviewedBy}</span>}
      </div>
      {!editing && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={selected ? 'subtle' : 'ghost'}
            icon={FileSearch}
            onClick={onSelect}
            aria-pressed={selected}
            disabled={f.region === null}
            title={f.region === null ? 'No source region recorded for this field' : undefined}
          >
            {selected ? 'Showing source' : 'View source'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={CircleCheck}
            onClick={() => {
              reviewField(doc.id, f.id, actor, { state: 'confirmed' });
            }}
            disabled={f.value === '' || f.state === 'confirmed'}
          >
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Pencil}
            onClick={() => {
              setDraft(f.value);
              setEditing(true);
            }}
          >
            {f.value === '' ? 'Enter value' : 'Edit'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={CircleHelp}
            onClick={() => {
              reviewField(doc.id, f.id, actor, { state: 'unclear' });
            }}
            disabled={f.state === 'unclear'}
          >
            Mark unclear
          </Button>
          {f.machineValue !== null && f.state !== 'unreviewed' && (
            <Button
              size="sm"
              variant="ghost"
              icon={Undo2}
              onClick={() => {
                resetField(doc.id, f.id, actor);
              }}
            >
              Reset
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function AddFieldForm({
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
        label="Value (type exactly as written; Marathi allowed)"
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
