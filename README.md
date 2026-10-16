# FundTrace AI — Loan Lifecycle Intelligence

TypeScript monorepo on Google/Firebase: React UI on Firebase Hosting, Gemini via Firebase AI Logic (Cloud Functions + Vertex AI after the Blaze upgrade).

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

## Google setup (one-time, free Spark plan)

Services used now — all work without upgrading to Blaze: **Firebase Hosting**, **Firebase AI Logic**
(Gemini Developer API) and **App Check**. Cloud Functions, Vertex AI and Cloud Storage need Blaze and
come later (see `CLAUDE.md`).

1. Firebase console → create (or reuse) the project, put its ID in `.firebaserc`.
2. **AI Logic** → _Get started_ → choose **Gemini Developer API**. Firebase creates and holds the Gemini key.
3. **Project settings → Your apps** → add a Web app; copy its config into `web/.env.local` (from `web/.env.example`).
4. **App Check** → register the web app with **reCAPTCHA v3**, put the site key in `VITE_RECAPTCHA_SITE_KEY`,
   then _enforce_ App Check for AI Logic once the deployed site works (B-08, B-35).
5. **Users and permissions** → add teammates (Editor is fine for the hackathon).
6. Run `scripts/setup-gcp.sh <project-id>` once (needs `gcloud`, project Owner). It sets up keyless
   GitHub → Firebase deploys and prints the GitHub repo variables to add.

### Deploy pipeline

| Event           | What happens (`.github/workflows/deploy.yml`)                                |
| --------------- | ---------------------------------------------------------------------------- |
| Pull request    | check + build, deploy to a 7-day **preview channel**; URL in the job summary |
| Merge to `main` | check + build, deploy the **live** site                                      |

No service-account keys are stored: GitHub signs in through Workload Identity Federation, limited to this repo.
Teammates just open PRs — no local Firebase login is needed to ship.

### Teammate quick start

```bash
nvm use && npm install
cp web/.env.example web/.env.local   # paste the web config; leave blank for offline demo mode
npm run dev -w web
```

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
| OCR / handwriting / translation of uploads                                                                               | **Real when configured** — Gemini via Firebase AI Logic (`web/src/lib/ai/`); values are unreviewed until confirmed |
| Demo sample documents                                                                                                    | Labelled _simulated demo output_                                                                                   |
| Authentication / role enforcement                                                                                        | **Demo sign-in only** — no credential is checked; UI-only role gating                                              |
| Storage                                                                                                                  | Browser `localStorage` (zod-validated on read); uploaded files live only in the open tab                           |
| Public records, core-banking feed, SMS/email                                                                             | Not connected                                                                                                      |

All names, accounts, amounts and records are fictional. Alerts and findings are investigative leads, not fraud determinations.

## Integrating real services (next steps)

- Upload files to Cloud Storage and run OCR/extraction in a callable (`functions/`), returning fields with page/region references in the existing `ExtractedField` shape.
- Call Gemini server-side only (`functions/src/services/gemini.ts`), with masked identifiers and zod-validated output.
- Replace demo sign-in with Firebase Auth + App Check; enforce roles in Firestore rules and callables.
- Move the store (`web/src/state/store.ts`) to Firestore behind the same action functions in `web/src/state/actions.ts`.
