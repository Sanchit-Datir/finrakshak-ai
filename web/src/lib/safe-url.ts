/**
 * Guards for URLs that come from data (public-record documents, uploaded graph bundles,
 * browser storage) or navigation state. Never render or follow a URL that fails these checks:
 * a `javascript:` or `data:` link is script injection, a `//host` path is an open redirect.
 */

/** Returns the URL only if it is an absolute http(s) URL; otherwise null (render as text). */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (url === null || url === undefined || url.length > 2048) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** An in-app path to return to after sign-in; anything else falls back to the dashboard. */
export function safeInternalPath(from: unknown, fallback = '/dashboard'): string {
  if (typeof from !== 'string' || from.length > 512) return fallback;
  let hasControl = false;
  for (let i = 0; i < from.length; i++) if (from.charCodeAt(i) < 0x20) hasControl = true;
  const ok = /^\/(?![/\\])/.test(from) && !from.startsWith('/login') && !hasControl;
  return ok ? from : fallback;
}
