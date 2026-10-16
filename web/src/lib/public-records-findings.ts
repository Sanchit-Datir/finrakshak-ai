import type {
  Application,
  ApplicationData,
  PrExposure,
  PrLink,
  PrSubject,
  PublicRecordsSnapshot,
  TradeCustomer,
} from '../domain/schemas.js';
import type { EvidenceRef, Finding } from './checks.js';
import { formatMoney } from './format.js';
import { receivablesImpact, type ReceivablesImpact } from './receivables.js';

/**
 * Turns a saved public-records check into review findings. Wording follows the spec: findings
 * are leads for verification, never verdicts; insolvency is a credit event, not wrongdoing.
 */

/**
 * A customer in liquidation makes the finding "Urgent review" when its declared receivable is at
 * least this share of all declared receivables, or when the applicant did not declare it at all.
 * Otherwise "Needs attention". Policy value — confirm with credit policy owners.
 */
export const URGENT_RECEIVABLE_SHARE_PERCENT = 20;

const key = (name: string, cin: string): string => `${name.trim().toUpperCase()}|${cin.trim().toUpperCase()}`;

/** Inputs the check depends on; a different key means the saved result is out of date. */
export function publicRecordsInputsKey(data: ApplicationData): string {
  const customers = data.receivables.customers.map((c) => key(c.name, c.cin)).sort();
  return JSON.stringify([key(data.business.businessName, data.business.registrationNo), customers]);
}

type Severity = 'liquidation' | 'insolvency' | 'enforcement';

function severityOf(s: PrSubject): Severity {
  if (/Liquidation|Dissolved|Strike Off/i.test(s.mcaStatus ?? '')) return 'liquidation';
  if (s.records.some((r) => r.kind === 'liquidation')) return 'liquidation';
  if (/CIRP/i.test(s.mcaStatus ?? '') || s.records.some((r) => r.kind === 'insolvency'))
    return 'insolvency';
  return 'enforcement';
}

const SEVERITY_TEXT: Record<Severity, string> = {
  liquidation: 'in liquidation or dissolved',
  insolvency: 'in a corporate insolvency resolution process',
  enforcement: 'named in enforcement records (allegations, B-36)',
};

const TITLE: Record<Severity, string> = {
  liquidation: 'Customer in liquidation — receivable may not be recovered',
  insolvency: 'Customer in insolvency — receivable at risk',
  enforcement: 'Customer named in enforcement records',
};

function declaredFor(app: Application, x: PrExposure): TradeCustomer | undefined {
  if (!x.declared) return undefined;
  const k = key(x.customer.inputName, x.customer.inputCin);
  return app.data.receivables.customers.find((c) => key(c.name, c.cin) === k);
}

/** Declared receivables split into owed by affected customers vs the rest. */
export function publicRecordsImpact(
  app: Application,
  snap: PublicRecordsSnapshot,
): ReceivablesImpact | null {
  const affected = new Set(
    snap.exposures.filter((x) => x.declared).map((x) => key(x.customer.inputName, x.customer.inputCin)),
  );
  return receivablesImpact(app.data.receivables.customers, (c) => affected.has(key(c.name, c.cin)));
}

const ref = (label: string, value: string, url: string | null): EvidenceRef => ({
  label,
  value,
  docId: null,
  fieldId: null,
  appId: null,
  ...(url === null ? {} : { url }),
});

const linkText = (l: PrLink): string =>
  `${l.debtor} did not pay ${l.creditor} — insolvency application ${l.date ?? 'date not stated'}` +
  (l.debtorStatus === null ? '' : `; ${l.debtor} status: ${l.debtorStatus}`);

function evidenceFor(x: PrExposure, amount: TradeCustomer | undefined): EvidenceRef[] {
  const c = x.customer;
  const status = c.mcaStatus ?? SEVERITY_TEXT[severityOf(c)];
  const latest = c.records[0];
  return [
    ref('Customer status (public records)', `${c.matchedName ?? ''}: ${status}`, latest?.url ?? null),
    ...(latest === undefined ? [] : [ref(`Latest record · ${latest.date ?? ''}`, latest.title, latest.url)]),
    ...(x.applicantLink === null
      ? []
      : [ref("Applicant's own insolvency application (IBBI)", linkText(x.applicantLink), x.applicantLink.url)]),
    ...x.chain.map((l, i) => ref(`Chain of unpaid dues · step ${i + 1} (IBBI)`, linkText(l), l.url)),
    ...(amount === undefined
      ? [ref('Application · trade receivables', 'Not declared by the applicant', null)]
      : [ref('Application · trade receivables', formatMoney(amount.outstandingMinor), null)]),
  ];
}

function observedText(x: PrExposure, amount: TradeCustomer | undefined, impact: ReceivablesImpact | null): string {
  const c = x.customer;
  const parts = [
    `${c.matchedName ?? 'The customer'}${c.cin === null ? '' : ` (CIN ${c.cin})`} is ${SEVERITY_TEXT[severityOf(c)]} according to public records.`,
  ];
  if (x.applicantLink !== null)
    parts.push(`The applicant itself filed an insolvency application against it (${x.applicantLink.date ?? 'date not stated'}).`);
  if (x.chain.length > 0)
    parts.push(
      `Its own dues are stuck in ${x.chain.length} further insolvency case(s): ${x.chain.map((l) => l.debtor).join(' → ')}.`,
    );
  if (amount === undefined) parts.push('The applicant did not declare this customer or an amount owed.');
  else if (impact !== null)
    parts.push(
      `Declared outstanding: ${formatMoney(amount.outstandingMinor)} of ${formatMoney(impact.totalMinor)} declared receivables.`,
    );
  return parts.join(' ');
}

