import { RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Card, CardHeader } from '../components/ui/Card.js';
import { ConfirmDialog } from '../components/ui/Dialog.js';
import { Checkbox, SelectField, TextField } from '../components/ui/Field.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Notice } from '../components/ui/States.js';
import { DataTable } from '../components/ui/Table.js';
import { Tabs } from '../components/ui/Tabs.js';
import { PRODUCT_LABEL, ROLE_LABEL } from '../domain/labels.js';
import {
  LoanProductSchema,
  SettingsSchema,
  type LoanProduct,
  type MonitoringConfig,
  type Settings,
} from '../domain/schemas.js';
import { DOC_GROUPS, docTypeLabel } from '../lib/doc-catalog.js';
import { minorToRupeeInput, parseRupeesToMinor } from '../lib/format.js';
import { useActor, useFormat } from '../state/hooks.js';
import { canConfigureRules, updateDemoSession, useSession } from '../state/session.js';
import { clearWorkspace, mutate, resetToDemo, useDb } from '../state/store.js';
import { useToast } from '../state/toast.js';
import { useUrlState } from '../state/url.js';

type Tab = 'profile' | 'preferences' | 'risk' | 'checklists' | 'data';

export function SettingsPage(): React.JSX.Element {
  const [tab, setTab] = useUrlState('tab', 'profile');
  const tabs = [
    { key: 'profile' as const, label: 'Profile' },
    { key: 'preferences' as const, label: 'Preferences' },
    { key: 'risk' as const, label: 'Risk & monitoring rules' },
    { key: 'checklists' as const, label: 'Document checklists' },
    { key: 'data' as const, label: 'Workspace data' },
  ];
  const current = (tabs.some((t) => t.key === tab) ? tab : 'profile') as Tab;
  return (
    <>
      <PageHeader
        docTitle="Settings"
        title="Settings"
        subtitle="Your profile, preferences, and (for authorised roles) risk configuration."
      />
      <Tabs
        label="Settings sections"
        tabs={tabs}
        value={current}
        onChange={(k) => {
          setTab(k);
        }}
      >
        {current === 'profile' && <ProfileTab />}
        {current === 'preferences' && <PreferencesTab />}
        {current === 'risk' && <RiskTab />}
        {current === 'checklists' && <ChecklistTab />}
        {current === 'data' && <DataTab />}
      </Tabs>
    </>
  );
}

