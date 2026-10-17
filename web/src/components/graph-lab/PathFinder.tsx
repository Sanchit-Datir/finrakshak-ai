import type { GraphNode } from '@fund-tracker/shared';
import { Route } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EDGE_LABEL, pathBetween, type LabIndex } from '../../lib/graph-lab.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Field.js';
import { EmptyState } from '../ui/States.js';
import { BasisBadge, EvidenceLine } from './NodeDetails.js';
import { NodePicker } from './NodePicker.js';

function Chosen({ node, label }: { node: GraphNode | null; label: string }): React.JSX.Element {
  return (
    <p className="text-sm">
      <span className="text-muted">{label}: </span>
      {node === null ? (
        <span className="text-muted">not chosen</span>
      ) : (
        <strong>{node.label}</strong>
      )}
    </p>
  );
}

/** Shortest chain of recorded relationships between two nodes, with evidence for each hop. */
export function PathFinder({
  ix,
  onExplore,
}: {
  ix: LabIndex;
  onExplore: (id: string) => void;
}): React.JSX.Element {
  const [a, setA] = useState<GraphNode | null>(null);
  const [b, setB] = useState<GraphNode | null>(null);
  const [includeWeak, setIncludeWeak] = useState(false);
  const steps = useMemo(
    () => (a === null || b === null ? null : pathBetween(ix, a.id, b.id, includeWeak)),
    [ix, a, b, includeWeak],
  );
  const label = (id: string): string => ix.nodes.get(id)?.label ?? id;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <NodePicker ix={ix} label="From" onPick={setA} />
          <Chosen node={a} label="From" />
        </div>
        <div className="space-y-1">
          <NodePicker ix={ix} label="To" onPick={setB} />
          <Chosen node={b} label="To" />
        </div>
      </div>
      <Checkbox
        label="Allow weak and candidate links (hub routes, professionals, text mentions, possible matches)"
        checked={includeWeak}
        onChange={(e) => {
          setIncludeWeak(e.target.checked);
        }}
      />
      {steps === null && a !== null && b !== null && (
        <EmptyState icon={Route} title="No connection found within 8 hops">
          The available records do not connect these two. This does not prove they are unrelated.
        </EmptyState>
      )}
      {steps !== null && steps.length > 0 && (
        <ol className="space-y-2" aria-label="Connection path">
          {steps.map((s, i) => (
            <li key={s.edge.id} className="border-line rounded-lg border p-2 text-sm">
              <p className="break-words">
                <span className="text-muted">Step {i + 1}: </span>
                <strong>{label(s.edge.from)}</strong> — {EDGE_LABEL[s.edge.type]} —{' '}
                <strong>{label(s.edge.to)}</strong>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <BasisBadge edge={s.edge} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onExplore(s.to);
                  }}
                >
                  Explore here
                </Button>
              </div>
              <EvidenceLine ix={ix} edge={s.edge} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
