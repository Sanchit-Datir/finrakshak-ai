import { Link } from 'react-router';
import type { AiAnalysisSnapshot, FtDocument } from '../../domain/schemas.js';
import type { Finding } from '../../lib/checks.js';
import { useFormat } from '../../state/hooks.js';
import { Notice, SimulatedBadge } from '../ui/States.js';

/** Shows a stored analysis. All model text is plain React text (escaped), never HTML. */
export function AiAnalysisResult({
  snapshot,
  docs,
  findings,
  stale,
}: {
  snapshot: AiAnalysisSnapshot;
  docs: readonly FtDocument[];
  findings: readonly Finding[];
  stale: boolean;
}): React.JSX.Element {
  const f = useFormat();
  const r = snapshot.result;
  const fieldName = (docId: string, fieldId: string): string => {
    const doc = docs.find((d) => d.id === docId);
    const field = doc?.fields.find((x) => x.id === fieldId);
    return `${doc?.filename ?? 'Document'} · ${field?.label ?? 'field'}`;
  };
  const titleOf = (id: string): string => findings.find((x) => x.id === id)?.title ?? 'Finding';
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {r.mock ? (
          <SimulatedBadge label="Mock provider — no model called" />
        ) : (
          <span className="text-muted text-xs">AI-written by {r.model}</span>
        )}
        <span className="text-muted text-xs">{f.dateTime(r.analysedAt)}</span>
      </div>
      {stale && (
        <Notice tone="warn" title="Out of date">
          Documents or findings changed after this analysis. Run it again to update it.
        </Notice>
      )}
      <section aria-labelledby="ai-summary">
        <h4 id="ai-summary" className="mb-1 font-semibold">
          Risk summary
        </h4>
        <p>{r.summary === '' ? 'The summary was withheld by the wording check.' : r.summary}</p>
      </section>
      <section aria-labelledby="ai-facts">
        <h4 id="ai-facts" className="mb-1 font-semibold">
          From the documents
        </h4>
        {r.facts.length === 0 ? (
          <p className="text-muted">No fact could be matched to a recorded field.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {r.facts.map((x) => (
              <li key={`${x.docId}:${x.fieldId}:${x.statement}`}>
                {x.statement}{' '}
                <span className="text-muted text-xs">({fieldName(x.docId, x.fieldId)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="ai-notes">
        <h4 id="ai-notes" className="mb-1 font-semibold">
          About the findings
        </h4>
        {r.findingNotes.length === 0 ? (
          <p className="text-muted">No notes on the findings.</p>
        ) : (
          <ul className="space-y-1">
            {r.findingNotes.map((n) => (
              <li key={n.findingId}>
                <span className="font-medium">{titleOf(n.findingId)}:</span> {n.note}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="ai-patterns">
        <h4 id="ai-patterns" className="mb-1 font-semibold">
          Matched patterns
        </h4>
        <p className="text-muted">
          None for an application: patterns are matched against a disbursed loan’s transactions. See{' '}
          <Link className="text-teal underline" to="/monitoring/risk-scores">
            Risk scores (synthetic)
          </Link>
          .
        </p>
      </section>
      <p className="text-muted border-line border-t pt-3 text-xs">
        A lead for a reviewer, not a decision. Every fact was checked against the recorded fields;{' '}
        {r.dropped} item(s) that did not match were removed.
        {snapshot.omittedDocuments > 0 &&
          ` ${String(snapshot.omittedDocuments)} document(s) were not sent (too much data).`}
        {r.remainingToday !== null && ` ${String(r.remainingToday)} AI analyses left today.`}
      </p>
    </div>
  );
}
