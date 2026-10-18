import type { GraphEdge } from '../../lib/graph.js';
import { LinkStatusBadge } from '../ui/StatusBadges.js';
import { DataTable } from '../ui/Table.js';

export function EdgeTable({
  edges,
  name,
  date,
  caption,
}: {
  edges: GraphEdge[];
  name: (id: string) => string;
  date: (iso: string) => string;
  caption: string;
}): React.JSX.Element {
  return (
    <DataTable
      caption={caption}
      rows={edges}
      rowKey={(e) => e.id}
      dense
      columns={[
        {
          key: 'from',
          header: 'Entity',
          sortValue: (e) => name(e.from),
          render: (e) => <span className="font-medium">{name(e.from)}</span>,
        },
        { key: 'rel', header: 'Relationship', sortValue: (e) => e.label, render: (e) => e.label },
        {
          key: 'to',
          header: 'Related entity',
          sortValue: (e) => name(e.to),
          render: (e) => <span className="font-medium">{name(e.to)}</span>,
        },
        {
          key: 'status',
          header: 'Verification',
          sortValue: (e) => e.status,
          render: (e) => <LinkStatusBadge status={e.status} />,
        },
        {
          key: 'source',
          header: 'Source / evidence',
          render: (e) => (
            <span className="text-xs">
              <span className="block">{e.source}</span>
              <span className="text-muted block">{e.evidence}</span>
            </span>
          ),
        },
        {
          key: 'date',
          header: 'Observed',
          sortValue: (e) => e.observedAt,
          render: (e) => <span className="tabular whitespace-nowrap">{date(e.observedAt)}</span>,
        },
      ]}
    />
  );
}
