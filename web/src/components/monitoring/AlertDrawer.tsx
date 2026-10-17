import { BriefcaseBusiness, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ALERT_STATUS_LABEL, TXN_TYPE_LABEL } from '../../domain/labels.js';
import { AlertStatusSchema, type AlertStatus, type Db } from '../../domain/schemas.js';
import { SOURCE_LABEL, type UnifiedAlert } from '../../lib/alerts.js';
import { formatMoney } from '../../lib/format.js';
import { RULES } from '../../lib/monitoring.js';
import { createCase, updateAlert } from '../../state/actions.js';
import { useActor, useFormat } from '../../state/hooks.js';
import { useDb } from '../../state/store.js';
import { useToast } from '../../state/toast.js';
import { EvidenceList } from '../applications/Findings.js';
import { SourceViewerDialog } from '../documents/SourceViewerDialog.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField, TextArea } from '../ui/Field.js';
import { Notice } from '../ui/States.js';
import { AlertStatusBadge, PriorityBadge } from '../ui/StatusBadges.js';
import type { EvidenceRef } from '../../lib/checks.js';

export function entityLabel(db: Db, id: string): string {
  const e = db.entities.find((x) => x.id === id);
  if (e === undefined) return id;
  if (e.ownerId === null) return e.name;
  const owner = db.entities.find((x) => x.id === e.ownerId);
  return `${owner?.name ?? ''} · ${e.name}`;
}

const NEEDS_REASON: ReadonlySet<AlertStatus> = new Set(['resolved', 'false_positive']);

