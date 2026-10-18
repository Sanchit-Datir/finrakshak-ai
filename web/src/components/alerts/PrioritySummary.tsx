import { CircleCheck, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { PRIORITY_HELP, PRIORITY_LABEL } from '../../domain/labels.js';
import type { Priority } from '../../domain/schemas.js';
import { cn } from '../ui/cn.js';

const STYLE: Record<Priority, { icon: LucideIcon; tone: string; ring: string }> = {
  urgent: { icon: ShieldAlert, tone: 'bg-danger-soft text-danger', ring: 'ring-danger' },
  needs_attention: { icon: TriangleAlert, tone: 'bg-warn-soft text-warn', ring: 'ring-warn' },
  routine: { icon: CircleCheck, tone: 'bg-ok-soft text-ok', ring: 'ring-ok' },
};
const ORDER: Priority[] = ['urgent', 'needs_attention', 'routine'];

/** Clickable counts per review priority that double as a quick filter. */
export function PrioritySummary({
  counts,
  selected,
  onSelect,
}: {
  counts: Record<Priority, number>;
  selected: string;
  onSelect: (p: string) => void;
}): React.JSX.Element {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ORDER.map((p) => {
        const { icon: Icon, tone, ring } = STYLE[p];
        const on = selected === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            title={PRIORITY_HELP[p]}
            onClick={() => {
              onSelect(on ? 'all' : p);
            }}
            className={cn(
              'card card-hover flex items-center gap-3 p-4 text-left',
              on && `ring-2 ${ring}`,
            )}
          >
            <span className={cn('flex size-10 items-center justify-center rounded-xl', tone)}>
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="tabular block text-2xl leading-none font-bold">{counts[p]}</span>
              <span className="text-muted mt-1 block text-xs font-medium">
                {PRIORITY_LABEL[p]} · open
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
