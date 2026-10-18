/**
 * Minimal robots.txt evaluator: groups for `*` (and our bot token), longest
 * matching Allow/Disallow prefix wins. Supports `*` wildcards and `$` anchors.
 */
export interface RobotsRules {
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
}

const BOT_TOKEN = 'finrakshakairesearchbot';

export function parseRobots(text: string): RobotsRules {
  const allow: string[] = [];
  const disallow: string[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === 'user-agent') {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
      continue;
    }
    if (key !== 'allow' && key !== 'disallow') continue;
    inRules = true;
    if (!agents.some((a) => a === '*' || a === BOT_TOKEN)) continue;
    if (value.length > 0) (key === 'allow' ? allow : disallow).push(value);
  }
  return { allow, disallow };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

function longestMatch(patterns: readonly string[], target: string): number {
  let best = -1;
  for (const p of patterns) {
    if (patternToRegExp(p).test(target)) best = Math.max(best, p.length);
  }
  return best;
}

export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  const allowLen = longestMatch(rules.allow, pathAndQuery);
  const disallowLen = longestMatch(rules.disallow, pathAndQuery);
  return disallowLen < 0 || allowLen >= disallowLen;
}

/** Used when robots.txt is missing (404) or is not a robots file (an HTML error page). */
export const ALLOW_ALL: RobotsRules = { allow: [], disallow: [] };

export function looksLikeRobots(text: string): boolean {
  return /^\s*(user-agent|disallow|allow|sitemap)\s*:/im.test(text) && !/<html/i.test(text);
}
