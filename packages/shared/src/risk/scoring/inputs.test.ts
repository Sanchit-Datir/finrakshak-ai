import { describe, expect, it } from 'vitest';
import type { RuleEntity, RuleTransaction } from '../rules/types.js';
import { TRADING_LINK_TYPE, deriveTradingLinks } from './inputs.js';

const entities: RuleEntity[] = [
  { id: 'B-1', ownerId: null },
  { id: 'B-1-acc', ownerId: 'B-1' },
  { id: 'B-1-C1', ownerId: null },
  { id: 'B-1-C1-acc', ownerId: 'B-1-C1' },
  { id: 'B-1-S1-acc', ownerId: 'B-1-S1' },
  { id: 'BANK', ownerId: null },
  { id: 'BANK-acc', ownerId: 'BANK' },
];
const loans = [{ borrowerId: 'B-1', accountEntityId: 'B-1-acc' }];
const tx = (id: string, fromId: string, toId: string, type: string): RuleTransaction => ({
  id,
  at: '2024-02-01T05:00:00.000Z',
  fromId,
  toId,
  amountMinor: 100,
  type,
});

describe('deriveTradingLinks', () => {
  it('links a borrower to the owners of the accounts it was paid by and paid, once each, as inferred', () => {
    const links = deriveTradingLinks(
      loans,
      [
        tx('1', 'B-1-C1-acc', 'B-1-acc', 'neft'),
        tx('2', 'B-1-C1-acc', 'B-1-acc', 'upi'),
        tx('3', 'B-1-acc', 'B-1-S1-acc', 'rtgs'),
      ],
      entities,
    );
    expect(links).toEqual([
      { from: 'B-1', to: 'B-1-C1', type: TRADING_LINK_TYPE, status: 'inferred' },
      { from: 'B-1', to: 'B-1-S1', type: TRADING_LINK_TYPE, status: 'inferred' },
    ]);
  });

  it('does not count the lender: disbursement and repayment are not trade', () => {
    const links = deriveTradingLinks(
      loans,
      [tx('1', 'BANK-acc', 'B-1-acc', 'disbursement'), tx('2', 'B-1-acc', 'BANK-acc', 'repayment')],
      entities,
    );
    expect(links).toEqual([]);
  });

  it('ignores payments between accounts that are not a borrower’s, and a borrower paying itself', () => {
    expect(deriveTradingLinks(loans, [tx('1', 'X-acc', 'Y-acc', 'neft')], entities)).toEqual([]);
    expect(deriveTradingLinks(loans, [tx('1', 'B-1-acc', 'B-1-acc', 'neft')], entities)).toEqual(
      [],
    );
  });
});
