import type {
  SynthEntity,
  SynthLoan,
  SynthRelationship,
  SynthTransaction,
} from '@finrakshak-ai/shared';
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

export interface LoanOptions {
  /** Latest start month index; the default leaves room for the loan's life inside the period. */
  readonly maxStartIndex?: number;
  /** Fixes the disbursement day (the day is still drawn, so other draws do not shift). */
  readonly disbursedOn?: string;
  /** Smallest loan amount in paise. */
  readonly minAmount?: number;
}

export function makeLoanBase(ctx: LoanContext, opts: LoanOptions = {}): LoanBase {
  const { rng, horizon } = ctx;
  const no = pad(ctx.n, 4);
  const drawnMonth = addMonthsToMonth(
    horizon.startMonth,
    rng.int(0, opts.maxStartIndex ?? defaultMaxStart(horizon.months)),
  );
  const drawnDay = `${drawnMonth}-${pad(rng.int(1, 25), 2)}`;
  const disbursedOn = opts.disbursedOn ?? drawnDay;
  const month = disbursedOn.slice(0, 7);
  const amount = rng.amount(Math.max(50_000_000, opts.minAmount ?? 0), 500_000_000, 1_000_000);
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
  /** Receipts per month (default: 2 or 3 at random). */
  receiptCount?(k: number): number;
  /** Payments to suppliers per month (default: 1 or 2 at random). */
  paymentCount?(k: number): number;
  /** Each customer's share of the monthly receipts, in percent; one receipt per customer. */
  readonly customerShares?: readonly number[];
  /** False when customer `i` (0 = the first) does not pay in loan month k. */
  receiptFrom?(k: number, i: number): boolean;
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
    const shares = plan.customerShares;
    const receipts = shares?.length ?? plan.receiptCount?.(k) ?? rng.int(2, 3);
    for (let i = 0; i < receipts; i++) {
      const customer = base.customers[i % base.customers.length];
      if (customer === undefined || plan.receiptFrom?.(k, i) === false) continue;
      const share =
        shares === undefined ? Math.floor(revenue / receipts) : percent(revenue, shares[i] ?? 0);
      add(
        addDays(start, rng.int(2, 24)),
        customer.accountId,
        base.accountId,
        roundTo(share, MONEY_STEP),
        rng.pick(CHANNELS),
      );
    }
    const payments = plan.paymentCount?.(k) ?? rng.int(1, 2);
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

export interface HealthyOverrides {
  readonly useOfFunds?: LifePlan['useOfFunds'];
  readonly emi?: LifePlan['emi'];
  readonly revenuePercent?: LifePlan['revenuePercent'];
  readonly receiptCount?: (k: number) => number;
  readonly paymentCount?: (k: number) => number;
}

/** A healthy borrower's plan: EMIs 0–2 days after the due date, normal receipts, two supplier payments up front. */
export function healthyPlan(ctx: LoanContext, over: HealthyOverrides = {}): LifePlan {
  const jitter = Array.from({ length: 40 }, () => ctx.rng.int(0, 2));
  const useOfFunds: LifePlan['useOfFunds'] = over.useOfFunds ?? [
    [ctx.rng.int(40, 55), 5, 15],
    [ctx.rng.int(15, 25), 20, 40],
  ];
  return {
    useOfFunds,
    emi: over.emi ?? ((k) => ({ offsetDays: jitter[k - 1] ?? 0, percent: 100 })),
    revenuePercent: over.revenuePercent ?? ((): number => 100),
    ...(over.receiptCount === undefined ? {} : { receiptCount: over.receiptCount }),
    ...(over.paymentCount === undefined ? {} : { paymentCount: over.paymentCount }),
  };
}

/** A single transaction outside the monthly life, with an id of its own kind (e.g. `X1`, `P1`). */
export function extraTxn(
  base: LoanBase,
  tag: string,
  date: string,
  from: string,
  to: string,
  amountMinor: number,
  type: SynthTransaction['type'],
  hm: readonly [number, number] = [11, 0],
): TxnFields {
  return {
    id: `T-${base.no}-${tag}`,
    loanId: base.loanId,
    at: istInstant(date, hm[0], hm[1]),
    fromId: from,
    toId: to,
    amountMinor,
    type,
  };
}

/** A relationship in the web app's shape, marked synthetic. */
export function synthRelationship(
  id: string,
  from: string,
  to: string,
  type: SynthRelationship['type'],
  observedAt: string,
): SynthRelationship {
  return {
    id,
    from,
    to,
    type,
    status: 'verified',
    source: 'SYNTH test',
    observedAt,
    evidence: 'SYNTH test',
    synthetic: true,
  };
}
