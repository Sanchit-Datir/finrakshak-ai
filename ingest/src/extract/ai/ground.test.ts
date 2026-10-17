import { describe, expect, it } from 'vitest';
import { classify } from '../../dataset/classify.js';
import { DOC_URL, listingItem, SHA } from '../../test/aiFixtures.js';
import { RUN_AT } from '../../test/fixtures.js';
import { toInrMinor } from '../patterns.js';
import { ground, type GroundingInput } from './ground.js';
import { AiExtractionRecordSchema, type ModelExtraction } from './schema.js';

const PAGES = [
  'ORDER\nIn the matter of M/s Example Finance  Limited (CIN: L65910MH1990PLC012345)\n' +
    'and Shri Ramesh Kumar, director. Assets worth Rs. 62.70 crore were provisionally attached.',
  'Lender: State Bank of India. A further Rs. 5,00,000 was frozen. Fee noted: Rs. 0.001.',
];
const INPUT: GroundingInput = {
  sha256: SHA,
  item: listingItem(),
  url: DOC_URL,
  pages: PAGES,
  model: 'gemini-test',
  promptVersion: 'extract.v1',
  extractedAt: RUN_AT,
};

type Org = ModelExtraction['organisations'][number];
type Amount = ModelExtraction['amounts'][number];
const org = (name: string, cin: string | null = null): Org => ({
  name,
  cin,
  role: 'subject_of_action',
  page: 1,
});
const amount = (amount_text: string): Amount => ({ amount_text, about: 'attached', page: 1 });

function extraction(over: Partial<ModelExtraction> = {}): ModelExtraction {
  return {
    organisations: [],
    amounts: [],
    dates: [],
    case_type: 'attachment',
    summary: 'ED attached assets.',
    ...over,
  };
}

const NO_DROPS = { ungrounded: 0, not_organisation: 0, unparsed_amount: 0 };

describe('ground (B-52)', () => {
  it('keeps an organisation printed in the text (case and spacing aside) with its printed CIN', () => {
    const out = ground(
      extraction({ organisations: [org('EXAMPLE FINANCE LIMITED', 'L65910MH1990PLC012345')] }),
      INPUT,
    );
    expect(out.rows.filter((r) => r.kind === 'organisation')).toEqual([
      expect.objectContaining({
        name: 'EXAMPLE FINANCE LIMITED',
        cin: 'L65910MH1990PLC012345',
        role: 'subject_of_action',
        page: 1,
      }),
    ]);
    expect(out.dropped).toEqual(NO_DROPS);
  });

  it('drops organisations the text does not contain, and individuals even when printed (B-38)', () => {
    const out = ground(
      extraction({ organisations: [org('Imaginary Holdings Limited'), org('Ramesh Kumar')] }),
      INPUT,
    );
    expect(out.rows.map((r) => r.kind)).toEqual(['case_type']);
    expect(out.dropped).toEqual({ ...NO_DROPS, ungrounded: 1, not_organisation: 1 });
  });

  it('keeps the organisation but not a CIN that is not printed in the text', () => {
    const out = ground(
      extraction({ organisations: [org('State Bank of India', 'U65910MH2000PLC999999')] }),
      INPUT,
    );
    expect(out.rows[0]).toMatchObject({
      kind: 'organisation',
      name: 'State Bank of India',
      cin: null,
    });
    expect(out.dropped.ungrounded).toBe(1);
  });

  it('converts grounded amounts to integer paise by code, keeping the printed text (B-01)', () => {
    const out = ground(
      extraction({ amounts: [amount('Rs. 62.70 crore'), amount('Rs. 5,00,000')] }),
      INPUT,
    );
    const rows = out.rows.filter((r) => r.kind === 'amount');
    expect(rows.map((r) => [r.amount_text, r.amount])).toEqual([
      ['Rs. 62.70 crore', { minor: 62_700_000_000, currency: 'INR' }],
      ['Rs. 5,00,000', { minor: 50_000_000, currency: 'INR' }],
    ]);
    expect(rows[0]?.amount).toEqual(toInrMinor('62.70', 'crore'));
    expect(rows.every((r) => Number.isSafeInteger(r.amount?.minor))).toBe(true);
    expect(out.dropped).toEqual(NO_DROPS);
  });

  it('drops amounts not in the text, and counts printed text it cannot convert (B-05)', () => {
    const out = ground(
      extraction({
        amounts: [amount('Rs. 99 crore'), amount('62.70 crore'), amount('Rs. 0.001')],
      }),
      INPUT,
    );
    expect(out.rows.filter((r) => r.kind === 'amount')).toEqual([]);
    expect(out.dropped).toEqual({ ...NO_DROPS, ungrounded: 1, unparsed_amount: 2 });
  });

  it('rejects an amount quoted without its unit (regression: "Rs. 62.70" of "Rs. 62.70 crore")', () => {
    const out = ground(extraction({ amounts: [amount('Rs. 62.70'), amount('Rs. 5,00')] }), INPUT);
    expect(out.rows.filter((r) => r.kind === 'amount')).toEqual([]);
    expect(out.dropped).toEqual({ ...NO_DROPS, ungrounded: 2 });
  });

  it('takes evidence status from the source classification, never the model (B-36)', () => {
    const ed = ground(extraction({ organisations: [org('Example Finance Limited')] }), INPUT);
    expect(classify(INPUT.item).evidence_status).toBe('allegation');
    expect(ed.rows.map((r) => r.evidence_status)).toEqual(['allegation', 'allegation']);

    const settled = listingItem({ source_id: 'sebi', collection: 'sebi.settlement_orders' });
    const sebi = ground(extraction(), { ...INPUT, item: settled });
    expect(sebi.rows.map((r) => r.evidence_status)).toEqual(['fact']);
  });

  it('adds date rows and one case-type row, and carries the document metadata', () => {
    const out = ground(
      extraction({ dates: [{ date: '2026-10-01', what: 'attachment order', page: 2 }] }),
      INPUT,
    );
    expect(out.rows.map((r) => [r.kind, r.date, r.about, r.page])).toEqual([
      ['date', '2026-10-01', 'attachment order', 2],
      ['case_type', null, 'attachment', null],
    ]);
    expect(out).toMatchObject({
      sha256: SHA,
      source_id: 'ed',
      item_id: 'ed_1',
      document_url: DOC_URL,
      model: 'gemini-test',
      prompt_version: 'extract.v1',
      extracted_at: RUN_AT,
      case_type: 'attachment',
      summary: 'ED attached assets.',
    });
  });

  it('gives claims deterministic ids (B-24) that change with the prompt version', () => {
    const model = extraction({
      organisations: [org('Example Finance Limited')],
      amounts: [amount('Rs. 62.70 crore')],
    });
    const ids = (input: GroundingInput): string[] =>
      ground(model, input).rows.map((r) => r.claim_id);
    const first = ids(INPUT);
    expect(ids(INPUT)).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
    expect(ids({ ...INPUT, promptVersion: 'extract.v2' }).some((id) => first.includes(id))).toBe(
      false,
    );
  });

  it('produces a record that passes the stored schema', () => {
    const out = ground(
      extraction({
        organisations: [org('Example Finance Limited', 'L65910MH1990PLC012345')],
        amounts: [amount('Rs. 62.70 crore')],
        dates: [{ date: '2026-10-01', what: 'order', page: null }],
      }),
      INPUT,
    );
    expect(AiExtractionRecordSchema.parse(out)).toEqual(out);
  });
});
