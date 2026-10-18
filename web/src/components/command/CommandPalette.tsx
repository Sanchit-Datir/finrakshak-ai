import {
  ArrowRight,
  Bell,
  Briefcase,
  Building2,
  Clock3,
  FileStack,
  Files,
  Landmark,
  Navigation,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { useDb } from '../../state/store.js';
import { toggleTheme } from '../../state/theme.js';
import { cn } from '../ui/cn.js';
import { readRecent, rememberRecent } from './recent.js';
import { searchCommands, type Command, type CommandGroup } from './search-index.js';

const GROUP_ICON: Record<CommandGroup, LucideIcon> = {
  Recent: Clock3,
  Actions: Sparkles,
  'Go to': Navigation,
  Borrowers: Users,
  Applications: FileStack,
  Loans: Landmark,
  Alerts: Bell,
  Cases: Briefcase,
  Documents: Files,
  Entities: Building2,
};

function Kbd({ children }: { children: string }): React.JSX.Element {
  return (
    <kbd className="border-line bg-surface-2 text-muted inline-flex min-w-5 items-center justify-center rounded border px-1 font-sans text-[11px] font-medium">
      {children}
    </kbd>
  );
}

/** Ctrl/⌘ K: jump to any record or page, or run a quick action. */
export function CommandPalette({
  open,
  onClose,
  onShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  onShortcuts: () => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  // Clicking the backdrop (the <dialog> itself, outside the panel) closes the palette.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const onClick = (e: MouseEvent): void => {
      if (e.target === el) onClose();
    };
    el.addEventListener('click', onClick);
    return () => {
      el.removeEventListener('click', onClick);
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="bg-surface text-ink backdrop:bg-navy-deep/50 palette-pop mx-auto mt-[12vh] w-[calc(100vw-24px)] max-w-[640px] overflow-hidden rounded-2xl p-0 shadow-[var(--shadow-pop)] backdrop:backdrop-blur-sm"
    >
      {open && <PaletteBody onClose={onClose} onShortcuts={onShortcuts} />}
    </dialog>
  );
}

function PaletteBody({
  onClose,
  onShortcuts,
}: {
  onClose: () => void;
  onShortcuts: () => void;
}): React.JSX.Element {
  const db = useDb();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const results = useMemo(() => searchCommands(db, query, recent), [db, query, recent]);
  const groups = [...new Set(results.map((r) => r.group))];

  const run = (c: Command | undefined): void => {
    if (c === undefined) return;
    onClose();
    if (c.action === 'toggle-theme') toggleTheme(db.settings.preferences.theme);
    else if (c.action === 'shortcuts') onShortcuts();
    else if (c.action === 'new-application') void navigate('/applications/new');
    else if (c.href !== undefined) {
      rememberRecent(c);
      void navigate(c.href);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    }
  };

  return (
    <div className="flex max-h-[70dvh] flex-col">
      <div className="border-line flex items-center gap-3 border-b px-4">
        <Search className="text-primary size-5 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="Search records, pages and actions"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[active] === undefined ? undefined : `${listId}-${active}`}
          placeholder="Search borrowers, loans, alerts, cases… or type a command"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>
      <div id={listId} role="listbox" aria-label="Results" className="overflow-y-auto py-2">
        {results.length === 0 && (
          <p className="text-muted px-4 py-10 text-center text-sm">
            Nothing matches “{query}”. Try a name, loan ID, alert or case number.
          </p>
        )}
        {groups.map((g) => {
          const Icon = GROUP_ICON[g];
          return (
            <div key={g} role="group" aria-label={g} className="px-2">
              <p
                aria-hidden
                className="text-muted flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase"
              >
                <Icon className="size-3.5" /> {g}
              </p>
              {results.map((r, i) =>
                r.group !== g ? null : (
                  <div
                    key={`${r.group}-${r.id}`}
                    id={`${listId}-${i}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === active}
                    onMouseMove={() => {
                      if (i !== active) setActive(i);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run(r);
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
                      i === active ? 'bg-primary-soft' : '',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-muted truncate text-xs">{r.detail}</p>
                    </div>
                    {r.hint !== undefined && <Kbd>{r.hint}</Kbd>}
                    {i === active && (
                      <ArrowRight className="text-primary size-4 shrink-0" aria-hidden />
                    )}
                  </div>
                ),
              )}
            </div>
          );
        })}
      </div>
      <div className="border-line bg-surface-2 text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px]">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>?</Kbd> all shortcuts
        </span>
        <span className="ml-auto">FinRakshak AI</span>
      </div>
    </div>
  );
}
