import { Bell, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlertDrawer } from '../components/monitoring/AlertDrawer.js';
import { Card } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { DemoBadge, EmptyState } from '../components/ui/States.js';
import { AlertStatusBadge, PriorityBadge } from '../components/ui/StatusBadges.js';
import { DataTable } from '../components/ui/Table.js';
import { Tabs, type TabDef } from '../components/ui/Tabs.js';
import { PRIORITY_LABEL } from '../domain/labels.js';
import { SOURCE_LABEL, allAlerts, isOpen, type UnifiedAlert } from '../lib/alerts.js';
import { inRange, resolvePeriod, type PeriodKind } from '../lib/period.js';
import { matchesQuery } from '../lib/text.js';
import { useFormat } from '../state/hooks.js';
import { useDb } from '../state/store.js';
import { useUrlState } from '../state/url.js';

type View = 'all' | 'open' | 'new' | 'in_review' | 'escalated' | 'resolved';

export function AlertsPage(): React.JSX.Element {
  const db = useDb();
  const f = useFormat();
  const [view, setView] = useUrlState('view', 'all');
  const [q, setQ] = useUrlState('q', '');
  const [priority, setPriority] = useUrlState('priority', 'all');
  const [category, setCategory] = useUrlState('category', 'all');
  const [branch, setBranch] = useUrlState('branch', 'all');
  const [source, setSource] = useUrlState('source', 'all');
  const [assignee, setAssignee] = useUrlState('assignee', 'all');
  const [period, setPeriod] = useUrlState('period', 'all');
  const [openId, setOpenId] = useUrlState('alert', '');
  const alerts = allAlerts(db);

  const filtered = useMemo(() => {
    const range =
      period === 'all' ? null : resolvePeriod({ kind: period as PeriodKind, from: '', to: '' });
    return alerts.filter(
      (a) =>
        (priority === 'all' || a.priority === priority) &&
        (category === 'all' || a.category === category) &&
        (branch === 'all' || a.branchId === branch) &&
        (source === 'all' || a.source === source) &&
        (assignee === 'all' ||
          (assignee === 'none' ? a.assignee === null : a.assignee === assignee)) &&
        (range === null || inRange(a.at, range)) &&
        matchesQuery(
          q,
          a.id,
          a.title,
          a.loanId,
          a.applicationId,
          a.linkedLabel,
          ...db.cases.filter((c) => c.alertIds.includes(a.id)).map((c) => c.id),
        ),
    );
  }, [alerts, db.cases, q, priority, category, branch, source, assignee, period]);

  const inView = (a: UnifiedAlert, v: View): boolean =>
    v === 'all' ||
    (v === 'open'
      ? isOpen(a.status)
      : v === 'resolved'
        ? a.status === 'resolved' || a.status === 'false_positive'
        : a.status === v);
  const current = (
    ['all', 'open', 'new', 'in_review', 'escalated', 'resolved'].includes(view) ? view : 'all'
  ) as View;
  const rows = filtered.filter((a) => inView(a, current));
  const tabs: TabDef<View>[] = (['all', 'new', 'in_review', 'escalated', 'resolved'] as const).map(
    (k) => ({
      key: k,
      label: {
        all: 'All',
        new: 'New',
        in_review: 'In review',
        escalated: 'Escalated',
        resolved: 'Resolved',
      }[k],
      count: filtered.filter((a) => inView(a, k)).length,
    }),
  );
  if (current === 'open')
    tabs.splice(1, 0, {
      key: 'open',
      label: 'Open',
      count: filtered.filter((a) => inView(a, 'open')).length,
    });
  const categories = [...new Set(alerts.map((a) => a.category))].sort();
  const assignees = [
    ...new Set(alerts.map((a) => a.assignee).filter((x): x is string => x !== null)),
  ].sort();

  return (
    <>
      <PageHeader
        docTitle="Alerts"
        title="Alerts"
        badge={<DemoBadge />}
        subtitle="Leads from pre-disbursement checks and transaction monitoring. Each opens with evidence and suggested checks."
      />
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Alert, case or loan ID…"
            className="lg:col-span-2"
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'all', label: 'All priorities' },
              ...(['urgent', 'needs_attention', 'routine'] as const).map((p) => ({
                value: p,
                label: PRIORITY_LABEL[p],
              })),
            ]}
          />
          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'All categories' },
              ...categories.map((c) => ({ value: c, label: c })),
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
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: 'all', label: 'All sources' },
              { value: 'monitoring', label: SOURCE_LABEL.monitoring },
              { value: 'pre_disbursement', label: SOURCE_LABEL.pre_disbursement },
            ]}
          />
          <FilterSelect
            label="Assigned user"
            value={assignee}
            onChange={setAssignee}
            options={[
              { value: 'all', label: 'Anyone' },
              { value: 'none', label: 'Unassigned' },
              ...assignees.map((u) => ({ value: u, label: u })),
            ]}
          />
          <div>
            <PeriodPicker
              label="Date"
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
                Any date
              </button>
            )}
          </div>
        </div>
      </Card>
      <Tabs
        label="Alert status"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setView(k);
        }}
      >
        <Card>
          <DataTable
            caption="Alerts"
            rows={rows}
            rowKey={(a) => a.id}
            initialSort={{ key: 'time', dir: 'desc' }}
            empty={
              <EmptyState icon={Bell} title="No alerts match these filters">
                Try a wider date range.
              </EmptyState>
            }
            columns={[
              {
                key: 'title',
                header: 'Alert',
                sortValue: (a) => a.title,
                render: (a) => (
                  <div className="max-w-[320px]">
                    <button
                      type="button"
                      className="text-primary text-left font-semibold hover:underline"
                      onClick={() => {
                        setOpenId(a.id);
                      }}
                    >
                      {a.title}
                    </button>
                    <p className="text-muted text-xs">{SOURCE_LABEL[a.source]}</p>
                  </div>
                ),
              },
              {
                key: 'priority',
                header: 'Priority',
                sortValue: (a) => ({ urgent: 0, needs_attention: 1, routine: 2 })[a.priority],
                render: (a) => <PriorityBadge priority={a.priority} />,
              },
              {
                key: 'reason',
                header: 'Reason',
                render: (a) => (
                  <span className="text-muted line-clamp-2 max-w-[260px] text-xs">
                    {a.category}
                  </span>
                ),
              },
              {
                key: 'linked',
                header: 'Linked record',
                sortValue: (a) => a.linkedLabel,
                render: (a) => (
                  <Link to={a.linkedHref} className="text-primary text-sm hover:underline">
                    {a.linkedLabel}
                  </Link>
                ),
              },
              {
                key: 'time',
                header: 'Time',
                sortValue: (a) => a.at,
                render: (a) => (
                  <span className="tabular whitespace-nowrap">{f.dateTime(a.at)}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                sortValue: (a) => a.status,
                render: (a) => (
                  <div>
                    <AlertStatusBadge status={a.status} />
                    {a.assignee !== null && <p className="text-muted mt-1 text-xs">{a.assignee}</p>}
                  </div>
                ),
              },
              {
                key: 'next',
                header: 'Next action',
                render: (a) => (
                  <button
                    type="button"
                    className="text-primary inline-flex max-w-[220px] items-start text-left text-xs font-semibold hover:underline"
                    onClick={() => {
                      setOpenId(a.id);
                    }}
                  >
                    {a.nextAction}
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                  </button>
                ),
              },
            ]}
          />
        </Card>
      </Tabs>
      <AlertDrawer
        alert={alerts.find((a) => a.id === openId) ?? null}
        onClose={() => {
          setOpenId('');
        }}
      />
    </>
  );
}
