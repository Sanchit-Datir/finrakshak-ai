import { describe, expect, it } from 'vitest';
import { downloadPriority, matchSeeds, selectForDownload } from '../select/relevance.js';
import { parseRbiRows } from './rbi.js';
import { SOURCE_REGISTRY } from './registry.js';
import { parseSebiRows } from './sebi.js';

const RUN = '2026-10-16T00:00:00.000Z';

describe('parseSebiRows', () => {
  it('reads date, title, link and SAT appeal references', () => {
    const html = `<table><tr role='row'><td>Sep 12, 2019</td><td><a href='https://www.sebi.gov.in/enforcement/orders/sep-2019/order-x_1.html'
      title="Order X<span style='color:#007ffc;'>[SAT Appeal No.:</span><a href='http://sat.gov.in/a.PDF'><em class='fa'></em>28/2020]</a>">Adjudication order in the matter of ABC Limited</a></td></tr></table>`;
    const [item] = parseSebiRows(html, 'sebi.orders.orders_of_ao', RUN);
    expect(item?.published_date).toBe('2019-09-12');
    expect(item?.title).toBe('Adjudication order in the matter of ABC Limited');
    expect(item?.fields['sat_appeal']).toBe('28/2020');
  });
});

describe('parseRbiRows', () => {
  it('assigns the preceding date header to each release', () => {
    const html = `<table class="tablebg"><tr><td>Oct 16, 2026</td></tr>
      <tr><td><a href="BS_PressReleaseDisplay.aspx?prid=1">RBI imposes monetary penalty on ABC Bank</a></td>
      <td><a href="https://rbidocs.rbi.org.in/x.PDF">pdf</a></td></tr></table>`;
    const [item] = parseRbiRows(html, RUN);
    expect(item?.published_date).toBe('2026-10-16');
    expect(item?.fields['prid']).toBe('1');
    expect(item?.document_urls).toEqual(['https://rbidocs.rbi.org.in/x.PDF']);
  });
});

describe('relevance', () => {
  it('matches seed aliases (acronyms case-sensitively)', () => {
    expect(matchSeeds('Order in the matter of Dewan Housing Finance Corporation Limited')).toEqual([
      { case_id: 'dhfl', alias: 'Dewan Housing Finance' },
    ]);
    expect(matchSeeds('dhflx and ilfs-like text')).toEqual([]);
  });
  it('prioritises seeded and fund-diversion items; skips unrelated RBI releases', () => {
    const base = {
      source_id: 'sebi' as const,
      collection: 'c',
      detail_url: null,
      document_urls: [],
      fields: {},
      listed_at: RUN,
    };
    const seeded = {
      ...base,
      item_id: 'a',
      title: 'Order in the matter of Gensol Engineering Ltd',
      published_date: '2025-01-01',
    };
    const diversion = {
      ...base,
      item_id: 'b',
      title: 'Order regarding diversion of funds by XYZ Ltd',
      published_date: '2026-01-01',
    };
    const other = {
      ...base,
      item_id: 'c',
      title: 'Order in the matter of trading in illiquid options',
      published_date: '2026-02-01',
    };
    expect(selectForDownload('sebi', [other, diversion, seeded], 10).map((i) => i.item_id)).toEqual(
      ['a', 'b'],
    );
    expect(
      downloadPriority('rbi', { ...other, source_id: 'rbi', title: 'Money Market Operations' }),
    ).toBeNull();
  });
});

describe('SOURCE_REGISTRY', () => {
  it('covers every brief source exactly once', () => {
    const ids = SOURCE_REGISTRY.map((s) => s.source_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(10);
  });
});
