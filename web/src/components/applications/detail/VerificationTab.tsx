import { FileText } from 'lucide-react';
import { useState } from 'react';
import { SourceViewerDialog } from '../../documents/SourceViewerDialog.js';
import { Badge } from '../../ui/Badge.js';
import { Card, CardHeader } from '../../ui/Card.js';
import { EmptyState } from '../../ui/States.js';
import { DataTable } from '../../ui/Table.js';
import type { Application, Db } from '../../../domain/schemas.js';
import { crossChecks } from '../../../lib/checks.js';
import type { CrossVerdict, EvidenceRef } from '../../../lib/checks.js';

const VERDICT: Record<CrossVerdict, { label: string; tone: 'ok' | 'info' | 'danger' | 'neutral' }> =
  {
    match: { label: 'Consistent', tone: 'ok' },
    variation: { label: 'Variation', tone: 'info' },
    conflict: { label: 'Inconsistent', tone: 'danger' },
    not_available: { label: 'Not checked', tone: 'neutral' },
  };

export function VerificationTab({ app, db }: { app: Application; db: Db }): React.JSX.Element {
  const rows = crossChecks(app, db);
  const [src, setSrc] = useState<EvidenceRef | null>(null);
  return (
    <Card>
      <CardHeader
        title="Cross-verification"
        subtitle="Application values compared with document fields. Fuzzy name similarity is not proof of identity."
      />
      <DataTable
        caption="Cross-verification"
        rows={rows}
        rowKey={(r) => `${r.label}-${r.fieldId ?? ''}`}
        empty={
          <EmptyState icon={FileText} title="Nothing to compare yet">
            Review document fields such as name, date of birth or survey number to enable
            comparisons.
          </EmptyState>
        }
        columns={[
          {
            key: 'label',
            header: 'Item',
            render: (r) => <span className="font-medium">{r.label}</span>,
          },
          {
            key: 'form',
            header: 'Application',
            render: (r) => <span lang="mr">{r.formValue}</span>,
          },
          { key: 'doc', header: 'Document', render: (r) => <span lang="mr">{r.docValue}</span> },
          {
            key: 'verdict',
            header: 'Result',
            render: (r) => <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Badge>,
          },
          {
            key: 'note',
            header: 'Note',
            render: (r) => <span className="text-muted text-xs">{r.note}</span>,
          },
          {
            key: 'src',
            header: 'Source',
            render: (r) =>
              r.docId === null ? (
                '—'
              ) : (
                <button
                  type="button"
                  className="text-primary text-sm font-semibold hover:underline"
                  onClick={() => {
                    setSrc({
                      label: r.label,
                      value: r.docValue,
                      docId: r.docId,
                      fieldId: r.fieldId,
                      appId: app.id,
                    });
                  }}
                >
                  View source
                </button>
              ),
          },
        ]}
      />
      <SourceViewerDialog
        docId={src?.docId ?? null}
        fieldId={src?.fieldId ?? null}
        onClose={() => {
          setSrc(null);
        }}
      />
    </Card>
  );
}
