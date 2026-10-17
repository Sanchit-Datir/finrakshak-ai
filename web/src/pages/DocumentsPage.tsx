import {
  Download,
  Eye,
  FileQuestion,
  Files,
  LayoutGrid,
  Link2,
  List,
  RefreshCw,
  Replace,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { DocThumb } from '../components/documents/DocThumb.js';
import { DocumentViewer } from '../components/documents/DocumentViewer.js';
import { ExtractedFieldsPanel } from '../components/documents/ExtractedFieldsPanel.js';
import { Button, IconButton } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { ConfirmDialog, Dialog } from '../components/ui/Dialog.js';
import { FilterSelect, SelectField } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { EmptyState, Notice } from '../components/ui/States.js';
import { ProcessingBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { cn } from '../components/ui/cn.js';
import { LANGUAGE_LABEL, PROCESSING_LABEL } from '../domain/labels.js';
import { LanguageSchema, ProcessingStateSchema, type FtDocument } from '../domain/schemas.js';
import { DOC_GROUPS, docTypeLabel } from '../lib/doc-catalog.js';
import { formatBytes } from '../lib/format.js';
import { ACCEPT_ATTR, processDocumentFile } from '../lib/processing.js';
import { matchesQuery } from '../lib/text.js';
import {
  linkDocument,
  replaceDocumentFile,
  retryWithoutFile,
  rotatePage,
} from '../state/actions.js';
import { getLocalFile } from '../state/files.js';
import { useActor, useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';

type Verification = 'all' | 'unreviewed' | 'reviewed' | 'unclear';

function verificationOf(d: FtDocument): Exclude<Verification, 'all'> {
  if (d.fields.some((f) => f.state === 'unclear')) return 'unclear';
  if (d.fields.length === 0 || d.fields.some((f) => f.state === 'unreviewed')) return 'unreviewed';
  return 'reviewed';
}

export function DocumentsPage(): React.JSX.Element {
  const db = useDb();
  const f = useFormat();
  const actor = useActor();
  const toast = useToast();
  const [q, setQ] = useUrlState('q', '');
  const [lang, setLang] = useUrlState('lang', 'all');
  const [proc, setProc] = useUrlState('status', 'all');
  const [type, setType] = useUrlState('type', 'all');
  const [ver, setVer] = useUrlState('verification', 'all');
  const [mode, setMode] = useUrlState('view', 'list');
  const [openId, setOpenId] = useUrlState('doc', '');
  const [linking, setLinking] = useState<FtDocument | null>(null);
  const [replacing, setReplacing] = useState<FtDocument | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      db.documents
        .filter((d) => {
          const app = db.applications.find((a) => a.id === d.applicationId);
          if (lang !== 'all' && (d.language ?? 'unset') !== lang) return false;
          if (proc !== 'all' && d.processing !== proc) return false;
          if (type !== 'all' && (d.docType ?? 'unset') !== type) return false;
          if (ver !== 'all' && verificationOf(d) !== ver) return false;
          return matchesQuery(
            q,
            d.filename,
            d.id,
            d.applicationId,
            docTypeLabel(d.docType),
            app?.data.applicant.fullName,
            app?.data.business.businessName,
            d.uploadedAt.slice(0, 10),
          );
        })
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [db, q, lang, proc, type, ver],
  );

  const open = db.documents.find((d) => d.id === openId) ?? null;
  const reprocess = (d: FtDocument): void => {
    const local = getLocalFile(d.id);
    if (local !== undefined) void processDocumentFile(d.id, local.file, actor);
    else retryWithoutFile(d.id, actor);
    toast.push({
      tone: 'info',
      title: 'Reprocessing requested',
      detail:
        local !== undefined
          ? 'File checks re-run locally. Automatic extraction is not connected.'
          : 'No file is available in this tab; routed to manual entry.',
    });
  };
  const download = (d: FtDocument): void => {
    const local = getLocalFile(d.id);
    if (local === undefined) return;
    const a = document.createElement('a');
    a.href = local.url;
    a.download = d.filename;
    a.click();
  };

  const actions = (d: FtDocument): React.JSX.Element => (
    <div className="flex items-center gap-0.5">
      <IconButton
        label={`Preview ${d.filename}`}
        icon={Eye}
        onClick={() => {
          setOpenId(d.id);
        }}
      />
      <IconButton
        label={`Download ${d.filename}`}
        icon={Download}
        disabled={getLocalFile(d.id) === undefined}
        title={
          getLocalFile(d.id) === undefined
            ? 'Original file not held in this browser tab'
            : `Download ${d.filename}`
        }
        onClick={() => {
          download(d);
        }}
      />
      <IconButton
        label={`Replace ${d.filename}`}
        icon={Replace}
        onClick={() => {
          setReplacing(d);
        }}
      />
      <IconButton
        label={`Reprocess ${d.filename}`}
        icon={RefreshCw}
        onClick={() => {
          reprocess(d);
        }}
      />
      <IconButton
        label={`Link ${d.filename} to application`}
        icon={Link2}
        onClick={() => {
          setLinking(d);
        }}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        docTitle="Document Library"
        title="Document Library"
        subtitle="All captured documents across applications. Documents not yet reviewed are marked."
      />
      <Notice className="mb-4">
        Original files you upload are kept only in this browser tab (no storage backend is
        connected). Role-based document permissions are not enforced in this prototype.
      </Notice>
      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Applicant, application ID, file, date…"
            className="lg:col-span-2"
          />
          <FilterSelect
            label="Document type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All types' },
              { value: 'unset', label: 'Not classified' },
              ...DOC_GROUPS.flatMap((g) =>
                g.types.map((t) => ({ value: t.key, label: `${g.group}: ${t.label}` })),
              ),
            ]}
          />
          <FilterSelect
            label="Language"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'all', label: 'All languages' },
              ...LanguageSchema.options.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] })),
              { value: 'unset', label: 'Not set' },
            ]}
          />
          <FilterSelect
            label="Processing"
            value={proc}
            onChange={setProc}
            options={[
              { value: 'all', label: 'All states' },
              ...ProcessingStateSchema.options.map((s) => ({
                value: s,
                label: PROCESSING_LABEL[s],
              })),
            ]}
          />
          <FilterSelect
            label="Verification"
            value={ver}
            onChange={setVer}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unreviewed', label: 'Not yet reviewed' },
              { value: 'unclear', label: 'Has unclear fields' },
              { value: 'reviewed', label: 'All fields reviewed' },
            ]}
          />
        </div>
        <div className="border-line flex items-center justify-between border-t px-4 py-2">
          <p className="text-muted text-xs" aria-live="polite">
            {rows.length} of {db.documents.length} documents
          </p>
          <div role="group" aria-label="View mode" className="flex gap-1">
            <IconButton
              label="List view"
              icon={List}
              aria-pressed={mode === 'list'}
              className={mode === 'list' ? 'bg-primary-soft text-primary' : ''}
              onClick={() => {
                setMode('list');
              }}
            />
            <IconButton
              label="Thumbnail view"
              icon={LayoutGrid}
              aria-pressed={mode === 'grid'}
              className={mode === 'grid' ? 'bg-primary-soft text-primary' : ''}
              onClick={() => {
                setMode('grid');
              }}
            />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Files} title="No documents match these filters">
            Try clearing a filter, or capture documents from a new application.
          </EmptyState>
        ) : mode === 'grid' ? (
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {rows.map((d) => (
              <li key={d.id} className="border-line rounded-xl border p-2">
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    setOpenId(d.id);
                  }}
                >
                  <DocThumb doc={d} className="h-40 w-full" />
                  <p className="mt-2 truncate text-sm font-medium">{d.filename}</p>
                  <p className="text-muted truncate text-xs">{docTypeLabel(d.docType)}</p>
                </button>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <ProcessingBadge state={d.processing} />
                  {verificationOf(d) !== 'reviewed' && (
                    <span className="text-warn text-xs font-semibold">Not fully reviewed</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DataTable
            caption="Documents"
            rows={rows}
            rowKey={(d) => d.id}
            initialSort={{ key: 'date', dir: 'desc' }}
            columns={[
              {
                key: 'file',
                header: 'File',
                sortValue: (d) => d.filename,
                render: (d) => (
                  <div className="flex items-center gap-3">
                    <DocThumb doc={d} className="h-12 w-9" />
                    <div className="min-w-0">
                      <p className="max-w-[220px] truncate font-medium">{d.filename}</p>
                      <p className="text-muted text-xs">
                        {d.id} · {formatBytes(d.sizeBytes)}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'app',
                header: 'Application',
                sortValue: (d) => d.applicationId ?? '',
                render: (d) =>
                  d.applicationId === null ? (
                    <span className="text-muted">Unlinked</span>
                  ) : (
                    <Link
                      className="text-primary font-semibold hover:underline"
                      to={`/applications/${d.applicationId}?tab=documents`}
                    >
                      {d.applicationId}
                    </Link>
                  ),
              },
              {
                key: 'type',
                header: 'Type',
                sortValue: (d) => docTypeLabel(d.docType),
                render: (d) => (
                  <span className={cn(d.docType === null && 'text-muted')}>
                    {docTypeLabel(d.docType)}
                  </span>
                ),
              },
              {
                key: 'lang',
                header: 'Language',
                sortValue: (d) => d.language ?? '',
                render: (d) =>
                  d.language === null ? (
                    <span className="text-muted">Not set</span>
                  ) : (
                    LANGUAGE_LABEL[d.language]
                  ),
              },
              {
                key: 'by',
                header: 'Uploaded by',
                sortValue: (d) => d.uploadedBy,
                render: (d) => d.uploadedBy,
              },
              {
                key: 'date',
                header: 'Upload date',
                sortValue: (d) => d.uploadedAt,
                render: (d) => (
                  <span className="tabular whitespace-nowrap">{f.date(d.uploadedAt)}</span>
                ),
              },
              {
                key: 'status',
                header: 'Processing',
                sortValue: (d) => d.processing,
                render: (d) => (
                  <div>
                    <ProcessingBadge state={d.processing} />
                    {d.processing === 'failed' && (
                      <p className="text-danger mt-1 max-w-[220px] text-xs">{d.failureReason}</p>
                    )}
                    {verificationOf(d) !== 'reviewed' && d.processing !== 'failed' && (
                      <p className="text-warn mt-1 text-xs font-medium">Not yet reviewed</p>
                    )}
                  </div>
                ),
              },
              { key: 'actions', header: 'Actions', render: actions },
            ]}
          />
        )}
      </Card>

      <Dialog
        open={open !== null}
        onClose={() => {
          setOpenId('');
        }}
        title={open === null ? '' : open.filename}
        description={
          open === null
            ? undefined
            : `${docTypeLabel(open.docType)} · ${open.applicationId ?? 'Unlinked'} · uploaded by ${open.uploadedBy}, ${f.dateTime(open.uploadedAt)}`
        }
        variant="drawer"
      >
        {open === null ? (
          <EmptyState icon={FileQuestion} title="Document not found" />
        ) : (
          <div className="space-y-4">
            <div className="border-line h-[52vh] overflow-hidden rounded-xl border">
              <DocumentViewer
                doc={open}
                onRotate={(p) => {
                  rotatePage(open.id, p, actor);
                }}
              />
            </div>
            <div className="border-line h-[60vh] overflow-hidden rounded-xl border">
              <ExtractedFieldsPanel
                doc={open}
                selectedFieldId={null}
                onSelectField={() => undefined}
                actor={actor}
              />
            </div>
          </div>
        )}
      </Dialog>

      <LinkDialog
        doc={linking}
        onClose={() => {
          setLinking(null);
        }}
        onLink={(appId) => {
          if (linking !== null) {
            linkDocument(linking.id, appId, actor);
            toast.push({ tone: 'success', title: `Linked to ${appId}`, detail: linking.filename });
          }
          setLinking(null);
        }}
      />
      <ConfirmDialog
        open={replacing !== null}
        title="Replace this document's file?"
        confirmLabel="Choose replacement file"
        onCancel={() => {
          setReplacing(null);
        }}
        onConfirm={() => {
          replaceRef.current?.click();
        }}
      >
        <p>
          The file for <strong>{replacing?.filename}</strong> will be replaced. Existing fields are
          kept but returned to review. The change is recorded in the audit history.
        </p>
      </ConfirmDialog>
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file === undefined || replacing === null) return;
          replaceDocumentFile(replacing.id, file, actor);
          void processDocumentFile(replacing.id, file, actor);
          toast.push({ tone: 'success', title: 'File replaced', detail: file.name });
          setReplacing(null);
        }}
      />
    </>
  );
}

function LinkDialog({
  doc,
  onClose,
  onLink,
}: {
  doc: FtDocument | null;
  onClose: () => void;
  onLink: (appId: string) => void;
}): React.JSX.Element {
  const db = useDb();
  const [appId, setAppId] = useState('');
  const choice = appId === '' ? (db.applications[0]?.id ?? '') : appId;
  return (
    <Dialog
      open={doc !== null}
      onClose={onClose}
      title="Link to application"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={choice === ''}
            onClick={() => {
              onLink(choice);
            }}
          >
            Link document
          </Button>
        </>
      }
    >
      <SelectField
        label="Application"
        value={choice}
        onChange={(e) => {
          setAppId(e.target.value);
        }}
      >
        {db.applications.map((a) => (
          <option key={a.id} value={a.id}>
            {a.id} — {a.data.business.businessName || a.data.applicant.fullName || 'Untitled'}
          </option>
        ))}
      </SelectField>
      {(doc?.applicationId ?? null) !== null && (
        <p className="text-muted mt-2 text-xs">
          Currently linked to {doc?.applicationId}; linking moves it.
        </p>
      )}
    </Dialog>
  );
}
