import {
  INVESTIGATION_LIMITS as L,
  type InvestigateApplicationInput,
  type InvestigationField,
  type InvestigationParty,
  type InvestigationRelated,
} from '@fund-tracker/shared';
import { REL_LABEL } from '../domain/labels.js';
import type { Application, ApplicationData, Db } from '../domain/schemas.js';
import { inputsKeyOf } from './application-analysis.js';
import type { Finding } from './checks.js';
import { formatMoney, maskIdentifier } from './format.js';
import type { LabIndex } from './graph-lab.js';
import { investigationRatios } from './investigation-ratios.js';
import { publicRelated, shortlist } from './investigation-shortlist.js';

/**
 * The bundle the browser sends to `investigateApplication` (docs/AI_INVESTIGATOR.md). Typed-in data
 * only, identifiers masked and date of birth, mobile and street address left out (B-16, B-67); empty
 * fields are kept as '' so the investigator can ask about gaps. Ratios, shortlists and related
 * entities are all made by code.
 */

const clip = (s: string, max: number = L.maxValueChars): string => s.trim().slice(0, max);
const money = (m: number | null): string => (m === null ? '' : formatMoney(m));
const masked = (s: string): string => (s.trim() === '' ? '' : maskIdentifier(s));
const f = (path: string, label: string, value: string): InvestigationField => ({
  path,
  label,
  value: clip(value),
});

function sectionsOf(d: ApplicationData): InvestigateApplicationInput['sections'] {
  const { applicant: a, address: ad, financial: fi, loan, collateral: c, business: b } = d;
  return {
    applicant: [
      f('applicant.fullName', 'Full name', a.fullName),
      f('applicant.fatherOrSpouse', 'Father or spouse', a.fatherOrSpouse),
      f('address.village', 'Village / town', ad.village),
      f('address.taluka', 'Taluka', ad.taluka),
      f('address.district', 'District', ad.district),
      f('address.pincode', 'Pincode', ad.pincode),
      f('financial.occupation', 'Occupation', fi.occupation),
      f(
        'financial.declaredAnnualIncome',
        'Declared annual income',
        money(fi.declaredAnnualIncomeMinor),
      ),
      f(
        'financial.existingLiabilities',
        'Existing liabilities',
        money(fi.existingLiabilitiesMinor),
      ),
      f('guarantor.relation', 'Guarantor relation', d.guarantor.relation),
    ],
    business: [
      f('business.businessName', 'Business name', b.businessName),
      f('business.registrationNo', 'CIN / registration number', b.registrationNo),
      f('business.pan', 'PAN (masked)', masked(b.pan)),
      f('business.gstin', 'GSTIN (masked)', masked(b.gstin)),
      f('business.udyamNo', 'Udyam number (masked)', masked(b.udyamNo)),
    ],
    loan: [
      f('loan.product', 'Loan product', loan.product),
      f('loan.amount', 'Loan amount', money(loan.amountMinor)),
      f(
        'loan.tenureMonths',
        'Tenure (months)',
        loan.tenureMonths === null ? '' : String(loan.tenureMonths),
      ),
      f('loan.purpose', 'Purpose', loan.purpose),
      f(
        'declaration.purposeDeclared',
        'Purpose declaration signed',
        d.declaration.purposeDeclared ? 'Yes' : 'No',
      ),
      f('declaration.remarks', 'Remarks', d.declaration.remarks),
    ],
    collateral: [
      f('collateral.surveyNumber', 'Survey number', c.surveyNumber),
      f('collateral.landArea', 'Land area', c.landArea === '' ? '' : `${c.landArea} ${c.landUnit}`),
      f('collateral.warehouseReceiptNo', 'Warehouse receipt number', c.warehouseReceiptNo),
      f('collateral.collateralValue', 'Collateral value', money(c.collateralValueMinor)),
    ],
    customers: d.receivables.customers.flatMap((cu, i) => {
      const n = String(i + 1);
      const p = `customers.${String(i)}`;
      return [
        f(`${p}.name`, `Customer ${n} name`, cu.name),
        f(`${p}.cin`, `Customer ${n} CIN`, cu.cin),
        f(`${p}.outstanding`, `Customer ${n} amount outstanding`, money(cu.outstandingMinor)),
        f(`${p}.oldestUnpaidDate`, `Customer ${n} oldest unpaid invoice`, cu.oldestUnpaidDate),
      ];
    }),
  };
}

