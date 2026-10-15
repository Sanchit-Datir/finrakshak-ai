import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn.js';

export interface TabDef<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
}

/** WAI-ARIA tabs with arrow-key navigation. Panels are rendered by the caller via `children`. */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
  className,
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = tabs.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    const t = tabs[next];
    if (t === undefined) return;
    e.preventDefault();
    onChange(t.key);
    refs.current[next]?.focus();
  };
  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKey}
        className="border-line -mx-1 flex gap-1 overflow-x-auto border-b px-1"
      >
        {tabs.map((t, i) => {
          const selected = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(t.key);
              }}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap',
                selected
                  ? 'border-primary text-primary'
                  : 'text-muted hover:text-ink border-transparent',
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'tabular rounded-full px-1.5 text-[11px]',
                    selected ? 'bg-primary-soft' : 'bg-neutral-soft',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${value}`}
        className="pt-4"
      >
        {children}
      </div>
    </div>
  );
}
