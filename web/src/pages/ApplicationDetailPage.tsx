export { NoteForm } from '../components/applications/detail/NoteForm.js';

import {
  CircleCheck,
  Download,
  FileQuestion,
  FileText,
  Info,
  MessageSquarePlus,
  Pencil,
  Send,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ApplicationSummaryBar } from '../components/applications/ApplicationSummaryBar.js';
import { applicantName } from '../components/applications/ApplicationsTable.js';
import { ActionMenu } from '../components/ui/ActionMenu.js';
import type { MenuAction } from '../components/ui/ActionMenu.js';
import { FindingsTable } from '../components/applications/Findings.js';
import { PublicRecordsCheck } from '../components/applications/PublicRecordsCheck.js';
import { ExtractStep } from '../components/applications/ExtractStep.js';
import { EntityGraph } from '../components/graph/EntityGraph.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { Dialog } from '../components/ui/Dialog.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/States.js';
import { AppStatusBadge } from '../components/ui/StatusBadges.js';
import { BORROWER_TYPE_LABEL, PRIORITY_LABEL, PRODUCT_LABEL } from '../domain/labels.js';
import { CATEGORY_LABEL, applicationDocs, reviewPriority, runChecks } from '../lib/checks.js';
import { docTypeLabel } from '../lib/doc-catalog.js';
import { downloadFile, exportHeader } from '../lib/export.js';
import { formatMoney } from '../lib/format.js';
import { addApplicationNote, setApplicationStatus } from '../state/actions.js';
import { useActor, useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';
import { useCopilotTarget } from '../state/copilot.js';
import { Tabs } from '../components/ui/Tabs.js';
import { PinButton } from '../components/ui/PinButton.js';
import { Overview } from '../components/applications/detail/Overview.js';
import { ApplicantTab } from '../components/applications/detail/ApplicantTab.js';
import { VerificationTab } from '../components/applications/detail/VerificationTab.js';
import { Timeline } from '../components/applications/detail/Timeline.js';
import { AuditTab } from '../components/applications/detail/AuditTab.js';
import { NoteForm } from '../components/applications/detail/NoteForm.js';
import { RequestInfoDialog } from '../components/applications/detail/RequestInfoDialog.js';

type Tab = 'overview' | 'documents' | 'findings' | 'activity';

/** Older links used eight tab names; map them onto the four merged sections. */
const TAB_ALIAS: Record<string, Tab> = {
  overview: 'overview',
  applicant: 'overview',
  documents: 'documents',
  verification: 'documents',
  findings: 'findings',
  entities: 'findings',
  activity: 'activity',
  timeline: 'activity',
  audit: 'activity',
};

function tabFor(key: string): Tab {
  return TAB_ALIAS[key] ?? 'overview';
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section>
      <h2 className="text-muted mb-3 text-xs font-semibold tracking-wider uppercase">{title}</h2>
      {children}
    </section>
  );
}

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
  useCopilotTarget(app === undefined ? null : { kind: 'application', id: app.id });

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
    { key: 'documents' as const, label: 'Documents & verification', count: docs.length },
    { key: 'findings' as const, label: 'Findings & entities', count: open.length },
    { key: 'activity' as const, label: 'Activity', count: app.notes.length },
  ];
  const current = tabFor(tab);
  const goTab = (k: string): void => {
    setTab(tabFor(k));
  };
  const moreActions: MenuAction[] = [
    {
      label: 'Add note',
      icon: MessageSquarePlus,
      onSelect: () => {
        setNoteOpen(true);
      },
    },
    {
      label: 'Request information',
      icon: Send,
      onSelect: () => {
        setRequestOpen(true);
      },
    },
    { label: 'Export review summary', icon: Download, onSelect: exportSummary },
    ...(borrower === undefined
      ? []
      : [{ label: 'Open borrower profile', icon: UserRound, to: `/borrowers/${borrower.id}` }]),
  ];

  return (
    <>
      <PageHeader
        docTitle={app.id}
        title={
          <>
            {app.id} · {applicantName(app)}
          </>
        }
        badge={<AppStatusBadge status={app.status} />}
        subtitle={
          <>
            {PRODUCT_LABEL[app.data.loan.product]} ·{' '}
            <span className="tabular">{formatMoney(app.data.loan.amountMinor)}</span> · {branch} ·
            Submitted {f.date(app.submittedAt)}
            <span className="text-muted mt-1 flex items-center gap-1.5 text-xs">
              <Info className="size-3.5 shrink-0" aria-hidden />
              Findings are review prompts, not a lending decision. Approve / decline is not part of
              this prototype.
            </span>
          </>
        }
        actions={
          <>
            <PinButton
              pin={{
                href: `/applications/${app.id}`,
                title: `${app.id} · ${applicantName(app)}`,
                kind: 'application',
              }}
            />
            <LinkButton to={`/applications/${app.id}/edit`} icon={Pencil}>
              Edit
            </LinkButton>
            <ActionMenu actions={moreActions} />
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
      <ApplicationSummaryBar
        app={app}
        db={db}
        priority={priority}
        openFindings={open.length}
        onGo={goTab}
      />

      <Tabs label="Application sections" tabs={tabs} value={current} onChange={goTab}>
        {current === 'overview' && (
          <div className="space-y-8">
            <Overview app={app} db={db} onTab={goTab} />
            <Section title="Applicant & loan">
              <ApplicantTab app={app} />
            </Section>
          </div>
        )}
        {current === 'documents' && (
          <div className="space-y-8">
            <ExtractStep docs={docs} actor={actor} />
            <Section title="Cross-verification">
              <VerificationTab app={app} db={db} />
            </Section>
          </div>
        )}
        {current === 'findings' && (
          <div className="space-y-8">
            {app.checksRunAt === null ? (
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
            )}
            <Section title="Related entities">
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
            </Section>
          </div>
        )}
        {current === 'activity' && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Timeline & notes">
              <Timeline app={app} />
            </Section>
            <Section title="Audit history">
              <AuditTab app={app} db={db} />
            </Section>
          </div>
        )}
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
