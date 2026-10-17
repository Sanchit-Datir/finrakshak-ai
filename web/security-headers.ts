/**
 * HTTP security headers for the built app (vite preview, and mirrored in firebase.json for
 * Firebase Hosting — keep the two in sync; see SECURITY.md). Everything the app loads is
 * self-hosted, so the Content-Security-Policy only allows the app's own origin:
 * no inline or third-party scripts, no plugins, no framing (clickjacking), no foreign forms.
 * React inline style attributes need style-src 'unsafe-inline'; images use data:/blob: URLs.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join('; ');

/** Headers safe for every response, including the dev server. */
export const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Built app: base headers plus the CSP (the dev server needs inline scripts for hot reload). */
export const BUILD_SECURITY_HEADERS: Record<string, string> = {
  ...BASE_SECURITY_HEADERS,
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};
