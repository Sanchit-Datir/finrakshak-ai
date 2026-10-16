import { describe, expect, it } from 'vitest';
import { isAllowed, looksLikeRobots, parseRobots } from '../http/robots.js';
import { parseDate } from './dates.js';
import { parseTable } from './htmlTable.js';
import { absoluteUrl, stableId } from './ids.js';

describe('parseDate (B-27)', () => {
  it.each([
    ['31/01/2025', '2025-01-31'],
    ['15-10-2026', '2026-10-15'],
    ['12.10.2026', '2026-10-12'],
    ['Oct 13, 2026', '2026-10-13'],
    ['Sept 1, 2024', '2024-09-01'],
    ['14th October 2026', '2026-10-14'],
    ['2026-10-15T00:00:00', '2026-10-15'],
  ])('%s → %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
  it('rejects impossible or empty dates', () => {
    expect(parseDate('31/02/2025')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('robots', () => {
  const rules = parseRobots(
    'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /js',
  );
  it('applies longest-match precedence', () => {
    expect(isAllowed(rules, '/wp-admin/x')).toBe(false);
    expect(isAllowed(rules, '/wp-admin/admin-ajax.php')).toBe(true);
    expect(isAllowed(rules, '/orders/')).toBe(true);
    expect(isAllowed(rules, '/js/app.js')).toBe(false);
  });
  it('treats Disallow: / as blocking everything', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow: /'), '/catalog')).toBe(false);
  });
  it('ignores groups for other bots and HTML error pages', () => {
    expect(isAllowed(parseRobots('User-agent: Googlebot\nDisallow: /'), '/x')).toBe(true);
    expect(looksLikeRobots('<html><title>Error</title></html>')).toBe(false);
  });
});

describe('ids', () => {
  it('is deterministic', () => {
    expect(stableId('x', 'a')).toBe(stableId('x', 'a'));
    expect(stableId('x', 'a')).not.toBe(stableId('x', 'b'));
  });
  it('resolves hrefs and rejects javascript links', () => {
    expect(absoluteUrl('/a b.pdf', 'https://h.gov.in/x/')).toBe('https://h.gov.in/a%20b.pdf');
    expect(absoluteUrl('javascript:void(0)', 'https://h.gov.in/')).toBeNull();
  });
});

describe('parseTable', () => {
  it('keys cells by header and collects links incl. onclick URLs', () => {
    const html = `<table><tr><th>Title</th><th>Date</th><th>File</th></tr>
      <tr><td>Order A</td><td>31/01/2025</td><td><a href="/a.pdf">View</a>
      <a href="javascript:void(0)" onclick="newwindow1(' https://x.gov.in/b.pdf');">B</a></td></tr></table>`;
    const rows = parseTable(html, 'https://nfra.gov.in/');
    expect(rows).toEqual([
      {
        cells: { title: 'Order A', date: '31/01/2025', file: 'View B' },
        links: ['https://nfra.gov.in/a.pdf', 'https://x.gov.in/b.pdf'],
      },
    ]);
  });
  it('returns no rows for an empty table', () => {
    expect(parseTable('<table><tr><th>T</th></tr></table>', 'https://a.in/')).toEqual([]);
  });
});
