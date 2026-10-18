import { Camera, FileText, Plus, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Application, FtDocument } from '../../domain/schemas.js';
import { ACCEPT_ATTR, intakeFiles } from '../../lib/processing.js';
import { removeDocument, rotatePage } from '../../state/actions.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog, Dialog } from '../ui/Dialog.js';
import { EmptyState } from '../ui/States.js';
import { cn } from '../ui/cn.js';
import { CameraCapture } from '../documents/CameraCapture.js';
import { DocumentViewer } from '../documents/DocumentViewer.js';
import { DocRow } from './DocRow.js';

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
