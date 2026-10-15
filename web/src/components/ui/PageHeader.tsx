import type { ReactNode } from 'react';
import { useDocumentTitle } from '../../state/hooks.js';

export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
  docTitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  docTitle: string;
}): React.JSX.Element {
  useDocumentTitle(docTitle);
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight sm:text-[26px]">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle !== undefined && <p className="text-muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
