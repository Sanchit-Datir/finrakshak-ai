import { Check, ChevronDown } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { DOC_GROUPS, docTypeLabel } from '../../lib/doc-catalog.js';
import { matchesQuery } from '../../lib/text.js';
import { cn } from '../ui/cn.js';
import { inputClass } from '../ui/Field.js';

/** Searchable, grouped document-type picker (spec §7: searchable dropdown grouped by category). */
export function DocTypeCombobox({
  value,
  onChange,
  label = 'Document type',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}): React.JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(
    () => [
      { group: '', key: null as string | null, label: 'Not classified yet' },
      ...DOC_GROUPS.flatMap((g) =>
        g.types
          .filter((t) => matchesQuery(q, t.label, t.labelMr, g.group))
          .map((t) => ({
            group: g.group,
            key: t.key,
            label: t.labelMr === undefined ? t.label : `${t.label} (${t.labelMr})`,
          })),
      ),
    ],
    [q],
  );
  const choose = (k: string | null): void => {
    onChange(k);
    setOpen(false);
    setQ('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const o = options[active];
      if (o !== undefined) choose(o.key);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQ('');
    }
  };
  let lastGroup = '';
  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="text-muted mb-1 block text-xs font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          value={open ? q : docTypeLabel(value)}
          placeholder="Search document types…"
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              setQ('');
            }, 150);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKey}
          className={cn(inputClass, 'h-9 py-1 pr-8', value === null && !open && 'text-muted')}
        />
        <ChevronDown
          className="text-muted pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
      </div>
      {open && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="card absolute z-50 mt-1 max-h-72 w-full min-w-[260px] overflow-y-auto py-1"
          style={{ boxShadow: 'var(--shadow-pop)' }}
        >
          {options.length === 1 && (
            <p className="text-muted px-3 py-2 text-sm">No matching document type.</p>
          )}
          {options.map((o, i) => {
            const header = o.group !== lastGroup && o.group !== '' ? o.group : null;
            lastGroup = o.group;
            return (
              <div key={o.key ?? 'none'}>
                {header !== null && (
                  <p
                    aria-hidden
                    className="text-muted px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase"
                  >
                    {header}
                  </p>
                )}
                <div
                  id={`${id}-opt-${i}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={o.key === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o.key);
                  }}
                  onMouseEnter={() => {
                    setActive(i);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                    i === active && 'bg-primary-soft',
                    o.key === null && 'text-muted',
                  )}
                >
                  <span className="flex-1">{o.label}</span>
                  {o.key === value && <Check className="text-primary size-4" aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
