import { Card, CardHeader } from '../../ui/Card.js';
import { DataTable } from '../../ui/Table.js';
import type { Application, Db } from '../../../domain/schemas.js';
import { applicationDocs } from '../../../lib/checks.js';
import { useFormat } from '../../../state/hooks.js';

export function AuditTab({ app, db }: { app: Application; db: Db }): React.JSX.Element {
  const f = useFormat();
  const rows = [
    ...app.audit.map((a) => ({ ...a, scope: 'Application' })),
    ...applicationDocs(app, db).flatMap((d) =>
      d.audit.map((a) => ({ ...a, scope: `${d.id} · ${d.filename}` })),
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Card>
      <CardHeader
        title="Audit history"
        subtitle="User corrections are recorded separately from machine-extracted values."
      />
      <DataTable
        caption="Audit history"
        rows={rows}
        rowKey={(r) => `${r.scope}-${r.id}`}
        dense
        initialSort={{ key: 'at', dir: 'desc' }}
        columns={[
          {
            key: 'at',
            header: 'When',
            sortValue: (r) => r.at,
            render: (r) => <span className="tabular whitespace-nowrap">{f.dateTime(r.at)}</span>,
          },
          { key: 'actor', header: 'Who', sortValue: (r) => r.actor, render: (r) => r.actor },
          {
            key: 'scope',
            header: 'Record',
            sortValue: (r) => r.scope,
            render: (r) => <span className="text-muted text-xs">{r.scope}</span>,
          },
          {
            key: 'action',
            header: 'Action',
            sortValue: (r) => r.action,
            render: (r) => <span className="font-medium">{r.action}</span>,
          },
          {
            key: 'detail',
            header: 'Detail',
            render: (r) => (
              <span className="text-xs" lang="mr">
                {r.detail}
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}
