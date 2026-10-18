import { spawn, type ChildProcess } from 'node:child_process';
import type { ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { DemoScenario } from './scenarios.ts';

/**
 * One demo run at a time: starts `playwright test` for a scenario, keeps its output, and streams
 * output and status to every open launcher page (server-sent events).
 */

export type RunState = 'idle' | 'running' | 'passed' | 'failed' | 'stopped';

export interface RunStatus {
  readonly state: RunState;
  readonly scenario: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

const E2E_DIR = fileURLToPath(new URL('../../', import.meta.url));
const CONFIG = fileURLToPath(new URL('../playwright.config.ts', import.meta.url));
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve('@playwright/test/cli');
const MAX_LINES = 2000;
// Colour codes, in case a tool ignores NO_COLOR.
const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');

const clients = new Set<ServerResponse>();
let child: ChildProcess | null = null;
let stopping = false;
let status: RunStatus = { state: 'idle', scenario: null, startedAt: null, finishedAt: null };
let lines: string[] = [];

function send(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event: string, data: unknown): void {
  for (const c of clients) send(c, event, data);
}

function setStatus(next: RunStatus): void {
  status = next;
  broadcast('status', status);
}

function append(fresh: readonly string[]): void {
  if (fresh.length === 0) return;
  lines = [...lines, ...fresh].slice(-MAX_LINES);
  broadcast('log', fresh);
}

/** Splits a stream into whole lines (a chunk can end mid-line). */
function lineReader(): { push: (chunk: Buffer) => void; flush: () => void } {
  let carry = '';
  return {
    push: (chunk) => {
      const parts = (carry + chunk.toString('utf8')).replace(ANSI, '').split(/\r?\n/);
      carry = parts.pop() ?? '';
      append(parts);
    },
    flush: () => {
      if (carry !== '') append([carry]);
      carry = '';
    },
  };
}

export function subscribe(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  send(res, 'status', status);
  send(res, 'log', lines);
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

export function currentStatus(): RunStatus {
  return status;
}

/** Starts a run; false when one is already running. `env` holds the DEMO_* settings. */
export function startRun(scenario: DemoScenario, env: Readonly<Record<string, string>>): boolean {
  if (child !== null) return false;
  lines = [];
  broadcast('reset', null);
  stopping = false;
  setStatus({
    state: 'running',
    scenario: scenario.id,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });
  const proc = spawn(process.execPath, [PLAYWRIGHT_CLI, 'test', '-c', CONFIG, scenario.file], {
    cwd: E2E_DIR,
    // Plain text for the log page. (NO_COLOR is not used: Playwright sets FORCE_COLOR for its
    // workers, and Node warns when both are set.)
    env: { ...process.env, ...env, FORCE_COLOR: '0' },
  });
  child = proc;
  const out = lineReader();
  const err = lineReader();
  proc.stdout.on('data', out.push);
  proc.stderr.on('data', err.push);
  proc.on('error', (e) => {
    append([`Could not start Playwright: ${e.message}`]);
  });
  proc.on('close', (code) => {
    out.flush();
    err.flush();
    child = null;
    const state: RunState = stopping ? 'stopped' : code === 0 ? 'passed' : 'failed';
    setStatus({ ...status, state, finishedAt: new Date().toISOString() });
  });
  return true;
}

/** Stops the running scenario (Playwright closes its browser); false when nothing runs. */
export function stopRun(): boolean {
  if (child === null) return false;
  stopping = true;
  append(['Stopping…']);
  child.kill('SIGTERM');
  return true;
}
