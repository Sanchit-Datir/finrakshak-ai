import { Save } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { Card, CardHeader } from '../ui/Card.js';
import { TextField } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { DataTable } from '../ui/Table.js';
import { SettingsSchema } from '../../domain/schemas.js';
import type { MonitoringConfig } from '../../domain/schemas.js';
import { minorToRupeeInput, parseRupeesToMinor } from '../../lib/format.js';
import { useActor, useFormat } from '../../state/hooks.js';
import { canConfigureRules, useSession } from '../../state/session.js';
import { mutate, useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';

type Draft = Record<keyof Omit<MonitoringConfig, 'version' | 'effectiveAt' | 'updatedBy'>, string>;

const FIELDS: { key: keyof Draft; label: string; money?: boolean; hint: string }[] = [
  {
    key: 'rapidOnwardHours',
    label: 'Rapid onward transfer: window (hours)',
    hint: 'Hours after disbursement',
  },
  {
    key: 'rapidOnwardPercent',
    label: 'Rapid onward transfer: share of disbursement (%)',
    hint: '1–100',
  },
  {
    key: 'repeatedCounterpartyMinLoans',
    label: 'Repeated counterparty: minimum loans',
    hint: '2 or more',
  },
  {
    key: 'repeatedCounterpartyWindowDays',
    label: 'Repeated counterparty: window (days)',
    hint: '',
  },
  {
    key: 'repeatedCounterpartyMinAmountMinor',
    label: 'Repeated counterparty: minimum payment (₹)',
    money: true,
    hint: 'Smaller payments are ignored',
  },
  { key: 'circularWindowDays', label: 'Circular movement: window (days)', hint: '' },
  {
    key: 'circularMinReturnPercent',
    label: 'Circular movement: minimum return (%)',
    hint: 'Of first transfer',
  },
  {
    key: 'cashReferenceMinor',
    label: 'Cash withdrawals: reference amount (₹)',
    money: true,
    hint: '',
  },
  { key: 'cashNearPercent', label: 'Cash withdrawals: “near” threshold (%)', hint: '50–99' },
  { key: 'cashMinCount', label: 'Cash withdrawals: minimum count', hint: '' },
  { key: 'cashWindowDays', label: 'Cash withdrawals: window (days)', hint: '' },
  {
    key: 'incomeMismatchRatio',
    label: 'Declared income ÷ statement credits (×)',
    hint: 'Pre-disbursement check',
  },
  {
    key: 'landAreaTolerancePercent',
    label: 'Land-area tolerance (%)',
    hint: 'Pre-disbursement check',
  },
];

function toDraft(m: MonitoringConfig): Draft {
  return Object.fromEntries(
    FIELDS.map((f) => [f.key, f.money === true ? minorToRupeeInput(m[f.key]) : String(m[f.key])]),
  ) as Draft;
}

export function RiskTab(): React.JSX.Element {
  const db = useDb();
  const fmt = useFormat();
  const actor = useActor();
  const toast = useToast();
  const session = useSession();
  const allowed = canConfigureRules(session?.role);
  const m = db.settings.monitoring;
  const [draft, setDraft] = useState<Draft>(() => toDraft(m));
  const [error, setError] = useState<string | null>(null);
  const save = (): void => {
    const values = Object.fromEntries(
      FIELDS.map((f) => [
        f.key,
        f.money === true ? parseRupeesToMinor(draft[f.key]) : Number(draft[f.key]),
      ]),
    );
    const parsed = SettingsSchema.shape.monitoring.safeParse({
      ...values,
      version: m.version + 1,
      effectiveAt: new Date().toISOString(),
      updatedBy: actor,
    });
    if (!parsed.success) {
      setError(
        `Check the values: ${parsed.error.issues.map((i) => FIELDS.find((x) => x.key === i.path[0])?.label ?? String(i.path[0])).join('; ')}`,
      );
      return;
    }
    setError(null);
    mutate((d) => {
      d.settings.monitoring = parsed.data;
    });
    toast.push({
      tone: 'success',
      title: `Rules saved as version ${parsed.data.version}`,
      detail: 'Alerts and findings were re-evaluated with the new thresholds.',
    });
  };
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone="info">Rule version {m.version}</Badge>
          <span>Effective {fmt.dateTime(m.effectiveAt)}</span>
          <span className="text-muted">Last updated by {m.updatedBy}</span>
        </div>
        {!allowed && (
          <Notice tone="warn" className="mt-3" title="Read only">
            Only Risk Analyst and Administrator roles can change global rules. Sign in with one of
            those demo roles to edit. (Restriction is UI-only in this prototype; a real deployment
            must enforce it on the server.)
          </Notice>
        )}
      </Card>
      <Card className="p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              hint={f.hint || undefined}
              inputMode="decimal"
              value={draft[f.key]}
              disabled={!allowed}
              onChange={(e) => {
                setDraft({ ...draft, [f.key]: e.target.value });
              }}
            />
          ))}
        </div>
        {error !== null && (
          <Notice tone="danger" className="mt-3">
            {error}
          </Notice>
        )}
        {allowed && (
          <div className="mt-4 flex gap-2">
            <Button variant="primary" icon={Save} onClick={save}>
              Save as new version
            </Button>
            <Button
              onClick={() => {
                setDraft(toDraft(m));
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Alert routing" subtitle="Default assignment (fixed in this prototype)" />
        <DataTable
          caption="Alert routing"
          rows={[
            { s: 'Transaction monitoring', to: 'Risk Analyst on duty' },
            { s: 'Pre-disbursement checks', to: 'Branch Manager of the application branch' },
            { s: 'Escalated alerts', to: 'Investigator (case owner)' },
          ]}
          rowKey={(r) => r.s}
          dense
          columns={[
            { key: 's', header: 'Source', render: (r) => r.s },
            { key: 't', header: 'Routed to', render: (r) => r.to },
          ]}
        />
      </Card>
    </div>
  );
}
