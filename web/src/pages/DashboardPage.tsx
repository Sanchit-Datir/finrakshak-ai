import { Activity, Bell, FileClock, FilePlus2, Plus, SearchCheck, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ApplicationsTable } from '../components/applications/ApplicationsTable.js';
import { HeroBanner } from '../components/dashboard/HeroBanner.js';
import { KpiCard } from '../components/dashboard/KpiCard.js';
import { LifecycleFunnel } from '../components/dashboard/LifecycleFunnel.js';
import { MyWork } from '../components/dashboard/MyWork.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { PublicRecordsLoansCard } from '../components/monitoring/PublicRecordsLoansCard.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { EmptyState } from '../components/ui/States.js';
import { AlertStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { allAlerts, isOpen } from '../lib/alerts.js';
import { greeting } from '../lib/format.js';
import { buckets, defaultPeriod, inRange, resolvePeriod } from '../lib/period.js';
import type { PeriodValue } from '../lib/period.js';
import { useDocumentTitle, useFormat } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import { resetToDemo, useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useBranchScope } from '../state/scope.js';
import { RiskDonut } from '../components/dashboard/RiskDonut.js';

const RECENT_LIMIT = 20;

const AWAITING = new Set(['documents_needed', 'processing', 'needs_review', 'ready_for_decision']);

/** Small fixed-height list that scrolls; its rows hold links, so keyboard focus scrolls it too. */
function ScrollArea({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="max-h-80 overflow-y-auto">{children}</div>;
}

function canSeeAllBranches(role: string | undefined): boolean {
  return role !== undefined && role !== 'branch_officer';
}

export function DashboardPage(): React.JSX.Element {
  const db = useDb();
  const session = useSession();
  const f = useFormat();
  const toast = useToast();
  useDocumentTitle('Command center');
  const [period_, setPeriod] = useState<PeriodValue>(() => defaultPeriod('month'));
  const multi = canSeeAllBranches(session?.role);
  const { scope: branch, setScope: setBranch } = useBranchScope();
  const range = resolvePeriod(period_);
  const firstName = (session?.name ?? '').split(' ')[0] ?? '';

  const scoped = useMemo(() => {
    const keep = (b: string): boolean => branch === 'all' || b === branch;
    return {
      apps: db.applications.filter((a) => keep(a.branchId)),
      alerts: allAlerts(db).filter((a) => keep(a.branchId)),
      loans: db.loans.filter((l) => keep(l.branchId)),
      cases: db.cases.filter((c) => keep(c.branchId)),
    };
  }, [db, branch]);

  const awaiting = scoped.apps.filter((a) => AWAITING.has(a.status));
  const attention = scoped.alerts.filter((a) => isOpen(a.status) && a.priority !== 'routine');
  const openCases = scoped.cases.filter((c) => c.status !== 'resolved' && c.status !== 'closed');
  const appsInPeriod = scoped.apps.filter((a) => inRange(a.submittedAt ?? a.createdAt, range));
  const alertsInPeriod = scoped.alerts.filter((a) => inRange(a.at, range));

  if (db.applications.length === 0) {
    return (
      <>
        <PageHeader
          docTitle="Command center"
          title={`${greeting(new Date(), f.opts.timezone)}, ${firstName}`}
          subtitle="Here's your portfolio overview."
        />
        <Card>
          <EmptyState
            icon={FilePlus2}
            title="No applications yet"
            action={
              <>
                <LinkButton to="/applications/new" variant="primary" icon={Plus}>
                  Start a new application
                </LinkButton>
                <Button
                  onClick={() => {
                    resetToDemo();
                    toast.push({
                      tone: 'success',
                      title: 'Sample records loaded',
                      detail: 'Sample applications, loans and cases are now available.',
                    });
                  }}
                >
                  Load sample records
                </Button>
              </>
            }
          >
            Start a new application or load the sample records.
          </EmptyState>
        </Card>
      </>
    );
  }

  const defs = buckets(range);
  const per = (dates: (string | null)[]): number[] =>
    defs.map(
      (d) =>
        dates.filter((iso) => {
          if (iso === null) return false;
          const t = new Date(iso).getTime();
          return t >= d.start && t <= d.end;
        }).length,
    );
  const period = range.label.toLowerCase();
  const loansWithAlerts = new Set(
    scoped.alerts.filter((a) => isOpen(a.status) && a.loanId !== null).map((a) => a.loanId),
  );

  return (
    <>
      <HeroBanner
        greeting={`${greeting(new Date(), f.opts.timezone)}, ${firstName}`}
        summary={
          <>
            <strong className="text-white">{attention.length}</strong> item(s) need attention and{' '}
            <strong className="text-white">{awaiting.length}</strong> application(s) are awaiting
            review.
          </>
        }
        controls={
          <>
            {multi && (
              <FilterSelect
                label="Branch"
                value={branch}
                onChange={setBranch}
                options={[
                  { value: 'all', label: 'All branches' },
                  ...db.branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            )}
            <PeriodPicker value={period_} onChange={setPeriod} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={FileClock}
          tone="info"
          value={awaiting.length}
          label="Applications awaiting review"
          to="/applications?status=awaiting"
          trend={per(scoped.apps.map((a) => a.submittedAt ?? a.createdAt))}
          trendLabel={`submitted ${period}`}
        />
        <KpiCard
          icon={ShieldAlert}
          tone="warn"
          value={attention.length}
          label="Items needing attention"
          to="/alerts?view=open"
          trend={per(scoped.alerts.filter((a) => a.priority !== 'routine').map((a) => a.at))}
          trendLabel={`raised ${period}`}
        />
        <KpiCard
          icon={Activity}
          tone="teal"
          value={scoped.loans.length}
          label="Active loans monitored"
          to="/monitoring"
          trend={per(scoped.loans.map((l) => l.disbursedAt))}
          trendLabel={`disbursed ${period}`}
        />
        <KpiCard
          icon={SearchCheck}
          tone="violet"
          value={openCases.length}
          label="Open investigations"
          to="/investigations?status=open"
          trend={per(scoped.cases.map((c) => c.openedAt))}
          trendLabel={`opened ${period}`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2">
          <MyWork
            db={db}
            me={session?.name ?? ''}
            alerts={scoped.alerts}
            apps={scoped.apps}
            cases={scoped.cases}
          />
        </div>
        <LifecycleFunnel
          stages={[
            {
              label: 'Applications',
              value: scoped.apps.length,
              hint: 'All applications in scope',
              to: '/applications',
              color: 'var(--color-primary)',
            },
            {
              label: 'Awaiting review',
              value: awaiting.length,
              hint: 'Documents, processing or review pending',
              to: '/applications?status=awaiting',
              color: 'var(--color-info)',
            },
            {
              label: 'Disbursed & monitored',
              value: scoped.loans.length,
              hint: 'Loans under post-disbursement monitoring',
              to: '/monitoring',
              color: 'var(--color-teal)',
            },
            {
              label: 'Loans with open alerts',
              value: loansWithAlerts.size,
              hint: 'Leads to review — not findings of wrongdoing',
              to: '/alerts?view=open',
              color: 'var(--color-warn)',
            },
            {
              label: 'Open investigations',
              value: openCases.length,
              hint: 'Cases not yet resolved or closed',
              to: '/investigations?status=open',
              color: 'var(--color-violet)',
            },
          ]}
        />
      </div>

      <div className="mt-6">
        <PublicRecordsLoansCard watches={db.publicWatches} />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Risk overview"
          subtitle="Applications in progress by review priority (current)"
        />
        <div className="px-4 pb-5 sm:px-5">
          <RiskDonut apps={awaiting} db={db} />
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Recent applications"
            subtitle={range.label}
            actions={
              <LinkButton to="/applications" size="sm">
                View all
              </LinkButton>
            }
          />
          <ScrollArea>
            <ApplicationsTable
              apps={[...appsInPeriod]
                .sort((a, b) =>
                  (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt),
                )
                .slice(0, RECENT_LIMIT)}
              db={db}
              caption="Recent applications"
              empty={
                <EmptyState icon={FilePlus2} title="No applications in this period">
                  Try a wider date range or start a new application.
                </EmptyState>
              }
            />
          </ScrollArea>
        </Card>
        <Card>
          <CardHeader
            title="Recent alerts"
            subtitle={range.label}
            actions={
              <LinkButton to="/alerts" size="sm">
                View all
              </LinkButton>
            }
          />
          {alertsInPeriod.length === 0 ? (
            <EmptyState icon={Bell} title="No alerts match this period">
              Try a wider date range.
            </EmptyState>
          ) : (
            <ScrollArea>
              <ul className="divide-line divide-y">
                {alertsInPeriod.slice(0, RECENT_LIMIT).map((a) => (
                  <li key={a.id} className="px-4 py-2.5 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={a.priority} />
                      <AlertStatusBadge status={a.status} />
                    </div>
                    <p className="mt-1.5 text-sm font-medium">{a.title}</p>
                    <p className="text-muted text-xs">
                      {a.linkedLabel} · <span className="tabular">{f.dateTime(a.at)}</span>
                    </p>
                    <Link
                      to={`/alerts?alert=${encodeURIComponent(a.id)}`}
                      className="text-primary mt-1 inline-block text-xs font-semibold hover:underline"
                    >
                      View evidence
                    </Link>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </Card>
      </div>
    </>
  );
}
