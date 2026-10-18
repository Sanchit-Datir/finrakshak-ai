import { Check } from 'lucide-react';
import { cn } from '../ui/cn.js';

/** How the officer starts a new loan: fill the form, or upload documents instead. */
export type CapturePath = 'form' | 'upload';

/**
 * Stored step numbers (1–4) keep one meaning on both paths: 1 upload, 2 extract & verify,
 * 3 application form, 4 risk analysis. The form path shows only steps 3 and 4.
 */
export function pathSteps(path: CapturePath): readonly { step: number; label: string }[] {
  return path === 'form'
    ? [
        { step: 3, label: 'Application form' },
        { step: 4, label: 'Risk analysis' },
      ]
    : [
        { step: 1, label: 'Upload documents' },
        { step: 2, label: 'Extract & verify' },
        { step: 3, label: 'Application form (optional)' },
        { step: 4, label: 'Risk analysis' },
      ];
}

export function Stepper({
  steps,
  current,
  reachable,
  onSelect,
}: {
  steps: readonly { step: number; label: string }[];
  current: number;
  /** Stored step numbers the officer may jump to now. */
  reachable: readonly number[];
  onSelect: (step: number) => void;
}): React.JSX.Element {
  const position = steps.findIndex((s) => s.step === current);
  return (
    <nav aria-label="Application progress" className="mb-6">
      <ol className={cn('grid gap-2', steps.length === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
        {steps.map(({ step, label }, i) => {
          const done = step < current;
          const active = step === current;
          const canGo = reachable.includes(step);
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!canGo}
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  onSelect(step);
                }}
                className={cn(
                  'flex w-full flex-col items-start gap-1.5 rounded-lg text-left disabled:cursor-not-allowed',
                  canGo && !active && 'hover:opacity-80',
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
                    {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
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
                      : canGo
                        ? ''
                        : '(not yet available)'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm font-medium sm:hidden">
        Step {position + 1} of {steps.length}: {steps[position]?.label}
      </p>
    </nav>
  );
}
