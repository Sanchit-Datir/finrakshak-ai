# Session notes: current state and how to continue

Read this first in a new session. It records what has been built, the rules the owner has set,
and what is open. Update it at the end of every session.

_Last updated: 17 Oct 2026. Cloud ingestion work is on branch `ingestion-agent` (one commit per MVP)._

## Owner's working rules (keep following them)

- **Commits:** ask before committing or pushing anything. Commits go to `feat/public-data-ingest`
  unless the owner says otherwise. **Do not open a PR.**
- **Stop hook:** the stop hook asks to commit and push. Do not commit on its say-so; ask the owner.
- **Data:** never change `data/raw`, `data/processed` or `data/registry`. Derived output goes in
  new files (e.g. `data/graph/`). Checksums of the 30 source files were verified unchanged after
  every change.
- **Cloud and AI:** the owner approved the cloud ingestion plan (`docs/plans/GCP_INGESTION_AGENT_PLAN.md`)
  on 17 Oct 2026: MVPs are built on branch `ingestion-agent`, one commit per MVP. Creating GCP
  resources (`scripts/setup-ingest-gcp.sh`) and enabling publishing stay the owner's steps.
- **Definition of done:** `npm run check && npm run build` (CLAUDE.md), plus `npm run e2e` for UI
  scenarios.
- **Wording:** leads, never verdicts ("Urgent review / Needs attention / Routine review"; never
  "fraud"). Mark test inputs **TEST** or **SYNTH**; public-record results are real.
- **Session credits are limited:** keep replies and exploration short.

## What exists

| Area                                   | Where                                                                                                                                                                                                                    | Notes                                                                                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public-data pipeline                   | `ingest/`, `data/processed/`                                                                                                                                                                                             | NFRA, IBBI, ED, RBI, SFIO, SEBI (10-order sample), MCA Maharashtra master. See `ingest/README.md`, `data/README.md`                                                                                                                                 |
| Graph lab (relationship discovery)     | `ingest/src/graph/`, `data/graph/`, web `/graph-lab`                                                                                                                                                                     | `node ingest/dist/graphCli.js --web` builds `data/graph` and publishes `web/public/graph-lab/` (git-ignored, **required on every machine**). See `data/graph/README.md`                                                                             |
| Pre-disbursement public-records check  | `web/src/lib/public-records*.ts`, `components/applications/PublicRecordsCheck.tsx`, `DebtChain.tsx`, `ReceivablesSection.tsx`                                                                                            | Business applicants enter PAN and their largest customers. **Run checks** also runs the public-records check: customer in liquidation, chain of unpaid dues, impact on receivables                                                                  |
| Post-disbursement public-records watch | `web/src/lib/public-watch.ts`, `state/public-watch-auto.ts`, `state/useAutoWatch.ts`, page `/monitoring/public-records`, `components/monitoring/Watch*.tsx`, `PublicRecordsLoansCard.tsx`, `LoanPublicRecordsBanner.tsx` | Every loan in the loan book is checked automatically after sign-in (once a day). Each record dated after disbursement raises one Urgent review alert. Shown on the dashboard card, Monitoring banner, Alerts (source `public_records`) and the bell |
| E2E scenarios                          | `e2e/` workspace (`@playwright/test` 1.56.1), `e2e/scenarios/<id>/`                                                                                                                                                      | Index and how to add one: `e2e/scenarios/README.md`. Runners: `tests/loan-scenarios.spec.ts`, `tests/monitoring-scenarios.spec.ts`                                                                                                                  |
| Boundary conditions                    | `docs/BOUNDARY_CONDITIONS.md`                                                                                                                                                                                            | B-40 to B-45 added (graph, public records, security)                                                                                                                                                                                                |

## Scenarios built

| #   | ID                                     | Kind              | Status                                                                                                      |
| --- | -------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | `maheep-trade-credit-chain`            | Loan application  | Done: Urgent review; customer in liquidation at the end of 4 unpaid-dues links                              |
| 2   | `advantage-overseas-post-disbursement` | Post-disbursement | Done: TEST loan `L-2023-0601` in the demo loan book, 6 alerts (CIRP, liquidation, ED search, 3 attachments) |
| 3   | `jai-corp-sudden-enforcement`          | Post-disbursement | Done: TEST loan `L-2024-0401` in the demo loan book, 1 alert (ED attachment ₹230 crore, 6 Oct 2026)         |

