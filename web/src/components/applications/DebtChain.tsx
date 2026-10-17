import { safeExternalUrl } from '../../lib/safe-url.js';
import {
  ArrowDown,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Factory,
  OctagonAlert,
} from 'lucide-react';
import type { PrExposure, PrLink, PrSubject } from '../../domain/schemas.js';
import { isDistressed } from '../../lib/public-records.js';
import { useFormat } from '../../state/hooks.js';
import { Badge } from '../ui/Badge.js';

const CLEAN = 'No insolvency or enforcement record';

/** Liquidated / dissolved → danger; insolvency → warn; anything else → neutral. */
function StatusBadge({ status }: { status: string | null }): React.JSX.Element {
  if (status === null) return <Badge tone="neutral">No record</Badge>;
  if (status === CLEAN)
    return (
      <Badge tone="ok" icon={CircleCheck}>
        {CLEAN}
      </Badge>
    );
  if (/Liquidation|Dissolved|Strike Off|liquidation/i.test(status))
    return (
      <Badge tone="danger" icon={OctagonAlert}>
        {status}
      </Badge>
    );
  if (/CIRP|insolvency/i.test(status))
    return (
      <Badge tone="warn" icon={CircleAlert}>
        {status}
      </Badge>
    );
  return (
    <Badge tone="neutral" icon={CircleCheck}>
      {status}
    </Badge>
  );
}

function SourceLink({ link }: { link: PrLink }): React.JSX.Element | null {
  const href = safeExternalUrl(link.url);
  if (href === null) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
    >
      IBBI announcement <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Step({
  name,
  status,
  part,
  arrow,
  link,
}: {
  name: string;
  status: string | null;
  part: string;
  arrow: string | null;
  link: PrLink | null;
}): React.JSX.Element {
  return (
    <li>
      {arrow !== null && (
        <p className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pl-3 text-xs">
          <ArrowDown className="size-4 shrink-0" aria-hidden />
          <span>{arrow}</span>
          {link !== null && <SourceLink link={link} />}
        </p>
      )}
      <div className="border-line bg-surface flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
        <Factory className="text-muted size-4 shrink-0" aria-hidden />
        <span className="min-w-0 font-semibold break-words">{name}</span>
        <span className="text-muted text-xs">{part}</span>
        <span className="ml-auto">
          <StatusBadge status={status} />
        </span>
      </div>
    </li>
  );
}

/** Applicant → customer → the customer's debtor → …: who owes whom, from public records. */
export function DebtChain({
  applicant,
  exposure,
}: {
  applicant: PrSubject;
  exposure: PrExposure;
}): React.JSX.Element {
  const applicantName = applicant.matchedName ?? applicant.inputName;
  const applicantStatus =
    applicant.nodeId === null
      ? null
      : isDistressed(applicant)
        ? (applicant.mcaStatus ?? `${applicant.records.length} insolvency / enforcement record(s)`)
        : CLEAN;
  const f = useFormat();
  const c = exposure.customer;
  const customerName = c.matchedName ?? c.inputName;
  const customerStatus = c.mcaStatus ?? exposure.applicantLink?.debtorStatus ?? null;
  const filed = (l: PrLink): string =>
    `${l.creditor} applied for insolvency of ${l.debtor} on ${l.date === null ? 'an unstated date' : f.date(l.date)} (unpaid dues)`;
  return (
    <div>
      <ol aria-label={`Chain of unpaid dues starting at ${applicantName}`}>
        <Step
          name={applicantName}
          status={applicantStatus}
          part="Applicant (is owed money)"
          arrow={null}
          link={null}
        />
        <Step
          name={customerName}
          status={customerStatus}
          part={exposure.declared ? 'Customer (declared)' : 'Customer (found in public records)'}
          arrow={
            exposure.applicantLink === null
              ? `Declared by the applicant as a customer that owes it money`
              : filed(exposure.applicantLink)
          }
          link={exposure.applicantLink}
        />
        {exposure.chain.map((l, i) => (
          <Step
            key={`${l.debtor}-${i}`}
            name={l.debtor}
            status={l.debtorStatus}
            part={`Owes ${l.creditor}`}
            arrow={filed(l)}
            link={l}
          />
        ))}
      </ol>
      <p className="text-muted mt-2 text-xs">
        Each arrow is an insolvency application in public records: the upper company applied because
        the lower one did not pay it. Money reaches the applicant only if every company below pays
        the one above.
      </p>
    </div>
  );
}
