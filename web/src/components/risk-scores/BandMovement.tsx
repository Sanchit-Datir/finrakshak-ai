import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BandMovement as Movement } from '../../lib/risk-score-view.js';

const ITEMS: readonly { key: keyof Movement; label: string; icon: LucideIcon }[] = [
  { key: 'up', label: 'Moved up', icon: ArrowUp },
  { key: 'down', label: 'Moved down', icon: ArrowDown },
  { key: 'fresh', label: 'New', icon: Sparkles },
  { key: 'unchanged', label: 'Unchanged', icon: Minus },
];

/** Loans by movement since the last run: icon, text and number, never colour alone. */
export function BandMovement({ movement }: { movement: Movement }): React.JSX.Element {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Movement since the last run">
      {ITEMS.map(({ key, label, icon: Icon }) => (
        <li key={key} className="card flex items-center justify-between gap-2 p-4">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="size-4" aria-hidden />
            {label}
          </span>
          <span className="tabular text-2xl font-semibold">{movement[key]}</span>
        </li>
      ))}
    </ul>
  );
}
