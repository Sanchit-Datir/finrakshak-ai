import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { readDemoConfig, viewportSize } from './support/config.js';

/**
 * Demo-video runs: a visible browser against the deployed app (DEMO_BASE_URL), one scenario at a
 * time, no retries and no web server. Settings come from DEMO_* variables; `e2e/demo/.env`
 * (git-ignored) fills in any that are not already set. See e2e/demo/README.md.
 */
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const demo = readDemoConfig();
const recordSize = { width: 1920, height: 1080 };
const fixed = viewportSize(demo.DEMO_VIEWPORT);
// A recording needs a fixed page size; a headless run has no window to fill.
const viewport =
  fixed ??
  (demo.DEMO_RECORD ? recordSize : demo.DEMO_HEADLESS ? { width: 1440, height: 900 } : null);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

export default defineConfig({
  testDir: './scenarios',
  testMatch: '*.demo.ts',
  // A new folder per run: Playwright empties its output folder, which would delete older videos.
  outputDir: `./recordings/${stamp}`,
  timeout: 20 * 60_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: demo.DEMO_BASE_URL,
    headless: demo.DEMO_HEADLESS,
    ...(demo.DEMO_BROWSER === 'chromium' ? {} : { channel: demo.DEMO_BROWSER }),
    viewport,
    video: demo.DEMO_RECORD ? { mode: 'on', size: viewport ?? recordSize } : 'off',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'off',
    screenshot: 'off',
    launchOptions: {
      // Maximised window; and no "controlled by automated software" bar or navigator.webdriver
      // flag, which also makes reCAPTCHA (App Check) less likely to refuse the sign-in.
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    },
  },
});
