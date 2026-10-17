/**
 * HTTP security headers for the built app (vite preview, and mirrored in firebase.json for
 * Firebase Hosting — keep the two in sync; see SECURITY.md). The app is self-hosted; the
 * Content-Security-Policy allows the app's own origin plus the few Google hosts listed below:
 * no inline scripts, no plugins, no framing (clickjacking), no foreign forms.
 * React inline style attributes need style-src 'unsafe-inline'; images use data:/blob: URLs.
 */
// Only these external hosts are allowed, and only for what the cloud features need:
//  - Firebase Auth (email + password) and the App Check token exchange
//  - the askGemini Cloud Function in Mumbai
//  - Google reCAPTCHA v3, which App Check uses to tell real visitors from bots
const FIREBASE_API_HOSTS = [
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://firebaseappcheck.googleapis.com',
  'https://asia-south1-fund-tracer.cloudfunctions.net',
];
const RECAPTCHA_SCRIPTS = [
  'https://www.google.com/recaptcha/',
  'https://www.gstatic.com/recaptcha/',
];

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' ${RECAPTCHA_SCRIPTS.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.gstatic.com/recaptcha/",
  "font-src 'self' data:",
  `connect-src 'self' ${FIREBASE_API_HOSTS.join(' ')} https://www.google.com/recaptcha/`,
  'frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/',
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
