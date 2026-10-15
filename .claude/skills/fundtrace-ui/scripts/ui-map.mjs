#!/usr/bin/env node
/**
 * Prints a compact index of the FundTrace web UI so an agent can locate code
 * without reading whole files. Usage (from repo root):
 *   node .claude/skills/fundtrace-ui/scripts/ui-map.mjs            # everything
 *   node .claude/skills/fundtrace-ui/scripts/ui-map.mjs monitoring # paths/exports matching "monitoring"
 *   node .claude/skills/fundtrace-ui/scripts/ui-map.mjs --routes   # route table only
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const SRC = join(ROOT, 'web', 'src');
const args = process.argv.slice(2);
const routesOnly = args.includes('--routes');
const print = (text) => process.stdout.write(`${text}\n`);
const filter = (args.find((a) => !a.startsWith('--')) ?? '').toLowerCase();

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

function exportsOf(text) {
  const names = [];
  for (const m of text.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|interface|type|class)\s+(\w+)/gm,
  )) {
    names.push(m[1]);
  }
  for (const m of text.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    names.push(
      ...m[1].split(',').map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)
          .pop(),
      ),
    );
  }
  return names;
}

function routes() {
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
  return [...app.matchAll(/path="([^"]+)"\s+element=\{<(\w+)/g)].map(
    (m) => `${m[1].padEnd(34)} ${m[2]}`,
  );
}

if (routesOnly || filter === '') {
  print('# Routes (web/src/App.tsx)');
  print(routes().join('\n'));
  if (routesOnly) process.exit(0);
  print('');
}

print('# Files: path (lines) — exports');
for (const file of walk(SRC).sort()) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const exp = exportsOf(text);
  const line = `${rel} (${text.split('\n').length}) — ${exp.join(', ') || '(no exports)'}`;
  if (filter === '' || line.toLowerCase().includes(filter)) print(line);
}
