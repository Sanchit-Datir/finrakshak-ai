import { expect, test } from '@playwright/test';

/** Security checks against the built app (see SECURITY.md). */

test('sends the Content-Security-Policy and security headers', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['permissions-policy']).toContain('camera=()');
});

test('an uploaded bundle cannot inject a javascript: link', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs += 1;
    void d.dismiss();
  });
  const node = {
    sources: ['test'],
    date: null,
    document_id: null,
    evidence_status: null,
    adverse_events: 0,
    seed_cases: [],
    hub: false,
    hub_roles: [],
    degree: 1,
  };
  const bundle = {
    meta: {
      generated_at: '2026-10-16T00:00:00Z',
      synthetic: true,
      label: 'SYNTH malicious bundle',
      dataset_built_at: null,
      thresholds: {},
      counts: {},
      notes: [],
    },
    nodes: [
      { ...node, id: 'a', kind: 'company', label: 'SYNTH Victim Pvt Ltd', detail: null },
      { ...node, id: 'b', kind: 'company', label: 'SYNTH Other Pvt Ltd', detail: null },
      {
        ...node,
        id: 'e',
        kind: 'event',
        label: 'SYNTH order',
        detail: 'X · final order · sebi_final_order',
        document_id: 'd1',
      },
    ],
    edges: ['a', 'b'].map((from) => ({
      id: `x-${from}`,
      from,
      to: 'e',
      type: 'named_in',
      basis: 'established',
      strength: 'strong',
      evidence_status: 'fact',
      source_id: 'test',
      date: null,
      document_id: 'd1',
      relationship_id: null,
      confidence: 1,
    })),
    documents: [
      {
        id: 'd1',
        url: 'javascript:alert(document.domain)',
        title: 'Malicious link',
        date: null,
        source_id: 'test',
      },
    ],
    networks: [
      {
        id: 'n',
        node_ids: ['a', 'b', 'e'],
        organisation_count: 2,
        adverse_organisation_count: 0,
        sources: ['test'],
        seed_cases: [],
        score: 1,
        summary: 'test',
      },
    ],
    identity: [],
  };
  await page.goto('/login');
  await page.getByRole('button', { name: /Continue with demo sign-in/ }).click();
  await page.waitForURL(/dashboard/);
  await page.goto('/graph-lab');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'evil.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page.getByText('SYNTHETIC TEST DATA').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/TEST · fact/).first()).toBeVisible();
  expect(await page.locator('a[href^="javascript" i]').count()).toBe(0);
  expect(dialogs).toBe(0);
});
