import { ALL_NAV } from '../app-shell/nav.js';
import { Dialog } from '../ui/Dialog.js';

const GENERAL: [string[], string][] = [
  [['Ctrl', 'K'], 'Open the command palette (⌘ K on Mac)'],
  [['Ctrl', 'J'], 'Ask FinRakshak Copilot about this page (⌘ J on Mac, or I)'],
  [['/'], 'Search anything'],
  [['N'], 'Start a new loan application'],
  [['?'], 'Show this list'],
  [['Esc'], 'Close a dialog or panel'],
];

function Keys({ keys }: { keys: string[] }): React.JSX.Element {
  return (
    <span className="flex gap-1">
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="border-line bg-surface-2 inline-flex min-w-6 justify-center rounded-md border px-1.5 py-0.5 font-sans text-xs font-semibold shadow-[inset_0_-1px_0_var(--color-line)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const go = ALL_NAV.filter((n) => n.key !== undefined);
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" wide>
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className="text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
            General
          </h3>
          <ul className="space-y-2 text-sm">
            {GENERAL.map(([keys, text]) => (
              <li key={text} className="flex items-center justify-between gap-3">
                {text}
                <Keys keys={keys} />
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-muted mb-2 text-xs font-semibold tracking-wider uppercase">
            Go to (press G, then)
          </h3>
          <ul className="space-y-2 text-sm">
            {go.map((n) => (
              <li key={n.to} className="flex items-center justify-between gap-3">
                {n.label}
                <Keys keys={['G', (n.key ?? '').toUpperCase()]} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
