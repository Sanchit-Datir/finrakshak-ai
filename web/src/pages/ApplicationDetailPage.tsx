import {
  CircleCheck,
  Download,
  FileQuestion,
  FileText,
  MessageSquarePlus,
  Pencil,
  Send,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { applicantName } from '../components/applications/ApplicationsTable.js';
import { FindingsTable } from '../components/applications/Findings.js';
import { PublicRecordsCheck } from '../components/applications/PublicRecordsCheck.js';
import { ExtractStep } from '../components/applications/ExtractStep.js';
import { SourceViewerDialog } from '../components/documents/SourceViewerDialog.js';
import { EntityGraph } from '../components/graph/EntityGraph.js';
import { Badge } from '../components/ui/Badge.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { Dialog } from '../components/ui/Dialog.js';
import { Checkbox, TextArea } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { DemoBadge, EmptyState, Notice } from '../components/ui/States.js';
import { AppStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import {
  BORROWER_TYPE_LABEL,
  PRIORITY_LABEL,
  PRODUCT_LABEL,
  SECTION_LABEL,
} from '../domain/labels.js';
import type { Application, Db } from '../domain/schemas.js';
import {
  CATEGORY_LABEL,
  applicationDocs,
  crossChecks,
  loanAlertsForApplication,
  reviewPriority,
  runChecks,
  type CrossVerdict,
  type EvidenceRef,
} from '../lib/checks.js';
import { docTypeLabel } from '../lib/doc-catalog.js';
import { downloadFile, exportHeader } from '../lib/export.js';
import { formatMoney } from '../lib/format.js';
import { addApplicationNote, setApplicationStatus } from '../state/actions.js';
import { useActor, useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';
import { Tabs } from '../components/ui/Tabs.js';

type Tab =
  | 'overview'
  | 'applicant'
  | 'documents'
  | 'verification'
  | 'findings'
  | 'entities'
  | 'timeline'
  | 'audit';

export function ApplicationDetailPage(): React.JSX.Element {
  const { applicationId = '' } = useParams();
  const db = useDb();
  const actor = useActor();
  const f = useFormat();
  const toast = useToast();
  const [tab, setTab] = useUrlState('tab', 'overview');
  const [noteOpen, setNoteOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const app = db.applications.find((a) => a.id === applicationId);

  if (app === undefined) {
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Application not found"
          action={<LinkButton to="/applications">Back to applications</LinkButton>}
        >
          {applicationId} does not exist in this workspace.
        </EmptyState>
      </Card>
    );
  }
  const findings = app.checksRunAt === null ? [] : runChecks(app, db);
  const open = findings.filter((x) => {
    const s = app.findingStates[x.id]?.status;
    return s !== 'resolved' && s !== 'not_an_issue';
  });
  const docs = applicationDocs(app, db);
  const priority = reviewPriority(app, db);
  const borrower = db.borrowers.find((b) => b.id === app.borrowerId);
  const branch = db.branches.find((b) => b.id === app.branchId)?.name ?? '';

  const exportSummary = (): void => {
    const lines = [
      exportHeader(`Review summary — ${app.id}`, `${applicantName(app)} · ${branch}`),
      `Applicant: ${applicantName(app)} (${BORROWER_TYPE_LABEL[app.borrowerType]})`,
      `Product: ${PRODUCT_LABEL[app.data.loan.product]} · Requested: ${formatMoney(app.data.loan.amountMinor)}`,
      `Purpose: ${app.data.loan.purpose}`,
      `Status: ${app.status.replace(/_/g, ' ')} · Review priority: ${priority === null ? 'checks not run' : PRIORITY_LABEL[priority]}`,
      `Checks last run: ${app.checksRunAt ?? 'never'} (deterministic rules; no AI analysis ran)`,
      '',
      'FINDINGS',
      ...findings.flatMap((x, i) => [
        `${i + 1}. [${PRIORITY_LABEL[x.priority]}] ${x.title} — ${CATEGORY_LABEL[x.category]} — status: ${(app.findingStates[x.id]?.status ?? 'needs_review').replace(/_/g, ' ')}`,
        `   Observed: ${x.observed}`,
        `   Next step: ${x.steps[0] ?? '-'}`,
      ]),
      findings.length === 0 ? 'None from configured checks (not a guarantee).' : '',
      '',
      'DOCUMENTS',
      ...docs.map(
        (d) =>
          `- ${docTypeLabel(d.docType)}: ${d.filename} (${d.processing}; ${d.fields.filter((x) => x.state !== 'unreviewed').length}/${d.fields.length} fields reviewed)`,
      ),
    ];
    downloadFile(`${app.id}-review-summary.txt`, lines.join('\n'), 'text/plain');
    toast.push({
      tone: 'success',
      title: 'Review summary exported',
      detail: `${app.id}-review-summary.txt`,
    });
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'applicant' as const, label: 'Applicant & Loan' },
    { key: 'documents' as const, label: 'Documents', count: docs.length },
    { key: 'verification' as const, label: 'Verification' },
    { key: 'findings' as const, label: 'Risk Findings', count: open.length },
    { key: 'entities' as const, label: 'Related Entities' },
    { key: 'timeline' as const, label: 'Timeline & Notes', count: app.notes.length },
    { key: 'audit' as const, label: 'Audit History' },
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'overview') as Tab;

  return (
    <>
      <PageHeader
        docTitle={app.id}
        title={
          <>
            {app.id} · {applicantName(app)}
          </>
        }
        badge={
          <>
            <AppStatusBadge status={app.status} />
            <PriorityBadge priority={priority} />
            <DemoBadge />
          </>
        }
        subtitle={
          <>
            {PRODUCT_LABEL[app.data.loan.product]} ·{' '}
            <span className="tabular">{formatMoney(app.data.loan.amountMinor)}</span> · {branch} ·
            Submitted {f.date(app.submittedAt)}
            {borrower !== undefined && (
              <>
                {' '}
                ·{' '}
                <Link className="text-primary hover:underline" to={`/borrowers/${borrower.id}`}>
                  Borrower profile
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <LinkButton to={`/applications/${app.id}/edit`} icon={Pencil}>
              Edit in workflow
            </LinkButton>
            <Button
              icon={MessageSquarePlus}
              onClick={() => {
                setNoteOpen(true);
              }}
            >
              Add note
            </Button>
            <Button
              icon={Send}
              onClick={() => {
                setRequestOpen(true);
              }}
            >
              Request information
            </Button>
            <Button icon={Download} onClick={exportSummary}>
              Export review summary
            </Button>
            {app.status === 'needs_review' && (
              <Button
                variant="primary"
                icon={CircleCheck}
                onClick={() => {
                  setApplicationStatus(app.id, actor, 'ready_for_decision', 'Review completed');
                  toast.push({
                    tone: 'success',
                    title: 'Marked ready for decision',
                    detail: 'This is a workflow status only — no lending decision was made.',
                  });
                }}
              >
                Mark ready for decision
              </Button>
            )}
          </>
        }
      />
      <Notice className="mb-4">
        Approve / decline actions are not shown: no decision workflow is implemented in this
        prototype. Findings are review prompts and must not be treated as a lending decision.
      </Notice>

      <Tabs
        label="Application sections"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setTab(k);
        }}
      >
        {current === 'overview' && <Overview app={app} db={db} onTab={setTab} />}
        {current === 'applicant' && <ApplicantTab app={app} />}
        {current === 'documents' && <ExtractStep docs={docs} actor={actor} />}
        {current === 'verification' && <VerificationTab app={app} db={db} />}
        {current === 'findings' &&
          (app.checksRunAt === null ? (
            <Card>
              <EmptyState
                icon={FileText}
                title="Checks have not been run"
                action={
                  <LinkButton to={`/applications/${app.id}/edit`}>Open risk analysis</LinkButton>
                }
              >
                Run the configured checks in step 4 of the workflow.
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader
                  title="Risk findings"
                  subtitle={`Checks last run ${f.dateTime(app.checksRunAt)} · deterministic rules · no AI analysis ran`}
                />
                <FindingsTable app={app} findings={findings} actor={actor} />
              </Card>
              {app.data.business.businessName.trim() !== '' && (
                <PublicRecordsCheck app={app} actor={actor} />
              )}
            </div>
          ))}
        {current === 'entities' && (
          <Card className="p-4">
            {borrower === undefined ? (
              <EmptyState icon={FileText} title="No borrower record yet">
                A borrower record is created when the application is submitted.
              </EmptyState>
            ) : (
              <EntityGraph
                db={db}
                roots={[borrower.entityId]}
                title={`Entities related to ${borrower.name}`}
              />
            )}
          </Card>
        )}
        {current === 'timeline' && <Timeline app={app} />}
        {current === 'audit' && <AuditTab app={app} db={db} />}
      </Tabs>

      <Dialog
        open={noteOpen}
        onClose={() => {
          setNoteOpen(false);
        }}
        title="Add a note"
      >
        <NoteForm
          onSubmit={(t) => {
            addApplicationNote(app.id, actor, t);
            setNoteOpen(false);
            toast.push({ tone: 'success', title: 'Note added' });
          }}
        />
      </Dialog>
      <RequestInfoDialog
        open={requestOpen}
        app={app}
        db={db}
        onClose={() => {
          setRequestOpen(false);
        }}
        onSubmit={(msg) => {
          addApplicationNote(app.id, actor, `Information requested: ${msg}`);
          if (app.status !== 'documents_needed')
            setApplicationStatus(
              app.id,
              actor,
              'documents_needed',
              'Information requested from applicant',
            );
          setRequestOpen(false);
          toast.push({
            tone: 'success',
            title: 'Request recorded',
            detail:
              'Status set to “Documents needed”. No message was sent — notifications are not connected.',
          });
        }}
      />
    </>
  );
}

export function NoteForm({
  onSubmit,
  label = 'Note',
}: {
  onSubmit: (text: string) => void;
  label?: string;
}): React.JSX.Element {
  const [text, setText] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() !== '') {
          onSubmit(text.trim());
          setText('');
        }
      }}
    >
      <TextArea
        label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <Button type="submit" variant="primary" disabled={text.trim() === ''}>
        Save note
      </Button>
    </form>
  );
}