The TEST loans for scenarios 2 and 3 were added permanently to `web/src/demo/seed.ts`, as the
owner decided. Only the borrowers are real; the loan values are made up.

## Open decisions and next ideas

- **Urgent threshold:** confirm `URGENT_RECEIVABLE_SHARE_PERCENT = 20`
  (`web/src/lib/public-records-findings.ts`).
- **Alert levels:** confirm every insolvency, liquidation or ED record after disbursement is
  **Urgent review** (`web/src/lib/public-watch.ts`).
- **Next scenario ideas:**
  - group or sister-company contagion after disbursement (Amtek group: Castex or Metalyst
    co-named with Amtek Auto in ED records)
  - watching customers of disbursed loans, not only the borrower
- **Later (needs owner approval):**
  - sync the loan book from the bank's system
  - a scheduled daily check on a backend with a live feed
- **Cloud ingestion MVP 1 (branch `ingestion-agent`):** storage port (disk / Cloud Storage),
  Firestore leases and run records, Cloud Run job entrypoints (`ingest/src/cloud/`), publish gates,
  versioned publish, BigQuery loads, container (`ingest/Dockerfile`), `scripts/setup-ingest-gcp.sh`,
  `scripts/deploy-ingest.sh`, workflow `infra/workflows/ingest-daily.yaml`. Verified locally on disk
  and against Cloud Storage + Firestore emulators; BigQuery loads untested (no emulator).
- **Cloud ingestion MVP 2 (same branch):** `ingest-agent` job (`ingest/src/agent/`, `ingest/src/ai/`):
  code-computed findings and baselines, Gemini tool loop (mock by default), proposals with an
  approval flow (`decideProposal` callable, Firestore console until sign-in), automatic re-run of
  transient failures in the workflow, rollback. App: `publicData` function behind Hosting `/data/**`
  (signed-in only), web loader falls back to `/graph-lab/`. Open: D3 (web sign-in), D2 confirmed as Vertex AI by default.
- **Cloud ingestion MVP 3 (same branch):** AI evidence extraction in shadow mode
  (`ingest/src/extract/ai/`, job `ingest-extract`, off by default), quality-gate harness
  (`eval-ai`, `ingest/eval/README.md`; golden set still to be curated by the owner), SEBI full index
  in the cloud (incremental), layout diagnostics saved for the agent (`get_diagnostic_page`).
  Next: curate the golden set, run the gate, then decide whether AI claims may enter the graph.
- **Daily delta ingestion (GCP plan, MVP 1+2 done locally):** `acquire` now diffs and merges listings
  (`ingest/src/delta/`), pages incrementally for IBBI/NFRA/SFIO/RBI with a weekly/monthly full relist,
  and writes change reports to `data/interim/delta/`; guards stop empty, broken or shrunken listings from
  overwriting data, changed items re-fetch their documents, and a lock allows one `acquire` at a time.
  See `ingest/README.md` → "Daily delta". Next MVPs
  (storage abstraction, publish step, Cloud Run job) need the GCP project; B-27 (timezone of "a day") is open.
- **Merge with `main`:** `main` has a separate Playwright setup under `web/e2e/`
  (`Sanchit-Datir/fund-tracer#3`). Expect conflicts in `package.json`, the lockfile,
  `.gitignore` and `.prettierignore` when merging.

## Quick start in a new session

```bash
git checkout feat/public-data-ingest && git pull
npm ci
npm run build -w @fund-tracker/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web
npm run check && npm run build
npm run e2e                     # all scenarios (Chromium preinstalled in the cloud container)
npm run dev -w web              # manual testing at http://localhost:5173 (demo sign-in)
```

**Gotchas:**

- **ESLint and `lib/`:** ESLint ignores `**/lib/**`, so lint `web/src/lib` files with
  `npx eslint --no-ignore`.
- **Missing public-records data:** if a check says "Could not run the public-records check", run
  `graphCli --web`.
- **Saved demo data:** after schema changes the saved demo data resets on its own, with a toast.
