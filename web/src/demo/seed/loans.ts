/** Disbursed demo loans and their transactions; the patterns the monitoring rules look for. */

import type { Entity, Loan, Relationship, Transaction } from '../../domain/schemas.js';
import { rupees } from './constants.js';
import type { SeedContext } from './context.js';
import { ent } from './entities.js';
import type { MakeRelationship } from './relationships.js';

export interface LoanBook {
  loans: Loan[];
  transactions: Transaction[];
  /** The circular-flow transaction on L-2026-0110 that the alert states and a case refer to. */
  circ1: string;
}

export function demoLoans(
  ctx: SeedContext,
  entities: Entity[],
  relationships: Relationship[],
  rel: MakeRelationship,
): LoanBook {
  const { ago, plus } = ctx;
  const loans: Loan[] = [];
  const txns: Transaction[] = [];
  let txSeq = 0;
  const tx = (
    loanId: string | null,
    at: string,
    fromId: string,
    toId: string,
    amountRupees: number,
    type: Transaction['type'],
    reference: string,
  ): string => {
    txSeq += 1;
    const id = `T-${String(5000 + txSeq)}`;
    txns.push({
      id,
      loanId,
      at,
      fromId,
      toId,
      amountMinor: rupees(amountRupees),
      type,
      reference,
      source: 'demo',
    });
    return id;
  };
  const addLoan = (
    id: string,
    appId: string | null,
    borrowerId: string,
    product: Loan['product'],
    amount: number,
    days: number,
    purpose: string,
    accountEntityId: string,
    branchId: string,
  ): string => {
    const at = ago(days, 11);
    loans.push({
      id,
      applicationId: appId,
      borrowerId,
      product,
      amountMinor: rupees(amount),
      disbursedAt: at,
      purpose,
      monitoringDays: 90,
      accountEntityId,
      dataSource: 'Core banking extract — accounts held at this bank only',
      lastUpdated: ago(0, 7),
      branchId,
    });
    entities.push(ent(`loan:${id}`, 'loan', id, purpose, null, borrowerId));
    relationships.push(
      rel(
        entities.find((e) => e.borrowerId === borrowerId && e.kind !== 'loan')?.id ?? borrowerId,
        `loan:${id}`,
        'borrower_for',
        'verified',
        `Loan ledger (${id})`,
        days,
        `Borrower on ${id}`,
      ),
    );
    tx(id, at, `loan:${id}`, accountEntityId, amount, 'disbursement', `Disbursement ${id}`);
    return at;
  };

  const d108 = addLoan(
    'L-2026-0108',
    'A-1008',
    'b-mahesh',
    'agri_term',
    650_000,
    40,
    'Tractor purchase',
    'a-mahesh',
    'br-baramati',
  );
  tx(
    'L-2026-0108',
    plus(d108, 26),
    'a-mahesh',
    'a-shivneri',
    620_000,
    'rtgs',
    'Tractor invoice SAE/2026/311',
  );
  tx(
    'L-2026-0108',
    plus(d108, 120),
    'a-mahesh',
    'x-cash',
    15_000,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx('L-2026-0108', plus(d108, 290), 'a-mahesh', 'a-krushi', 8_400, 'upi', 'Fertiliser');

  const d110 = addLoan(
    'L-2026-0110',
    'A-1010',
    'b-omsai',
    'msme_working_capital',
    1_200_000,
    25,
    'Fertiliser and seed inventory',
    'a-omsai',
    'br-junnar',
  );
  tx(
    'L-2026-0110',
    plus(d110, 20),
    'a-omsai',
    'a-bhosale-infra',
    500_000,
    'rtgs',
    'Advance — material',
  );
  const circ1 = tx(
    'L-2026-0110',
    plus(d110, 30),
    'a-omsai',
    'a-navnath',
    400_000,
    'neft',
    'Supply advance',
  );
  tx(null, plus(d110, 74), 'a-navnath', 'a-sachin', 380_000, 'imps', 'Refund');
  tx(null, plus(d110, 98), 'a-sachin', 'a-omsai', 350_000, 'neft', 'Capital introduction');
  tx('L-2026-0110', plus(d110, 216), 'a-omsai', 'a-krushi', 110_000, 'neft', 'Fertiliser stock');
  tx('L-2026-0110', plus(d110, 264), 'a-omsai', 'a-nirmal', 85_000, 'neft', 'Seed stock');

  const d111 = addLoan(
    'L-2026-0111',
    'A-1011',
    'b-kiran',
    'msme_term',
    800_000,
    18,
    'Poultry shed expansion and feed',
    'a-kiran',
    'br-baramati',
  );
  tx('L-2026-0111', plus(d111, 50), 'a-kiran', 'a-godavari', 180_000, 'neft', 'Feed purchase');
  tx('L-2026-0111', plus(d111, 145), 'a-kiran', 'a-navnath', 250_000, 'rtgs', 'Shed material');
  tx('L-2026-0111', plus(d111, 290), 'a-kiran', 'a-godavari', 120_000, 'neft', 'Feed purchase');

  const d112 = addLoan(
    'L-2026-0112',
    'A-1012',
    'b-anil',
    'agri_term',
    400_000,
    12,
    'Drip irrigation installation',
    'a-anil',
    'br-baramati',
  );
  tx(
    'L-2026-0112',
    plus(d112, 24),
    'a-anil',
    'x-cash',
    95_000,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx(
    'L-2026-0112',
    plus(d112, 49),
    'a-anil',
    'x-cash',
    98_000,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx(
    'L-2026-0112',
    plus(d112, 97),
    'a-anil',
    'x-cash',
    97_500,
    'cash_withdrawal',
    'Counter withdrawal',
  );
  tx(
    'L-2026-0112',
    plus(d112, 145),
    'a-anil',
    'a-sinchan',
    60_000,
    'neft',
    'Drip kit part payment',
  );

  const d091 = addLoan(
    'L-2026-0091',
    null,
    'b-ramesh',
    'kcc_crop',
    160_000,
    70,
    'Kharif crop inputs',
    'a-ramesh',
    'br-shirur',
  );
  tx('L-2026-0091', plus(d091, 72), 'a-ramesh', 'a-krushi', 32_000, 'upi', 'Fertiliser');
  tx('L-2026-0091', plus(d091, 120), 'a-ramesh', 'a-nirmal', 41_000, 'neft', 'Soybean seed');
  tx(
    'L-2026-0091',
    plus(d091, 216),
    'a-ramesh',
    'x-cash',
    20_000,
    'cash_withdrawal',
    'Labour wages',
  );
  tx('L-2026-0091', plus(d091, 720), 'a-ramesh', 'a-krushi', 18_500, 'upi', 'Pesticide');
  tx(
    'L-2026-0091',
    plus(d091, 1440),
    'a-ramesh',
    'loan:L-2026-0091',
    25_000,
    'repayment',
    'Interest servicing',
  );

  // Warehouse-receipt loan with no transaction data imported.
  const d109 = ago(60, 11);
  loans.push({
    id: 'L-2026-0109',
    applicationId: 'A-1009',
    borrowerId: 'b-dnyaneshwar',
    product: 'warehouse_receipt',
    amountMinor: rupees(900_000),
    disbursedAt: d109,
    purpose: 'Pledge of soybean stock',
    monitoringDays: 90,
    accountEntityId: 'a-dnyaneshwar',
    dataSource: 'No transaction file imported',
    lastUpdated: d109,
    branchId: 'br-shirur',
  });
  entities.push(
    ent(
      'loan:L-2026-0109',
      'loan',
      'L-2026-0109',
      'Pledge of soybean stock',
      null,
      'b-dnyaneshwar',
    ),
  );
  relationships.push(
    rel(
      'e-dnyaneshwar',
      'loan:L-2026-0109',
      'borrower_for',
      'verified',
      'Loan ledger (L-2026-0109)',
      60,
      'Borrower on L-2026-0109',
    ),
  );
  return { loans, transactions: txns, circ1 };
}
