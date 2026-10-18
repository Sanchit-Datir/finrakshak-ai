import { Activity, FileQuestion, Files, SearchCheck } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { ApplicationsTable } from '../components/applications/ApplicationsTable.js';
import { DocThumb } from '../components/documents/DocThumb.js';
import { EntityGraph } from '../components/graph/EntityGraph.js';
import { LinkButton } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/States.js';
import {
  AlertStatusBadge,
  CaseStatusBadge,
  PriorityBadge,
  ProcessingBadge,
} from '../components/ui/StatusBadges.js';
import { Badge } from '../components/ui/Badge.js';
import { DataTable } from '../components/ui/Table.js';
import { Tabs } from '../components/ui/Tabs.js';
import { PinButton } from '../components/ui/PinButton.js';
import { BORROWER_TYPE_LABEL, PRODUCT_LABEL, TXN_TYPE_LABEL } from '../domain/labels.js';
import { allAlerts } from '../lib/alerts.js';
import { docTypeLabel } from '../lib/doc-catalog.js';
import { formatMoney } from '../lib/format.js';
import { useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useUrlState } from '../state/url.js';
import { useCopilotTarget } from '../state/copilot.js';
import { summarizeBorrower } from './BorrowersPage.js';

type Tab =
  'overview' | 'applications' | 'documents' | 'entities' | 'transactions' | 'findings' | 'activity';

