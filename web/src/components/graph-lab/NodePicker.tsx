import type { GraphNode } from '@finrakshak-ai/shared';
import { useState } from 'react';
import { KIND_LABEL, searchNodes, type LabIndex } from '../../lib/graph-lab.js';
import { SearchInput } from '../ui/SearchInput.js';
import { KIND_ICON } from './LabGraphView.js';

/** Search box with a short list of matching nodes; picking one calls `onPick`. */
export function NodePicker({
  ix,
  label,
  onPick,
  className,
}: {
  ix: LabIndex;
  label: string;
  onPick: (node: GraphNode) => void;
  className?: string;
}): React.JSX.Element {
  const [q, setQ] = useState('');
  const hits = searchNodes(ix, q);
  return (
    <div className={className}>
      <SearchInput
        label={label}
        value={q}
        onChange={setQ}
        placeholder="Company, bank, address or case…"
      />
      {q.trim().length >= 2 && (
        <ul
          className="border-line bg-surface mt-1 max-h-64 overflow-y-auto rounded-lg border text-sm"
          aria-label={`${label} results`}
        >
          {hits.length === 0 && <li className="text-muted px-3 py-2">No matching node.</li>}
          {hits.map((n) => {
            const Icon = KIND_ICON[n.kind];
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className="hover:bg-surface-2 focus-visible:bg-surface-2 flex w-full items-start gap-2 px-3 py-2 text-left"
                  onClick={() => {
                    onPick(n);
                    setQ('');
                  }}
                >
                  <Icon className="text-muted mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate">{n.label}</span>
                    <span className="text-muted block truncate text-xs">
                      {KIND_LABEL[n.kind]} · {n.degree} link(s)
                      {n.detail !== null && ` · ${n.detail}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