function RequestInfoDialog({
  open,
  app,
  db,
  onClose,
  onSubmit,
}: {
  open: boolean;
  app: Application;
  db: Db;
  onClose: () => void;
  onSubmit: (msg: string) => void;
}): React.JSX.Element {
  const missing = db.settings.checklists[app.data.loan.product].filter(
    (t) => !applicationDocs(app, db).some((d) => d.docType === t),
  );
  const [items, setItems] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const text = [...items.map(docTypeLabel), msg.trim()].filter((x) => x !== '').join('; ');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Request information"
      description="Records the request on the application. Sending SMS / email is not connected."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={text === ''}
            onClick={() => {
              onSubmit(text);
              setItems([]);
              setMsg('');
            }}
          >
            Record request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {missing.length > 0 && (
          <p className="text-sm font-medium">Documents not on file for this product:</p>
        )}
        {missing.map((t) => (
          <Checkbox
            key={t}
            label={docTypeLabel(t)}
            checked={items.includes(t)}
            onChange={(e) => {
              setItems((xs) => (e.target.checked ? [...xs, t] : xs.filter((x) => x !== t)));
            }}
          />
        ))}
        <TextArea
          label="Message / other information needed"
          value={msg}
          onChange={(e) => {
            setMsg(e.target.value);
          }}
        />
      </div>
    </Dialog>
  );
}

