import { ExternalLink, FileSearch, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FINDING_STATUS_LABEL } from '../../domain/labels.js';
import { FindingStatusSchema, type Application, type FindingStatus } from '../../domain/schemas.js';
import { CATEGORY_LABEL, type EvidenceRef, type Finding } from '../../lib/checks.js';
import { commentOnFinding, setFindingStatus } from '../../state/actions.js';
import { useFormat } from '../../state/hooks.js';
import { useToast } from '../../state/toast.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { SelectField, TextArea } from '../ui/Field.js';
import { EmptyState, Notice } from '../ui/States.js';
import { FindingStatusBadge, PriorityBadge } from '../ui/StatusBadges.js';
import { DataTable } from '../ui/Table.js';
import { SourceViewerDialog } from '../documents/SourceViewerDialog.js';

export function EvidenceList({
  evidence,
  onOpen,
}: {
  evidence: EvidenceRef[];
  onOpen: (e: EvidenceRef) => void;
}): React.JSX.Element {
  return (
    <ul className="space-y-2">
      {evidence.map((e, i) => (
        <li key={`${e.label}-${i}`} className="border-line rounded-lg border p-2.5 text-sm">
          <p className="text-muted text-xs">{e.label}</p>
          <p className="mt-0.5 font-medium break-words" lang="mr">
            {e.value || '—'}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            {e.docId !== null && (
              <button
                type="button"
                className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                onClick={() => {
                  onOpen(e);
                }}
              >
                <FileSearch className="size-3.5" aria-hidden /> Open source
              </button>
            )}
            {e.appId !== null && (
              <Link
                className="text-primary font-semibold hover:underline"
                to={`/applications/${e.appId}`}
              >
                Open application {e.appId}
              </Link>
            )}
            {e.url !== undefined && (
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden /> Open public record
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function statusOf(app: Application, f: Finding): FindingStatus {
  return app.findingStates[f.id]?.status ?? 'needs_review';
}

export function FindingsTable({
  app,
  findings,
  actor,
}: {
  app: Application;
  findings: Finding[];
  actor: string;
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null);
  const finding = findings.find((f) => f.id === open) ?? null;
  return (
    <>
      <DataTable
        caption="Risk findings"
        rows={findings}
        rowKey={(f) => f.id}
        empty={
          <EmptyState icon={ListChecks} title="No findings from the configured checks">
            This means no configured check raised an item in the available data. It is not a
            guarantee that the application is free of issues.
          </EmptyState>
        }
        columns={[
          {
            key: 'finding',
            header: 'Finding',
            render: (f) => (
              <button
                type="button"
                className="text-primary text-left font-semibold hover:underline"
                onClick={() => {
                  setOpen(f.id);
                }}
              >
                {f.title}
              </button>
            ),
            sortValue: (f) => f.title,
            className: 'min-w-[220px]',
          },
          {
            key: 'category',
            header: 'Category',
            render: (f) => <span className="text-muted">{CATEGORY_LABEL[f.category]}</span>,
            sortValue: (f) => f.category,
          },
          {
            key: 'priority',
            header: 'Review priority',
            render: (f) => <PriorityBadge priority={f.priority} />,
            sortValue: (f) => ({ urgent: 0, needs_attention: 1, routine: 2 })[f.priority],
          },
          {
            key: 'evidence',
            header: 'Evidence',
            render: (f) => <span className="tabular text-muted">{f.evidence.length} item(s)</span>,
          },
          {
            key: 'certainty',
            header: 'Certainty',
            render: (f) => (
              <span className="text-muted line-clamp-2 max-w-[240px] text-xs">{f.certainty}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (f) => <FindingStatusBadge status={statusOf(app, f)} />,
            sortValue: (f) => statusOf(app, f),
          },
          {
            key: 'next',
            header: 'Recommended next step',
            render: (f) => (
              <span className="line-clamp-2 max-w-[260px] text-xs">{f.steps[0] ?? '—'}</span>
            ),
          },
        ]}
      />
      <FindingDrawer
        app={app}
        finding={finding}
        actor={actor}
        onClose={() => {
          setOpen(null);
        }}
      />
    </>
  );
}

function FindingDrawer({
  app,
  finding,
  actor,
  onClose,
}: {
  app: Application;
  finding: Finding | null;
  actor: string;
  onClose: () => void;
}): React.JSX.Element {
  const f = useFormat();
  const toast = useToast();
  const [source, setSource] = useState<EvidenceRef | null>(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<FindingStatus | null>(null);
  const state = finding === null ? undefined : app.findingStates[finding.id];
  const current = state?.status ?? 'needs_review';
  const chosen = status ?? current;
  const close = (): void => {
    setStatus(null);
    setComment('');
    onClose();
  };
  const save = (): void => {
    if (finding === null) return;
    if (chosen !== current) {
      setFindingStatus(app.id, finding.id, actor, chosen, comment.trim());
      toast.push({
        tone: 'success',
        title: `Finding marked ${FINDING_STATUS_LABEL[chosen].toLowerCase()}`,
      });
    } else if (comment.trim() !== '') {
      commentOnFinding(app.id, finding.id, actor, comment.trim());
      toast.push({ tone: 'success', title: 'Comment added' });
    }
    setComment('');
    setStatus(null);
  };
  const needsReason =
    (chosen === 'resolved' || chosen === 'not_an_issue') &&
    chosen !== current &&
    comment.trim() === '';
  return (
    <Dialog
      open={finding !== null}
      onClose={close}
      variant="drawer"
      title={finding?.title ?? ''}
      description={
        finding === null ? undefined : (
          <span className="flex flex-wrap gap-2 pt-1">
            <PriorityBadge priority={finding.priority} />
            <FindingStatusBadge status={current} />
            <span>{CATEGORY_LABEL[finding.category]}</span>
          </span>
        )
      }
      footer={
        <>
          <Button onClick={close}>Close</Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={needsReason || (chosen === current && comment.trim() === '')}
          >
            Save
          </Button>
        </>
      }
    >
      {finding !== null && (
        <div className="space-y-5 text-sm">
          <Notice>
            This finding is an investigative prompt from a configured check — not a determination of
            fraud or a lending decision.
          </Notice>
          <section>
            <h3 className="mb-1 font-semibold">What was observed</h3>
            <p>{finding.observed}</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold">Why it matters</h3>
            <p>{finding.whyItMatters}</p>
          </section>
          <section>
            <h3 className="mb-1 font-semibold">Certainty</h3>
            <p className="text-muted">{finding.certainty}</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Source evidence</h3>
            <EvidenceList evidence={finding.evidence} onOpen={setSource} />
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h3 className="mb-1 font-semibold">Known</h3>
              <ul className="list-disc space-y-0.5 pl-4">
                {finding.known.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="mb-1 font-semibold">Unknown</h3>
              <ul className="list-disc space-y-0.5 pl-4">
                {finding.unknown.length === 0 ? (
                  <li>—</li>
                ) : (
                  finding.unknown.map((k) => <li key={k}>{k}</li>)
                )}
              </ul>
            </section>
          </div>
          {finding.benign.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">Possible benign explanations</h3>
              <ul className="list-disc space-y-0.5 pl-4">
                {finding.benign.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-1 font-semibold">Recommended verification steps</h3>
            <ol className="list-decimal space-y-0.5 pl-4">
              {finding.steps.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Comments</h3>
            {(state?.comments.length ?? 0) === 0 ? (
              <p className="text-muted">No comments yet.</p>
            ) : (
              <ul className="space-y-2">
                {state?.comments.map((c) => (
                  <li key={c.id} className="bg-surface-2 rounded-lg p-2.5">
                    <p>{c.text}</p>
                    <p className="text-muted mt-1 text-xs">
                      {c.author} · {f.dateTime(c.at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border-line space-y-3 border-t pt-4">
            <h3 className="font-semibold">Resolution</h3>
            <SelectField
              label="Status"
              value={chosen}
              onChange={(e) => {
                setStatus(FindingStatusSchema.parse(e.target.value));
              }}
            >
              {FindingStatusSchema.options.map((s) => (
                <option key={s} value={s}>
                  {FINDING_STATUS_LABEL[s]}
                </option>
              ))}
            </SelectField>
            <TextArea
              label={
                chosen !== current && (chosen === 'resolved' || chosen === 'not_an_issue')
                  ? 'Reason (required)'
                  : 'Comment'
              }
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
              }}
              error={needsReason ? 'Record why this finding is resolved or not an issue.' : null}
            />
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
