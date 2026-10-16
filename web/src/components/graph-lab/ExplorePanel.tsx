import { Network } from 'lucide-react';
import { useMemo, useState } from 'react';
import { egoLayout, LABEL_ALL_MAX, LAYOUT_CAP, type LabIndex } from '../../lib/graph-lab.js';
import { Checkbox, SelectField } from '../ui/Field.js';
import { EmptyState, Notice } from '../ui/States.js';
import { LabGraphView } from './LabGraphView.js';
import { NodeDetails } from './NodeDetails.js';
import { NodePicker } from './NodePicker.js';

/** Search a node, see its neighbourhood as a graph, and inspect the evidence for each link. */
export function ExplorePanel({
  ix,
  focus,
  onFocus,
}: {
  ix: LabIndex;
  focus: string | null;
  onFocus: (id: string) => void;
}): React.JSX.Element {
  const [hops, setHops] = useState(1);
  const [includeWeak, setIncludeWeak] = useState(false);
  const [selected, setSelected] = useState<string | null>(focus);
  // Selection follows the focus when the focus changes (compare during render, no effect).
  const [lastFocus, setLastFocus] = useState(focus);
  if (focus !== lastFocus) {
    setLastFocus(focus);
    setSelected(focus);
  }
  const layout = useMemo(
    () => (focus === null ? null : egoLayout(ix, focus, hops, includeWeak)),
    [ix, focus, hops, includeWeak],
  );
  const selNode = selected === null ? undefined : ix.nodes.get(selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <NodePicker
          ix={ix}
          label="Find a node"
          className="w-full sm:w-96"
          onPick={(n) => {
            onFocus(n.id);
          }}
        />
        <SelectField
          label="Show"
          value={String(hops)}
          onChange={(e) => {
            setHops(Number(e.target.value));
          }}
          className="w-44"
        >
          <option value="1">Direct links (1 hop)</option>
          <option value="2">Two hops</option>
        </SelectField>
        <Checkbox
          label="Include weak and candidate links"
          checked={includeWeak}
          onChange={(e) => {
            setIncludeWeak(e.target.checked);
          }}
          className="pb-2"
        />
      </div>
      {layout === null ? (
        <EmptyState icon={Network} title="Choose a starting point">
          Search for a company, bank, professional, address or case — or open a network from the
          Networks tab.
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-2">
            <LabGraphView
              layout={layout}
              selected={selected}
              onSelect={setSelected}
              label="Neighbourhood graph"
            />
            {layout.busy && (
              <p className="text-muted text-xs">
                More than {LABEL_ALL_MAX} nodes: names are shown for the focus and the selected node
                only. Hover a node or use the list beside the graph for the rest.
              </p>
            )}
            {layout.truncated && (
              <p className="text-muted text-xs">
                Showing the first {LAYOUT_CAP} nodes. Hubs are not expanded; focus on a node to see
                more.
              </p>
            )}
          </div>
          <aside className="border-line rounded-xl border p-3" aria-live="polite">
            {selNode === undefined ? (
              <p className="text-muted text-sm">
                Select a node to see its relationships and evidence.
              </p>
            ) : (
              <NodeDetails ix={ix} node={selNode} includeWeak={includeWeak} onFocus={onFocus} />
            )}
          </aside>
        </div>
      )}
      <Notice>
        A connection is not evidence of wrongdoing. Shared addresses, creditors, professionals or
        cases are context for review. Candidate links are possible matches only, and absence of a
        link does not mean no relationship exists.
      </Notice>
    </div>
  );
}
