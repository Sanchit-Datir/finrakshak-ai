import {
  ArrowDown,
  ArrowUp,
  Eye,
  RefreshCw,
  Replace,
  RotateCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { LANGUAGE_LABEL } from '../../domain/labels.js';
import { LanguageSchema } from '../../domain/schemas.js';
import type { FtDocument } from '../../domain/schemas.js';
import { formatBytes } from '../../lib/format.js';
import { ACCEPT_ATTR, processDocumentFile } from '../../lib/processing.js';
import {
  moveDocument,
  replaceDocumentFile,
  retryWithoutFile,
  rotatePage,
  setDocLanguage,
  setDocType,
} from '../../state/actions.js';
import { getLocalFile } from '../../state/files.js';
import { useToast } from '../../state/toast.js';
import { Button, IconButton } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/Dialog.js';
import { FilterSelect } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { ProcessingBadge } from '../ui/StatusBadges.js';
import { cn } from '../ui/cn.js';
import { DocThumb } from '../documents/DocThumb.js';
import { DocTypeCombobox } from '../documents/DocTypeCombobox.js';

export function DocRow({
  doc,
  index,
  total,
  appId,
  actor,
  onPreview,
  onRemove,
}: {
  doc: FtDocument;
  index: number;
  total: number;
  appId: string;
  actor: string;
  onPreview: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const replaceRef = useRef<HTMLInputElement>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const toast = useToast();
  const local = getLocalFile(doc.id);
  const busy = doc.processing === 'uploading' || doc.processing === 'processing';
  const retry = (): void => {
    if (local !== undefined) void processDocumentFile(doc.id, local.file, actor);
    else retryWithoutFile(doc.id, actor);
  };
  return (
    <li className="card p-3 sm:p-4">
      <div className="flex gap-3">
        <DocThumb doc={doc} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{doc.filename}</p>
            <ProcessingBadge state={doc.processing} />
            {doc.sampleId !== null && (
              <span className="text-violet text-xs font-semibold">Sample document</span>
            )}
          </div>
          <p className="text-muted tabular mt-0.5 text-xs">
            {doc.pages.length} page(s) · {formatBytes(doc.sizeBytes)} ·{' '}
            {doc.source === 'camera'
              ? 'Camera capture'
              : doc.source === 'demo'
                ? 'Synthetic sample'
                : 'Uploaded file'}
          </p>
          {busy && (
            <div className="mt-2" role="status">
              <div className="bg-line h-1.5 w-full max-w-xs overflow-hidden rounded-full">
                <div
                  className={cn(
                    'bg-primary h-full rounded-full transition-all',
                    doc.processing === 'uploading' ? 'w-1/3' : 'w-2/3',
                  )}
                />
              </div>
              <p className="text-muted mt-1 text-xs">
                {doc.processing === 'uploading'
                  ? 'Reading file in your browser…'
                  : 'Counting pages and checking image quality…'}
              </p>
            </div>
          )}
          {doc.processing === 'failed' && (
            <Notice tone="danger" className="mt-2">
              {doc.failureReason ?? 'Processing failed.'}{' '}
              <button
                type="button"
                className="text-primary font-semibold underline"
                onClick={retry}
              >
                Retry
              </button>
            </Notice>
          )}
          {doc.qualityWarnings.length > 0 && doc.processing !== 'failed' && (
            <ul className="mt-2 space-y-1">
              {doc.qualityWarnings.map((w) => (
                <li key={w} className="text-warn flex gap-1.5 text-xs">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="text-ink/80">{w}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DocTypeCombobox
              value={doc.docType}
              onChange={(v) => {
                setDocType(doc.id, v, actor);
              }}
            />
            <FilterSelect
              label={
                doc.sampleId !== null
                  ? 'Language (sample metadata)'
                  : 'Language — select manually (not auto-detected)'
              }
              value={doc.language ?? ''}
              onChange={(v) => {
                setDocLanguage(doc.id, v === '' ? null : LanguageSchema.parse(v), actor);
              }}
              options={[
                { value: '', label: 'Not set' },
                ...LanguageSchema.options.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] })),
              ]}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5 sm:flex-row sm:items-start">
          <IconButton
            label={`Move ${doc.filename} up`}
            icon={ArrowUp}
            disabled={index === 0}
            onClick={() => {
              moveDocument(appId, doc.id, -1);
            }}
          />
          <IconButton
            label={`Move ${doc.filename} down`}
            icon={ArrowDown}
            disabled={index === total - 1}
            onClick={() => {
              moveDocument(appId, doc.id, 1);
            }}
          />
        </div>
      </div>
      <div className="border-line mt-3 flex flex-wrap gap-1 border-t pt-2">
        <Button size="sm" variant="ghost" icon={Eye} onClick={onPreview}>
          Preview
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCw}
          onClick={() => {
            rotatePage(doc.id, 0, actor);
          }}
        >
          Rotate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Replace}
          onClick={() => {
            setConfirmReplace(true);
          }}
        >
          Replace
        </Button>
        {doc.processing === 'failed' && (
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={retry}>
            Retry
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          onClick={onRemove}
          className="text-danger ml-auto"
        >
          Remove
        </Button>
        <input
          ref={replaceRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f === undefined) return;
            replaceDocumentFile(doc.id, f, actor);
            void processDocumentFile(doc.id, f, actor);
            toast.push({
              tone: 'success',
              title: 'File replaced',
              detail: `${f.name}. Earlier fields were kept and returned for review.`,
            });
          }}
        />
        <ConfirmDialog
          open={confirmReplace}
          title="Replace this document's file?"
          confirmLabel="Choose replacement file"
          onCancel={() => {
            setConfirmReplace(false);
          }}
          onConfirm={() => {
            setConfirmReplace(false);
            replaceRef.current?.click();
          }}
        >
          <p>
            The current file <strong>{doc.filename}</strong> will be replaced. Fields already
            entered are kept but returned to “Unreviewed”, and the change is recorded in the audit
            history.
          </p>
        </ConfirmDialog>
      </div>
    </li>
  );
}
