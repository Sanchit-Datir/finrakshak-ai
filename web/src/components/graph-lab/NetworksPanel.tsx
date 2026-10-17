import type { GraphNetwork } from '@fund-tracker/shared';
import { Telescope } from 'lucide-react';
import { useState } from 'react';
import { isOrganisation, type LabIndex } from '../../lib/graph-lab.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { DataTable } from '../ui/Table.js';

const SHOWN = 200;

/** The organisation with the most strong links: a sensible place to start exploring. */
function anchor(ix: LabIndex, net: GraphNetwork): string | undefined {
  return net.node_ids
    .map((id) => ix.nodes.get(id))
    .filter((n) => n !== undefined && isOrganisation(n))
    .sort((a, b) => (b?.degree ?? 0) - (a?.degree ?? 0))[0]?.id;
}

function names(ix: LabIndex, net: GraphNetwork): string {
  const orgs = net.node_ids
    .map((id) => ix.nodes.get(id))
    .filter((n) => n !== undefined && isOrganisation(n));
  const first = orgs.slice(0, 3).map((n) => n?.label ?? '');
  return `${first.join('; ')}${orgs.length > 3 ? `; +${orgs.length - 3} more` : ''}`;
}

export function NetworksPanel({
  ix,
  onExplore,
}: {
  ix: LabIndex;
  onExplore: (id: string) => void;
}): React.JSX.Element {
  const [seedOnly, setSeedOnly] = useState(false);
  const rows = ix.bundle.networks
    .filter((n) => !seedOnly || n.seed_cases.length > 0)
    .slice(0, SHOWN);
  return (
    <div className="space-y-3">
      <Notice title="How networks are formed">
        Organisations joined by strong, established records: named in the same case, same registered
        address, a non-hub insolvency applicant, or audit links. Hubs (large banks, batch notices,
        busy professionals), text mentions and possible identity matches never join networks. Score
        = distinct sources + organisations with adverse records + 3 × seed cases — a reading-order
        aid, not a risk rating.
      </Notice>
      <Checkbox
        label="Only networks touching a seed case"
        checked={seedOnly}
        onChange={(e) => {
          setSeedOnly(e.target.checked);
        }}
      />
      <DataTable
        caption={`Networks (${ix.bundle.networks.length} total; top ${SHOWN} by score shown)`}
        rows={rows}
        rowKey={(n) => n.id}
        dense
        initialSort={{ key: 'score', dir: 'desc' }}
        empty="No networks with two or more organisations."
        columns={[
          {
            key: 'score',
            header: 'Score',
            align: 'right',
            render: (n) => <span className="tabular">{n.score}</span>,
            sortValue: (n) => n.score,
          },
          {
            key: 'orgs',
            header: 'Organisations',
            align: 'right',
            render: (n) => <span className="tabular">{n.organisation_count}</span>,
            sortValue: (n) => n.organisation_count,
          },
          {
            key: 'names',
            header: 'Members',
            render: (n) => <span className="block max-w-md truncate">{names(ix, n)}</span>,
          },
          {
            key: 'sources',
            header: 'Sources / seeds',
            render: (n) => (
              <span className="flex flex-wrap gap-1">
                {n.sources.map((s) => (
                  <Badge key={s} tone="info">
                    {s.toUpperCase()}
                  </Badge>
                ))}
                {n.seed_cases.map((c) => (
                  <Badge key={c} tone="violet">
                    {c}
                  </Badge>
                ))}
              </span>
            ),
          },
          {
            key: 'open',
            header: 'Explore',
            render: (n) => {
              const start = anchor(ix, n);
              return start === undefined ? null : (
                <Button
                  size="sm"
                  variant="subtle"
                  icon={Telescope}
                  onClick={() => {
                    onExplore(start);
                  }}
                >
                  Explore
                </Button>
              );
            },
          },
        ]}
      />
    </div>
  );
}
