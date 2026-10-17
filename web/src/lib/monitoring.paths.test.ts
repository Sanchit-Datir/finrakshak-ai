import { describe, expect, it } from 'vitest';
import { linkedEntities, runMonitoring } from './monitoring.js';
import {
  BIG_LOAN,
  DAY,
  entity,
  loan,
  party,
  rel,
  txn,
  world,
  singleLoan,
} from './monitoring-world.js';

/**
 * Characterisation tests for the two rules that follow paths: circular transfers (funds out and back
 * to the borrower's account) and linked counterparties (payments to someone within two
 * relationship hops). All parties are fictional.
 */

describe('circular (back to the borrower within 30 days, at least 50% returned)', () => {
  const OUT = 40_000_000;
  const cycle = (back: number, backOffset: number): ReturnType<typeof runMonitoring> =>
    runMonitoring(
      singleLoan([
        txn('T1', 'B-acc', 'X-acc', OUT, DAY),
        txn('T2', 'X-acc', 'B-acc', back, backOffset),
      ]),
    );

  it('fires at exactly 50% returned and is urgent, with both legs traceable', () => {
    const [alert, ...rest] = cycle(OUT / 2, 2 * DAY);
    expect(rest).toEqual([]);
    expect(alert?.ruleId).toBe('circular');
    expect(alert?.priority).toBe('urgent');
    expect(alert?.transactionIds).toEqual(['T1', 'T2']);
    expect(alert?.totalMinor).toBe(OUT);
    expect(alert?.id).toBe('mon:circular:L1:T1');
  });
  it('does not fire one minor unit below 50%', () => {
    expect(cycle(OUT / 2 - 1, 2 * DAY)).toEqual([]);
  });
  it('includes a return exactly 30 days after disbursement, not 1 ms later', () => {
    expect(cycle(OUT, 30 * DAY)).toHaveLength(1);
    expect(cycle(OUT, 30 * DAY + 1)).toEqual([]);
  });
  it('needs the return to come after the outflow', () => {
    const db = singleLoan([
      txn('T1', 'X-acc', 'B-acc', OUT, DAY),
      txn('T2', 'B-acc', 'X-acc', OUT, 2 * DAY),
    ]);
    expect(runMonitoring(db)).toEqual([]);
  });
  it('does not fire when nothing comes back', () => {
    expect(runMonitoring(singleLoan([txn('T1', 'B-acc', 'X-acc', OUT, DAY)]))).toEqual([]);
  });

  const chain = (ids: string[]): ReturnType<typeof runMonitoring> => {
    const nodes = ['B-acc', ...ids.map((i) => `${i}-acc`), 'B-acc'];
    const legs = nodes
      .slice(0, -1)
      .map((from, i) => txn(`T${i + 1}`, from, nodes[i + 1] ?? 'B-acc', OUT, (i + 1) * DAY));
    return runMonitoring(singleLoan(legs));
  };

  it('follows a four-transfer loop (out through three parties and back)', () => {
    expect(chain(['X', 'Y', 'Z']).map((a) => a.ruleId)).toEqual(['circular']);
  });
  it('does not follow a five-transfer loop', () => {
    const db = world({
      entities: ['B', 'X', 'Y', 'Z', 'W'].flatMap((id) => party(id)),
      loans: [loan('L1', 'B', BIG_LOAN)],
      transactions: ['B', 'X', 'Y', 'Z', 'W', 'B']
        .slice(0, 5)
        .map((from, i, all) =>
          txn(`T${i + 1}`, `${from}-acc`, `${all[i + 1] ?? 'B'}-acc`, OUT, (i + 1) * DAY),
        ),
    });
    expect(runMonitoring(db).filter((a) => a.ruleId === 'circular')).toEqual([]);
  });
});

describe('linked_counterparty (payment within two relationship hops of the borrower)', () => {
  const entities = ['B', 'C', 'P', 'Q'].flatMap((id) =>
    party(id, id === 'B' ? 'company' : 'counterparty'),
  );
  const pay = [txn('T1', 'B-acc', 'C-acc', 2_000_000, DAY)];
  const run = (
    relationships: ReturnType<typeof rel>[],
    transactions = pay,
  ): ReturnType<typeof runMonitoring> =>
    runMonitoring(
      world({ entities, loans: [loan('L1', 'B', BIG_LOAN)], transactions, relationships }),
    );

  it('fires for one hop, in either direction of the relationship', () => {
    for (const r of [
      rel('R1', 'B', 'C', 'shares_address'),
      rel('R1', 'C', 'B', 'shares_address'),
    ]) {
      const [alert, ...rest] = run([r]);
      expect(rest).toEqual([]);
      expect(alert?.ruleId).toBe('linked_counterparty');
      expect(alert?.id).toBe('mon:linked_counterparty:L1:C');
      expect(alert?.explanation).toContain('1 recorded relationship(s)');
      expect(alert?.totalMinor).toBe(2_000_000);
    }
  });
  it('fires for two hops and not for three', () => {
    const twoHops = [rel('R1', 'B', 'P', 'director_of'), rel('R2', 'P', 'C', 'owner_of')];
    expect(run(twoHops)[0]?.explanation).toContain('2 recorded relationship(s)');
    const threeHops = [
      rel('R1', 'B', 'P', 'director_of'),
      rel('R2', 'P', 'Q', 'owner_of'),
      rel('R3', 'Q', 'C', 'owner_of'),
    ];
    expect(run(threeHops)).toEqual([]);
  });
  it('only follows director_of, owner_of, guarantor_for and shares_address', () => {
    expect(run([rel('R1', 'B', 'C', 'same_proceeding')])).toEqual([]);
    expect(run([rel('R1', 'B', 'C', 'account_of')])).toEqual([]);
    for (const type of ['director_of', 'owner_of', 'guarantor_for', 'shares_address'] as const)
      expect(run([rel('R1', 'B', 'C', type)])).toHaveLength(1);
  });
  it('says so when the link is only inferred', () => {
    expect(run([rel('R1', 'B', 'C', 'shares_address', 'inferred')])[0]?.explanation).toContain(
      'inferred (unverified) link',
    );
  });
  it('ignores payments to the borrower’s own other account', () => {
    const db = world({
      entities: [...entities, entity('B-acc2', 'account', 'SYNTH B second account', 'B')],
      loans: [loan('L1', 'B', BIG_LOAN)],
      transactions: [txn('T1', 'B-acc', 'B-acc2', 2_000_000, DAY)],
      relationships: [rel('R1', 'B', 'C', 'shares_address')],
    });
    expect(runMonitoring(db)).toEqual([]);
  });
  it('adds several payments to one linked entity into a single alert', () => {
    const two = [
      txn('T1', 'B-acc', 'C-acc', 2_000_000, DAY),
      txn('T2', 'B-acc', 'C-acc', 3_000_000, 2 * DAY),
    ];
    const alerts = run([rel('R1', 'B', 'C', 'shares_address')], two);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.transactionIds).toEqual(['T1', 'T2']);
    expect(alerts[0]?.totalMinor).toBe(5_000_000);
  });
  it('does not alert on a payment to an entity with no link at all', () => {
    expect(run([])).toEqual([]);
  });
});

describe('linkedEntities', () => {
  it('lists neighbours across link types in both directions and skips other types', () => {
    const rels = [
      rel('R1', 'B', 'P', 'director_of'),
      rel('R2', 'Q', 'B', 'guarantor_for'),
      rel('R3', 'B', 'C', 'account_of'),
    ];
    expect(linkedEntities('B', rels).map((l) => l.entityId)).toEqual(['P', 'Q']);
  });
});
