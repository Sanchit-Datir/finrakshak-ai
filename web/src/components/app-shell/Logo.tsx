import { cn } from '../ui/cn.js';

export function LogoMark({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="#12324A" />
      <path
        d="M8 22l5-6 4 3 7-9"
        fill="none"
        stroke="#5EEAD4"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="10" r="2.2" fill="#fff" />
    </svg>
  );
}

export function Wordmark({
  inverted = false,
  collapsed = false,
}: {
  inverted?: boolean;
  collapsed?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <LogoMark className={inverted ? 'rounded-lg ring-1 ring-white/15' : ''} />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              'text-[16px] font-bold tracking-tight',
              inverted ? 'text-white' : 'text-ink',
            )}
          >
            FinRakshak <span className={inverted ? 'text-teal-300' : 'text-teal'}>AI</span>
          </p>
          <p
            className={cn(
              'text-[11px] font-medium whitespace-nowrap',
              inverted ? 'text-white/70' : 'text-muted',
            )}
          >
            Loan Lifecycle Intelligence
          </p>
        </div>
      )}
    </div>
  );
}
