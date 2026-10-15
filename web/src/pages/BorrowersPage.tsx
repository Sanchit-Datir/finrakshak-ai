import { ChevronRight, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Card } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { DemoBadge, EmptyState } from '../components/ui/States.js';
import { PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { APP_STATUS_LABEL, BORROWER_TYPE_LABEL } from '../domain/labels.js';
import {
  ApplicationStatusSchema,
  BorrowerTypeSchema,
  type Borrower,
  type Db,
  type Priority,
} from '../domain/schemas.js';
import { allAlerts, isOpen } from '../lib/alerts.js';
import { reviewPriority, runChecks } from '../lib/checks.js';
import { inRange, resolvePeriod, type PeriodKind } from '../lib/period.js';
import { matchesQuery } from '../lib/text.js';
import { useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useUrlState } from '../state/url.js';

export interface BorrowerSummary {
  b: Borrower;
  activeLoans: number;
  lastActivity: string;
  openFindings: number;
  priority: Priority | null;
  statuses: string[];
  loanIds: string[];
  appIds: string[];
}

export function summarizeBorrower(db: Db, b: Borrower): BorrowerSummary {
  const apps = db.applications.filter((a) => a.borrowerId === b.id);
  const loans = db.loans.filter((l) => l.borrowerId === b.id);
  const alerts = allAlerts(db).filter((a) => a.borrowerId === b.id && isOpen(a.status));
  const findings = apps.flatMap((a) =>
    a.checksRunAt === null
      ? []
      : runChecks(a, db).filter(
          (f) =>
            f.priority !== 'routine' &&
            !['resolved', 'not_an_issue'].includes(a.findingStates[f.id]?.status ?? ''),
        ),
  );
  const dates = [
    b.updatedAt,
    ...apps.map((a) => a.updatedAt),
    ...loans.map((l) => l.lastUpdated),
  ].sort();
  let priority: Priority | null = null;
  for (const a of apps) {
    const p = reviewPriority(a, db);
    if (
      p !== null &&
      (priority === null ||
        ['routine', 'needs_attention', 'urgent'].indexOf(p) >
          ['routine', 'needs_attention', 'urgent'].indexOf(priority))
    )
      priority = p;
  }
  return {
    b,
    activeLoans: loans.length,
    lastActivity: dates[dates.length - 1] ?? b.updatedAt,
    openFindings: findings.length + alerts.length,
    priority,
    statuses: apps.map((a) => a.status),
    loanIds: loans.map((l) => l.id),
    appIds: apps.map((a) => a.id),
  };
}

export function BorrowersPage(): React.JSX.Element {
  const db = useDb();
  const f = useFormat();
  const [q, setQ] = useUrlState('q', '');
  const [type, setType] = useUrlState('type', 'all');
  const [branch, setBranch] = useUrlState('branch', 'all');
  const [loan, setLoan] = useUrlState('loan', 'all');
  const [status, setStatus] = useUrlState('status', 'all');
  const [period, setPeriod] = useUrlState('period', 'all');

  const rows = useMemo(() => {
    const range =
      period === 'all' ? null : resolvePeriod({ kind: period as PeriodKind, from: '', to: '' });
    return db.borrowers
      .map((b) => summarizeBorrower(db, b))
      .filter((s) => {
        if (type !== 'all' && s.b.type !== type) return false;
        if (branch !== 'all' && s.b.branchId !== branch) return false;
        if (loan === 'active' && s.activeLoans === 0) return false;
        if (loan === 'none' && s.activeLoans > 0) return false;
        if (status !== 'all' && !s.statuses.includes(status)) return false;
        if (range !== null && !inRange(s.lastActivity, range)) return false;
        return matchesQuery(q, s.b.name, s.b.nameOriginal, s.b.id, ...s.loanIds, ...s.appIds);
      });
  }, [db, q, type, branch, loan, status, period]);

  return (
    <>
      <PageHeader
        docTitle="Borrowers"
        title="Borrowers"
        badge={<DemoBadge />}
        subtitle="Search by name, borrower ID or loan / application ID. Identifiers are masked by default."
      />
      <Card>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Name, borrower ID, loan ID…"
            className="lg:col-span-2"
          />
          <FilterSelect
            label="Borrower type"
            value={type}
            onChange={setType}
            options={[
              { value: 'all', label: 'All types' },
              ...BorrowerTypeSchema.options.map((t) => ({
                value: t,
                label: BORROWER_TYPE_LABEL[t],
              })),
            ]}
          />
          <FilterSelect
            label="Branch"
            value={branch}
            onChange={setBranch}
            options={[
              { value: 'all', label: 'All branches' },
              ...db.branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <FilterSelect
            label="Loan status"
            value={loan}
            onChange={setLoan}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'active', label: 'Has disbursed loan' },
              { value: 'none', label: 'No disbursed loan' },
            ]}
          />
          <FilterSelect
            label="Application status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Any' },
              ...ApplicationStatusSchema.options.map((s) => ({
                value: s,
                label: APP_STATUS_LABEL[s],
              })),
            ]}
          />
          <div className="lg:col-span-6">
            <PeriodPicker
              label="Last activity"
              value={{ kind: period === 'all' ? '30d' : (period as PeriodKind), from: '', to: '' }}
              options={['today', '7d', '30d', 'month']}
              onChange={(v) => {
                setPeriod(v.kind);
              }}
            />
            {period !== 'all' && (
              <button
                type="button"
                className="text-primary mt-1 text-xs font-semibold hover:underline"
                onClick={() => {
                  setPeriod('all');
                }}
              >
                Clear date filter
              </button>
            )}
          </div>
        </div>
        <DataTable
          caption="Borrowers"
          rows={rows}
          rowKey={(s) => s.b.id}
          initialSort={{ key: 'activity', dir: 'desc' }}
          empty={
            <EmptyState icon={Users} title="No borrowers match these filters">
              Try a different name or clear filters.
            </EmptyState>
          }
          columns={[
            {
              key: 'name',
              header: 'Borrower',
              sortValue: (s) => s.b.name,
              render: (s) => (
                <div>
                  <Link
                    to={`/borrowers/${s.b.id}`}
                    className="text-primary font-semibold hover:underline"
                  >
                    {s.b.name}
                  </Link>
                  <p className="text-muted font-deva text-xs" lang="mr">
                    {s.b.nameOriginal}
                  </p>
                  <p className="text-muted text-xs">
                    {s.b.id} · {s.b.maskedIdentifier}
                  </p>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              sortValue: (s) => s.b.type,
              render: (s) => BORROWER_TYPE_LABEL[s.b.type],
            },
            {
              key: 'loans',
              header: 'Active loans',
              align: 'right',
              sortValue: (s) => s.activeLoans,
              render: (s) => s.activeLoans,
            },
            {
              key: 'branch',
              header: 'Branch',
              sortValue: (s) => s.b.branchId,
              render: (s) => db.branches.find((x) => x.id === s.b.branchId)?.name ?? '',
            },
            {
              key: 'activity',
              header: 'Last activity',
              sortValue: (s) => s.lastActivity,
              render: (s) => (
                <span className="tabular whitespace-nowrap">{f.date(s.lastActivity)}</span>
              ),
            },
            {
              key: 'findings',
              header: 'Open findings',
              sortValue: (s) => s.openFindings,
              render: (s) => (
                <div className="flex items-center gap-2">
                  <span className="tabular font-semibold">{s.openFindings}</span>
                  {s.priority !== null && s.openFindings > 0 && (
                    <PriorityBadge priority={s.priority} />
                  )}
                </div>
              ),
            },
            {
              key: 'action',
              header: 'Action',
              render: (s) => (
                <Link
                  to={`/borrowers/${s.b.id}`}
                  className="text-primary inline-flex items-center text-sm font-semibold hover:underline"
                >
                  View
                  <ChevronRight className="size-4" aria-hidden />
                  <span className="sr-only"> {s.b.name}</span>
                </Link>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
