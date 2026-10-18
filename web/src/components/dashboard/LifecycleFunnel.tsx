import { Link } from 'react-router';
import { Card, CardHeader } from '../ui/Card.js';

export interface FunnelStage {
  label: string;
  value: number;
  hint: string;
  to: string;
  color: string;
}

/** Loan lifecycle at a glance; bar widths are relative to the first stage. */
export function LifecycleFunnel({ stages }: { stages: FunnelStage[] }): React.JSX.Element {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <Card>
      <CardHeader title="Loan lifecycle" subtitle="From application to investigation (current)" />
      <ol className="space-y-3 px-4 pb-5 sm:px-5">
        {stages.map((s, i) => (
          <li key={s.label}>
            <Link to={s.to} className="group block rounded-lg">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium group-hover:text-primary">
                  <span className="text-muted tabular mr-1.5 text-xs">{i + 1}</span>
                  {s.label}
                </span>
                <span className="tabular font-semibold">{s.value}</span>
              </div>
              <div className="bg-surface-2 h-2.5 overflow-hidden rounded-full">
                <div
                  className="grow-x h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (s.value / max) * 100)}%`,
                    background: s.color,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              </div>
              <p className="text-muted mt-1 text-[11px]">{s.hint}</p>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
