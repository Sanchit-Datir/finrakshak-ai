import type { PrRecord, PrSubject, PublicWatch, WatchEvent } from '../domain/schemas.js';
import type { EvidenceRef, Finding } from './checks.js';
import type { LabIndex } from './graph-lab.js';
import { lookupCompany } from './public-records.js';

/**
 * Post-disbursement public-records watch (pure). A check "as of" a date raises every record of
 * the borrower dated after disbursement and on or before that date that the watch has not
 * raised before. In the prototype the date is chosen by the user to replay history; a scheduled
 * job against a live feed would use today.
 */

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export const recordKey = (r: PrRecord): string => `${r.caseType}-${r.date ?? 'nodate'}-${hash(r.title)}`;

export interface WatchCheckResult {
  readonly asOf: string;
  readonly subject: PrSubject;
  readonly newEvents: WatchEvent[];
}

export function checkWatch(ix: LabIndex, watch: PublicWatch, asOf: string, now: string): WatchCheckResult {
  const subject = lookupCompany(ix, watch.borrowerName, watch.cin);
  const seen = new Set(watch.events.map((e) => e.key));
  const newEvents = subject.records
    .filter((r) => r.date !== null && r.date > watch.disbursedOn && r.date <= asOf)
    .filter((r) => !seen.has(recordKey(r)))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map((record) => ({ key: recordKey(record), record, raisedAt: now, raisedAsOf: asOf }));
  return { asOf, subject, newEvents };
}

/** Records already public when the loan was disbursed: context, not alerts. */
export function priorRecords(watch: PublicWatch): PrRecord[] {
  const records = watch.lastCheck?.subject.records ?? [];
  return records.filter((r) => r.date !== null && r.date <= watch.disbursedOn);
}

type Kind = PrRecord['kind'];

const TITLE: Record<Kind, string> = {
  insolvency: 'Borrower taken to insolvency (CIRP)',
  liquidation: 'Borrower ordered into liquidation',
  enforcement: 'Enforcement action against the borrower',
};

const WHY: Record<Kind, string> = {
  insolvency:
    'A creditor has started insolvency against the borrower. A moratorium stops recovery actions, and repayment of this loan now depends on the resolution process.',
  liquidation:
    'The borrower is being wound up. Recovery depends on the liquidation process and the security held.',
  enforcement:
    'An enforcement agency is acting against the borrower (search, attachment or prosecution). Assets, including any security, may be attached. These are allegations until decided (B-36).',
};

const STEPS: Record<Kind, string[]> = {
  insolvency: [
    "File or update the bank's claim with the resolution professional before the deadline in the announcement.",
    'Stop further drawdowns and review the security and guarantees.',
    'Re-assess asset classification and provisioning under credit policy.',
  ],
  liquidation: [
    'File or update the claim with the liquidator.',
    'Review the realisable value of the security.',
    'Escalate for write-off / recovery decisions under credit policy.',
  ],
  enforcement: [
    "Read the source record and record the borrower's role (accused, victim or other) (B-42).",
    'Check whether the pledged security is among the attached assets.',
    'Escalate under the fraud-monitoring policy if the borrower is the subject.',
  ],
};

const MATCH_TEXT: Record<PrSubject['match'], string> = {
  cin: 'CIN',
  exact_name: 'exact name (confirm CIN)',
  ambiguous: 'ambiguous name',
  none: 'not found',
  via_applicant_record: 'public record',
};

const ref = (label: string, value: string, url: string | null): EvidenceRef => ({
  label,
  value,
  docId: null,
  fieldId: null,
  appId: null,
  ...(url === null ? {} : { url }),
});

function evidence(w: PublicWatch, ev: WatchEvent): EvidenceRef[] {
  const s = w.lastCheck?.subject;
  return [
    ref(`Public record · ${ev.record.date ?? 'date not stated'}`, ev.record.title, ev.record.url),
    ref('Loan', `${w.loanRef} · disbursed ${w.disbursedOn}`, null),
    ref(
      'Borrower in public records',
      `${s?.matchedName ?? w.borrowerName} · matched by ${MATCH_TEXT[s?.match ?? 'none']}` +
        (s?.mcaStatus === null || s === undefined ? '' : ` · MCA status: ${s.mcaStatus}`),
      null,
    ),
  ];
}

/** The review finding (and alert body) for one raised event. */
export function watchFinding(w: PublicWatch, ev: WatchEvent): Finding {
  const kind = ev.record.kind;
  return {
    id: `watch-${w.id}-${ev.key}`,
    ruleId: 'public_records_watch',
    title: `${TITLE[kind]}: ${w.borrowerName} (${ev.record.date ?? 'undated'})`,
    category: 'post_disbursement_record',
    priority: 'urgent',
    certainty: `Public record (${ev.record.caseType.split('_')[0]?.toUpperCase() ?? ''}), ${ev.record.evidenceStatus}`,
    observed: `${ev.record.title} — dated ${ev.record.date ?? 'not stated'}, after loan ${w.loanRef} was disbursed on ${w.disbursedOn}.`,
    whyItMatters: WHY[kind],
    evidence: evidence(w, ev),
    known: ['The record and its date come from the local public-records dataset.'],
    unknown: [
      'Whether the borrower is current on this loan.',
      'Whether the status changed after the dataset was built (B-43).',
    ],
    benign: [
      'An insolvency application may be settled or withdrawn (section 12A).',
      'The borrower may be named as a victim or complainant rather than the accused.',
    ],
    steps: STEPS[kind],
  };
}
