import type { ReactNode } from 'react';
import { cn } from './cn.js';

export function Card({
  children,
  className,
  as: As = 'section',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  'aria-labelledby'?: string;
}): React.JSX.Element {
  return (
    <As className={cn('card', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  id,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  id?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 id={id} className="text-[16px] font-semibold">
          {title}
        </h2>
        {subtitle !== undefined && <p className="text-muted mt-0.5 text-[13px]">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
