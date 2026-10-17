#!/usr/bin/env node
import { errorMessage, log } from '../log.js';
import { runAcquireTask } from './acquireTask.js';
import { runBuildTask } from './buildTask.js';
import { makeDeps, type CloudDeps } from './context.js';
import { readCloudEnv, type CloudEnv } from './env.js';

type Task = (env: CloudEnv, deps: CloudDeps) => Promise<boolean>;

/** Cloud Run job entrypoints (one image, one task per job). Add a step = add a task here. */
const TASKS: Readonly<Record<string, Task>> = {
  acquire: runAcquireTask,
  build: runBuildTask,
};

async function main(argv: readonly string[]): Promise<void> {
  const name = argv[0] ?? '';
  const task = TASKS[name];
  if (!task) {
    process.stderr.write(`Usage: node dist/cloud/main.js <${Object.keys(TASKS).join('|')}>\n`);
    process.exitCode = 2;
    return;
  }
  const env = readCloudEnv();
  const ok = await task(env, makeDeps(env));
  // Non-zero exit marks the Cloud Run task failed, which Workflows and alerting pick up.
  if (!ok) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((e: unknown) => {
  log.error('cloud task failed', { error: errorMessage(e) });
  process.exitCode = 1;
});
