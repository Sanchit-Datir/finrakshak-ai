import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { readDemoConfig } from '../support/config.ts';
import { currentStatus, startRun, stopRun, subscribe } from './runs.ts';
import { DEMO_SCENARIOS } from './scenarios.ts';

/**
 * Demo launcher: a local page with one Start button per scenario. Run `npm run demo`, then open
 * http://localhost:4400. Listens on 127.0.0.1 only and accepts commands only from its own page.
 * Uses Node's built-in TypeScript support (Node 22.6+).
 */

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .default(4400)
  .parse(process.env['DEMO_LAUNCHER_PORT']);
const PAGE = fileURLToPath(new URL('./index.html', import.meta.url));
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINS = new Set([...HOSTS].map((h) => `http://${h}`));
const MAX_BODY = 16 * 1024;

const RunRequestSchema = z
  .object({
    scenario: z.enum(['1', '2', '3']),
    baseUrl: z.string().url().max(300),
    signIn: z.enum(['account', 'quick']),
    email: z.string().max(200),
    password: z.string().max(200),
    appCheckDebugToken: z.string().max(200),
    pace: z.enum(['slow', 'normal', 'fast']),
    captions: z.boolean(),
    ai: z.boolean(),
    record: z.boolean(),
    browser: z.enum(['chromium', 'chrome', 'msedge']),
    viewport: z.string().regex(/^(auto|\d{3,4}x\d{3,4})$/),
    holdSeconds: z.number().int().min(0).max(600),
  })
  .strict();
type RunRequest = z.infer<typeof RunRequestSchema>;

const onOff = (b: boolean): string => (b ? 'on' : 'off');

/** DEMO_* variables for the run. An empty password or token keeps the one from .env. */
function runEnv(r: RunRequest): Record<string, string> {
  return {
    DEMO_BASE_URL: r.baseUrl,
    DEMO_SIGN_IN: r.signIn,
    DEMO_EMAIL: r.email,
    ...(r.password === '' ? {} : { DEMO_PASSWORD: r.password }),
    ...(r.appCheckDebugToken === '' ? {} : { DEMO_APPCHECK_DEBUG_TOKEN: r.appCheckDebugToken }),
    DEMO_PACE: r.pace,
    DEMO_CAPTIONS: onOff(r.captions),
    DEMO_AI: onOff(r.ai),
    DEMO_RECORD: onOff(r.record),
    DEMO_BROWSER: r.browser,
    DEMO_VIEWPORT: r.viewport,
    DEMO_HOLD_SECONDS: String(r.holdSeconds),
  };
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > MAX_BODY) throw new Error('Request body too large');
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function defaults(): Record<string, unknown> {
  const c = readDemoConfig();
  return {
    baseUrl: c.DEMO_BASE_URL,
    signIn: c.DEMO_SIGN_IN,
    email: c.DEMO_EMAIL,
    hasPassword: c.DEMO_PASSWORD !== '',
    hasAppCheckDebugToken: c.DEMO_APPCHECK_DEBUG_TOKEN !== '',
    pace: c.DEMO_PACE,
    captions: c.DEMO_CAPTIONS,
    ai: c.DEMO_AI,
    record: c.DEMO_RECORD,
    browser: c.DEMO_BROWSER,
    viewport: c.DEMO_VIEWPORT,
    holdSeconds: c.DEMO_HOLD_SECONDS,
  };
}

async function handleRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Malformed or oversized bodies fail validation like any other bad input.
  const parsed = RunRequestSchema.safeParse(await readJson(req).catch(() => null));
  if (!parsed.success) {
    json(res, 400, { error: 'These settings are not valid. Check the settings panel.' });
    return;
  }
  const r = parsed.data;
  const scenario = DEMO_SCENARIOS.find((s) => s.id === r.scenario);
  if (scenario === undefined) {
    json(res, 404, { error: 'Unknown scenario.' });
    return;
  }
  if (r.signIn === 'account' && r.password === '' && readDemoConfig().DEMO_PASSWORD === '') {
    json(res, 400, {
      error: 'Enter the password, add DEMO_PASSWORD to e2e/demo/.env, or choose quick sign-in.',
    });
    return;
  }
  if (!startRun(scenario, runEnv(r))) {
    json(res, 409, { error: 'A scenario is already running. Stop it first.' });
    return;
  }
  json(res, 202, currentStatus());
}

/** Only this machine, and for commands only this page (no cross-site requests). */
function allowed(req: IncomingMessage): boolean {
  if (!HOSTS.has(req.headers.host ?? '')) return false;
  if (req.method === 'GET') return true;
  const type = req.headers['content-type'] ?? '';
  return ORIGINS.has(req.headers.origin ?? '') && type.startsWith('application/json');
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!allowed(req)) {
    json(res, 403, { error: 'Forbidden' });
    return;
  }
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  const key = `${req.method ?? 'GET'} ${path}`;
  if (key === 'GET /') {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
    });
    res.end(await readFile(PAGE));
  } else if (key === 'GET /api/config')
    json(res, 200, { scenarios: DEMO_SCENARIOS, defaults: defaults() });
  else if (key === 'GET /api/events') subscribe(res);
  else if (key === 'POST /api/run') await handleRun(req, res);
  else if (key === 'POST /api/stop') json(res, stopRun() ? 202 : 409, currentStatus());
  else json(res, 404, { error: 'Not found' });
}

/** Opens the launcher in the default browser; prints the address if that is not possible. */
function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const p = spawn(cmd, args, { stdio: 'ignore', detached: true });
  p.on('error', () => {
    process.stdout.write(`Open ${url} in your browser.\n`);
  });
  p.unref();
}

const server = createServer((req, res) => {
  route(req, res).catch((e: unknown) => {
    process.stderr.write(`Launcher error: ${e instanceof Error ? e.message : 'unknown'}\n`);
    if (!res.headersSent) json(res, 500, { error: 'Something went wrong. See the terminal.' });
    else res.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  process.stdout.write(`FundTrace demo launcher: ${url}  (Ctrl+C to quit)\n`);
  if (!process.argv.includes('--no-open')) openInBrowser(url);
});

process.on('SIGINT', () => {
  stopRun();
  server.close();
  process.exit(0);
});
