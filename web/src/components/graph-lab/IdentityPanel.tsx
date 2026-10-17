import { Telescope } from 'lucide-react';
import type { LabIndex } from '../../lib/graph-lab.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Notice } from '../ui/States.js';
import { DataTable } from '../ui/Table.js';

const REASON: Record<string, string> = {
  similar_name: 'Similar name',
  same_registered_address: 'Same registered address',
};

/** Possible identity matches: listed for manual review, never merged automatically. */
export function IdentityPanel({
  ix,
  onExplore,
}: {
  ix: LabIndex;
  onExplore: (id: string) => void;
}): React.JSX.Element {
  const rows = [...ix.bundle.identity].sort((x, y) => y.similarity - x.similarity).slice(0, 300);
  return (
    <div className="space-y-3">
      <Notice tone="warn" title="Needs manual review">
        These pairs might be the same organisation written differently — or different organisations
        with similar names. They are kept separate in the graph and never join networks. Confirm
        with a CIN or official record before treating them as one.
      </Notice>
      <DataTable
        caption={`Identity candidates (${ix.bundle.identity.length} total; 300 most similar shown)`}
        rows={rows}
        rowKey={(r) => r.id}
        dense
        initialSort={{ key: 'sim', dir: 'desc' }}
        empty="No identity candidates."
        columns={[
          {
            key: 'a',
            header: 'Name A',
            render: (r) => <span className="block max-w-xs break-words">{r.name_a}</span>,
            sortValue: (r) => r.name_a,
          },
          {
            key: 'b',
            header: 'Name B',
            render: (r) => <span className="block max-w-xs break-words">{r.name_b}</span>,
            sortValue: (r) => r.name_b,
          },
          {
            key: 'sim',
            header: 'Similarity',
            align: 'right',
            render: (r) => <span className="tabular">{r.similarity.toFixed(2)}</span>,
            sortValue: (r) => r.similarity,
          },
          {
            key: 'why',
            header: 'Why proposed',
            render: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.reasons.map((x) => (
                  <Badge key={x} tone="warn">
                    {REASON[x] ?? x}
                  </Badge>
                ))}
              </span>
            ),
          },
          {
            key: 'open',
            header: 'Explore',
            render: (r) => (
              <Button
                size="sm"
                variant="subtle"
                icon={Telescope}
                onClick={() => {
                  onExplore(r.a);
                }}
              >
                Explore
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
