/**
 * TEST loans for the post-disbursement public-records scenarios. The borrowers are real companies so
 * their public records can be matched; the loans, amounts and accounts are made up.
 */

import type { Borrower, Entity, Loan, Relationship } from '../../domain/schemas.js';
import { rupees } from './constants.js';
import type { SeedContext } from './context.js';
import { borrowerFactory } from './borrowers.js';
import { account, ent } from './entities.js';
import type { MakeRelationship } from './relationships.js';

export interface TestLoanTargets {
  entities: Entity[];
  borrowers: Borrower[];
  loans: Loan[];
  relationships: Relationship[];
  rel: MakeRelationship;
}

export function addTestLoans(ctx: SeedContext, targets: TestLoanTargets): void {
  const { ago } = ctx;
  const { entities, borrowers, loans, relationships, rel } = targets;
  const borrower = borrowerFactory(ctx);
  // TEST loan for the post-disbursement public-records scenario
  // (e2e/scenarios/advantage-overseas-post-disbursement). The borrower is a real company so its
  // public records (IBBI, ED) can be matched; the loan, amount and account are made up.
  entities.push(
    ent(
      'c-advantage',
      'company',
      'Advantage Overseas Private Limited',
      'TEST borrower — public-records scenario',
      null,
      'b-advantage',
    ),
    account('a-advantage', 'c-advantage', 'XXXX 0601'),
    ent(
      'loan:L-2023-0601',
      'loan',
      'L-2023-0601',
      'Working capital (TEST loan)',
      null,
      'b-advantage',
    ),
  );
  borrowers.push({
    ...borrower(
      'b-advantage',
      'c-advantage',
      'Advantage Overseas Private Limited',
      'Advantage Overseas Private Limited',
      'private_limited',
      'br-shirur',
      'CIN U05121MH2004PTC199195',
      1240,
    ),
    registrationNo: 'U05121MH2004PTC199195',
  });
  loans.push({
    id: 'L-2023-0601',
    applicationId: null,
    borrowerId: 'b-advantage',
    product: 'msme_working_capital',
    amountMinor: rupees(20_000_000),
    disbursedAt: '2023-06-01T05:30:00.000Z',
    purpose: 'Working capital (TEST loan for the public-records scenario)',
    monitoringDays: 90,
    accountEntityId: 'a-advantage',
    dataSource: 'TEST loan — real borrower name, made-up loan values (public-records scenario)',
    lastUpdated: ago(0, 7),
    branchId: 'br-shirur',
  });
  relationships.push(
    rel(
      'c-advantage',
      'loan:L-2023-0601',
      'borrower_for',
      'verified',
      'Loan ledger (L-2023-0601)',
      1240,
      'Borrower on L-2023-0601',
    ),
  );

  // TEST loan for the "clean borrower, sudden enforcement" public-records scenario
  // (e2e/scenarios/jai-corp-sudden-enforcement). Real borrower; made-up loan values.
  entities.push(
    ent(
      'c-jaicorp',
      'company',
      'Jai Corp Limited',
      'TEST borrower — public-records scenario',
      null,
      'b-jaicorp',
    ),
    account('a-jaicorp', 'c-jaicorp', 'XXXX 0401'),
    ent('loan:L-2024-0401', 'loan', 'L-2024-0401', 'Term loan (TEST loan)', null, 'b-jaicorp'),
  );
  borrowers.push({
    ...borrower(
      'b-jaicorp',
      'c-jaicorp',
      'Jai Corp Limited',
      'Jai Corp Limited',
      'private_limited',
      'br-shirur',
      'CIN L17120MH1985PLC036500',
      930,
    ),
    registrationNo: 'L17120MH1985PLC036500',
  });
  loans.push({
    id: 'L-2024-0401',
    applicationId: null,
    borrowerId: 'b-jaicorp',
    product: 'msme_term',
    amountMinor: rupees(50_000_000),
    disbursedAt: '2024-04-01T05:30:00.000Z',
    purpose: 'Term loan (TEST loan for the public-records scenario)',
    monitoringDays: 90,
    accountEntityId: 'a-jaicorp',
    dataSource: 'TEST loan — real borrower name, made-up loan values (public-records scenario)',
    lastUpdated: ago(0, 7),
    branchId: 'br-shirur',
  });
  relationships.push(
    rel(
      'c-jaicorp',
      'loan:L-2024-0401',
      'borrower_for',
      'verified',
      'Loan ledger (L-2024-0401)',
      930,
      'Borrower on L-2024-0401',
    ),
  );
}