export function BorrowerProfilePage(): React.JSX.Element {
  const { borrowerId = '' } = useParams();
  const db = useDb();
  const f = useFormat();
  const [tab, setTab] = useUrlState('tab', 'overview');
  const b = db.borrowers.find((x) => x.id === borrowerId);
  useCopilotTarget(b === undefined ? null : { kind: 'borrower', id: b.id });
  const data = useMemo(() => {
    if (b === undefined) return null;
    const apps = db.applications.filter((a) => a.borrowerId === b.id);
    const loans = db.loans.filter((l) => l.borrowerId === b.id);
    const accounts = new Set(loans.map((l) => l.accountEntityId));
    const txns = db.transactions
      .filter((t) => accounts.has(t.fromId) || accounts.has(t.toId))
      .sort((x, y) => y.at.localeCompare(x.at));
    const docs = db.documents.filter((d) => d.borrowerId === b.id);
    const alerts = allAlerts(db).filter((a) => a.borrowerId === b.id);
    const cases = db.cases.filter((c) => c.borrowerIds.includes(b.id));
    return { apps, loans, txns, docs, alerts, cases, summary: summarizeBorrower(db, b) };
  }, [db, b]);

  if (b === undefined || data === null) {
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title="Borrower not found"
          action={<LinkButton to="/borrowers">Back to borrowers</LinkButton>}
        >
          {borrowerId} does not exist in this workspace.
        </EmptyState>
      </Card>
    );
  }
  const names = new Map(db.entities.map((e) => [e.id, e]));
  const label = (id: string): string => {
    const e = names.get(id);
    const owner = (e?.ownerId ?? null) === null ? undefined : names.get(e?.ownerId ?? '');
    return owner === undefined ? (e?.name ?? id) : `${owner.name} (${e?.name ?? ''})`;
  };
  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    {
      key: 'applications' as const,
      label: 'Applications & Loans',
      count: data.apps.length + data.loans.length,
    },
    { key: 'documents' as const, label: 'Documents', count: data.docs.length },
    { key: 'entities' as const, label: 'Related Entities' },
    ...(data.txns.length > 0
      ? [{ key: 'transactions' as const, label: 'Transaction Activity', count: data.txns.length }]
      : []),
    {
      key: 'findings' as const,
      label: 'Findings & Cases',
      count: data.alerts.length + data.cases.length,
    },
    { key: 'activity' as const, label: 'Activity History' },
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'overview') as Tab;
  const activity = [
    ...data.apps.flatMap((a) => a.audit.map((x) => ({ ...x, scope: a.id }))),
    ...data.docs.flatMap((d) => d.audit.map((x) => ({ ...x, scope: d.id }))),
  ].sort((x, y) => y.at.localeCompare(x.at));

  return (
    <>
      <PageHeader
        docTitle={b.name}
        title={b.name}
        badge={
          <>
            <Badge tone={b.status === 'active' ? 'ok' : 'neutral'}>
              {b.status === 'active' ? 'Active' : 'Inactive'}
            </Badge>
          </>
        }
        subtitle={
          <>
            <span className="font-deva" lang="mr">
              {b.nameOriginal}
            </span>{' '}
            · {b.id} · {BORROWER_TYPE_LABEL[b.type]} ·{' '}
            {db.branches.find((x) => x.id === b.branchId)?.name} · RM: {b.relationshipManager} ·
            Updated {f.date(data.summary.lastActivity)}
          </>
        }
        actions={
          <PinButton pin={{ href: `/borrowers/${b.id}`, title: b.name, kind: 'borrower' }} />
        }
      />
      <Tabs
        label="Borrower sections"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setTab(k);
        }}
      >
        {current === 'overview' && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <p className="text-muted text-sm">Applications</p>
              <p className="tabular text-3xl font-bold">{data.apps.length}</p>
            </Card>
            <Card className="p-5">
              <p className="text-muted text-sm">Disbursed loans monitored</p>
              <p className="tabular text-3xl font-bold">{data.loans.length}</p>
              <p className="text-muted text-xs">
                {formatMoney(data.loans.reduce((s, l) => s + l.amountMinor, 0))} total
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-muted text-sm">Open findings & alerts</p>
              <div className="flex items-center gap-2">
                <p className="tabular text-3xl font-bold">{data.summary.openFindings}</p>
                {data.summary.priority !== null && (
                  <PriorityBadge priority={data.summary.priority} />
                )}
              </div>
            </Card>
            <Card className="p-5 md:col-span-3">
              <h3 className="mb-2 font-semibold">Identifiers</h3>
              <p className="text-sm">
                {b.maskedIdentifier}{' '}
                <span className="text-muted text-xs">
                  (masked by default; full numbers are not stored in this prototype)
                </span>
              </p>
            </Card>
          </div>
        )}
        {current === 'applications' && (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Applications" />
              <ApplicationsTable
                apps={data.apps}
                db={db}
                caption="Applications"
                showAmount
                empty={<EmptyState icon={Files} title="No applications" />}
              />
            </Card>
            <Card>
              <CardHeader title="Disbursed loans" />
              <DataTable
                caption="Loans"
                rows={data.loans}
                rowKey={(l) => l.id}
                empty={<EmptyState icon={Activity} title="No disbursed loans" />}
                columns={[
                  {
                    key: 'id',
                    header: 'Loan ID',
                    render: (l) => (
                      <Link
                        className="text-primary font-semibold hover:underline"
                        to={`/monitoring?loan=${l.id}`}
                      >
                        {l.id}
                      </Link>
                    ),
                  },
                  { key: 'p', header: 'Product', render: (l) => PRODUCT_LABEL[l.product] },
                  {
                    key: 'a',
                    header: 'Amount',
                    align: 'right',
                    render: (l) => formatMoney(l.amountMinor),
                  },
                  { key: 'd', header: 'Disbursed', render: (l) => f.date(l.disbursedAt) },
                  { key: 'purpose', header: 'Stated purpose', render: (l) => l.purpose },
                ]}
              />
            </Card>
          </div>
        )}
        {current === 'documents' && (
          <Card>
            <DataTable
              caption="Documents"
              rows={data.docs}
              rowKey={(d) => d.id}
              empty={<EmptyState icon={Files} title="No documents on file" />}
              columns={[
                {
                  key: 'f',
                  header: 'File',
                  render: (d) => (
                    <div className="flex items-center gap-3">
                      <DocThumb doc={d} className="h-12 w-9" />
                      <Link
                        className="text-primary font-medium hover:underline"
                        to={`/documents?doc=${d.id}`}
                      >
                        {d.filename}
                      </Link>
                    </div>
                  ),
                },
                { key: 't', header: 'Type', render: (d) => docTypeLabel(d.docType) },
                { key: 'a', header: 'Application', render: (d) => d.applicationId ?? '—' },
                {
                  key: 's',
                  header: 'Processing',
                  render: (d) => <ProcessingBadge state={d.processing} />,
                },
                { key: 'u', header: 'Uploaded', render: (d) => f.date(d.uploadedAt) },
              ]}
            />
          </Card>
        )}
        {current === 'entities' && (
          <Card className="p-4">
            <EntityGraph db={db} roots={[b.entityId]} title={`Entities related to ${b.name}`} />
          </Card>
        )}
        {current === 'transactions' && (
          <Card>
            <CardHeader
              title="Transaction activity"
              subtitle="Observed records on accounts linked to this borrower’s loans."
            />
            <DataTable
              caption="Transactions"
              rows={data.txns}
              rowKey={(t) => t.id}
              dense
              columns={[
                {
                  key: 'at',
                  header: 'Date',
                  render: (t) => (
                    <span className="tabular whitespace-nowrap">{f.dateTime(t.at)}</span>
                  ),
                },
                { key: 'id', header: 'ID', render: (t) => t.id },
                { key: 'from', header: 'From', render: (t) => label(t.fromId) },
                { key: 'to', header: 'To', render: (t) => label(t.toId) },
                {
                  key: 'amt',
                  header: 'Amount',
                  align: 'right',
                  render: (t) => formatMoney(t.amountMinor),
                },
                { key: 'type', header: 'Type', render: (t) => TXN_TYPE_LABEL[t.type] },
              ]}
            />
          </Card>
        )}
        {current === 'findings' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Alerts" />
              {data.alerts.length === 0 ? (
                <EmptyState icon={SearchCheck} title="No alerts">
                  No configured check or monitoring rule raised an alert for this borrower.
                </EmptyState>
              ) : (
                <ul className="divide-line divide-y">
                  {data.alerts.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <div className="flex gap-2">
                        <PriorityBadge priority={a.priority} />
                        <AlertStatusBadge status={a.status} />
                      </div>
                      <Link
                        to={`/alerts?alert=${encodeURIComponent(a.id)}`}
                        className="text-primary mt-1 block text-sm font-semibold hover:underline"
                      >
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Investigation cases" />
              {data.cases.length === 0 ? (
                <EmptyState icon={SearchCheck} title="No cases" />
              ) : (
                <ul className="divide-line divide-y">
                  {data.cases.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <div className="flex gap-2">
                        <PriorityBadge priority={c.priority} />
                        <CaseStatusBadge status={c.status} />
                      </div>
                      <Link
                        to={`/investigations/${c.id}`}
                        className="text-primary mt-1 block text-sm font-semibold hover:underline"
                      >
                        {c.id} — {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
        {current === 'activity' && (
          <Card>
            <DataTable
              caption="Activity history"
              rows={activity}
              rowKey={(r) => `${r.scope}-${r.id}`}
              dense
              columns={[
                {
                  key: 'at',
                  header: 'When',
                  render: (r) => (
                    <span className="tabular whitespace-nowrap">{f.dateTime(r.at)}</span>
                  ),
                },
                { key: 'scope', header: 'Record', render: (r) => r.scope },
                { key: 'who', header: 'Who', render: (r) => r.actor },
                {
                  key: 'what',
                  header: 'Action',
                  render: (r) => (
                    <span>
                      <strong>{r.action}</strong>{' '}
                      <span className="text-muted text-xs">{r.detail}</span>
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        )}
      </Tabs>
    </>
  );
}
