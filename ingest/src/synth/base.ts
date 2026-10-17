import type { SynthEntity, SynthLoan, SynthTransaction } from '@fund-tracker/shared';
import { addDays, addMonths, addMonthsToMonth, istInstant, monthEnd } from './calendar.js';
import type { Horizon, LoanContext } from './archetypes/types.js';
import type { TxnFields } from './ledger.js';

/**
 * The parts every scenario shares: the borrower, its account and counterparties, the loan terms, and a
 * month-by-month account life (customers pay in, suppliers are paid, the EMI goes out). A scenario shapes
 * that life through a `LifePlan` and adds whatever makes it different. Amounts are INR paise integers.
 */

export const BANK_ID = 'BANK';
export const BANK_ACCOUNT_ID = 'BANK-acc';
/** ₹100 in paise: every generated amount is a multiple of this. */
export const MONEY_STEP = 10_000;

export const roundTo = (n: number, step: number): number => Math.round(n / step) * step;
/** `p` percent of `amount`, rounded down, with integers only. */
export const percent = (amount: number, p: number): number => Math.floor((amount * p) / 100);
export const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function makeHorizon(startMonth: string, months: number): Horizon {
  const endMonth = addMonthsToMonth(startMonth, months - 1);
  return { startMonth, months, endMonth, endDate: monthEnd(endMonth) };
}

const entity = (
  id: string,
  kind: SynthEntity['kind'],
  name: string,
  ownerId: string | null = null,
): SynthEntity => ({
  id,
  kind,
  name,
  subtitle: 'SYNTH test entity',
  ownerId,
  borrowerId: null,
  synthetic: true,
});

/** A party plus the account it owns. */
export const partyWithAccount = (
  id: string,
  kind: 'company' | 'counterparty',
  name: string,
): SynthEntity[] => [entity(id, kind, name), entity(`${id}-acc`, 'account', `${name} account`, id)];

/** The one bank every loan is disbursed from and repaid to. */
export const bankEntities = (): SynthEntity[] =>
  partyWithAccount(BANK_ID, 'company', 'SYNTH Demo Bank');

export interface Counterparty {
  readonly id: string;
  readonly accountId: string;
}

export interface LoanBase {
  readonly no: string;
  readonly borrowerId: string;
  readonly accountId: string;
  readonly loanId: string;
  readonly name: string;
  readonly amount: number;
  readonly tenor: number;
  readonly emi: number;
  readonly disbursedOn: string;
  readonly disbursedMonth: string;
  readonly entities: SynthEntity[];
  readonly suppliers: Counterparty[];
  readonly customers: Counterparty[];
  readonly loan: SynthLoan;
}

const counterparties = (
  no: string,
  roles: readonly string[],
  names: (role: string) => string,
): [Counterparty[], SynthEntity[]] => {
  const list: Counterparty[] = [];
  const ents: SynthEntity[] = [];
  for (const role of roles) {
    const id = `B-${no}-${role}`;
    list.push({ id, accountId: `${id}-acc` });
    ents.push(...partyWithAccount(id, 'counterparty', names(role)));
  }
  return [list, ents];
};

/** The latest start month index that still leaves room for a loan's life inside the period. */
export const defaultMaxStart = (months: number): number =>
  Math.max(0, Math.min(Math.floor(months / 2) - 1, months - 8));

export function makeLoanBase(
  ctx: LoanContext,
  maxStartIndex = defaultMaxStart(ctx.horizon.months),
): LoanBase {
  const { rng, horizon } = ctx;
  const no = pad(ctx.n, 4);
  const month = addMonthsToMonth(horizon.startMonth, rng.int(0, maxStartIndex));
  const disbursedOn = `${month}-${pad(rng.int(1, 25), 2)}`;
  const amount = rng.amount(50_000_000, 500_000_000, 1_000_000);
  const tenor = rng.pick([12, 18, 24, 36] as const);
  const emi = roundTo(
    Math.floor(amount / tenor) + Math.floor((amount * 1200) / 120_000),
    MONEY_STEP,
  );
  const name = ctx.names.borrower();
  const [suppliers, supplierEnts] = counterparties(
    no,
    ['S1', 'S2'],
    (r) => `SYNTH Supplier ${no}-${r}`,
  );
  const [customers, customerEnts] = counterparties(
    no,
    ['C1', 'C2', 'C3'],
    (r) => `SYNTH Customer ${no}-${r}`,
  );
  const borrowerId = `B-${no}`;
  const loan: SynthLoan = {
    id: `L-${no}`,
    applicationId: null,
    borrowerId,
    product: rng.pick(['msme_term', 'msme_working_capital', 'agri_term'] as const),
    amountMinor: amount,
    disbursedAt: istInstant(disbursedOn, 10, 30),
    purpose: 'SYNTH test loan',
    monitoringDays: 90,
    accountEntityId: `${borrowerId}-acc`,
    dataSource: 'SYNTHETIC TEST DATA',
    lastUpdated: disbursedOn,
    branchId: 'br-synth',
    synthetic: true,
  };
  return {
    no,
    borrowerId,
    accountId: `${borrowerId}-acc`,
    loanId: loan.id,
    name,
    amount,
    tenor,
    emi,
    disbursedOn,
    disbursedMonth: month,
    entities: [...partyWithAccount(borrowerId, 'company', name), ...supplierEnts, ...customerEnts],
    suppliers,
    customers,
    loan,
  };
}