function Overview({
  app,
  db,
  onTab,
}: {
  app: Application;
  db: Db;
  onTab: (t: string) => void;
}): React.JSX.Element {
  const f = useFormat();
  const docs = applicationDocs(app, db);
  const required = db.settings.checklists[app.data.loan.product];
  const findings =
    app.checksRunAt === null
      ? []
      : runChecks(app, db).filter(
          (x) =>
            x.priority !== 'routine' &&
            !['resolved', 'not_an_issue'].includes(app.findingStates[x.id]?.status ?? ''),
        );
  const tasks = docs.flatMap((d) =>
    d.fields
      .filter((x) => x.state === 'unreviewed' || x.state === 'unclear')
      .map((x) => ({ d, x })),
  );
  const loanAlerts = loanAlertsForApplication(app, db);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Summary</h3>
        <dl className="space-y-2 text-sm">
          {[
            ['Applicant', applicantName(app)],
            ['Borrower type', BORROWER_TYPE_LABEL[app.borrowerType]],
            ['Product', PRODUCT_LABEL[app.data.loan.product]],
            ['Requested', formatMoney(app.data.loan.amountMinor)],
            ['Purpose', app.data.loan.purpose || '—'],
            ['Created by', `${app.createdBy}, ${f.date(app.createdAt)}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Document checklist</h3>
        <ul className="space-y-1.5 text-sm">
          {required.map((t) => {
            const has = docs.some((d) => d.docType === t && d.processing !== 'failed');
            return (
              <li key={t} className="flex items-center justify-between gap-2">
                <span>{docTypeLabel(t)}</span>
                {has ? (
                  <Badge tone="ok" icon={CircleCheck}>
                    On file
                  </Badge>
                ) : (
                  <Badge tone="warn" icon={FileQuestion}>
                    Missing
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-muted mt-3 text-xs">
          Checklist configured for this product in Settings.
        </p>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Outstanding verification</h3>
        {tasks.length === 0 ? (
          <p className="text-muted text-sm">All extracted fields reviewed.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tasks.slice(0, 6).map(({ d, x }) => (
              <li key={x.id}>
                {x.label}{' '}
                <span className="text-muted">
                  — {d.filename} ({x.state})
                </span>
              </li>
            ))}
          </ul>
        )}
        {tasks.length > 0 && (
          <Button
            size="sm"
            className="mt-3"
            onClick={() => {
              onTab('documents');
            }}
          >
            Review fields ({tasks.length})
          </Button>
        )}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          title="Findings requiring attention"
          actions={
            <Button
              size="sm"
              onClick={() => {
                onTab('findings');
              }}
            >
              All findings
            </Button>
          }
        />
        {findings.length === 0 ? (
          <p className="text-muted px-5 pb-5 text-sm">
            {app.checksRunAt === null
              ? 'Checks not yet run.'
              : 'None open at Needs attention or Urgent review.'}
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {findings.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <PriorityBadge priority={x.priority} />
                <span className="font-medium">{x.title}</span>
              </li>
            ))}
          </ul>
        )}
        {loanAlerts.length > 0 && (
          <p className="border-line border-t px-5 py-3 text-sm">
            Post-disbursement: {loanAlerts.length} monitoring alert(s) on the resulting loan.{' '}
            <Link
              className="text-primary font-semibold hover:underline"
              to={`/monitoring?loan=${loanAlerts[0]?.loanId ?? ''}`}
            >
              Open monitoring
            </Link>
          </p>
        )}
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Recent actions & notes</h3>
        <ul className="space-y-2 text-sm">
          {[...app.audit]
            .reverse()
            .slice(0, 5)
            .map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.action}</span>{' '}
                <span className="text-muted">
                  — {a.actor}, {f.dateTime(a.at)}
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function ApplicantTab({ app }: { app: Application }): React.JSX.Element {
  const d = app.data;
  const groups: [string, [string, string][]][] = [
    [
      SECTION_LABEL.applicant,
      [
        ['Full name', d.applicant.fullName],
        ['Original script', d.applicant.nameOriginal],
        ['Father / spouse', d.applicant.fatherOrSpouse],
        ['Date of birth', d.applicant.dob],
        ['Mobile', d.applicant.mobile],
      ],
    ],
    [
      SECTION_LABEL.loan,
      [
        ['Product', PRODUCT_LABEL[d.loan.product]],
        ['Amount', formatMoney(d.loan.amountMinor)],
        ['Tenure', d.loan.tenureMonths === null ? '' : `${d.loan.tenureMonths} months`],
        ['Purpose', d.loan.purpose],
      ],
    ],
    [
      SECTION_LABEL.address,
      [
        ['Address', d.address.line],
        ['Village', d.address.village],
        ['Taluka', d.address.taluka],
        ['District', d.address.district],
        ['PIN', d.address.pincode],
      ],
    ],
    [
      SECTION_LABEL.financial,
      [
        ['Occupation', d.financial.occupation],
        ['Declared annual income', formatMoney(d.financial.declaredAnnualIncomeMinor)],
        ['Existing liabilities', formatMoney(d.financial.existingLiabilitiesMinor)],
      ],
    ],
    [
      SECTION_LABEL.collateral,
      [
        ['Survey / Gat no.', d.collateral.surveyNumber],
        [
          'Land area',
          d.collateral.landArea === '' ? '' : `${d.collateral.landArea} ${d.collateral.landUnit}`,
        ],
        ['Warehouse receipt', d.collateral.warehouseReceiptNo],
        ['Collateral value', formatMoney(d.collateral.collateralValueMinor)],
      ],
    ],
    [
      SECTION_LABEL.business,
      [
        ['Business name', d.business.businessName],
        ['Registration', d.business.registrationNo],
        ['GSTIN', d.business.gstin],
        ['Udyam', d.business.udyamNo],
      ],
    ],
    [
      SECTION_LABEL.guarantor,
      [
        ['Name', d.guarantor.name],
        ['Relationship', d.guarantor.relation],
      ],
    ],
    [
      SECTION_LABEL.declaration,
      [
        ['Purpose declaration signed', d.declaration.purposeDeclared ? 'Yes' : 'Not recorded'],
        ['Remarks', d.declaration.remarks],
      ],
    ],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map(([title, rows]) => (
        <Card key={title} className="p-5">
          <h3 className="mb-3 font-semibold">{title}</h3>
          <dl className="space-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd
                  className="text-right font-medium break-words"
                  lang={/[ऀ-ॿ]/.test(v) ? 'mr' : undefined}
                >
                  {v === '' ? '—' : v}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}

const VERDICT: Record<CrossVerdict, { label: string; tone: 'ok' | 'info' | 'danger' | 'neutral' }> =
  {
    match: { label: 'Consistent', tone: 'ok' },
    variation: { label: 'Variation', tone: 'info' },
    conflict: { label: 'Inconsistent', tone: 'danger' },
    not_available: { label: 'Not checked', tone: 'neutral' },
  };

function VerificationTab({ app, db }: { app: Application; db: Db }): React.JSX.Element {
  const rows = crossChecks(app, db);
  const [src, setSrc] = useState<EvidenceRef | null>(null);
  return (
    <Card>
      <CardHeader
        title="Cross-verification"
        subtitle="Application values compared with document fields. Fuzzy name similarity is not proof of identity."
      />
      <DataTable
        caption="Cross-verification"
        rows={rows}
        rowKey={(r) => `${r.label}-${r.fieldId ?? ''}`}
        empty={
          <EmptyState icon={FileText} title="Nothing to compare yet">
            Review document fields such as name, date of birth or survey number to enable
            comparisons.
          </EmptyState>
        }
        columns={[
          {
            key: 'label',
            header: 'Item',
            render: (r) => <span className="font-medium">{r.label}</span>,
          },
          {
            key: 'form',
            header: 'Application',
            render: (r) => <span lang="mr">{r.formValue}</span>,
          },
          { key: 'doc', header: 'Document', render: (r) => <span lang="mr">{r.docValue}</span> },
          {
            key: 'verdict',
            header: 'Result',
            render: (r) => <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Badge>,
          },
          {
            key: 'note',
            header: 'Note',
            render: (r) => <span className="text-muted text-xs">{r.note}</span>,
          },
          {
            key: 'src',
            header: 'Source',
            render: (r) =>
              r.docId === null ? (
                '—'
              ) : (
                <button
                  type="button"
                  className="text-primary text-sm font-semibold hover:underline"
                  onClick={() => {
                    setSrc({
                      label: r.label,
                      value: r.docValue,
                      docId: r.docId,
                      fieldId: r.fieldId,
                      appId: app.id,
                    });
                  }}
                >
                  View source
                </button>
              ),
          },
        ]}
      />
      <SourceViewerDialog
        docId={src?.docId ?? null}
        fieldId={src?.fieldId ?? null}
        onClose={() => {
          setSrc(null);
        }}
      />
    </Card>
  );
}

function Timeline({ app }: { app: Application }): React.JSX.Element {
  const f = useFormat();
  const items = [
    ...app.notes.map((n) => ({ id: n.id, at: n.at, who: n.author, what: n.text, note: true })),
    ...app.audit.map((a) => ({
      id: a.id,
      at: a.at,
      who: a.actor,
      what: `${a.action}: ${a.detail}`,
      note: false,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card className="p-5">
      <ol className="border-line space-y-4 border-l pl-5">
        {items.map((i) => (
          <li key={i.id} className="relative">
            <span
              aria-hidden
              className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full ${i.note ? 'bg-primary' : 'bg-line'}`}
            />
            <p className="text-sm">
              {i.note && <span className="text-primary mr-1 text-xs font-semibold">NOTE</span>}
              {i.what}
            </p>
            <p className="text-muted text-xs">
              {i.who} · {f.dateTime(i.at)}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function AuditTab({ app, db }: { app: Application; db: Db }): React.JSX.Element {
  const f = useFormat();
  const rows = [
    ...app.audit.map((a) => ({ ...a, scope: 'Application' })),
    ...applicationDocs(app, db).flatMap((d) =>
      d.audit.map((a) => ({ ...a, scope: `${d.id} · ${d.filename}` })),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card>
      <CardHeader
        title="Audit history"
        subtitle="User corrections are recorded separately from machine-extracted values."
      />
      <DataTable
        caption="Audit history"
        rows={rows}
        rowKey={(r) => `${r.scope}-${r.id}`}
        dense
        initialSort={{ key: 'at', dir: 'desc' }}
        columns={[
          {
            key: 'at',
            header: 'When',
            sortValue: (r) => r.at,
            render: (r) => <span className="tabular whitespace-nowrap">{f.dateTime(r.at)}</span>,
          },
          { key: 'actor', header: 'Who', sortValue: (r) => r.actor, render: (r) => r.actor },
          {
            key: 'scope',
            header: 'Record',
            sortValue: (r) => r.scope,
            render: (r) => <span className="text-muted text-xs">{r.scope}</span>,
          },
          {
            key: 'action',
            header: 'Action',
            sortValue: (r) => r.action,
            render: (r) => <span className="font-medium">{r.action}</span>,
          },
          {
            key: 'detail',
            header: 'Detail',
            render: (r) => (
              <span className="text-xs" lang="mr">
                {r.detail}
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}
