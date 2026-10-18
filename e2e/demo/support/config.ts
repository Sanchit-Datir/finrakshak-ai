import { z } from 'zod';

/**
 * Settings for the demo-video scripts, read once from DEMO_* environment variables (set by the
 * launcher, by `e2e/demo/.env`, or on the command line). Every value has a safe default except the
 * password, which is never committed: put it in `e2e/demo/.env` or type it in the launcher.
 */

/** Pause multipliers: slow for a narrated video, fast for a dry run. */
export const PACE_FACTOR = { slow: 1.6, normal: 1, fast: 0.4 } as const;
export type Pace = keyof typeof PACE_FACTOR;

const onOff = z.enum(['on', 'off']).transform((v) => v === 'on');

const DemoEnvSchema = z.object({
  DEMO_BASE_URL: z
    .string()
    .url()
    .default('https://finrakshak-ai.web.app')
    .transform((u) => u.replace(/\/+$/, '')),
  /** "account": email + password (the deployed app). "quick": the prototype's quick sign-in. */
  DEMO_SIGN_IN: z.enum(['account', 'quick']).default('account'),
  DEMO_EMAIL: z.string().default('manager@gmail.com'),
  DEMO_PASSWORD: z.string().default(''),
  /** Registered App Check debug token, for when reCAPTCHA refuses an automated browser. */
  DEMO_APPCHECK_DEBUG_TOKEN: z.string().default(''),
  DEMO_PACE: z.enum(['slow', 'normal', 'fast']).default('normal'),
  DEMO_CAPTIONS: onOff.default('on'),
  /** Include the Gemini / Copilot steps. */
  DEMO_AI: onOff.default('on'),
  /** Seconds the final screen stays up before the browser closes. */
  DEMO_HOLD_SECONDS: z.coerce.number().int().min(0).max(600).default(15),
  DEMO_BROWSER: z.enum(['chromium', 'chrome', 'msedge']).default('chromium'),
  /** "auto": the page fills the (maximised) window. Or a fixed page size such as 1920x1080. */
  DEMO_VIEWPORT: z
    .string()
    .regex(/^(auto|\d{3,4}x\d{3,4})$/, 'use auto or WIDTHxHEIGHT, e.g. 1920x1080')
    .default('auto'),
  DEMO_HEADLESS: onOff.default('off'),
  /** Also save a Playwright video (1920×1080) under e2e/demo/recordings/. */
  DEMO_RECORD: onOff.default('off'),
});

export type DemoConfig = z.infer<typeof DemoEnvSchema>;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Page size for DEMO_VIEWPORT; null means "fill the window". */
export function viewportSize(viewport: string): Size | null {
  const m = /^(\d+)x(\d+)$/.exec(viewport);
  return m === null ? null : { width: Number(m[1]), height: Number(m[2]) };
}

/** Empty variables count as unset, so `DEMO_PASSWORD=` in .env falls back to the default. */
function demoVariables(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => e[0].startsWith('DEMO_') && e[1] !== undefined && e[1] !== '',
    ),
  );
}

export function readDemoConfig(env: NodeJS.ProcessEnv = process.env): DemoConfig {
  const parsed = DemoEnvSchema.safeParse(demoVariables(env));
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid demo settings:\n  ${problems.join('\n  ')}`);
}
