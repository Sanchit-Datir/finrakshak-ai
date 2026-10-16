import type { IngestConfig } from '../config.js';
import { errorMessage, log } from '../log.js';
import { ALLOW_ALL, isAllowed, looksLikeRobots, parseRobots, type RobotsRules } from './robots.js';

export interface FetchResult {
  readonly url: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer;
}

export interface FetchOptions {
  readonly form?: Readonly<Record<string, string>>;
  readonly referer?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpStatusError';
  }
}

const MAX_BODY_BYTES = 80 * 1024 * 1024;
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polite HTTP client: honours robots.txt, enforces a per-host delay, retries
 * transient failures with exponential backoff + jitter, keeps session cookies
 * per host (as a browser would) and never bypasses access controls.
 */
export class PoliteFetcher {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly robots = new Map<string, RobotsRules>();
  private readonly cookies = new Map<string, Map<string, string>>();

  constructor(private readonly cfg: IngestConfig) {}

  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const target = new URL(url);
    const rules = await this.rulesFor(target);
    if (!isAllowed(rules, `${target.pathname}${target.search}`)) {
      throw new RobotsDisallowedError(url);
    }
    return this.fetchWithRetry(target, opts);
  }

  private async rulesFor(target: URL): Promise<RobotsRules> {
    const cached = this.robots.get(target.host);
    if (cached) return cached;
    let rules = ALLOW_ALL;
    try {
      await this.waitTurn(target.host);
      const res = await this.once(new URL('/robots.txt', target.origin), {});
      const text = res.body.toString('utf8');
      if (res.status === 200 && looksLikeRobots(text)) rules = parseRobots(text);
    } catch (e) {
      log.warn('robots.txt unavailable; using allow-all with polite delay', {
        host: target.host,
        error: errorMessage(e),
      });
    }
    this.robots.set(target.host, rules);
    return rules;
  }

  private async fetchWithRetry(target: URL, opts: FetchOptions): Promise<FetchResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt++) {
      await this.waitTurn(target.host);
      try {
        const res = await this.once(target, opts);
        if (!RETRYABLE.has(res.status)) return res;
        lastError = new HttpStatusError(res.status, target.href);
      } catch (e) {
        lastError = e;
      }
      const backoff = 2_000 * 2 ** attempt + Math.floor(Math.random() * 1_000);
      log.warn('retrying request', {
        url: target.href,
        attempt,
        backoff,
        error: errorMessage(lastError),
      });
      await sleep(backoff);
    }
    throw new Error(`Giving up on ${target.href}`, { cause: lastError });
  }

  private async waitTurn(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host) ?? 0;
    const wait = last + this.cfg.minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt.set(host, Date.now());
  }

  private async once(target: URL, opts: FetchOptions): Promise<FetchResult> {
    const res = await fetch(target, {
      method: opts.form ? 'POST' : 'GET',
      headers: this.headersFor(target, opts),
      body: opts.form ? new URLSearchParams(opts.form).toString() : null,
      redirect: 'follow',
      signal: AbortSignal.timeout(this.cfg.requestTimeoutMs),
    });
    this.storeCookies(target.host, res.headers.getSetCookie());
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) throw new Error(`Body too large (${declared} bytes)`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BODY_BYTES) throw new Error(`Body too large (${body.length} bytes)`);
    return {
      url: target.href,
      finalUrl: res.url || target.href,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body,
    };
  }

  private headersFor(target: URL, opts: FetchOptions): Record<string, string> {
    const headers: Record<string, string> = { 'User-Agent': this.cfg.userAgent, ...opts.headers };
    if (opts.form) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    if (opts.referer) headers['Referer'] = opts.referer;
    const jar = this.cookies.get(target.host);
    if (jar && jar.size > 0) {
      headers['Cookie'] = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    return headers;
  }

  private storeCookies(host: string, setCookies: string[]): void {
    if (setCookies.length === 0) return;
    const jar = this.cookies.get(host) ?? new Map<string, string>();
    for (const sc of setCookies) {
      const pair = sc.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    this.cookies.set(host, jar);
  }
}