function priorityOf(x: PrExposure, amount: TradeCustomer | undefined, impact: ReceivablesImpact | null): Finding['priority'] {
  if (severityOf(x.customer) !== 'liquidation') return 'needs_attention';
  if (amount === undefined) return 'urgent';
  const total = impact?.totalMinor ?? 0;
  const share = total === 0 ? 0 : ((amount.outstandingMinor ?? 0) * 100) / total;
  return share >= URGENT_RECEIVABLE_SHARE_PERCENT ? 'urgent' : 'needs_attention';
}

function exposureFinding(app: Application, snap: PublicRecordsSnapshot, x: PrExposure): Finding {
  const amount = declaredFor(app, x);
  const impact = publicRecordsImpact(app, snap);
  const c = x.customer;
  return {
    id: `pr:${c.nodeId ?? c.inputName}`,
    ruleId: 'public_records',
    title: `${TITLE[severityOf(c)]}: ${c.matchedName ?? c.inputName}${x.declared ? '' : ' (not declared)'}`,
    category: 'counterparty_exposure',
    priority: priorityOf(x, amount, impact),
    certainty: `Public record (IBBI / MCA), matched by ${MATCH_TEXT[c.match]}`,
    observed: observedText(x, amount, impact),
    whyItMatters:
      'Working-capital limits are drawn against receivables. Money owed by a customer in insolvency or liquidation is paid late, in part or not at all — and here the customer is itself waiting on other defaulted companies, so the applicant’s cash flow and drawing power may be overstated.',
    evidence: evidenceFor(x, amount),
    known: [
      `Statuses and dates come from the local public-records dataset built ${snap.datasetBuiltAt?.slice(0, 10) ?? 'on an unknown date'}.`,
      'In each chain step the first company applied for insolvency of the second, so the second owed it money.',
    ],
    unknown: [
      'How much of the receivable will be recovered in the insolvency or liquidation, if any.',
      'Whether the applicant has already written off or provided for this receivable.',
      'Whether the status changed after the dataset was built.',
      ...(c.match === 'exact_name' ? ['The customer was matched by exact name, not CIN — confirm it is the same company.'] : []),
    ],
    benign: [
      'The amount may be small, disputed, or already settled outside the process.',
      'The applicant may have filed a claim with the liquidator or resolution professional and expect partial recovery.',
      'A customer’s insolvency is a credit event, not wrongdoing by the applicant or the customer.',
    ],
    steps: [
      'Obtain the receivables ageing statement and confirm what this customer owes.',
      'Exclude this receivable from drawing power until recovery is evidenced.',
      'Ask for the claim filed with the liquidator or resolution professional and the amount admitted.',
      'Check how much of the applicant’s sales depend on this customer and on others in the same trade.',
      'Verify the customer on MCA21 by CIN before relying on the match.',
    ],
  };
}

const MATCH_TEXT: Record<PrSubject['match'], string> = {
  cin: 'CIN',
  exact_name: 'exact name (no CIN)',
  ambiguous: 'name (ambiguous)',
  none: 'no match',
  via_applicant_record: "the applicant's own insolvency application",
};

function applicantFinding(snap: PublicRecordsSnapshot): Finding[] {
  const a = snap.applicant;
  if (a.nodeId === null || a.records.length === 0) return [];
  const sev = severityOf(a);
  return [
    {
      id: `pr:applicant:${a.nodeId}`,
      ruleId: 'public_records',
      title: `Applicant ${SEVERITY_TEXT[sev]}`,
      category: 'counterparty_exposure',
      priority: sev === 'enforcement' ? 'needs_attention' : 'urgent',
      certainty: `Public record, matched by ${MATCH_TEXT[a.match]}`,
      observed: `${a.matchedName ?? ''} appears in ${a.records.length} insolvency or enforcement record(s).`,
      whyItMatters: 'The applicant’s own records affect its ability to borrow and repay.',
      evidence: a.records.slice(0, 5).map((r) => ref(`${r.caseType} · ${r.date ?? ''}`, r.title, r.url)),
      known: ['Being named in a record does not say whether the company is the accused, a victim or a complainant (B-42).'],
      unknown: ['The applicant’s role in each record and the current status.'],
      benign: ['The company may be a complainant or victim named in the record.'],
      steps: ['Read each source record and record the applicant’s role before deciding.'],
    },
  ];
}

function staleFinding(app: Application, snap: PublicRecordsSnapshot | null): Finding[] {
  if (snap === null && app.data.receivables.customers.length === 0) return [];
  const stale = snap !== null && snap.inputsKey !== publicRecordsInputsKey(app.data);
  if (snap !== null && !stale) return [];
  return [
    {
      id: 'pr:not-current',
      ruleId: 'public_records',
      title: stale ? 'Public-records check is out of date' : 'Public-records check not run',
      category: 'evidence_incomplete',
      priority: stale ? 'needs_attention' : 'routine',
      certainty: 'Process check',
      observed: stale
        ? 'The business details or customers changed after the last public-records check.'
        : 'The applicant and its customers have not been checked against the local public-records dataset.',
      whyItMatters: 'Customers in insolvency or liquidation reduce the receivables a working-capital limit relies on.',
      evidence: [],
      known: [],
      unknown: ['Whether any customer is in insolvency or liquidation.'],
      benign: [],
      steps: ['Run the public-records check in Risk analysis.'],
    },
  ];
}

export function publicRecordsFindings(app: Application): Finding[] {
  const snap = app.publicRecords;
  const current = snap === null ? [] : [...applicantFinding(snap), ...snap.exposures.map((x) => exposureFinding(app, snap, x))];
  return [...staleFinding(app, snap), ...current];
}

