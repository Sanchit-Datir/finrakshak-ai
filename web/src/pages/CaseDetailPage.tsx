import {
  Download,
  ExternalLink,
  FileQuestion,
  MessageSquarePlus,
  Plus,
  RefreshCcw,
  UserRoundCog,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { EntityGraph } from '../components/graph/EntityGraph.js';
import { AlertDrawer, entityLabel } from '../components/monitoring/AlertDrawer.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { Dialog } from '../components/ui/Dialog.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState, Notice } from '../components/ui/States.js';
import {
  AlertStatusBadge,
  CaseStatusBadge,
  EvidenceStatusBadge,
  PriorityBadge,
} from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { Tabs } from '../components/ui/Tabs.js';
import { PinButton } from '../components/ui/PinButton.js';
import {
  CASE_STATUS_LABEL,
  EVIDENCE_STATUS_LABEL,
  EVIDENCE_TYPE_LABEL,
  PRIORITY_LABEL,
  TXN_TYPE_LABEL,
} from '../domain/labels.js';
import { allAlerts } from '../lib/alerts.js';
import { CATEGORY_LABEL, runChecks } from '../lib/checks.js';
import { downloadFile, exportHeader } from '../lib/export.js';
import { formatMoney } from '../lib/format.js';
import { addCaseEvidence, addCaseNote, assignCase, setCaseStatus } from '../state/actions.js';
import { useActor, useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';
import { useCopilotTarget } from '../state/copilot.js';
import { NoteForm } from './ApplicationDetailPage.js';
import { Checklist } from '../components/investigations/Checklist.js';
import { StatusDialog } from '../components/investigations/StatusDialog.js';
import { AssignDialog } from '../components/investigations/AssignDialog.js';
import { EvidenceDialog } from '../components/investigations/EvidenceDialog.js';

type Tab = 'overview' | 'evidence' | 'network' | 'timeline' | 'findings' | 'notes' | 'audit';

const DAY = 86_400_000;

export function CaseDetailPage(): React.JSX.Element {
  const { caseId = '' } = useParams();
  const db = useDb();
  const actor = useActor();
  const f = useFormat();
  const toast = useToast();
  const [tab, setTab] = useUrlState('tab', 'overview');
  const [dialog, setDialog] = useState<'status' | 'assign' | 'note' | 'evidence' | null>(null);
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const c = db.cases.find((x) => x.id === caseId);
  useCopilotTarget(c === undefined ? null : { kind: 'case', id: c.id });
  if (c === undefined)
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Case not found"
          action={<LinkButton to="/investigations">Back to investigations</LinkButton>}
        >
          {caseId} does not exist in this workspace.
        </EmptyState>
      </Card>
    );

  const alerts = allAlerts(db).filter(
    (a) => c.alertIds.includes(a.id) || (a.loanId !== null && c.loanIds.includes(a.loanId)),
  );
  const apps = db.applications.filter((a) => c.applicationIds.includes(a.id));
  const findings = apps.flatMap((a) =>
    a.checksRunAt === null
      ? []
      : runChecks(a, db)
          .filter((x) => x.priority !== 'routine')
          .map((x) => ({ app: a, x })),
  );
  const loans = db.loans.filter((l) => c.loanIds.includes(l.id));
  const txns = loans
    .flatMap((l) => {
      const s = new Date(l.disbursedAt).getTime();
      return db.transactions.filter(
        (t) =>
          t.loanId === l.id ||
          (t.loanId === null &&
            new Date(t.at).getTime() >= s &&
            new Date(t.at).getTime() <= s + l.monitoringDays * DAY),
      );
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const flagged = new Set(alerts.flatMap((a) => a.monitoring?.transactionIds ?? []));
  const roots =
    c.entityIds.length > 0
      ? c.entityIds
      : c.borrowerIds.flatMap((b) => db.borrowers.filter((x) => x.id === b).map((x) => x.entityId));

  const exportSummary = (): void => {
    const lines = [
      exportHeader(`Case summary — ${c.id}`, c.title),
      `Title: ${c.title}`,
      `Priority: ${PRIORITY_LABEL[c.priority]} · Status: ${CASE_STATUS_LABEL[c.status]} · Owner: ${c.owner}`,
      `Opened: ${c.openedAt} · Updated: ${c.updatedAt}`,
      `Summary: ${c.summary}`,
      c.outcome === null ? '' : `Outcome: ${c.outcome}`,
      '',
      'EVIDENCE',
      ...c.evidence.map(
        (e) =>
          `- [${EVIDENCE_STATUS_LABEL[e.status]}] ${e.sourceName} (${EVIDENCE_TYPE_LABEL[e.sourceType]}) — ${e.reference}: ${e.excerpt}`,
      ),
      '',
      'LINKED ALERTS',
      ...alerts.map((a) => `- ${a.title} (${a.status})`),
      '',
      'CHECKLIST',
      ...c.checklist.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`),
      '',
      'NOTES',
      ...c.notes.map((n) => `- ${n.at} ${n.author}: ${n.text}`),
      '',
      'AUDIT',
      ...c.audit.map((a) => `- ${a.at} ${a.actor}: ${a.action} — ${a.detail}`),
    ];
    downloadFile(`${c.id}-summary.txt`, lines.join('\n'), 'text/plain');
    toast.push({ tone: 'success', title: 'Case summary exported', detail: `${c.id}-summary.txt` });
  };

  const tabs = [
    { key: 'overview' as const, label: 'Case overview' },
    { key: 'evidence' as const, label: 'Evidence', count: c.evidence.length },
    { key: 'network' as const, label: 'Entity network' },
    { key: 'timeline' as const, label: 'Financial timeline', count: txns.length },
    { key: 'findings' as const, label: 'Findings', count: alerts.length + findings.length },
    { key: 'notes' as const, label: 'Notes & actions', count: c.notes.length },
    { key: 'audit' as const, label: 'Audit history' },
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'overview') as Tab;

  return (
    <>
      <PageHeader
        docTitle={c.id}
        title={
          <>
            {c.id} · {c.title}
          </>
        }
        badge={
          <>
            <PriorityBadge priority={c.priority} />
            <CaseStatusBadge status={c.status} />
          </>
        }
        subtitle={
          <>
            Assigned to <strong>{c.owner}</strong> · Opened {f.dateTime(c.openedAt)} · Updated{' '}
            {f.dateTime(c.updatedAt)}
          </>
        }
        actions={
          <>
            <PinButton
              pin={{ href: `/investigations/${c.id}`, title: `${c.id} · ${c.title}`, kind: 'case' }}
            />
            <Button
              icon={UserRoundCog}
              onClick={() => {
                setDialog('assign');
              }}
            >
              Assign
            </Button>
            <Button
              icon={MessageSquarePlus}
              onClick={() => {
                setDialog('note');
              }}
            >
              Add note
            </Button>
            <Button icon={Download} onClick={exportSummary}>
              Export case summary
            </Button>
            <Button
              variant="primary"
              icon={RefreshCcw}
              onClick={() => {
                setDialog('status');
              }}
            >
              Change status
            </Button>
          </>
        }
      />
      <Notice className="mb-4">
        A case collects evidence for review. It does not label any person or entity as guilty;
        outcomes must be based on verified evidence.
      </Notice>

      <Tabs
        label="Case sections"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setTab(k);
        }}
      >
        {current === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h3 className="mb-2 font-semibold">Summary</h3>
              <p className="text-sm">{c.summary || '—'}</p>
              {c.outcome !== null && (
                <Notice tone="info" title="Recorded outcome" className="mt-3">
                  {c.outcome}
                </Notice>
              )}
              <h3 className="mt-5 mb-2 font-semibold">Linked records</h3>
              <ul className="space-y-1 text-sm">
                {c.borrowerIds.map((b) => (
                  <li key={b}>
                    Borrower:{' '}
                    <Link className="text-primary hover:underline" to={`/borrowers/${b}`}>
                      {db.borrowers.find((x) => x.id === b)?.name ?? b}
                    </Link>
                  </li>
                ))}
                {c.applicationIds.map((a) => (
                  <li key={a}>
                    Application:{' '}
                    <Link className="text-primary hover:underline" to={`/applications/${a}`}>
                      {a}
                    </Link>
                  </li>
                ))}
                {c.loanIds.map((l) => (
                  <li key={l}>
                    Loan:{' '}
                    <Link className="text-primary hover:underline" to={`/monitoring?loan=${l}`}>
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h3 className="mb-2 font-semibold">Next actions</h3>
              <Checklist c={c} actor={actor} />
            </Card>
          </div>
        )}
        {current === 'evidence' && (
          <Card>
            <CardHeader
              title="Evidence"
              subtitle="Each item keeps its source, exact excerpt and verification status."
              actions={
                <Button
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    setDialog('evidence');
                  }}
                >
                  Add evidence
                </Button>
              }
            />
            {c.evidence.length === 0 ? (
              <EmptyState icon={FileQuestion} title="No evidence recorded yet">
                Add documents, transaction references or internal records that support or contradict
                the concern.
              </EmptyState>
            ) : (
              <ul className="divide-line divide-y">
                {c.evidence.map((e) => (
                  <li key={e.id} className="px-5 py-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{e.sourceName}</p>
                      <EvidenceStatusBadge status={e.status} />
                      <span className="text-muted text-xs">
                        {EVIDENCE_TYPE_LABEL[e.sourceType]}
                      </span>
                    </div>
                    <blockquote
                      className="border-primary bg-surface-2 mt-2 rounded-r-lg border-l-4 px-3 py-2"
                      lang="mr"
                    >
                      “{e.excerpt}”
                    </blockquote>
                    <p className="text-muted mt-1 text-xs">
                      Reference: {e.reference} · Collected {f.dateTime(e.collectedAt)}
                    </p>
                    {e.link !== null && (
                      <Link
                        to={e.link}
                        className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      >
                        <ExternalLink className="size-3.5" aria-hidden /> Open original source
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {current === 'network' && (
          <Card className="p-4">
            {roots.length === 0 ? (
              <EmptyState icon={FileQuestion} title="No entities linked to this case" />
            ) : (
              <EntityGraph db={db} roots={roots} title={`Entity network for ${c.id}`} />
            )}
          </Card>
        )}
        {current === 'timeline' && (
          <Card>
            <CardHeader
              title="Financial timeline"
              subtitle="Observed transactions for linked loans; flagged rows are part of a linked alert."
            />
            <DataTable
              caption="Financial timeline"
              rows={txns}
              rowKey={(t) => t.id}
              dense
              empty={
                <EmptyState
                  icon={FileQuestion}
                  title="No transaction records are available for this case."
                />
              }
              columns={[
                {
                  key: 'at',
                  header: 'Date / time',
                  render: (t) => (
                    <span className="tabular whitespace-nowrap">{f.dateTime(t.at)}</span>
                  ),
                },
                { key: 'id', header: 'ID', render: (t) => t.id },
                {
                  key: 'from',
                  header: 'From',
                  render: (t) => <span className="text-xs">{entityLabel(db, t.fromId)}</span>,
                },
                {
                  key: 'to',
                  header: 'To',
                  render: (t) => <span className="text-xs">{entityLabel(db, t.toId)}</span>,
                },
                {
                  key: 'amt',
                  header: 'Amount',
                  align: 'right',
                  render: (t) => formatMoney(t.amountMinor),
                },
                { key: 'type', header: 'Type', render: (t) => TXN_TYPE_LABEL[t.type] },
                {
                  key: 'flag',
                  header: 'In linked alert',
                  render: (t) =>
                    flagged.has(t.id) ? (
                      <span className="text-warn text-xs font-semibold">Yes</span>
                    ) : (
                      <span className="text-muted text-xs">No</span>
                    ),
                },
              ]}
            />
          </Card>
        )}
        {current === 'findings' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Linked alerts" />
              {alerts.length === 0 ? (
                <EmptyState icon={FileQuestion} title="No linked alerts" />
              ) : (
                <ul className="divide-line divide-y">
                  {alerts.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <div className="flex gap-2">
                        <PriorityBadge priority={a.priority} />
                        <AlertStatusBadge status={a.status} />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenAlert(a.id);
                        }}
                        className="text-primary mt-1 text-left text-sm font-semibold hover:underline"
                      >
                        {a.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Application findings" />
              {findings.length === 0 ? (
                <EmptyState icon={FileQuestion} title="No application findings" />
              ) : (
                <ul className="divide-line divide-y">
                  {findings.map(({ app, x }) => (
                    <li key={x.id} className="px-5 py-3">
                      <PriorityBadge priority={x.priority} />
                      <Link
                        to={`/applications/${app.id}?tab=findings`}
                        className="text-primary mt-1 block text-sm font-semibold hover:underline"
                      >
                        {app.id}: {x.title}
                      </Link>
                      <p className="text-muted text-xs">{CATEGORY_LABEL[x.category]}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
        {current === 'notes' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Notes</h3>
              <NoteForm
                onSubmit={(t) => {
                  addCaseNote(c.id, actor, t);
                  toast.push({ tone: 'success', title: 'Note added' });
                }}
                label="Add an investigation note"
              />
              <ul className="mt-4 space-y-2">
                {[...c.notes].reverse().map((n) => (
                  <li key={n.id} className="bg-surface-2 rounded-lg p-3 text-sm">
                    <p>{n.text}</p>
                    <p className="text-muted mt-1 text-xs">
                      {n.author} · {f.dateTime(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Next-action checklist</h3>
              <Checklist c={c} actor={actor} />
            </Card>
          </div>
        )}
        {current === 'audit' && (
          <Card>
            <DataTable
              caption="Case audit history"
              rows={[...c.audit].reverse()}
              rowKey={(a) => a.id}
              dense
              columns={[
                {
                  key: 'at',
                  header: 'When',
                  render: (a) => (
                    <span className="tabular whitespace-nowrap">{f.dateTime(a.at)}</span>
                  ),
                },
                { key: 'who', header: 'Who', render: (a) => a.actor },
                {
                  key: 'what',
                  header: 'Action',
                  render: (a) => <span className="font-medium">{a.action}</span>,
                },
                {
                  key: 'detail',
                  header: 'Reason / detail',
                  render: (a) => <span className="text-xs">{a.detail}</span>,
                },
              ]}
            />
          </Card>
        )}
      </Tabs>

      <StatusDialog
        open={dialog === 'status'}
        c={c}
        onClose={() => {
          setDialog(null);
        }}
        onSave={(s, reason, outcome) => {
          setCaseStatus(c.id, actor, s, reason, outcome);
          setDialog(null);
          toast.push({ tone: 'success', title: `Status changed to ${CASE_STATUS_LABEL[s]}` });
        }}
      />
      <AssignDialog
        open={dialog === 'assign'}
        owner={c.owner}
        onClose={() => {
          setDialog(null);
        }}
        onSave={(o) => {
          assignCase(c.id, actor, o);
          setDialog(null);
          toast.push({ tone: 'success', title: `Assigned to ${o}` });
        }}
      />
      <Dialog
        open={dialog === 'note'}
        onClose={() => {
          setDialog(null);
        }}
        title="Add a note"
      >
        <NoteForm
          onSubmit={(t) => {
            addCaseNote(c.id, actor, t);
            setDialog(null);
            toast.push({ tone: 'success', title: 'Note added' });
          }}
        />
      </Dialog>
      <EvidenceDialog
        open={dialog === 'evidence'}
        onClose={() => {
          setDialog(null);
        }}
        onSave={(e) => {
          addCaseEvidence(c.id, actor, e);
          setDialog(null);
          toast.push({ tone: 'success', title: 'Evidence added' });
        }}
      />
      <AlertDrawer
        alert={alerts.find((a) => a.id === openAlert) ?? null}
        onClose={() => {
          setOpenAlert(null);
        }}
      />
    </>
  );
}