function ProfileTab(): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  // A signed-in cloud account is managed by the administrator; only a demo profile is editable here.
  const managed = useSession()?.demo === false;
  const [p, setP] = useState(db.settings.profile);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(db.settings.profile);
  const save = (): void => {
    if (p.name.trim() === '') {
      setErr('Name is required.');
      return;
    }
    if (p.email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) {
      setErr('Enter a valid work email.');
      return;
    }
    setErr(null);
    mutate((d) => {
      d.settings.profile = { ...p, name: p.name.trim() };
    });
    updateDemoSession({ name: p.name.trim(), employeeId: p.employeeId, branchId: p.branchId });
    toast.push({ tone: 'success', title: 'Profile saved' });
  };
  return (
    <Card className="max-w-3xl p-5">
      {managed && (
        <Notice className="mb-3">
          Your name, employee ID, role and branch are managed by your administrator.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Name"
          required
          readOnly={managed}
          value={p.name}
          error={err !== null && p.name.trim() === '' ? err : null}
          onChange={(e) => {
            setP({ ...p, name: e.target.value });
          }}
        />
        <TextField
          label="Employee ID"
          readOnly={managed}
          value={p.employeeId}
          onChange={(e) => {
            setP({ ...p, employeeId: e.target.value });
          }}
        />
        <TextField
          label="Work email"
          type="email"
          readOnly={managed}
          value={p.email}
          error={err !== null && p.name.trim() !== '' ? err : null}
          onChange={(e) => {
            setP({ ...p, email: e.target.value });
          }}
        />
        <TextField
          label="Role"
          value={ROLE_LABEL[p.role]}
          readOnly
          hint={
            managed
              ? 'Set by your administrator.'
              : "Set by quick sign-in. Real roles would come from your bank's identity system."
          }
        />
        <SelectField
          label="Branch"
          disabled={managed}
          value={p.branchId}
          onChange={(e) => {
            setP({ ...p, branchId: e.target.value });
          }}
        >
          {db.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" icon={Save} disabled={!dirty} onClick={save}>
          Save
        </Button>
        <Button
          disabled={!dirty}
          onClick={() => {
            setP(db.settings.profile);
            setErr(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function PreferencesTab(): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  const prefs = db.settings.preferences;
  const set = (patch: Partial<Settings['preferences']>): void => {
    mutate((d) => {
      d.settings.preferences = SettingsSchema.shape.preferences.parse({
        ...d.settings.preferences,
        ...patch,
      });
    });
    toast.push({ tone: 'success', title: 'Preference saved' });
  };
  return (
    <Card className="max-w-3xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Theme"
          value={prefs.theme}
          onChange={(e) => {
            set({ theme: SettingsSchema.shape.preferences.shape.theme.parse(e.target.value) });
          }}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </SelectField>
        <SelectField
          label="Date format"
          value={prefs.dateFormat}
          onChange={(e) => {
            set({
              dateFormat: SettingsSchema.shape.preferences.shape.dateFormat.parse(e.target.value),
            });
          }}
        >
          <option value="dd-mmm-yyyy">15 Oct 2026</option>
          <option value="dd/mm/yyyy">15/10/2026</option>
          <option value="yyyy-mm-dd">2026-10-15</option>
        </SelectField>
        <SelectField
          label="Time zone"
          value={prefs.timezone}
          onChange={(e) => {
            set({ timezone: e.target.value });
          }}
        >
          <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
          <option value="UTC">UTC</option>
        </SelectField>
        <SelectField
          label="Table density"
          value={prefs.density}
          onChange={(e) => {
            set({ density: e.target.value === 'compact' ? 'compact' : 'comfortable' });
          }}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </SelectField>
      </div>
      <fieldset className="mt-5 space-y-2">
        <legend className="mb-1 text-sm font-semibold">Notifications</legend>
        <Checkbox
          label="New alerts in my branch"
          checked={prefs.notifyNewAlerts}
          onChange={(e) => {
            set({ notifyNewAlerts: e.target.checked });
          }}
        />
        <Checkbox
          label="Updates to cases I own"
          checked={prefs.notifyCaseUpdates}
          onChange={(e) => {
            set({ notifyCaseUpdates: e.target.checked });
          }}
        />
        <Checkbox
          label="Weekly digest email"
          checked={prefs.notifyWeeklyDigest}
          onChange={(e) => {
            set({ notifyWeeklyDigest: e.target.checked });
          }}
        />
        <p className="text-muted text-xs">
          Preferences are saved; email/SMS delivery is not connected. In-app alerts appear in the
          notification bell.
        </p>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="mb-1 text-sm font-semibold">Advanced</legend>
        <Checkbox
          label="Developer mode"
          hint="Shows the “Raw details” tab in document extraction views."
          checked={prefs.developerMode}
          onChange={(e) => {
            set({ developerMode: e.target.checked });
          }}
        />
      </fieldset>
    </Card>
  );
}

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

function RiskTab(): React.JSX.Element {
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

function ChecklistTab(): React.JSX.Element {
  const db = useDb();
  const toast = useToast();
  const session = useSession();
  const allowed = canConfigureRules(session?.role);
  const [product, setProduct] = useState<LoanProduct>('kcc_crop');
  const list = db.settings.checklists[product];
  const toggle = (key: string, on: boolean): void => {
    mutate((d) => {
      d.settings.checklists[product] = on
        ? [...d.settings.checklists[product], key]
        : d.settings.checklists[product].filter((k) => k !== key);
    });
    toast.push({
      tone: 'success',
      title: 'Checklist updated',
      detail: `${PRODUCT_LABEL[product]}: ${docTypeLabel(key)} ${on ? 'required' : 'no longer required'}`,
    });
  };
  return (
    <Card className="p-5">
      {!allowed && (
        <Notice tone="warn" className="mb-4" title="Read only">
          Only Risk Analyst and Administrator roles can change checklists.
        </Notice>
      )}
      <SelectField
        label="Loan product"
        value={product}
        className="max-w-sm"
        onChange={(e) => {
          setProduct(LoanProductSchema.parse(e.target.value));
        }}
      >
        {LoanProductSchema.options.map((p) => (
          <option key={p} value={p}>
            {PRODUCT_LABEL[p]}
          </option>
        ))}
      </SelectField>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_GROUPS.map((g) => (
          <fieldset key={g.group}>
            <legend className="mb-2 text-sm font-semibold">{g.group}</legend>
            <div className="space-y-1.5">
              {g.types.map((t) => (
                <Checkbox
                  key={t.key}
                  label={docTypeLabel(t.key)}
                  checked={list.includes(t.key)}
                  disabled={!allowed}
                  onChange={(e) => {
                    toggle(t.key, e.target.checked);
                  }}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-muted mt-4 text-xs">
        Board resolution and company registration apply only to companies; partnership deed only to
        partnerships.
      </p>
    </Card>
  );
}

function DataTab(): React.JSX.Element {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'reset' | 'clear' | null>(null);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-2 font-semibold">Workspace data</h3>
        <p className="text-muted mb-3 text-sm">
          Resetting restores the original sample records; clearing removes every record.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={RotateCcw}
            onClick={() => {
              setConfirm('reset');
            }}
          >
            Reset sample records
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            onClick={() => {
              setConfirm('clear');
            }}
          >
            Clear workspace
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        danger={confirm === 'clear'}
        title={confirm === 'reset' ? 'Reset sample records?' : 'Clear all records?'}
        confirmLabel={confirm === 'reset' ? 'Reset' : 'Clear workspace'}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm === 'reset') resetToDemo();
          else clearWorkspace();
          toast.push({
            tone: 'success',
            title: confirm === 'reset' ? 'Sample records restored' : 'Workspace cleared',
          });
          setConfirm(null);
        }}
      >
        <p>
          {confirm === 'reset'
            ? 'All changes you made (applications, reviews, notes, alert and case updates) will be replaced by the original sample records.'
            : 'All applications, documents, loans, alerts and cases will be removed from this browser. Your profile and preferences are kept.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
