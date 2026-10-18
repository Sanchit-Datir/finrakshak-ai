import { CircleCheck, CircleHelp, FileSearch, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { ExtractedField, FtDocument } from '../../domain/schemas.js';
import { hasDevanagari, normalizeDigits } from '../../lib/text.js';
import { resetField, reviewField } from '../../state/actions.js';
import { useToast } from '../../state/toast.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { inputClass } from '../ui/Field.js';
import { FieldStateBadge } from '../ui/StatusBadges.js';
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

export function FieldRow({
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
