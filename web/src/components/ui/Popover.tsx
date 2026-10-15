import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn.js';

/** Click-to-open popover with outside-click and Escape dismissal. */
export function Popover({
  trigger,
  children,
  align = 'right',
  panelClassName,
}: {
  trigger: (p: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  panelClassName?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({
        open,
        toggle: () => {
          setOpen((o) => !o);
        },
        id,
      })}
      {open && (
        <div
          id={id}
          className={cn(
            'card absolute top-full z-50 mt-2 overflow-hidden',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
          style={{ boxShadow: 'var(--shadow-pop)' }}
        >
          {children(() => {
            setOpen(false);
          })}
        </div>
      )}
    </div>
  );
}
