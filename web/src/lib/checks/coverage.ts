/** Which configured checks had the input they need, so "ran" is never shown for a check with nothing to compare. */

import { fieldsOf } from './evidence.js';
import type { Ctx } from './types.js';

export type CheckCoverage =
  | { readonly name: string; readonly status: 'ran' }
  | { readonly name: string; readonly status: 'no_input'; readonly reason: string };

/** A reason the check had nothing to look at, or null when it had input. */
type Needs = (ctx: Ctx) => string | null;

const filled = (value: string): boolean => value.trim() !== '';

const ALWAYS: Needs = () => null;

const RULES: readonly (readonly [name: string, needs: Needs])[] = [
  ['Required fields present', ALWAYS],
  ['Document checklist for loan product', ALWAYS],
  [
    'Name consistency across documents',
    ({ app, docs }) =>
      !filled(app.data.applicant.fullName) || fieldsOf(docs, 'applicant_name_latin').length === 0
        ? 'Needs the applicant name and a document that shows a name'
        : null,
  ],
  [
    'Date-of-birth consistency',
    ({ app, docs }) =>
      !filled(app.data.applicant.dob) || fieldsOf(docs, 'dob').length === 0
        ? 'Needs a date of birth on the form and in a document'
        : null,
  ],
  [
    'Survey number reuse',
    ({ app }) => (filled(app.data.collateral.surveyNumber) ? null : 'Needs a survey / Gat number'),
  ],
  [
    'Warehouse receipt reuse',
    ({ app }) =>
      filled(app.data.collateral.warehouseReceiptNo) ? null : 'Needs a warehouse receipt number',
  ],
  [
    'Declared income vs bank credits',
    ({ app, docs }) =>
      app.data.financial.declaredAnnualIncomeMinor === null ||
      fieldsOf(docs, 'avg_monthly_credit').length === 0
        ? 'Needs a declared income and a bank statement'
        : null,
  ],
  [
    'Relationships to open investigations',
    ({ app, db }) =>
      db.borrowers.some((b) => b.id === app.borrowerId) ? null : 'Needs a linked borrower record',
  ],
  ['Field review status', ALWAYS],
  [
    'Public records: applicant and customers',
    ({ app }) =>
      !filled(app.data.business.businessName)
        ? 'Needs a business name (business applicants only)'
        : app.publicRecords === null
          ? 'Not run yet for this application'
          : null,
  ],
];

export const CHECK_NAMES: readonly string[] = RULES.map(([name]) => name);

export function checkCoverage(ctx: Ctx): CheckCoverage[] {
  return RULES.map(([name, needs]): CheckCoverage => {
    const reason = needs(ctx);
    return reason === null ? { name, status: 'ran' } : { name, status: 'no_input', reason };
  });
}
