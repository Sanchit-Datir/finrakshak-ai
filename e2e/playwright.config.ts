import { defineConfig, devices } from '@playwright/test';

/**
 * Browser scenarios against the built web app (vite preview on :4173). The server is started
 * here unless one is already running. Scenarios that use public records need the graph published
 * first: `node ingest/dist/graphCli.js --web`.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      'npm run build -w @finrakshak-ai/shared && npm run build -w web && npm exec -w web -- vite preview --port 4173 --strictPort',
    cwd: '..',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
