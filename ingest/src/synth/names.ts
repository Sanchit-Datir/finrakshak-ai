import type { Rng } from './rng.js';

/**
 * Fictional organisation names. Every one starts with "SYNTH " (B-54) so none can equal a real company
 * in the public-records graph, which matches on exact names.
 */

const FIRST = [
  'Kasturi',
  'Sahyadri',
  'Navjeevan',
  'Harsha',
  'Bhavani',
  'Mauli',
  'Ganga',
  'Shivneri',
  'Sakal',
  'Varada',
  'Anand',
  'Pragati',
  'Suryoday',
  'Malhar',
  'Tejas',
  'Utkarsh',
  'Vitthal',
  'Rajgad',
  'Konkan',
  'Deccan',
  'Godavari',
  'Krishna',
  'Purna',
  'Indrayani',
] as const;
const SECOND = [
  'Agro',
  'Steel',
  'Traders',
  'Textiles',
  'Logistics',
  'Foods',
  'Polymers',
  'Infra',
  'Plastics',
  'Engineering',
  'Dairy',
  'Cement',
  'Fabricators',
  'Seeds',
  'Packaging',
  'Motors',
  'Chemicals',
  'Cold Storage',
  'Oils',
  'Timber',
] as const;
const SUFFIX = ['Pvt Ltd', 'Ltd'] as const;

/** Hands out unique names in a seeded order; after the pool runs out it adds a number. */
export class NameBook {
  private readonly pool: string[];
  private next = 0;

  constructor(rng: Rng) {
    const all = FIRST.flatMap((a) => SECOND.flatMap((b) => SUFFIX.map((s) => `${a} ${b} ${s}`)));
    this.pool = rng.shuffle(all);
  }

  /** The next borrower name, e.g. "SYNTH Mauli Agro Pvt Ltd", then "SYNTH Mauli Agro Pvt Ltd 2" on a repeat. */
  borrower(): string {
    const lap = Math.floor(this.next / this.pool.length);
    const base = this.pool[this.next % this.pool.length] ?? 'Unnamed Pvt Ltd';
    this.next++;
    return `SYNTH ${base}${lap > 0 ? ` ${lap + 1}` : ''}`;
  }
}

/** A counterparty name made unique by the loan number and role, e.g. "SYNTH Supplier 0007-S1". */
export const counterpartyName = (loanNo: string, role: string): string =>
  `SYNTH ${role.startsWith('C') ? 'Customer' : role.startsWith('S') ? 'Supplier' : 'Related party'} ${loanNo}-${role}`;
