import { Check } from 'lucide-react';
import { cn } from '../ui/cn.js';

export const STEPS = [
  'Capture documents',
  'Extract & verify',
  'Review application',
  'Risk analysis',
] as const;

export function Stepper({
  current,
  furthest,
  onSelect,
}: {
  current: number;
  furthest: number;
  onSelect: (step: number) => void;
}): React.JSX.Element {
  return (
    <nav aria-label="Application progress" className="mb-6">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          const reachable = step <= furthest;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  onSelect(step);
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-1.5 rounded-lg text-left disabled:cursor-not-allowed',
                  reachable && !active && 'hover:opacity-80',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-full rounded-full',
                    done || active ? 'bg-primary' : 'bg-line',
                  )}
                />
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      done
                        ? 'bg-primary text-white dark:text-navy-deep'
                        : active
                          ? 'border-primary text-primary border-2'
                          : 'border-line text-muted border-2',
                    )}
                  >
                    {done ? <Check className="size-3.5" aria-hidden /> : step}
                  </span>
                  <span
                    className={cn(
                      'hidden text-sm font-medium sm:inline',
                      active ? 'text-ink' : 'text-muted',
                    )}
                  >
                    {label}
                  </span>
                </span>
                <span className="sr-only">
                  {done
                    ? '(completed)'
                    : active
                      ? '(current step)'
                      : reachable
                        ? ''
                        : '(not yet available)'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm font-medium sm:hidden">
        Step {current} of 4: {STEPS[current - 1]}
      </p>
    </nav>
  );
}
