import { Banknote, CircleAlert, ExternalLink, Gavel, History, OctagonAlert } from 'lucide-react';
import type { PrRecord, PublicWatch } from '../../domain/schemas.js';
import { formatMoney } from '../../lib/format.js';
import { priorRecords } from '../../lib/public-watch.js';
import { useFormat } from '../../state/hooks.js';
import { Badge } from '../ui/Badge.js';

const KIND_BADGE: Record<
  PrRecord['kind'],
  { label: string; tone: 'danger' | 'warn'; icon: typeof Gavel }
> = {
  insolvency: { label: 'Insolvency (CIRP)', tone: 'warn', icon: CircleAlert },
  liquidation: { label: 'Liquidation', tone: 'danger', icon: OctagonAlert },
  enforcement: { label: 'Enforcement', tone: 'danger', icon: Gavel },
};

function RecordLine({
  r,
  raisedAsOf,
}: {
  r: PrRecord;
  raisedAsOf: string | null;
}): React.JSX.Element {
  const f = useFormat();
  const k = KIND_BADGE[r.kind];
  return (
    <li className="border-line bg-surface rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular text-sm font-semibold">
          {r.date === null ? 'Undated' : f.date(r.date)}
        </span>
        <Badge tone={k.tone} icon={k.icon}>
          {k.label}
        </Badge>
        {raisedAsOf !== null && (
          <span className="text-muted text-xs">
            Alert raised by the check as of {f.date(raisedAsOf)}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm break-words">{r.title}</p>
      {r.url !== null && (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          Open public record <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </li>
  );
}

/** Disbursement, then every record raised since, oldest first. */
export function WatchTimeline({ watch }: { watch: PublicWatch }): React.JSX.Element {
  const f = useFormat();
  const prior = priorRecords(watch);
  const events = [...watch.events].sort((a, b) =>
    (a.record.date ?? '').localeCompare(b.record.date ?? ''),
  );
  return (
    <div className="space-y-3">
      {prior.length > 0 && (
        <section aria-label="Known before disbursement">
          <h4 className="text-muted mb-1 flex items-center gap-1 text-xs font-semibold uppercase">
            <History className="size-3.5" aria-hidden /> Already public before disbursement
            (context, no alert)
          </h4>
          <ol className="space-y-2">
            {prior.map((r) => (
              <RecordLine
                key={`${r.caseType}-${r.date ?? ''}-${r.title}`}
                r={r}
                raisedAsOf={null}
              />
            ))}
          </ol>
        </section>
      )}
      <ol className="space-y-2" aria-label={`Timeline for ${watch.loanRef}`}>
        <li className="bg-primary-soft rounded-lg p-3 text-sm">
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            <Banknote className="size-4" aria-hidden /> {f.date(watch.disbursedOn)} · Loan{' '}
            {watch.loanRef} disbursed
            {watch.amountMinor !== null && (
              <span className="tabular">({formatMoney(watch.amountMinor)})</span>
            )}
          </span>
        </li>
        {events.map((e) => (
          <RecordLine key={e.key} r={e.record} raisedAsOf={e.raisedAsOf} />
        ))}
      </ol>
      {events.length === 0 && (
        <p className="text-muted text-sm">
          No public record dated after disbursement has been found yet.
        </p>
      )}
    </div>
  );
}
