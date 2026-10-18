import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClass } from './Button.js';
import { cn } from './cn.js';
import { Popover } from './Popover.js';

export interface MenuAction {
  label: string;
  icon: LucideIcon;
  /** Either a route to open or a handler to run. */
  to?: string;
  onSelect?: () => void;
}

const ITEM =
  'hover:bg-surface-2 focus-visible:bg-surface-2 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none';

/** "More ▾" overflow menu that keeps secondary actions out of the header. */
export function ActionMenu({
  actions,
  label = 'More',
}: {
  actions: MenuAction[];
  label?: string;
}): React.JSX.Element {
  return (
    <Popover
      panelClassName="w-60 py-1"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          aria-haspopup="menu"
          className={buttonClass('secondary')}
        >
          {label}
          <ChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      )}
    >
      {(close) => (
        <ul aria-label={`${label} actions`}>
          {actions.map(({ label: l, icon: Icon, to, onSelect }) => (
            <li key={l}>
              {to !== undefined ? (
                <Link to={to} className={ITEM} onClick={close}>
                  <Icon className="text-muted size-4" aria-hidden />
                  {l}
                </Link>
              ) : (
                <button
                  type="button"
                  className={ITEM}
                  onClick={() => {
                    close();
                    onSelect?.();
                  }}
                >
                  <Icon className="text-muted size-4" aria-hidden />
                  {l}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
