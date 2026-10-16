import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

const EnvSchema = z.object({
  FUNDTRACE_DATA_DIR: z.string().min(1).optional(),
  FUNDTRACE_MIN_DELAY_MS: z.coerce.number().int().min(500).max(60_000).default(1_500),
  FUNDTRACE_MAX_DOCS_PER_SOURCE: z.coerce.number().int().min(0).max(100_000).default(1_500),
});

export interface IngestConfig {
  readonly dataDir: string;
  readonly userAgent: string;
  readonly minDelayMs: number;
  readonly maxDocsPerSource: number;
  readonly requestTimeoutMs: number;
  readonly maxRetries: number;
  readonly extractorVersion: string;
}

let cached: IngestConfig | undefined;

/** Reads and validates the environment once (CLAUDE.md: env is parsed, not cast). */
export function getConfig(): IngestConfig {
  if (cached) return cached;
  const env = EnvSchema.parse(process.env);
  cached = {
    dataDir: env.FUNDTRACE_DATA_DIR ?? path.resolve(here, '../../data'),
    userAgent:
      'Mozilla/5.0 (compatible; FundTraceResearchBot/0.1; +https://github.com/Sanchit-Datir/fund-tracer)',
    minDelayMs: env.FUNDTRACE_MIN_DELAY_MS,
    maxDocsPerSource: env.FUNDTRACE_MAX_DOCS_PER_SOURCE,
    requestTimeoutMs: 90_000,
    maxRetries: 4,
    extractorVersion: 'regex-v1',
  };
  return cached;
}

export function dataPath(...parts: string[]): string {
  return path.join(getConfig().dataDir, ...parts);
}
