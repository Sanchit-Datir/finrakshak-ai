import { SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertsTable } from '../components/alerts/AlertsTable.js';
import { PrioritySummary } from '../components/alerts/PrioritySummary.js';
import { Button } from '../components/ui/Button.js';
import { FilterChips, type ActiveFilter } from '../components/ui/FilterChips.js';
import { AlertDrawer } from '../components/monitoring/AlertDrawer.js';
import { Card } from '../components/ui/Card.js';
import { FilterSelect } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { PeriodPicker } from '../components/ui/PeriodPicker.js';
import { SearchInput } from '../components/ui/SearchInput.js';
import { Tabs, type TabDef } from '../components/ui/Tabs.js';
import { PRIORITY_LABEL } from '../domain/labels.js';
import type { RiskAlertDoc } from '@finrakshak-ai/shared';
import {
  SOURCE_LABEL,
  allAlerts,
  isOpen,
  riskScoreAlerts,
  type UnifiedAlert,
} from '../lib/alerts.js';
import { PERIOD_LABEL, inRange, resolvePeriod, type PeriodKind } from '../lib/period.js';
import type { Priority } from '../domain/schemas.js';
import { matchesQuery } from '../lib/text.js';
import { useDb } from '../state/store.js';
import { useRiskScores } from '../state/useRiskScores.js';
import { useUrlState } from '../state/url.js';
import { useBranchScope } from '../state/scope.js';
import { useCopilotTarget } from '../state/copilot.js';

type View = 'all' | 'open' | 'new' | 'in_review' | 'escalated' | 'resolved';

const NO_RISK_ALERTS: RiskAlertDoc[] = [];

export function AlertsPage(): React.JSX.Element {
  const db = useDb();
  const [view, setView] = useUrlState('view', 'all');
  const [q, setQ] = useUrlState('q', '');
  const [priority, setPriority] = useUrlState('priority', 'all');
  const [category, setCategory] = useUrlState('category', 'all');
  const { scope } = useBranchScope();
  const [branch, setBranch] = useUrlState('branch', scope);
  const [source, setSource] = useUrlState('source', 'all');
  const [assignee, setAssignee] = useUrlState('assignee', 'all');
  const [period, setPeriod] = useUrlState('period', 'all');
  const [openId, setOpenId] = useUrlState('alert', '');
  useCopilotTarget(openId === '' ? null : { kind: 'alert', id: openId });
  const [, setParams] = useSearchParams();
  const [more, setMore] = useState(
    () => category !== 'all' || branch !== 'all' || assignee !== 'all' || period !== 'all',
  );
  const risk = useRiskScores();
  const riskDocs = risk.status === 'ready' ? risk.data.alerts : NO_RISK_ALERTS;
  const alerts = useMemo(
    () =>
      [...allAlerts(db), ...riskScoreAlerts(db, riskDocs)].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
      ),
    [db, riskDocs],
  );

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

  const openByPriority = { urgent: 0, needs_attention: 0, routine: 0 };
  for (const a of alerts)
    if (isOpen(a.status) && (branch === 'all' || a.branchId === branch))
      openByPriority[a.priority] += 1;
  const branchName = (id: string): string => db.branches.find((b) => b.id === id)?.name ?? id;
  const active: ActiveFilter[] = [
    ...(q === ''
      ? []
      : [
          {
            key: 'q',
            label: `“${q}”`,
            onClear: () => {
              setQ('');
            },
          },
        ]),
    ...(priority === 'all'
      ? []
      : [
          {
            key: 'priority',
            label: PRIORITY_LABEL[priority as Priority],
            onClear: () => {
              setPriority('all');
            },
          },
        ]),
    ...(source === 'all'
      ? []
      : [
          {
            key: 'source',
            label: SOURCE_LABEL[source as UnifiedAlert['source']],
            onClear: () => {
              setSource('all');
            },
          },
        ]),
    ...(category === 'all'
      ? []
      : [
          {
            key: 'category',
            label: category,
            onClear: () => {
              setCategory('all');
            },
          },
        ]),
    ...(branch === 'all'
      ? []
      : [
          {
            key: 'branch',
            label: branchName(branch),
            onClear: () => {
              setBranch('all');
            },
          },
        ]),
    ...(assignee === 'all'
      ? []
      : [
          {
            key: 'assignee',
            label: assignee === 'none' ? 'Unassigned' : assignee,
            onClear: () => {
              setAssignee('all');
            },
          },
        ]),
    ...(period === 'all'
      ? []
      : [
          {
            key: 'period',
            label: PERIOD_LABEL[period as PeriodKind],
            onClear: () => {
              setPeriod('all');
            },
          },
        ]),
  ];
  const clearAll = (): void => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of ['q', 'priority', 'source', 'category', 'branch', 'assignee', 'period'])
          next.delete(k);
        // With a branch scope set in the sidebar, "clear all" still means every branch.
        if (scope !== 'all') next.set('branch', 'all');
        return next;
      },
      { replace: true },
    );
  };

  return (
    <>
      <PageHeader
        docTitle="Alerts"
        title="Alerts"
        subtitle="Leads from pre-disbursement checks and transaction monitoring. Each opens with evidence and suggested checks."
      />
      <PrioritySummary counts={openByPriority} selected={priority} onSelect={setPriority} />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <SearchInput
            label="Search"
            value={q}
            onChange={setQ}
            placeholder="Alert, case or loan ID…"
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
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: 'all', label: 'All sources' },
              { value: 'monitoring', label: SOURCE_LABEL.monitoring },
              { value: 'pre_disbursement', label: SOURCE_LABEL.pre_disbursement },
              { value: 'public_records', label: SOURCE_LABEL.public_records },
              { value: 'risk_score', label: SOURCE_LABEL.risk_score },
            ]}
          />
          <Button
            icon={SlidersHorizontal}
            aria-expanded={more}
            onClick={() => {
              setMore((m) => !m);
            }}
          >
            {more ? 'Fewer filters' : 'More filters'}
          </Button>
        </div>
        {more && (
          <div className="border-line mt-3 grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
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
              label="Assigned user"
              value={assignee}
              onChange={setAssignee}
              options={[
                { value: 'all', label: 'Anyone' },
                { value: 'none', label: 'Unassigned' },
                ...assignees.map((u) => ({ value: u, label: u })),
              ]}
            />
            <PeriodPicker
              label="Date"
              value={{ kind: period === 'all' ? '30d' : (period as PeriodKind), from: '', to: '' }}
              options={['today', '7d', '30d', 'month']}
              onChange={(v) => {
                setPeriod(v.kind);
              }}
            />
          </div>
        )}
        {active.length > 0 && (
          <div className="mt-3">
            <FilterChips filters={active} onClearAll={clearAll} />
          </div>
        )}
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
          <AlertsTable rows={rows} onOpen={setOpenId} />
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
