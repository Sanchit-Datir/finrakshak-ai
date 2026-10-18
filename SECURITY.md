# Security

How FinRakshak AI protects itself against injection, tampering and vulnerable dependencies.
Report a vulnerability privately to the repository owner. Do not open a public issue.

## Injection and tampering (web app)

| Threat                                               | Protection                                                                                                                                                                                                                                                                                                                                                                                                                    | Where                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cross-site scripting (XSS)                           | React escapes all rendered text. `dangerouslySetInnerHTML`, `innerHTML` and `eval` are not used.                                                                                                                                                                                                                                                                                                                              | whole `web/src`                                                                                                 |
| Script injection through links                       | Links from data (public-record documents, uploaded graph bundles, saved data) are rendered only if they are absolute `http(s)` URLs, so `javascript:` and `data:` links become plain text. External links open with `rel="noreferrer"`.                                                                                                                                                                                       | `web/src/lib/safe-url.ts` (`safeExternalUrl`)                                                                   |
| Open redirect after sign-in                          | The return path must be an in-app path. `//host`, `/\host`, full URLs and control characters fall back to the dashboard.                                                                                                                                                                                                                                                                                                      | `safeInternalPath`, `LoginPage.tsx`                                                                             |
| Content injection, clickjacking, third-party scripts | **Content-Security-Policy**: only the app's own origin may run scripts, connect or load workers. No plugins (`object-src 'none'`), no framing (`frame-ancestors 'none'`), forms post only to the app. Also sent: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera, microphone, location, payment off), `Cross-Origin-Opener/Resource-Policy`, and HSTS on Hosting. | `web/security-headers.ts` (vite preview), `firebase.json` (Hosting); kept in sync by `security-headers.test.ts` |
| Tampered or malformed data                           | All external data is parsed with zod before use: browser storage, graph bundles, CSV imports and the published index. Invalid saved data is reset, not trusted.                                                                                                                                                                                                                                                               | `web/src/domain/schemas.ts`, `packages/shared`                                                                  |
| Oversized uploads and decompression bombs            | Graph bundle files are limited to 64 MB, and gzip decompression stops at 256 MB. Document uploads are limited to 20 MB and transaction CSVs to 5 MB.                                                                                                                                                                                                                                                                          | `lib/graph-lab.ts`, `lib/processing.ts`, `MonitoringPage.tsx`                                                   |
| Spreadsheet formula injection                        | CSV exports neutralise cells starting with `=`, `+`, `-` or `@`.                                                                                                                                                                                                                                                                                                                                                              | `web/src/lib/export.ts`                                                                                         |
| Fake findings ("being fooled")                       | Public-record matches use exact CIN, then exact name; fuzzy matches are never merged (B-37). Every finding links to its source document, and records state their evidence status (B-36, B-42). Alerts are leads, not verdicts.                                                                                                                                                                                                | `lib/public-records.ts`, `lib/public-watch.ts`                                                                  |
| Input abuse                                          | Form fields have length limits and format checks (PAN, CIN, amounts in paise with overflow checks: B-01, B-03, B-25).                                                                                                                                                                                                                                                                                                         | forms and `lib/receivables.ts`                                                                                  |

## Backend (Firebase)

- **Firestore:** rules are default-deny (`firestore.rules`). Each collection needs an explicit
  rule and an emulator test.
- **Callable functions:** they enforce App Check, check `request.auth`, validate input with zod and
  verify ownership (CLAUDE.md). There are no API keys or secrets in the web bundle.

## Software composition analysis (SCA)

- **CI:** runs `npm run audit:prod` on every pull request and push to `main`. The build fails on
  any known vulnerability in production dependencies.
- **Dependabot** (`.github/dependabot.yml`) proposes weekly updates for npm packages and GitHub
  Actions.
- **Lockfile:** dependencies are pinned by `package-lock.json` and installed with `npm ci`.
- **Remediation, 16 Oct 2026:** the scan went from 32 known vulnerabilities to **0 in production
  dependencies**:
  - removed the unused `firebase` package from the web app
  - upgraded `firebase-admin` 14, `firebase-functions` 7, `firebase-tools` 15 and `vitest` 5
  - overrode `uuid` to ^11.1.1
- **Accepted (development only):** 5 advisories remain inside the `firebase-tools` CLI, which is
  used locally for emulators and deploys and never shipped to users. They are `braces`/`chokidar`
  (denial of service through crafted glob patterns) and `@opentelemetry/core` (memory use). No
  fixed version exists upstream yet. Re-check with `npm run audit:all` and remove this note when
  fixed.

## Before deploying to the cloud

- Re-run `npm run audit:prod` and `npm audit`.
- Enable GitHub secret scanning and, if available, CodeQL.
- Keep the CSP strict. Any new third-party script, font or API origin must be added explicitly
  and reviewed.
- Add rate limiting and per-user quotas to callables before enabling Gemini (B-08, B-15).
