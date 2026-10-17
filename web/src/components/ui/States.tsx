import { FlaskConical, Info, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button.js';
import { cn } from './cn.js';

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}
    >
      <div className="bg-primary-soft text-primary mb-3 flex size-12 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="font-semibold">{title}</p>
      {children !== undefined && <div className="text-muted mt-1 max-w-md text-sm">{children}</div>}
      {action !== undefined && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>
      )}
    </div>
  );
}

export function ErrorState({
  title,
  children,
  onRetry,
  action,
}: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <div className="bg-danger-soft text-danger mb-3 flex size-12 items-center justify-center rounded-full">
        <TriangleAlert className="size-6" aria-hidden />
      </div>
      <p className="font-semibold">{title}</p>
      {children !== undefined && <div className="text-muted mt-1 max-w-md text-sm">{children}</div>}
      <div className="mt-4 flex gap-2">
        {onRetry !== undefined && (
          <Button icon={RefreshCw} onClick={onRetry}>
            Retry
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div aria-hidden className={cn('bg-line/60 animate-pulse rounded-md', className)} />;
}

export function PageSkeleton(): React.JSX.Element {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/** Marks output that no real OCR / AI service produced. */
export function SimulatedBadge({
  label = 'Simulated output',
}: {
  label?: string;
}): React.JSX.Element {
  return (
    <span className="bg-warn-soft text-warn inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
      <FlaskConical className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger';
  title?: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  const styles = {
    info: 'bg-info-soft text-info',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
  }[tone];
  const Icon = tone === 'info' ? Info : TriangleAlert;
  return (
    <div className={cn('flex gap-2.5 rounded-xl p-3 text-[13px]', styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-ink min-w-0">
        {title !== undefined && <p className="font-semibold">{title}</p>}
        <div className="text-ink/85">{children}</div>
      </div>
    </div>
  );
}
