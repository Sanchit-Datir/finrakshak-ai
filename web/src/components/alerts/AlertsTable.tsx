import { ArrowRight, Bell } from 'lucide-react';
import { Link } from 'react-router';
import { SOURCE_LABEL, type UnifiedAlert } from '../../lib/alerts.js';
import { relativeTime } from '../../lib/format.js';
import { useFormat } from '../../state/hooks.js';
import { EmptyState } from '../ui/States.js';
import { AlertStatusBadge, PriorityBadge } from '../ui/StatusBadges.js';
import { DataTable } from '../ui/Table.js';

const PRIORITY_SORT = { urgent: 0, needs_attention: 1, routine: 2 } as const;

/** Compact alert list: one line per alert, full text on hover and in the drawer. */
export function AlertsTable({
  rows,
  onOpen,
}: {
  rows: UnifiedAlert[];
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const f = useFormat();
  return (
    <DataTable
      caption="Alerts"
      rows={rows}
      rowKey={(a) => a.id}
      initialSort={{ key: 'time', dir: 'desc' }}
      empty={
        <EmptyState icon={Bell} title="No alerts match these filters">
          Try a wider date range or remove a filter.
        </EmptyState>
      }
      columns={[
        {
          key: 'priority',
          header: 'Priority',
          sortValue: (a) => PRIORITY_SORT[a.priority],
          render: (a) => <PriorityBadge priority={a.priority} />,
        },
        {
          key: 'title',
          header: 'Alert',
          sortValue: (a) => a.title,
          className: 'min-w-[240px]',
          render: (a) => (
            <div className="max-w-[340px] min-w-0">
              <button
                type="button"
                title={a.title}
                className="text-ink hover:text-primary block w-full truncate text-left font-semibold"
                onClick={() => {
                  onOpen(a.id);
                }}
              >
                {a.title}
              </button>
              <p className="text-muted truncate text-xs" title={a.category}>
                {SOURCE_LABEL[a.source]} · {a.category}
              </p>
            </div>
          ),
        },
        {
          key: 'linked',
          header: 'Linked record',
          sortValue: (a) => a.linkedLabel,
          render: (a) => (
            <Link
              to={a.linkedHref}
              title={a.linkedLabel}
              className="text-primary block max-w-[180px] truncate text-sm hover:underline"
            >
              {a.linkedLabel}
            </Link>
          ),
        },
        {
          key: 'time',
          header: 'When',
          sortValue: (a) => a.at,
          render: (a) => (
            <time
              dateTime={a.at}
              title={f.dateTime(a.at)}
              className="tabular text-muted whitespace-nowrap"
            >
              {relativeTime(a.at)}
            </time>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          sortValue: (a) => a.status,
          render: (a) => (
            <div className="whitespace-nowrap">
              <AlertStatusBadge status={a.status} />
              {a.assignee !== null && (
                <p className="text-muted mt-0.5 max-w-[140px] truncate text-xs">{a.assignee}</p>
              )}
            </div>
          ),
        },
        {
          key: 'next',
          header: 'Next action',
          render: (a) => (
            <button
              type="button"
              title={a.nextAction}
              className="text-primary group inline-flex max-w-[240px] items-center gap-1 text-left text-xs font-semibold"
              onClick={() => {
                onOpen(a.id);
              }}
            >
              <span className="truncate group-hover:underline">{a.nextAction}</span>
              <ArrowRight
                className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          ),
        },
      ]}
    />
  );
}
