import { X } from 'lucide-react';

export interface ActiveFilter {
  key: string;
  label: string;
  onClear: () => void;
}

/** Removable chips for the filters currently applied, plus "Clear all". */
export function FilterChips({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  /** Clears every filter in one update (separate URL updates in one tick can overwrite each other). */
  onClearAll: () => void;
}): React.JSX.Element | null {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.onClear}
          className="bg-primary-soft text-primary-strong hover:bg-primary/15 inline-flex items-center gap-1.5 rounded-full py-1 pr-2 pl-3 text-xs font-semibold transition-colors"
        >
          {f.label}
          <X className="size-3.5" aria-hidden />
          <span className="sr-only">Remove filter</span>
        </button>
      ))}
      {filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-muted hover:text-ink text-xs font-semibold underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
