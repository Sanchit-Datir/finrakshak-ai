import { FileText, MessageSquarePlus, RefreshCw } from 'lucide-react';
import type { PrefillChange } from '../../../lib/prefill.js';
import { Button } from '../../ui/Button.js';
import { Notice } from '../../ui/States.js';
import { UploadInsteadCard } from '../UploadInsteadCard.js';

/** Validation summary, form actions and notices about fields filled from documents. */
export function ReviewHeader({
  errors,
  requireCoreFields,
  hasDocs,
  prefillNote,
  unreviewed,
  onAttach,
  onRefill,
  onAddNote,
}: {
  errors: readonly string[];
  requireCoreFields: boolean;
  hasDocs: boolean;
  prefillNote: readonly PrefillChange[];
  /** Extracted fields still unreviewed (not used to fill the form). */
  unreviewed: number;
  onAttach: () => void;
  onRefill: () => void;
  onAddNote: () => void;
}): React.JSX.Element {
  return (
    <>
      {errors.length > 0 && (
        <Notice tone="danger" title="Some information needs attention">
          <ul className="list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
      {requireCoreFields && <UploadInsteadCard onUpload={onAttach} />}
      <div className="flex flex-wrap items-center gap-2">
        {hasDocs && (
          <Button size="sm" icon={RefreshCw} onClick={onRefill}>
            Fill empty fields from reviewed documents
          </Button>
        )}
        <Button size="sm" icon={MessageSquarePlus} onClick={onAddNote}>
          Add a note
        </Button>
        {!requireCoreFields && (
          <Button size="sm" icon={FileText} onClick={onAttach}>
            Replace / attach a document
          </Button>
        )}
      </div>
      {prefillNote.length > 0 && (
        <Notice title={`${prefillNote.length} field(s) were filled from reviewed document fields`}>
          <ul className="mt-1 space-y-0.5 text-xs">
            {prefillNote.map((c) => (
              <li key={c.path}>
                {c.label}: <span lang="mr">“{c.value}”</span> — from {c.source}
              </li>
            ))}
          </ul>
          Check each value; you can edit anything below.
        </Notice>
      )}
      {unreviewed > 0 && (
        <Notice tone="warn">
          {unreviewed} extracted field(s) are still unreviewed and were not used. Review them in
          “Extract & verify”.
        </Notice>
      )}
    </>
  );
}
