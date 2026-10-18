import {
  ArrowDown,
  ArrowUp,
  Camera,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Replace,
  RotateCw,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LANGUAGE_LABEL } from '../../domain/labels.js';
import { LanguageSchema, type Application, type FtDocument } from '../../domain/schemas.js';
import { formatBytes } from '../../lib/format.js';
import { ACCEPT_ATTR, intakeFiles, processDocumentFile } from '../../lib/processing.js';
import {
  moveDocument,
  removeDocument,
  replaceDocumentFile,
  retryWithoutFile,
  rotatePage,
  setDocLanguage,
  setDocType,
} from '../../state/actions.js';
import { getLocalFile } from '../../state/files.js';
import { useToast } from '../../state/toast.js';
import { Button, IconButton } from '../ui/Button.js';
import { ConfirmDialog, Dialog } from '../ui/Dialog.js';
import { FilterSelect } from '../ui/Field.js';
import { EmptyState, Notice } from '../ui/States.js';
import { ProcessingBadge } from '../ui/StatusBadges.js';
import { cn } from '../ui/cn.js';
import { CameraCapture } from '../documents/CameraCapture.js';
import { DocThumb } from '../documents/DocThumb.js';
import { DocTypeCombobox } from '../documents/DocTypeCombobox.js';
import { DocumentViewer } from '../documents/DocumentViewer.js';

export function CaptureStep({
  app,
  docs,
  actor,
  ensureApp,
  onFillForm,
}: {
  app: Application | null;
  docs: FtDocument[];
  actor: string;
  ensureApp: () => string;
  onFillForm: () => void;
}): React.JSX.Element {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<FtDocument | null>(null);
  const [removing, setRemoving] = useState<FtDocument | null>(null);

  const addFiles = (files: File[], source: 'upload' | 'camera'): void => {
    if (files.length === 0) return;
    const appId = ensureApp();
    intakeFiles(appId, files, source, actor);
    toast.push({
      tone: 'success',
      title: `${files.length} file(s) added`,
      detail: 'Files stay in this browser tab only — no upload backend is connected.',
    });
  };

  // Native drag-and-drop listeners; the buttons below provide the keyboard-accessible path.
  const dropRef = useRef<HTMLDivElement>(null);
  const addRef = useRef(addFiles);
  useEffect(() => {
    addRef.current = addFiles;
  });
  useEffect(() => {
    const el = dropRef.current;
    if (el === null) return;
    const over = (e: DragEvent): void => {
      e.preventDefault();
      setDrag(true);
    };
    const leave = (): void => {
      setDrag(false);
    };
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      setDrag(false);
      addRef.current([...(e.dataTransfer?.files ?? [])], 'upload');
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="font-semibold">Upload documents</h3>
          <p className="text-muted text-sm">
            The application is created from the document fields you confirm. You do not need to fill
            the application form.
          </p>
        </div>
        <Button icon={FileText} onClick={onFillForm} className="h-12 shrink-0 px-5">
          Fill the form instead
        </Button>
      </div>
      <div
        ref={dropRef}
        className={cn(
          'rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          drag ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
        )}
      >
        <div className="bg-primary-soft text-primary mx-auto mb-3 flex size-14 items-center justify-center rounded-full">
          <Upload className="size-7" aria-hidden />
        </div>
        <p className="text-lg font-semibold">Drop documents here or browse files.</p>
        <p className="text-muted mt-1 text-sm">
          PDF, JPG or PNG. Marathi and English documents supported.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            variant="primary"
            icon={Camera}
            onClick={() => {
              setCamera(true);
            }}
            className="h-12 px-5"
          >
            Scan document
          </Button>
          <Button icon={Upload} onClick={() => inputRef.current?.click()} className="h-12 px-5">
            Upload files
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])], 'upload');
            e.target.value = '';
          }}
        />
      </div>

      <section aria-labelledby="doclist-h">
        <div className="mb-2 flex items-center justify-between">
          <h3 id="doclist-h" className="font-semibold">
            Documents for this application{' '}
            <span className="text-muted tabular">({docs.length})</span>
          </h3>
          {docs.length > 0 && (
            <Button size="sm" icon={Plus} onClick={() => inputRef.current?.click()}>
              Add another document
            </Button>
          )}
        </div>
        {docs.length === 0 ? (
          <div className="card">
            <EmptyState icon={Upload} title="No documents yet">
              Scan or upload documents to extract and verify their details, or fill the application
              form instead.
            </EmptyState>
          </div>
        ) : (
          <ol className="space-y-3">
            {docs.map((doc, i) => (
              <DocRow
                key={doc.id}
                doc={doc}
                index={i}
                total={docs.length}
                appId={app?.id ?? ''}
                actor={actor}
                onPreview={() => {
                  setPreview(doc);
                }}
                onRemove={() => {
                  setRemoving(doc);
                }}
              />
            ))}
          </ol>
        )}
      </section>

      <CameraCapture
        open={camera}
        onClose={() => {
          setCamera(false);
        }}
        onCapture={(files) => {
          addFiles(files, 'camera');
        }}
      />
      <Dialog
        open={preview !== null}
        onClose={() => {
          setPreview(null);
        }}
        title={preview?.filename ?? ''}
        wide
      >
        {preview !== null && (
          <div className="h-[70vh]">
            <DocumentViewer
              doc={docs.find((d) => d.id === preview.id) ?? preview}
              onRotate={(p) => {
                rotatePage(preview.id, p, actor);
              }}
            />
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        title="Remove this document?"
        confirmLabel="Remove document"
        danger
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing !== null) {
            removeDocument(removing.id, actor);
            toast.push({ tone: 'success', title: 'Document removed', detail: removing.filename });
          }
          setRemoving(null);
        }}
      >
        <p>
          <strong>{removing?.filename}</strong> and any fields entered for it will be removed from
          this application. The removal is recorded in the audit history.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function DocRow({
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
