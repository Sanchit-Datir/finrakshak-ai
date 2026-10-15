import { Download, FileBarChart, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { StackedBarChart } from '../components/charts/StackedBarChart.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { DemoBadge, EmptyState, Notice } from '../components/ui/States.js';
import { CaseStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { Tabs } from '../components/ui/Tabs.js';
import {
  APP_STATUS_LABEL,
  CASE_STATUS_LABEL,
  PRIORITY_LABEL,
  PROCESSING_LABEL,
} from '../domain/labels.js';
import type { Db, Priority } from '../domain/schemas.js';
import { allAlerts, isOpen } from '../lib/alerts.js';
import { CATEGORY_LABEL, reviewPriority, runChecks, type FindingCategory } from '../lib/checks.js';
import { downloadFile, toCsv } from '../lib/export.js';
import { formatMoney } from '../lib/format.js';
import {
  buckets,
  defaultPeriod,
  inRange,
  resolvePeriod,
  type PeriodValue,
  type Range,
} from '../lib/period.js';
import { useFormat } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import { useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';

type Tab = 'monthly' | 'pre' | 'post' | 'cases' | 'docs' | 'branch';

interface ReportData {
  apps: Db['applications'];
  docs: Db['documents'];
  fields: Db['documents'][number]['fields'];
  alerts: ReturnType<typeof allAlerts>;
  loans: Db['loans'];
  txns: Db['transactions'];
  findings: { a: Db['applications'][number]; f: ReturnType<typeof runChecks>[number] }[];
  cases: Db['cases'];
}

function compute(db: Db, r: Range, branch: string): ReportData {
  const inB = (b: string): boolean => branch === 'all' || b === branch;
  const apps = db.applications.filter(
    (a) => inB(a.branchId) && inRange(a.submittedAt ?? a.createdAt, r),
  );
  const docs = db.documents.filter(
    (d) =>
      inRange(d.uploadedAt, r) &&
      (d.applicationId === null ||
        apps.some((a) => a.id === d.applicationId) ||
        inB(db.applications.find((a) => a.id === d.applicationId)?.branchId ?? '')),
  );
  const fields = docs.flatMap((d) => d.fields);
  const alerts = allAlerts(db).filter((a) => inB(a.branchId) && inRange(a.at, r));
  const loans = db.loans.filter((l) => inB(l.branchId));
  const txns = db.transactions.filter(
    (t) => inRange(t.at, r) && loans.some((l) => l.id === t.loanId),
  );
  const findings = apps.flatMap((a) =>
    a.checksRunAt === null ? [] : runChecks(a, db).map((f) => ({ a, f })),
  );
  const cases = db.cases.filter((c) => inB(c.branchId));
  return { apps, docs, fields, alerts, loans, txns, findings, cases };
}

export function ReportsPage(): React.JSX.Element {
  const db = useDb();
  const f = useFormat();
  const toast = useToast();
  const session = useSession();
  const multi = session?.role !== 'branch_officer';
  const [tab, setTab] = useUrlState('tab', 'monthly');
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod('month'));
  const [branch, setBranch] = useState(multi ? 'all' : session.branchId);
  const range = useMemo(() => resolvePeriod(period), [period]);
  const d = useMemo(() => compute(db, range, branch), [db, range, branch]);
  const [generatedAt] = useState(() => new Date().toISOString());
  const scope =
    branch === 'all' ? 'All branches' : (db.branches.find((b) => b.id === branch)?.name ?? branch);

  const needReview = d.apps.filter((a) => {
    const p = reviewPriority(a, db);
    return p === 'needs_attention' || p === 'urgent';
  });
  const reviewed = d.fields.filter((x) => x.state !== 'unreviewed').length;
  const failed = d.docs.filter((x) => x.processing === 'failed').length;
  const pct = (n: number, of: number): string =>
    of === 0 ? '—' : `${Math.round((n / of) * 100)}%`;
  const byCat = new Map<string, Record<Priority, number>>();
  for (const { f: x } of d.findings) {
    const row = byCat.get(x.category) ?? { routine: 0, needs_attention: 0, urgent: 0 };
    row[x.priority] += 1;
    byCat.set(x.category, row);
  }
  const unresolved = [
    ...d.alerts
      .filter((a) => isOpen(a.status))
      .map((a) => ({
        id: a.id,
        what: a.title,
        where: a.linkedLabel,
        href: `/alerts?alert=${encodeURIComponent(a.id)}`,
        action: a.nextAction,
        priority: a.priority,
      })),
    ...d.findings
      .filter(
        ({ a, f: x }) =>
          x.priority === 'urgent' &&
          !['resolved', 'not_an_issue'].includes(a.findingStates[x.id]?.status ?? ''),
      )
      .map(({ a, f: x }) => ({
        id: x.id,
        what: x.title,
        where: a.id,
        href: `/applications/${a.id}?tab=findings`,
        action: x.steps[0] ?? '',
        priority: x.priority,
      })),
  ];

  const exportCsv = (): void => {
    const meta = [
      ['report', tab],
      ['generated_at', generatedAt],
      ['date_range', `${range.start.toISOString()} to ${range.end.toISOString()}`],
      ['scope', scope],
      ['data', 'DEMO DATA - synthetic; identifiers masked'],
    ];
    const rows: (string | number)[][] = [
      ['applications_processed', d.apps.length],
      ['applications_needing_review', needReview.length],
      ['extraction_fields_reviewed_pct', pct(reviewed, d.fields.length)],
      ['documents_failed_pct', pct(failed, d.docs.length)],
      ['alerts_open', d.alerts.filter((a) => isOpen(a.status)).length],
      ['alerts_closed', d.alerts.filter((a) => !isOpen(a.status)).length],
      ['transactions_analysed', d.txns.length],
      ['transaction_volume_inr', (d.txns.reduce((s, t) => s + t.amountMinor, 0) / 100).toFixed(2)],
      ...[...byCat.entries()].flatMap(([cat, v]) =>
        (['urgent', 'needs_attention', 'routine'] as const).map((p) => [
          `findings_${cat}_${p}`,
          v[p],
        ]),
      ),
    ];
    downloadFile(
      `fundtrace-report-${tab}-${generatedAt.slice(0, 10)}.csv`,
      toCsv(['metric', 'value'], [...meta, ...rows]),
      'text/csv',
    );
    toast.push({
      tone: 'success',
      title: 'CSV report generated',
      detail: `${rows.length} metrics · ${scope} · ${range.label}`,
    });
  };

  const tabs = [
    { key: 'monthly' as const, label: 'Monthly Overview' },
    { key: 'pre' as const, label: 'Pre-disbursement Review' },
    { key: 'post' as const, label: 'Post-disbursement Monitoring' },
    { key: 'cases' as const, label: 'Open Investigations' },
    { key: 'docs' as const, label: 'Document Processing' },
    ...(multi ? [{ key: 'branch' as const, label: 'Branch Summary' }] : []),
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'monthly') as Tab;

  return (
    <>
      <PageHeader
        docTitle="Reports"
        title="Reports"
        badge={<DemoBadge />}
        subtitle="Every value is calculated from the current dataset for the selected period and scope."
        actions={
          <>
            {multi && (
              <FilterSelect
                label="Scope"
                value={branch}
                onChange={setBranch}
                options={[
                  { value: 'all', label: 'All branches' },
                  ...db.branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            )}
            <PeriodPicker
              label="Reporting period"
              value={period}
              onChange={setPeriod}
              options={['month', 'last_month', '30d', 'custom']}
            />
            <Button icon={Download} className="self-end" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              icon={Printer}
              className="self-end"
              onClick={() => {
                window.print();
              }}
            >
              Print / save as PDF
            </Button>
          </>
        }
      />
      <p className="text-muted mb-4 text-xs">
        Generated {f.dateTime(generatedAt)} · {range.label} · {scope} · Demo data. PDF output uses
        your browser’s print dialog.
      </p>

      <Tabs
        label="Report"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setTab(k);
        }}
      >
        {current === 'monthly' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Applications processed', d.apps.length, 'Submitted or created in period'],
                [
                  'Applications needing review',
                  needReview.length,
                  'Needs attention or urgent priority',
                ],
                [
                  'Extraction fields reviewed',
                  pct(reviewed, d.fields.length),
                  `${reviewed} of ${d.fields.length} fields · ${pct(failed, d.docs.length)} documents failed`,
                ],
                [
                  'Alerts open / closed',
                  `${d.alerts.filter((a) => isOpen(a.status)).length} / ${d.alerts.filter((a) => !isOpen(a.status)).length}`,
                  'Detected in period',
                ],
                [
                  'Transactions analysed',
                  d.txns.length,
                  d.txns.length === 0
                    ? 'No transaction data in period'
                    : formatMoney(d.txns.reduce((s, t) => s + t.amountMinor, 0)),
                ],
              ].map(([k, v, h]) => (
                <Card key={String(k)} className="p-4">
                  <p className="tabular text-2xl font-bold">{v}</p>
                  <p className="text-sm font-medium">{k}</p>
                  <p className="text-muted text-xs">{h}</p>
                </Card>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Applications trend" subtitle={range.label} />
                <div className="px-4 pb-4">
                  {d.apps.length === 0 ? (
                    <EmptyState icon={FileBarChart} title="No applications in this period">
                      Try a wider date range.
                    </EmptyState>
                  ) : (
                    <StackedBarChart
                      title="Applications per period by review priority"
                      series={[
                        { key: 'urgent', label: 'Urgent review', color: 'var(--color-danger)' },
                        {
                          key: 'needs_attention',
                          label: 'Needs attention',
                          color: 'var(--color-warn)',
                        },
                        { key: 'routine', label: 'Routine review', color: 'var(--color-teal)' },
                        { key: 'none', label: 'Checks not run', color: 'var(--color-muted)' },
                      ]}
                      buckets={buckets(range).map((b) => {
                        const inB = d.apps.filter((a) => {
                          const t = new Date(a.submittedAt ?? a.createdAt).getTime();
                          return t >= b.start && t <= b.end;
                        });
                        const v = { urgent: 0, needs_attention: 0, routine: 0, none: 0 };
                        for (const a of inB) v[reviewPriority(a, db) ?? 'none'] += 1;
                        return { label: b.label, values: v };
                      })}
                    />
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Findings by category and review priority" />
                <DataTable
                  caption="Findings by category"
                  rows={[...byCat.entries()]}
                  rowKey={([c]) => c}
                  dense
                  empty={<EmptyState icon={FileBarChart} title="No findings in this period" />}
                  columns={[
                    {
                      key: 'c',
                      header: 'Category',
                      render: ([c]) => CATEGORY_LABEL[c as FindingCategory],
                    },
                    ...(['urgent', 'needs_attention', 'routine'] as const).map((p) => ({
                      key: p,
                      header: PRIORITY_LABEL[p],
                      align: 'right' as const,
                      render: ([, v]: [string, Record<Priority, number>]) => v[p],
                    })),
                  ]}
                />
              </Card>
            </div>
            <Card>
              <CardHeader title="Unresolved items and suggested actions" />
              <DataTable
                caption="Unresolved items"
                rows={unresolved}
                rowKey={(u) => u.id}
                dense
                empty={
                  <EmptyState icon={FileBarChart} title="No unresolved items in this period" />
                }
                columns={[
                  {
                    key: 'p',
                    header: 'Priority',
                    render: (u) => <PriorityBadge priority={u.priority} />,
                  },
                  {
                    key: 'w',
                    header: 'Item',
                    render: (u) => (
                      <Link to={u.href} className="text-primary font-medium hover:underline">
                        {u.what}
                      </Link>
                    ),
                  },
                  {
                    key: 'r',
                    header: 'Record',
                    render: (u) => <span className="text-xs">{u.where}</span>,
                  },
                  {
                    key: 'a',
                    header: 'Suggested action',
                    render: (u) => <span className="text-xs">{u.action}</span>,
                  },
                ]}
              />
            </Card>
            <Notice>
              Reports do not estimate losses prevented or performance improvements; no such evidence
              exists in this dataset.
            </Notice>
          </div>
        )}
        {current === 'pre' && (
          <Card>
            <DataTable
              caption="Pre-disbursement review"
              rows={d.apps}
              rowKey={(a) => a.id}
              empty={<EmptyState icon={FileBarChart} title="No applications in this period" />}
              columns={[
                {
                  key: 'id',
                  header: 'Application',
                  render: (a) => (
                    <Link
                      className="text-primary font-semibold hover:underline"
                      to={`/applications/${a.id}`}
                    >
                      {a.id}
                    </Link>
                  ),
                },
                { key: 's', header: 'Status', render: (a) => APP_STATUS_LABEL[a.status] },
                {
                  key: 'p',
                  header: 'Review priority',
                  render: (a) => <PriorityBadge priority={reviewPriority(a, db)} />,
                },
                {
                  key: 'f',
                  header: 'Findings',
                  align: 'right',
                  render: (a) => (a.checksRunAt === null ? '—' : runChecks(a, db).length),
                },
                {
                  key: 'u',
                  header: 'Unreviewed fields',
                  align: 'right',
                  render: (a) =>
                    db.documents
                      .filter((x) => a.documentIds.includes(x.id))
                      .reduce(
                        (n, x) => n + x.fields.filter((y) => y.state === 'unreviewed').length,
                        0,
                      ),
                },
              ]}
            />
          </Card>
        )}
        {current === 'post' && (
          <Card>
            <DataTable
              caption="Post-disbursement monitoring"
              rows={d.loans}
              rowKey={(l) => l.id}
              columns={[
                {
                  key: 'id',
                  header: 'Loan',
                  render: (l) => (
                    <Link
                      className="text-primary font-semibold hover:underline"
                      to={`/monitoring?loan=${l.id}`}
                    >
                      {l.id}
                    </Link>
                  ),
                },
                {
                  key: 'a',
                  header: 'Amount',
                  align: 'right',
                  render: (l) => formatMoney(l.amountMinor),
                },
                {
                  key: 't',
                  header: 'Txns in period',
                  align: 'right',
                  render: (l) => d.txns.filter((t) => t.loanId === l.id).length,
                },
                {
                  key: 'o',
                  header: 'Open alerts',
                  align: 'right',
                  render: (l) =>
                    allAlerts(db).filter((a) => a.loanId === l.id && isOpen(a.status)).length,
                },
                {
                  key: 'src',
                  header: 'Data source',
                  render: (l) => <span className="text-xs">{l.dataSource}</span>,
                },
              ]}
            />
          </Card>
        )}
        {current === 'cases' && (
          <Card>
            <DataTable
              caption="Open investigations"
              rows={d.cases.filter((c) => c.status !== 'closed' && c.status !== 'resolved')}
              rowKey={(c) => c.id}
              empty={<EmptyState icon={FileBarChart} title="No open investigations" />}
              columns={[
                {
                  key: 'id',
                  header: 'Case',
                  render: (c) => (
                    <Link
                      className="text-primary font-semibold hover:underline"
                      to={`/investigations/${c.id}`}
                    >
                      {c.id}
                    </Link>
                  ),
                },
                { key: 't', header: 'Title', render: (c) => c.title },
                {
                  key: 'p',
                  header: 'Priority',
                  render: (c) => <PriorityBadge priority={c.priority} />,
                },
                {
                  key: 's',
                  header: 'Status',
                  render: (c) => <CaseStatusBadge status={c.status} />,
                },
                { key: 'o', header: 'Owner', render: (c) => c.owner },
                {
                  key: 'age',
                  header: 'Days open',
                  align: 'right',
                  render: (c) =>
                    Math.max(
                      0,
                      Math.round((Date.now() - new Date(c.openedAt).getTime()) / 86_400_000),
                    ),
                },
              ]}
            />
          </Card>
        )}
        {current === 'docs' && (
          <Card>
            <DataTable
              caption="Document processing"
              rows={(
                [
                  'queued',
                  'uploading',
                  'processing',
                  'needs_review',
                  'completed',
                  'failed',
                ] as const
              ).map((s) => ({ s, n: d.docs.filter((x) => x.processing === s).length }))}
              rowKey={(r) => r.s}
              columns={[
                { key: 's', header: 'Processing state', render: (r) => PROCESSING_LABEL[r.s] },
                { key: 'n', header: 'Documents', align: 'right', render: (r) => r.n },
                {
                  key: 'p',
                  header: 'Share',
                  align: 'right',
                  render: (r) => pct(r.n, d.docs.length),
                },
              ]}
            />
          </Card>
        )}
        {current === 'branch' && (
          <Card>
            <DataTable
              caption="Branch summary"
              rows={db.branches.map((b) => ({ b, x: compute(db, range, b.id) }))}
              rowKey={(r) => r.b.id}
              columns={[
                { key: 'b', header: 'Branch', render: (r) => r.b.name },
                {
                  key: 'a',
                  header: 'Applications',
                  align: 'right',
                  render: (r) => r.x.apps.length,
                },
                {
                  key: 'l',
                  header: 'Loans monitored',
                  align: 'right',
                  render: (r) => r.x.loans.length,
                },
                {
                  key: 'o',
                  header: 'Open alerts',
                  align: 'right',
                  render: (r) => r.x.alerts.filter((a) => isOpen(a.status)).length,
                },
                {
                  key: 'c',
                  header: 'Open cases',
                  align: 'right',
                  render: (r) =>
                    r.x.cases.filter((c) => c.status !== 'closed' && c.status !== 'resolved')
                      .length,
                },
                {
                  key: 'cs',
                  header: 'Case statuses',
                  render: (r) => (
                    <span className="text-xs">
                      {[...new Set(r.x.cases.map((c) => CASE_STATUS_LABEL[c.status]))].join(', ') ||
                        '—'}
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