export function AlertDrawer({
  alert,
  onClose,
}: {
  alert: UnifiedAlert | null;
  onClose: () => void;
}): React.JSX.Element {
  const db = useDb();
  const actor = useActor();
  const f = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [note, setNote] = useState('');
  const [source, setSource] = useState<EvidenceRef | null>(null);
  const current = alert?.status ?? 'new';
  const chosen = status ?? current;
  const reasonMissing = chosen !== current && NEEDS_REASON.has(chosen) && note.trim() === '';
  const linkedCase =
    alert === null ? undefined : db.cases.find((c) => c.alertIds.includes(alert.id));
  const users = [
    ...new Set([actor, 'Neha Joshi', 'Farhan Shaikh', 'Anjali Patil', 'Rahul Kulkarni']),
  ];

  const close = (): void => {
    setStatus(null);
    setNote('');
    onClose();
  };
  const save = (): void => {
    if (alert === null) return;
    const statusChanged = chosen !== current;
    updateAlert(alert.id, actor, {
      ...(statusChanged ? { status: chosen, resolutionReason: note.trim() } : {}),
      ...(note.trim() !== '' ? { note: note.trim() } : {}),
    });
    toast.push({
      tone: 'success',
      title: statusChanged
        ? `Alert marked ${ALERT_STATUS_LABEL[chosen].toLowerCase()}`
        : 'Note added',
    });
    setStatus(null);
    setNote('');
  };
  const openCase = (): void => {
    if (alert === null) return;
    const loan = db.loans.find((l) => l.id === alert.loanId);
    const id = createCase(actor, {
      title: alert.title,
      summary: alert.reason,
      priority: alert.priority,
      branchId: alert.branchId,
      source: alert.source === 'pre_disbursement' ? 'pre_disbursement' : 'monitoring',
      borrowerIds: alert.borrowerId === null ? [] : [alert.borrowerId],
      entityIds:
        alert.monitoring?.entityIds.map((e) => db.entities.find((x) => x.id === e)?.ownerId ?? e) ??
        [],
      loanIds: loan === undefined ? [] : [loan.id],
      applicationIds: alert.applicationId === null ? [] : [alert.applicationId],
      alertIds: [alert.id],
    });
    toast.push({
      tone: 'success',
      title: `${id} opened`,
      detail: 'Alert escalated and linked to the new case.',
    });
    close();
    void navigate(`/investigations/${id}`);
  };

  const m = alert?.monitoring ?? null;
  const fnd = alert?.finding ?? null;
  const txns =
    m === null
      ? []
      : m.transactionIds
          .flatMap((id) => db.transactions.filter((t) => t.id === id))
          .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <Dialog
      open={alert !== null}
      onClose={close}
      variant="drawer"
      title={alert?.title ?? ''}
      description={
        alert === null ? undefined : (
          <span className="flex flex-wrap items-center gap-2 pt-1">
            <PriorityBadge priority={alert.priority} />
            <AlertStatusBadge status={current} />
            <span>
              {SOURCE_LABEL[alert.source]} · {alert.linkedLabel}
            </span>
          </span>
        )
      }
      footer={
        <>
          <Button onClick={close}>Close</Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={reasonMissing || (chosen === current && note.trim() === '')}
          >
            Save
          </Button>
        </>
      }
    >
      {alert !== null && (
        <div className="space-y-5 text-sm">
          <Notice>
            An alert is an investigative lead, not a fraud determination. Timing or amount alone
            does not establish wrongdoing.
          </Notice>
          {m !== null && (
            <>
              <section className="bg-surface-2 rounded-xl p-3">
                <h3 className="font-semibold">Triggered rule: {RULES[m.ruleId].name}</h3>
                <p className="text-muted mt-1">{RULES[m.ruleId].description}</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted inline">Threshold: </dt>
                    <dd className="inline font-medium">{m.threshold}</dd>
                  </div>
                  <div>
                    <dt className="text-muted inline">Time window: </dt>
                    <dd className="inline font-medium">{m.window}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted inline">Fields used: </dt>
                    <dd className="inline font-mono text-xs">
                      {RULES[m.ruleId].fieldsUsed.join(', ')}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted inline">Rule configuration: </dt>
                    <dd className="inline">
                      version {db.settings.monitoring.version}, effective{' '}
                      {f.date(db.settings.monitoring.effectiveAt)}
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Explanation</h3>
                <p>{m.explanation}</p>
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Transactions in the observed sequence</h3>
                <ol className="border-line space-y-3 border-l pl-4">
                  {txns.map((t) => (
                    <li key={t.id} className="relative">
                      <span
                        aria-hidden
                        className="bg-primary absolute top-1.5 -left-[21px] size-2.5 rounded-full"
                      />
                      <p className="tabular font-medium">
                        {formatMoney(t.amountMinor)} · {TXN_TYPE_LABEL[t.type]}
                      </p>
                      <p className="text-muted text-xs">
                        {entityLabel(db, t.fromId)} → {entityLabel(db, t.toId)}
                      </p>
                      <p className="text-muted text-xs">
                        {f.dateTime(t.at)} · {t.id} · {t.reference} · source:{' '}
                        {t.source === 'demo' ? 'core banking extract' : 'imported file'}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Total in observed sequence</h3>
                <p className="tabular text-lg font-semibold">{formatMoney(m.totalMinor)}</p>
                <p className="text-muted text-xs">Calculation basis: {m.totalBasis}</p>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Related entities</h3>
                <ul className="list-disc pl-4">
                  {[
                    ...new Set(
                      m.entityIds.map((e) => db.entities.find((x) => x.id === e)?.ownerId ?? e),
                    ),
                  ].map((e) => (
                    <li key={e}>{entityLabel(db, e)}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Possible benign explanations</h3>
                <ul className="list-disc pl-4">
                  {m.benign.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Suggested steps</h3>
                <ol className="list-decimal pl-4">
                  {m.steps.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ol>
              </section>
            </>
          )}
          {fnd !== null && (
            <>
              <section>
                <h3 className="mb-1 font-semibold">What was observed</h3>
                <p>{fnd.observed}</p>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Why it matters</h3>
                <p>{fnd.whyItMatters}</p>
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Source evidence</h3>
                <EvidenceList evidence={fnd.evidence} onOpen={setSource} />
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Possible benign explanations</h3>
                <ul className="list-disc pl-4">
                  {fnd.benign.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Suggested checks</h3>
                <ol className="list-decimal pl-4">
                  {fnd.steps.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ol>
              </section>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              to={alert.linkedHref}
              className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden /> Open linked record
            </Link>
            {linkedCase !== undefined ? (
              <Link
                to={`/investigations/${linkedCase.id}`}
                className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
              >
                <BriefcaseBusiness className="size-4" aria-hidden /> {linkedCase.id}
              </Link>
            ) : (
              <Button size="sm" icon={BriefcaseBusiness} onClick={openCase}>
                Open investigation case
              </Button>
            )}
          </div>
          <section>
            <h3 className="mb-2 font-semibold">Analyst notes</h3>
            {(alert.state?.notes.length ?? 0) === 0 ? (
              <p className="text-muted">No notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {alert.state?.notes.map((n) => (
                  <li key={n.id} className="bg-surface-2 rounded-lg p-2.5">
                    <p>{n.text}</p>
                    <p className="text-muted mt-1 text-xs">
                      {n.author} · {f.dateTime(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border-line space-y-3 border-t pt-4">
            <h3 className="font-semibold">Review</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Status"
                value={chosen}
                onChange={(e) => {
                  setStatus(AlertStatusSchema.parse(e.target.value));
                }}
              >
                {AlertStatusSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {ALERT_STATUS_LABEL[s]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Assigned to"
                value={alert.assignee ?? ''}
                onChange={(e) => {
                  updateAlert(alert.id, actor, {
                    assignee: e.target.value === '' ? null : e.target.value,
                  });
                  toast.push({ tone: 'success', title: 'Assignment updated' });
                }}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextArea
              label={
                chosen !== current && NEEDS_REASON.has(chosen)
                  ? 'Resolution reason (required)'
                  : 'Add note'
              }
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              error={reasonMissing ? 'Record why the alert is resolved or a false positive.' : null}
            />
            {(alert.state?.resolutionReason ?? '') !== '' && (
              <p className="text-xs">
                <span className="text-muted">Resolution reason:</span>{' '}
                {alert.state?.resolutionReason}
              </p>
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Audit trail</h3>
            {(alert.state?.audit.length ?? 0) === 0 ? (
              <p className="text-muted">No changes yet — status is New.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {alert.state?.audit.map((a) => (
                  <li key={a.id}>
                    <span className="tabular">{f.dateTime(a.at)}</span> · {a.actor} ·{' '}
                    <strong>{a.action}</strong> — {a.detail}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <SourceViewerDialog
        docId={source?.docId ?? null}
        fieldId={source?.fieldId ?? null}
        onClose={() => {
          setSource(null);
        }}
      />
    </Dialog>
  );
}
