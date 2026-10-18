import { CircleCheck, CircleDashed, ShieldAlert, TriangleAlert } from 'lucide-react';
import { DonutChart } from '../charts/DonutChart.js';
import { PRIORITY_HELP } from '../../domain/labels.js';
import type { Application, Db } from '../../domain/schemas.js';
import { reviewPriority } from '../../lib/checks.js';

export function RiskDonut({ apps, db }: { apps: Application[]; db: Db }): React.JSX.Element {
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
          color: 'var(--color-muted)',
          icon: CircleDashed,
          href: '/applications?priority=none',
        },
      ]}
    />
  );
}
