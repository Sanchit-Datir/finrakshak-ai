import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import type { Application, FindingStatus } from '../../domain/schemas.js';
import { CATEGORY_LABEL } from '../../lib/checks.js';
import type { Finding } from '../../lib/checks.js';
import { EmptyState } from '../ui/States.js';
import { FindingStatusBadge, PriorityBadge } from '../ui/StatusBadges.js';
import { DataTable } from '../ui/Table.js';
import { FindingDrawer } from './FindingDrawer.js';

function statusOf(app: Application, f: Finding): FindingStatus {
  return app.findingStates[f.id]?.status ?? 'needs_review';
}

export function FindingsTable({
  app,
  findings,
  actor,
}: {
  app: Application;
  findings: Finding[];
  actor: string;
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const finding = findings.find((f) => f.id === open) ?? null;
  return (
    <>
      <DataTable
        caption="Risk findings"
        rows={findings}
        rowKey={(f) => f.id}
        empty={
          <EmptyState icon={ListChecks} title="No findings from the configured checks">
            This means no configured check raised an item in the available data. It is not a
            guarantee that the application is free of issues.
          </EmptyState>
        }
        columns={[
          {
            key: 'finding',
            header: 'Finding',
            render: (f) => (
              <button
                type="button"
                className="text-primary text-left font-semibold hover:underline"
                onClick={() => {
                  setOpen(f.id);
                }}
              >
                {f.title}
              </button>
            ),
            sortValue: (f) => f.title,
            className: 'min-w-[220px]',
          },
          {
            key: 'category',
            header: 'Category',
            render: (f) => <span className="text-muted">{CATEGORY_LABEL[f.category]}</span>,
            sortValue: (f) => f.category,
          },
          {
            key: 'priority',
            header: 'Review priority',
            render: (f) => <PriorityBadge priority={f.priority} />,
            sortValue: (f) => ({ urgent: 0, needs_attention: 1, routine: 2 })[f.priority],
          },
          {
            key: 'evidence',
            header: 'Evidence',
            render: (f) => <span className="tabular text-muted">{f.evidence.length} item(s)</span>,
          },
          {
            key: 'certainty',
            header: 'Certainty',
            render: (f) => (
              <span className="text-muted line-clamp-2 max-w-[240px] text-xs">{f.certainty}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (f) => <FindingStatusBadge status={statusOf(app, f)} />,
            sortValue: (f) => statusOf(app, f),
          },
          {
            key: 'next',
            header: 'Recommended next step',
            render: (f) => (
              <span className="line-clamp-2 max-w-[260px] text-xs">{f.steps[0] ?? '—'}</span>
            ),
          },
        ]}
      />
      <FindingDrawer
        app={app}
        finding={finding}
        actor={actor}
        onClose={() => {
          setOpen(null);
        }}
      />
    </>
  );
}