/** How many monthly EMIs fall due inside the period. */
export function emiCount(base: Pick<LoanBase, 'disbursedOn' | 'tenor'>, horizon: Horizon): number {
  let k = 0;
  while (k < base.tenor && addMonths(base.disbursedOn, k + 1) <= horizon.endDate) k++;
  return k;
}

export interface EmiOutcome {
  /** Days after the due date the EMI is paid; null = never paid. */
  readonly offsetDays: number | null;
  /** Share of the EMI that is paid, in percent. */
  readonly percent: number;
}

export interface LifePlan {
  /** Payments to suppliers just after disbursement: [percent of the loan, earliest day, latest day]. */
  readonly useOfFunds: readonly (readonly [number, number, number])[];
  emi(k: number): EmiOutcome;
  /** Customer receipts in loan month k, as a percent of normal. */
  revenuePercent(k: number): number;
}

const CHANNELS = ['neft', 'imps', 'upi', 'rtgs', 'cheque'] as const;

/** The disbursement, use of funds, monthly receipts, supplier payments and EMIs of one loan. */
export function lifeTransactions(base: LoanBase, ctx: LoanContext, plan: LifePlan): TxnFields[] {
  const { rng, horizon } = ctx;
  const out: TxnFields[] = [];
  const add = (
    date: string,
    from: string,
    to: string,
    amountMinor: number,
    type: SynthTransaction['type'],
    hm: readonly [number, number] = [rng.int(9, 16), rng.pick([0, 15, 30, 45])],
  ): void => {
    if (date > horizon.endDate || amountMinor <= 0) return;
    const id = `T-${base.no}-${pad(out.length + 1, 4)}`;
    out.push({
      id,
      loanId: base.loanId,
      at: istInstant(date, hm[0], hm[1]),
      fromId: from,
      toId: to,
      amountMinor,
      type,
    });
  };
  add(base.disbursedOn, BANK_ACCOUNT_ID, base.accountId, base.amount, 'disbursement', [10, 30]);
  plan.useOfFunds.forEach(([pct, from, to], i) => {
    const supplier = base.suppliers[i % base.suppliers.length];
    if (supplier)
      add(
        addDays(base.disbursedOn, rng.int(from, to)),
        base.accountId,
        supplier.accountId,
        roundTo(percent(base.amount, pct), MONEY_STEP),
        'rtgs',
      );
  });
  for (let k = 1; addMonths(base.disbursedOn, k - 1) <= horizon.endDate; k++) {
    const start = addMonths(base.disbursedOn, k - 1);
    const due = addMonths(base.disbursedOn, k);
    const revenue = percent(Math.floor((base.emi * rng.int(18, 26)) / 10), plan.revenuePercent(k));
    const receipts = rng.int(2, 3);
    for (let i = 0; i < receipts; i++) {
      const customer = base.customers[i % base.customers.length];
      if (customer)
        add(
          addDays(start, rng.int(2, 24)),
          customer.accountId,
          base.accountId,
          roundTo(Math.floor(revenue / receipts), MONEY_STEP),
          rng.pick(CHANNELS),
        );
    }
    const payments = rng.int(1, 2);
    for (let i = 0; i < payments; i++) {
      const supplier = base.suppliers[i % base.suppliers.length];
      if (supplier)
        add(
          addDays(start, rng.int(4, 26)),
          base.accountId,
          supplier.accountId,
          roundTo(Math.floor(percent(revenue, 35) / payments), MONEY_STEP),
          rng.pick(CHANNELS),
        );
    }
    const emi = plan.emi(k);
    if (k <= base.tenor && emi.offsetDays !== null)
      add(
        addDays(due, emi.offsetDays),
        base.accountId,
        BANK_ACCOUNT_ID,
        percent(base.emi, emi.percent),
        'repayment',
        [14, 0],
      );
  }
  return out;
}
