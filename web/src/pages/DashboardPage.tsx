import {
  Activity,
  Bell,
  CircleCheck,
  CircleDashed,
  FileClock,
  FilePlus2,
  Plus,
  ScanLine,
  SearchCheck,
  ShieldAlert,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ApplicationsTable } from '../components/applications/ApplicationsTable.js';
import { DonutChart } from '../components/charts/DonutChart.js';
import { Button, LinkButton } from '../components/ui/Button.js';
import { PublicRecordsLoansCard } from '../components/monitoring/PublicRecordsLoansCard.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { EmptyState } from '../components/ui/States.js';
import { AlertStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { cn } from '../components/ui/cn.js';
import { PRIORITY_HELP } from '../domain/labels.js';
import type { Application, Db } from '../domain/schemas.js';
import { allAlerts, isOpen } from '../lib/alerts.js';
import { reviewPriority } from '../lib/checks.js';
import { greeting } from '../lib/format.js';
import { defaultPeriod, inRange, resolvePeriod, type PeriodValue } from '../lib/period.js';
import { useFormat } from '../state/hooks.js';
import { useSession } from '../state/session.js';
import { resetToDemo, useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';

const RECENT_LIMIT = 20;
const AWAITING = new Set(['documents_needed', 'processing', 'needs_review', 'ready_for_decision']);

function Kpi({
  icon: Icon,
  tone,
  value,
  label,
  to,
  hint,
}: {
  icon: LucideIcon;
  tone: string;
  value: number;
  label: string;
  to: string;
  hint: string;
}): React.JSX.Element {
  return (
    <Link
      to={to}
      className="card group hover:border-primary/50 flex flex-col gap-3 p-4 transition-colors sm:p-5"
    >
      <span className={cn('flex size-10 items-center justify-center rounded-xl', tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="tabular text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-0.5 text-sm font-medium">{label}</p>
        <p className="text-muted mt-1 text-xs">{hint}</p>
      </div>
      <span className="text-primary text-xs font-semibold group-hover:underline">
        View records →
      </span>
    </Link>
  );
}

function MiniLink({
  icon: Icon,
  value,
  label,
  to,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  to: string;
}): React.JSX.Element {
  return (
    <li>
      <Link
        to={to}
        className="border-line bg-surface hover:border-primary/50 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
      >
        <Icon className="text-muted size-4" aria-hidden />
        <span className="tabular font-semibold">{value}</span>
        <span className="text-muted">{label}</span>
        <span className="text-primary text-xs font-semibold">View →</span>
      </Link>
    </li>
  );
}

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
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod('month'));
  const multi = canSeeAllBranches(session?.role);
  const [branch, setBranch] = useState<string>(multi ? 'all' : (session?.branchId ?? 'all'));
  const range = resolvePeriod(period);
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
          docTitle="Dashboard"
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

  return (
    <>
      <PageHeader
        docTitle="Dashboard"
        title={`${greeting(new Date(), f.opts.timezone)}, ${firstName}`}
        subtitle="Here's your portfolio overview."
        actions={
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
            <PeriodPicker value={period} onChange={setPeriod} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Kpi
          icon={FileClock}
          tone="bg-info-soft text-info"
          value={awaiting.length}
          label="Applications awaiting review"
          hint="Current: documents needed, processing, needs review or ready for decision"
          to="/applications?status=awaiting"
        />
        <Kpi
          icon={ShieldAlert}
          tone="bg-warn-soft text-warn"
          value={attention.length}
          label="Items needing attention"
          hint="Open alerts at Needs attention or Urgent review"
          to="/alerts?view=open"
        />
      </div>
      <ul aria-label="More counts" className="mt-3 flex flex-wrap gap-2">
        <MiniLink
          icon={Activity}
          value={scoped.loans.length}
          label="Active loans monitored"
          to="/monitoring"
        />
        <MiniLink
          icon={SearchCheck}
          value={openCases.length}
          label="Open investigations"
          to="/investigations?status=open"
        />
      </ul>

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

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
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

      <h2 className="mt-8 mb-3 text-[16px] font-semibold">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { to: '/applications/new', icon: FilePlus2, label: 'Start a new application' },
          { to: '/applications/new?capture=1', icon: ScanLine, label: 'Scan / upload documents' },
          { to: '/borrowers', icon: Users, label: 'Find a borrower' },
          { to: '/alerts?view=open', icon: Bell, label: 'Review monitoring alerts' },
        ].map(({ to, icon: Icon, label }) => (
          <Link
            key={label}
            to={to}
            className="card hover:border-primary/50 flex items-center gap-3 p-4 text-sm font-semibold"
          >
            <span className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Icon className="size-5" aria-hidden />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}

function RiskDonut({ apps, db }: { apps: Application[]; db: Db }): React.JSX.Element {
  const counts = { routine: 0, needs_attention: 0, urgent: 0, none: 0 };
  for (const a of apps) {
    const p = reviewPriority(a, db);
    counts[p ?? 'none'] += 1;
  }
  return (
    <DonutChart
      title="Applications in progress by review priority"
      centerLabel="in progress"
      slices={[
        {
          key: 'urgent',
          label: 'Urgent review',
          value: counts.urgent,
          color: 'var(--color-danger)',
          icon: ShieldAlert,
          help: PRIORITY_HELP.urgent,
          href: '/applications?priority=urgent',
        },
        {
          key: 'needs_attention',
          label: 'Needs attention',
          value: counts.needs_attention,
          color: 'var(--color-warn)',
          icon: TriangleAlert,
          help: PRIORITY_HELP.needs_attention,
          href: '/applications?priority=needs_attention',
        },
        {
          key: 'routine',
          label: 'Routine review',
          value: counts.routine,
          color: 'var(--color-teal)',
          icon: CircleCheck,
          help: PRIORITY_HELP.routine,
          href: '/applications?priority=routine',
        },
        {
          key: 'none',
          label: 'Checks not run',
          value: counts.none,
          color: 'var(--color-line)',
          icon: CircleDashed,
          href: '/applications?priority=none',
        },
      ]}
    />
  );
}
