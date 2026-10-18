import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Sparkline } from '../charts/Sparkline.js';
import { cn } from '../ui/cn.js';

export type KpiTone = 'info' | 'warn' | 'teal' | 'violet';

const TONE: Record<KpiTone, { chip: string; color: string }> = {
  info: { chip: 'bg-info-soft text-info', color: 'var(--color-info)' },
  warn: { chip: 'bg-warn-soft text-warn', color: 'var(--color-warn)' },
  teal: { chip: 'bg-ok-soft text-ok', color: 'var(--color-teal)' },
  violet: { chip: 'bg-violet-soft text-violet', color: 'var(--color-violet)' },
};

/** Count card with a trend line computed from the same records in the selected period. */
export function KpiCard({
  icon: Icon,
  tone,
  value,
  label,
  to,
  trend,
  trendLabel,
}: {
  icon: LucideIcon;
  tone: KpiTone;
  value: number;
  label: string;
  to: string;
  trend: number[];
  trendLabel: string;
}): React.JSX.Element {
  const t = TONE[tone];
  const periodTotal = trend.reduce((s, v) => s + v, 0);
  return (
    <Link to={to} className="card card-hover group relative flex flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <span className={cn('flex size-10 items-center justify-center rounded-xl', t.chip)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <ArrowUpRight
          className="text-muted group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>
      <p className="tabular mt-4 text-[34px] leading-none font-bold tracking-tight">{value}</p>
      <p className="mt-1.5 text-sm font-medium">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-muted min-w-0 text-xs leading-tight">
          <span className="tabular text-ink block text-sm font-semibold">{periodTotal}</span>
          {trendLabel}
        </p>
        <Sparkline values={trend} color={t.color} className="h-9 w-28 shrink-0" />
      </div>
    </Link>
  );
}
