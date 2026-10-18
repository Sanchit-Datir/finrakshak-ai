import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useDb } from '../../state/store.js';
import { cn } from './cn.js';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: 'left' | 'right';
}

/** Sortable, horizontally scrollable table. Rows are keyed by `rowKey`. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  initialSort,
  dense = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  caption: string;
  empty?: ReactNode;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  dense?: boolean;
}): React.JSX.Element {
  const compact = useDb().settings.preferences.density === 'compact';
  const tight = dense || compact;
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (sort === null) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col?.sortValue;
    if (get === undefined) return rows;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);
  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-line text-muted border-b text-left text-xs font-semibold tracking-wide uppercase">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active
                ? sort.dir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    'px-4 py-2.5 font-semibold whitespace-nowrap',
                    c.align === 'right' && 'text-right',
                    c.className,
                  )}
                >
                  {c.sortValue === undefined ? (
                    c.header
                  ) : (
                    <button
                      type="button"
                      className="hover:text-ink inline-flex items-center gap-1 uppercase"
                      onClick={() => {
                        setSort(
                          active && sort.dir === 'asc'
                            ? { key: c.key, dir: 'desc' }
                            : { key: c.key, dir: 'asc' },
                        );
                      }}
                    >
                      {c.header}
                      {active ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                      )}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              className="border-line hover:bg-surface-2/70 border-b last:border-b-0"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 align-middle',
                    tight ? 'py-2' : 'py-3',
                    c.align === 'right' && 'tabular text-right',
                    c.className,
                  )}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
