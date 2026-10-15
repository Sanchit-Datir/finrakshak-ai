import { useDb } from '../../state/store.js';
import { docTypeLabel } from '../../lib/doc-catalog.js';
import { Dialog } from '../ui/Dialog.js';
import { ErrorState } from '../ui/States.js';
import { FieldStateBadge } from '../ui/StatusBadges.js';
import { DocumentViewer } from './DocumentViewer.js';

/** Opens the exact source document/page/region behind a piece of evidence. */
export function SourceViewerDialog({
  docId,
  fieldId,
  onClose,
}: {
  docId: string | null;
  fieldId: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const db = useDb();
  const doc = docId === null ? undefined : db.documents.find((d) => d.id === docId);
  const field = doc?.fields.find((f) => f.id === fieldId);
  return (
    <Dialog
      open={docId !== null}
      onClose={onClose}
      wide
      title={
        doc === undefined ? 'Source not found' : `${docTypeLabel(doc.docType)} — ${doc.filename}`
      }
      description={
        field === undefined ? undefined : (
          <span className="flex flex-wrap items-center gap-2">
            {field.label}: <strong lang="mr">{field.value || '(empty)'}</strong>{' '}
            <FieldStateBadge state={field.state} />
          </span>
        )
      }
    >
      {doc === undefined ? (
        <ErrorState title="This document is no longer available">
          It may have been removed. The removal is recorded in the application audit history.
        </ErrorState>
      ) : (
        <div className="h-[68vh]">
          <DocumentViewer doc={doc} highlight={field?.region ?? null} />
        </div>
      )}
    </Dialog>
  );
}
