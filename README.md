# FundTrace AI — Loan Lifecycle Intelligence

TypeScript monorepo on Google/Firebase: React UI, Cloud Functions backend, Firestore, Gemini via Vertex AI.

The web app is a **functional prototype with synthetic demo data** built to the spec in
[`docs/fundtrace-ai-ui-spec.md`](docs/fundtrace-ai-ui-spec.md). Core workflow: capture paper documents →
review Marathi/English fields against the source → run evidence-backed checks → monitor post-disbursement
transactions → investigate a unified case.

```
web/              React + Vite UI (Firebase Hosting)
functions/        Cloud Functions (callables, services, config)
packages/shared/  zod schemas + shared types
docs/             BOUNDARY_CONDITIONS.md, ARCHITECTURE.md
CLAUDE.md         Coding standards & instructions (read first)
```

## Getting started

```bash
nvm use            # Node 22
npm install
npm run check      # format + lint + typecheck + tests
npm run build
```

## Firebase setup (one-time)

1. Create a Firebase project (Blaze plan, required for Functions/Vertex); enable Auth, Firestore, App Check, and the Vertex AI API.
2. Put its ID in `.firebaserc`.
3. `npx firebase login`, then `npm run emulators` to develop locally.
4. Copy `web/.env.example` to `web/.env.local` and fill in the web app config.
5. Deploy: `npm run build && npx firebase deploy`.

See `CLAUDE.md` for standards and `docs/BOUNDARY_CONDITIONS.md` for edge cases that must be handled.

## Run the web prototype

```bash
npm install
npm run dev -w web        # http://localhost:5173 → “Continue with demo sign-in”
npm run build -w web && npx vite preview --root web   # production build
```

Pick a demo role on the sign-in page (Risk Analyst / Administrator can edit rules and checklists).
Settings → “Data sources & demo” resets or clears the demo dataset. Help & Support has a guided walkthrough.

## What is real vs. simulated

| Area                                                                                                                     | Status                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Application checks (checklist, name/DOB/land-area conflicts, duplicate survey/receipt, income vs credits, relationships) | **Real** — deterministic rules in `web/src/lib/checks.ts`, run in the browser                                      |
| Monitoring rules (rapid onward transfer, linked counterparty, repeated counterparty, circular flow, split cash)          | **Real** — `web/src/lib/monitoring.ts`, thresholds editable in Settings                                            |
| File intake (PDF page count, image blur/darkness/resolution warnings)                                                    | **Real**, local only (pdf.js + canvas)                                                                             |
| CSV transaction import, CSV/TXT exports                                                                                  | **Real**, validated with zod                                                                                       |
| OCR / handwriting / translation                                                                                          | **Not connected.** Demo sample documents show labelled _simulated demo output_; uploads require manual field entry |
| Gemini on Vertex AI analysis                                                                                             | **Not connected.** No AI result is shown anywhere                                                                  |
| Authentication / role enforcement                                                                                        | **Demo sign-in only** — no credential is checked; UI-only role gating                                              |
| Storage                                                                                                                  | Browser `localStorage` (zod-validated on read); uploaded files live only in the open tab                           |
| Public records, core-banking feed, SMS/email                                                                             | Not connected                                                                                                      |

All names, accounts, amounts and records are fictional. Alerts and findings are investigative leads, not fraud determinations.

## Integrating real services (next steps)

- Upload files to Cloud Storage and run OCR/extraction in a callable (`functions/`), returning fields with page/region references in the existing `ExtractedField` shape.
- Call Gemini server-side only (`functions/src/services/gemini.ts`), with masked identifiers and zod-validated output.
- Replace demo sign-in with Firebase Auth + App Check; enforce roles in Firestore rules and callables.
- Move the store (`web/src/state/store.ts`) to Firestore behind the same action functions in `web/src/state/actions.ts`.
