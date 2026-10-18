import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useDocumentTitle } from '../../state/hooks.js';
import { sectionFor, type Stage } from '../app-shell/nav.js';
import { cn } from './cn.js';

const EYEBROW: Record<Stage | 'none', string> = {
  pre: 'text-primary',
  post: 'text-ok',
  investigate: 'text-violet',
  none: 'text-muted',
};

/** "① PRE-SANCTION · Assess before you lend": where this page sits in the loan journey. */
function StageEyebrow(): React.JSX.Element | null {
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  if (section === null || section.bare === true) return null;
  return (
    <p
      className={cn(
        'mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase',
        EYEBROW[section.stage?.kind ?? 'none'],
      )}
    >
      {section.stage !== undefined && (
        <span
          aria-hidden
          className="grid size-4 place-items-center rounded-full border border-current text-[9px] leading-none"
        >
          {section.stage.n}
        </span>
      )}
      {section.stage !== undefined && <span className="sr-only">Step {section.stage.n}: </span>}
      {section.label}
      <span className="text-muted font-medium tracking-normal normal-case">· {section.hint}</span>
    </p>
  );
}

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
        <StageEyebrow />
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
