# FundTrace AI — Loan Lifecycle Intelligence

TypeScript monorepo on Google/Firebase: React UI, Cloud Functions backend, Firestore, Gemini via Vertex AI.

The web app is a **functional prototype with synthetic demo data** built to the spec in
[`docs/fundtrace-ai-ui-spec.md`](docs/fundtrace-ai-ui-spec.md). Core workflow: capture paper documents →
review Marathi/English fields against the source → run evidence-backed checks → monitor post-disbursement
transactions → investigate a unified case.

```
web/              React + Vite UI (Firebase Hosting)
functions/        Cloud Functions (callables, services, config)
packages/shared/  zod schemas + shared types (incl. the evidence/graph data model)
ingest/           public-source data pipeline (acquire → extract → build), see ingest/README.md
data/             source registry, MCA master, canonical dataset, see data/README.md
docs/             BOUNDARY_CONDITIONS.md, ARCHITECTURE.md
CLAUDE.md         Coding standards & instructions (read first)
```

## Getting started

```bash
nvm use            # Node 22
npm install
npm run check      # format + lint + typecheck + tests
npm run test:emulators  # Firestore rules + Firestore code against the emulator (needs Java 21)
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
npm run dev -w web        # http://localhost:5173 → “Continue with quick sign-in”
npm run build -w web && npx vite preview --root web   # production build
```

Pick a demo role on the sign-in page (Risk Analyst / Administrator can edit rules and checklists).
Settings → “Data sources & demo” resets or clears the demo dataset. Help & Support has a guided walkthrough.

## Public-source dataset (`ingest/`)

A TypeScript pipeline collects permitted public records (NFRA, IBBI, ED, RBI, SFIO, a SEBI sample)
and the MCA company master into an evidence graph: case events, entities, relationships, evidence
claims with `fact / finding / allegation / inference` status, and review leads. It is offline data for
BigQuery and the upcoming graph features; the web app does not read it yet.

```bash
npm run build -w @fund-tracker/shared && npm run build -w ingest
node ingest/dist/cli.js build      # rebuild data/processed from data/raw (+ MCA join), ~30 s
```

**Daily updates (delta):** `acquire` fetches only what changed since the last run. IBBI, NFRA, SFIO and
RBI are listed incrementally (newest pages until known items) with a weekly or monthly full relist
(`--full` forces one). Each run diffs the listing against the stored one, merges it (records that vanish
from a source are flagged, never deleted), downloads documents only for new or changed items, and writes
a change report to `data/interim/delta/`. Empty, broken or sharply shrunken listings never overwrite stored
data, and a lock allows one run at a time.

```bash
node ingest/dist/cli.js acquire all          # daily run: incremental where possible
node ingest/dist/cli.js acquire all --full   # force a full relist
```

- How to run, sources, caps, daily delta, BigQuery load: [`ingest/README.md`](ingest/README.md)
- What is stored where (git vs Cloud Storage), file layouts, MCA coverage: [`data/README.md`](data/README.md)
- Source terms and access audit: [`data/registry/sources.json`](data/registry/sources.json)

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
| Public records (MCA, NFRA, IBBI, ED, RBI, SFIO, SEBI sample)                                                             | **Real dataset, not yet wired into the app** — built by `ingest/` into `data/processed/`                           |
| Core-banking feed, SMS/email                                                                                             | Not connected                                                                                                      |

In the web app, all names, accounts, amounts and records are fictional. Alerts and findings are investigative leads, not fraud determinations.

## Integrating real services (next steps)

- Upload files to Cloud Storage and run OCR/extraction in a callable (`functions/`), returning fields with page/region references in the existing `ExtractedField` shape.
- Call Gemini server-side only (`functions/src/services/gemini.ts`), with masked identifiers and zod-validated output.
- Replace demo sign-in with Firebase Auth + App Check; enforce roles in Firestore rules and callables.
- Move the store (`web/src/state/store.ts`) to Firestore behind the same action functions in `web/src/state/actions.ts`.
