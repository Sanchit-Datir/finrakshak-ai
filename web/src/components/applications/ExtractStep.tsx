import { Files } from 'lucide-react';
import { useState } from 'react';
import type { FtDocument } from '../../domain/schemas.js';
import { docTypeLabel } from '../../lib/doc-catalog.js';
import { rotatePage } from '../../state/actions.js';
import { DocThumb } from '../documents/DocThumb.js';
import { DocumentViewer } from '../documents/DocumentViewer.js';
import { ExtractedFieldsPanel } from '../documents/ExtractedFieldsPanel.js';
import { EmptyState } from '../ui/States.js';
import { ProcessingBadge } from '../ui/StatusBadges.js';
import { cn } from '../ui/cn.js';

type Pane = 'docs' | 'viewer' | 'fields';

/** Three-panel review workspace: documents | viewer | extracted fields (tabs on small screens). */
export function ExtractStep({
  docs,
  actor,
  initialDocId = null,
}: {
  docs: FtDocument[];
  actor: string;
  initialDocId?: string | null;
}): React.JSX.Element {
  const [docId, setDocId] = useState<string | null>(initialDocId ?? docs[0]?.id ?? null);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>('viewer');
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  if (doc === undefined) {
    return (
      <div className="card">
        <EmptyState icon={Files} title="No documents to review">
          Go back to “Capture documents” to scan or upload documents.
        </EmptyState>
      </div>
    );
  }
  const field = doc.fields.find((f) => f.id === fieldId) ?? null;
  const selectField = (id: string | null): void => {
    setFieldId(id);
    if (id !== null) setPane('viewer');
  };
  return (
    <div>
      <div
        role="group"
        aria-label="Workspace panes"
        className="bg-surface-2 border-line mb-3 flex rounded-xl border p-1 lg:hidden"
      >
        {(['docs', 'viewer', 'fields'] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pane === p}
            onClick={() => {
              setPane(p);
            }}
            className={cn(
              'flex-1 rounded-lg py-2 text-sm font-medium',
              pane === p ? 'bg-surface shadow-sm' : 'text-muted',
            )}
          >
            {p === 'docs' ? `Documents (${docs.length})` : p === 'viewer' ? 'Original' : 'Fields'}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:h-[calc(100dvh-260px)] lg:min-h-[560px] lg:grid-cols-[220px_minmax(0,1fr)_minmax(340px,420px)]">
        <nav
          aria-label="Documents"
          className={cn('card overflow-y-auto p-2 lg:block', pane === 'docs' ? 'block' : 'hidden')}
        >
          <ul className="space-y-1">
            {docs.map((d) => {
              const pending = d.fields.filter((f) => f.state === 'unreviewed').length;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-current={d.id === doc.id ? 'true' : undefined}
                    onClick={() => {
                      setDocId(d.id);
                      setFieldId(null);
                      setPane('viewer');
                    }}
                    className={cn(
                      'flex w-full gap-2 rounded-lg p-2 text-left',
                      d.id === doc.id ? 'bg-primary-soft' : 'hover:bg-surface-2',
                    )}
                  >
                    <DocThumb doc={d} className="h-14 w-11" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {docTypeLabel(d.docType)}
                      </span>
                      <span className="text-muted block truncate text-xs">{d.filename}</span>
                      <span className="mt-1 block">
                        <ProcessingBadge state={d.processing} />
                      </span>
                      {pending > 0 && (
                        <span className="text-warn mt-0.5 block text-xs font-medium">
                          {pending} to review
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <section
          aria-label="Document viewer"
          className={cn(
            'card min-h-[420px] overflow-hidden lg:block',
            pane === 'viewer' ? 'block' : 'hidden',
          )}
        >
          <DocumentViewer
            key={doc.id}
            doc={doc}
            highlight={field?.region ?? null}
            onRotate={(p) => {
              rotatePage(doc.id, p, actor);
            }}
          />
          {field !== null && (
            <p
              className="bg-primary-soft text-primary border-line border-t px-3 py-2 text-xs font-medium"
              role="status"
            >
              Comparing with original: “{field.label}” — highlighted on page {field.page + 1}.
            </p>
          )}
        </section>
        <section
          aria-label="Extracted fields"
          className={cn(
            'card min-h-[420px] overflow-hidden lg:block',
            pane === 'fields' ? 'block' : 'hidden',
          )}
        >
          <ExtractedFieldsPanel
            key={doc.id}
            doc={doc}
            selectedFieldId={fieldId}
            onSelectField={selectField}
            actor={actor}
          />
        </section>
      </div>
    </div>
  );
}