type PartyBase = Pick<InvestigationParty, 'partyId' | 'role' | 'name' | 'cin'>;

function partiesOf(app: Application): PartyBase[] {
  const d = app.data;
  const out: PartyBase[] = [];
  if (d.applicant.fullName.trim() !== '')
    out.push({
      partyId: 'applicant',
      role: 'applicant',
      name: clip(d.applicant.fullName),
      cin: '',
    });
  if (d.business.businessName.trim() !== '')
    out.push({
      partyId: 'business',
      role: 'business',
      name: clip(d.business.businessName),
      cin: clip(d.business.registrationNo, 30),
    });
  d.receivables.customers.forEach((c, i) => {
    if (c.name.trim() !== '')
      out.push({
        partyId: `customer:${String(i)}`,
        role: 'customer',
        name: clip(c.name),
        cin: clip(c.cin, 30),
      });
  });
  return out.slice(0, L.maxParties);
}

/** The application's own data: what the stored result is keyed on (no public-records data). */
export function investigationCore(
  app: Application,
  findings: readonly Finding[],
): Omit<InvestigateApplicationInput, 'parties'> & { parties: PartyBase[] } {
  return {
    borrowerType: app.borrowerType,
    sections: sectionsOf(app.data),
    ratios: investigationRatios(app.data, app.borrowerType).slice(0, L.maxRatios),
    parties: partiesOf(app),
    findings: findings.slice(0, L.maxCheckFindings).map((x) => ({
      findingId: x.id,
      title: clip(x.title, L.maxTextChars) || x.ruleId,
      priority: x.priority,
      observed: clip(x.observed, L.maxTextChars),
    })),
  };
}

/** Same application data and findings, same key: a stored investigation is current only then. */
export function investigationInputsKey(app: Application, findings: readonly Finding[]): string {
  return inputsKeyOf(investigationCore(app, findings));
}

/** Relationships recorded in the workspace for the borrower, with any open case they lead to. */
function workspaceRelated(app: Application, db: Db): InvestigationRelated[] {
  const borrower = db.borrowers.find((b) => b.id === app.borrowerId);
  if (borrower === undefined) return [];
  const me = borrower.entityId;
  const names = new Map(db.entities.map((e) => [e.id, e.name]));
  const open = db.cases.filter((c) => !['resolved', 'closed'].includes(c.status));
  return db.relationships
    .filter(
      (r) => r.type !== 'borrower_for' && r.type !== 'account_of' && (r.from === me || r.to === me),
    )
    .map((r) => {
      const other = r.from === me ? r.to : r.from;
      const c = open.find((x) => x.entityIds.includes(other) && !x.entityIds.includes(me));
      return {
        entityId: other,
        name: clip(names.get(other) ?? other),
        relation: clip(`${REL_LABEL[r.type]} (${r.status.replace(/_/g, ' ')})`, 120),
        source: 'workspace' as const,
        concern: c === undefined ? null : `In open case ${c.id}`,
      };
    });
}

/** The full bundle. Without the public-records index the shortlists are empty (and the UI says so). */
export function buildInvestigationBundle(
  app: Application,
  db: Db,
  findings: readonly Finding[],
  ix: LabIndex | null,
): InvestigateApplicationInput {
  const core = investigationCore(app, findings);
  const pincode = /^\d{6}$/.test(app.data.address.pincode.trim())
    ? app.data.address.pincode.trim()
    : null;
  const workspace = workspaceRelated(app, db);
  const owner = core.parties.some((p) => p.partyId === 'business') ? 'business' : 'applicant';
  const parties = core.parties.map((p): InvestigationParty => {
    const query = {
      name: p.name,
      cin: p.cin,
      pincode: p.role === 'customer' ? null : pincode,
      people: p.role === 'applicant',
    };
    const candidates = ix === null ? [] : shortlist(ix, query);
    const related = [
      ...(p.partyId === owner ? workspace : []),
      ...(ix === null ? [] : publicRelated(ix, candidates)),
    ];
    const ranked = related.sort((a, b) => Number(b.concern !== null) - Number(a.concern !== null));
    return { ...p, candidates, related: ranked.slice(0, L.maxRelatedPerParty) };
  });
  return { ...core, parties };
}
