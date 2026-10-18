# Session notes: current state and how to continue

Read this first in a new session. It records what has been built, the rules the owner has set,
and what is open. Update it at the end of every session.

_Last updated: 18 Oct 2026 (cleaning-code session). Cloud ingestion work is on branch `ingestion-agent` (one commit per MVP)._

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
- **PRs and main:** every open PR must be updated with `main` before it is merged (CI check
  `Up to date with main`). To enforce it at merge time the owner turns on branch protection for
  `main`: require status checks, mark `Up to date with main` required, and tick "Require branches
  to be up to date before merging".
- **Definition of done:** `npm run check && npm run build` (CLAUDE.md), plus `npm run e2e` for UI
  scenarios.
- **Wording:** leads, never verdicts ("Urgent review / Needs attention / Routine review"; never
  "fraud"). Mark test inputs **TEST** or **SYNTH**; public-record results are real.
- **Session credits are limited:** keep replies and exploration short.

## Rename session (18 Oct 2026, branch `rename`)

At the owner's request the repo was renamed `finrakshak-ai`: package scope `@finrakshak-ai/*`, env-var
prefix `FINRAKSHAK_AI_` (was `FUNDTRACE_`), skill `.claude/skills/finrakshak-ai-ui/`, spec
`docs/finrakshak-ai-ui-spec.md`, browser storage keys `finrakshak-ai.*` (old demo workspaces and
sessions start fresh), emulator project `demo-finrakshak-ai`, repo URLs and display names. **Kept on
purpose** (Google Cloud cannot rename them in place): project ID `fund-tracer` and everything derived
from it (Hosting site, `*.web.app`, functions URL, service accounts, buckets `fund-tracer-ingest-*`)
and the BigQuery datasets `fundtrace`, `fundtrace_public(_dryrun)`, `fundtrace_synth`. The ingest jobs pick up
the new env-var names on the next deploy from `main` (`INGEST_ENABLED=true`: `scripts/deploy-ingest.sh`
sets every variable with `--set-env-vars` and redeploys the workflow in the same step). README gained
sections 5 (API calls, datasets and AI) and 6 (Agents).

**Deploys blocked since the GitHub repo rename (18 Oct 2026, owner step):** the Workload Identity
provider only accepts `assertion.repository == 'Sanchit-Datir/fund-tracer'`, so every GitHub Actions
login to GCP now fails ("rejected by the attribute condition"): previews, live deploys and the
emergency-stop button. The site keeps serving the last deploy. Fix: run
`scripts/setup-gcp.sh fund-tracer` from this branch in Cloud Shell (it now resets the condition and
adds the preview and stop bindings for `Sanchit-Datir/finrakshak-ai`), then re-run the failed Deploy.

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

## UI updates session (17 Oct 2026, branch `ui-updates` from `main`)

Owner's UI review comments, plan and status in `docs/plans/UI_UPDATES_PLAN.md` (skipped items listed
there). Dashboard trimmed, "Demo data" / "local copy" badges and the footer removed, branches renamed
Mumbai / Delhi / Pune / Kolkata (ids unchanged), new application can start from the form (documents
optional, no demo sample), products Business / Education / MSME / Farmer loan, Settings "Data
sources" and "Cloud & AI" removed, nav reordered. Storage key bumped to `finrakshak-ai.demo.v2`. Open for
the owner: the product and borrower-sort decisions listed in the plan. Not committed yet.

## Remaining-work session (17 Oct 2026, branch `remaining-work-changes`)

Built the rest of `docs/plans/REMAINING_WORK.md` that needs no GCP: the cloud scoring job (W2a–W2f, off
by default) and the app side (W3a–W3e). See the status table at the top of that page. The owner confirmed
Q1–Q4 and Q6 and the flags-from-`fundtrace_synth` choice. **Score visibility (owner, 17 Oct 2026):** for now
everyone signed in with a usable profile sees every branch's synthetic scores (`RISK_SCORES_SCOPE`);
branch scoping is kept in the service and will be decided later. Open for the owner: the W2g dry run
(`docs/DEPLOY.md` → Synthetic risk scores). The branch was pushed at the user's request; no PR.

## EMI prepayment fix (18 Oct 2026, branch `fix/emi-prepayment`)

`behaviour.prepayment_min_multiple` (B-59, `packages/shared/src/risk/scoring/emi.ts`): a large repayment made
with no EMI overdue is a prepayment, not an EMI. Off in v1 and v2 (v2 replay unchanged, 105 alerts). With it
on, v2 + behaviour option 4 catches 105 of 105 defaulters with 0 false alarms at 30.4 per 1,000 loan-months
(table in `docs/RISK_SCORING.md`). **Open for the owner:** publish that as settings v3 (0.4 over the budget)
or not. Committed on this branch (43447f1).

## Agents session (17 Oct 2026, branch `pattern-miner-risk-explainer-agent`)

At the owner's request, built the **pattern miner** and the **risk explainer** from main, following
`docs/plans/AGENTS_PLAN.md`, `PATTERN_MINER_PLAN.md` and `RISK_EXPLAINER_PLAN.md` (steps 12, 14 and 17/E2).
Pushed at the owner's request; PR opened against `main` at the owner's request. **Owner confirmed (17 Oct
2026):** explanations in their own collection `synthRiskExplanations` (one per alert; a prompt bump applies to
new alerts only); the mock and the kill switches store nothing, a failed real model stores code-worded
proposals with `model: null`; model-rejected candidates are not proposed and only their count is kept.

- Shared: `runToolLoop` (`ingest/src/ai/toolLoop.ts`), the number check (`ai/outputChecks.ts`), the `agentRuns`
  envelope (all three agents write one). The 14a edge-case tests found a bug: once the input budget was used,
  the ingestion agent's `submit_review` was refused too, so it could never finish; fixed in the shared loop.
- Miner: `ingest/src/miner/{agent,tools,wording,proposals,store,load}.ts`, task `mine` (job `ingest-miner`, on
  demand, `FINRAKSHAK_AI_MINER_ENABLED=false`), `npm run miner -- propose` (prints only). On the real timelines:
  0 candidates, nothing proposed (as at checkpoint 1). `decidePattern` callable writes the library (B-61).
- Explainer: `ingest/src/explain/`, task `explain` (job `ingest-explain`, after `score`,
  `FINRAKSHAK_AI_EXPLAIN_ENABLED=false`); sentences in `synthRiskExplanations` (not on the alert: B-57), shown
  labelled in the risk score drawer (B-62).
- B-60 to B-63 added (B-59 was taken by the prepayment fix on `main`, so "patterns from hand-picked defaulters" is B-63). Everything runs on the mock; the mock and the kill switches store nothing.
- Open for the owner: the budget alert (B-15), re-running `scripts/setup-ingest-gcp.sh` for the two new
  accounts, checkpoint 4 (miner Vertex dry run) and E3 (explainer dry run); step 15 (approval view, scorer
  reading the Firestore library, `proposals_waiting`) is not built.

## AI analysis of an application (18 Oct 2026, branch `feat/application-ai-analysis`)

The Risk step's "AI-assisted document analysis" card now runs `analyseApplication` on a click: grounded
facts from the recorded fields, a note per finding, a short summary; matched patterns do not apply before
disbursement. Gemini on Vertex AI (owner switched from the AI Studio key on 18 Oct 2026; runtime account needs
roles/aiplatform.user); mock
locally. See `docs/APPLICATION_AI_ANALYSIS.md` and B-64. **Open for the owner:** budget limit first
(B-15). Names are not masked (owner, 18 Oct 2026). Attention score 0–100 added (code-computed, top of the card), with a weight per kind of finding scaled by priority (owner, 18 Oct 2026; table in the doc). Not tuned on outcomes.

## AI investigator (18 Oct 2026, branch `claude/ai-investigator-e63431` from `feat/application-ai-analysis`)

"Investigate with AI" on the Risk step (`investigateApplication` callable, Vertex AI, mock locally): the
browser sends a bundle (typed-in data, identifiers masked; ratios, public-records shortlist and related
entities all made by code); Gemini reads it through 8 tools and proposes findings and draft questions; code
verifies every citation, quote and number and counts rejections. Verified findings add to the attention
score as their own kinds (45/40/25/15, scaled by priority); mock and out-of-date ones do not. See
`docs/AI_INVESTIGATOR.md` and **B-67** (B-65 and B-66 are the branch scope and the copilot). Checked in the browser against the
auth + functions emulators with the mock. **Owner decided (18 Oct 2026):** every model call counts
against the daily limit and the limit is never crossed (the run stops and keeps what was verified); names
are not masked (applies to B-64 too). **Open for the owner:** grant `roles/aiplatform.user` to the
functions runtime account `728958349363-compute@developer.gserviceaccount.com` (it does not have it yet;
the grant was not run from the session). PR opened against `main` at the owner's request.

## Showcase UI and Copilot (18 Oct 2026, branch `remaining-ui-changes-2`, not committed)

The owner approved `docs/plans/UI_SHOWCASE_PLAN.md`, re-ordered for the judging criteria (Gen AI is 65%).
The owner said: do not commit yet, and stay on this branch.

- **Built:**
  - the dark "mission rail" sidebar, with the journey pre-sanction → ₹ disbursed → post-disbursement →
    investigate and live counts (`web/src/lib/nav-counts.ts`);
  - the branch-scope switcher (B-65), pinned records, `/queue` (My queue) and the mobile tab bar;
  - **FinRakshak Copilot** (`docs/COPILOT.md`, B-66): the `assistRecord` callable, the grounding check
    in shared plus its runtime copy in functions, and a simulated answer in demo sessions. Open it with
    Ctrl/⌘ J, I, or **Ask AI**.
- **Renames:** Dashboard → Command center, Monitoring → Loan book, Graph Lab → Relationship graph.
- **Next:** the AI hub page (2C), AI in workflows (2B), then the money-trail Sankey and Story mode.

## Cleaning-code session (18 Oct 2026, branch `cleaning-code` from `main`)

For the judging criteria (technical merit and Gen AI 40%, UX 10%); plan and status in
`docs/plans/CLEANING_CODE_PLAN.md`. Owner's answers: full plan, **MIT** license, commit and push to
`cleaning-code` (no PR), credits left as a placeholder. The owner then limited the session to ~20
minutes, so the remaining component splits, the benchmark script and the screenshots were dropped.

- **Lint gap fixed:** ESLint and Prettier ignored every `lib/` folder (also `web/src/lib`); now only
  `functions/lib`. 12 hidden lint errors fixed. `web/src/lib/synth-sample.json` is prettier-ignored
  (byte-compared by `sample.test.ts`).
- **Split into folders, behaviour unchanged** (old files are barrels, no importer changed):
  `state/actions/`, `lib/checks/`, `domain/schemas/`, `demo/seed/` (createDemoDb output compared byte
  for byte), `demo/samples/`, dialogs/tabs into `components/<area>/`, `ReviewStep` into
  `components/applications/review/` with pure `lib/review-form.ts`; `lib/report-data.ts`. New tests:
  `review-form.test.ts`, `report-data.test.ts` (1,579 tests total after merging `main` on 18 Oct 2026).
- **Docs:** README rewritten (all requested sections, Mermaid diagrams, ASCII wireframes, cost,
  benchmarks), `LICENSE` (MIT), `CONTRIBUTING.md`, `.github/pull_request_template.md`; the
  finrakshak-ai-ui skill's code map points at the new folders.
- **Still over ~300 lines:** `pages/MonitoringPage.tsx`, `CaseDetailPage.tsx`, `ReportsPage.tsx`,
  `DocumentsPage.tsx`, `components/graph/EntityGraph.tsx`, `monitoring/AlertDrawer.tsx`,
  `BorrowerProfilePage.tsx`, `ApplicationDetailPage.tsx`, `AlertsPage.tsx`, `DashboardPage.tsx`,
  `LoginPage.tsx`, `lib/graph-lab.ts` (each is one large component; split the JSX next).
- **Not run:** `npm run test:e2e -w web` fails in the cloud container because `@playwright/test`
  1.64 wants a Chromium build that is not installed (environment, not code); `npm run e2e` not run.

## Performance report plan (18 Oct 2026, branch `claude/intelligent-faraday-xbjw3e`)

Plan only, nothing built: `docs/plans/PERFORMANCE_BENCHMARK_PLAN.md` (updated after merging `main`: AI
callables, billed gate, burst and daily limits, agents). It adds a `bench/` workspace (`npm run bench`,
`bench:api` on the emulators, `bench:live`, `bench:report`) and small log-only API changes (tokens and
durations). README section 13 now lists what the benchmark measures and how to run it, with a note that
the scripts are being added; remove that note once `bench/` exists. Owner approved live Gemini calls
(under US$1) and a live run. Open for the owner: the `roles/aiplatform.user` grant, credentials, TEST
users, an App Check debug token, and how to fit ~100 model calls under the daily limit of 30 (B-15).

**Report measured (18 Oct 2026):** `docs/PERFORMANCE_REPORT.md` (offline parts; live API and Gemini
blocked by App Check). Finding for the owner: the scoring replay grows with loans × transactions
(`byAccount` in `packages/shared/src/risk/scoring/run.ts`): 200 loans 31 s, 1,000 loans 761 s. Not fixed.

## How-to-use guide (18 Oct 2026, branch `how-to-use` from `main`)

At the owner's request, added `how-to-use/` for judges: index, quick start, every user flow, a gallery of
31 screenshots (captured with Playwright from `npm run dev -w web`, quick sign-in; desktop, dark mode and
360 px), the AI features and agents, the GCP services, an architecture and code tour, and a demo script
with FAQ. The root README links to it.

Owner's follow-up (same day): **no mocked, simulated or not-connected state in any screenshot or in the
guide.** The session had no Google credentials, so no real Gemini call could be captured; the Copilot,
Help and document-tab screenshots were dropped and every "Simulated" / "Not connected" / "demo session"
notice (including the sidebar's AI status line) is hidden before capture (28 screenshots left). The app
itself still shows those labels (spec §1). Capture a real Copilot / AI investigator run on the deployed
app once an account with AI access is available.

**"Marathi" removed from the repo (owner, 18 Oct 2026)** except `data/raw` and `data/processed` (real
public-record company names, never changed). UI wording now says Devanagari where the code handles
Devanagari digits and names (behaviour unchanged; language code `mr` kept, label "Regional
(Devanagari)"); README, the UI spec, cost guidelines and plans no longer claim Marathi-language support.

## Open decisions and next ideas

- **New loan opens the form directly (18 Oct 2026, branch `ui/loan-page-layout`):** the form path is
  Application form → Risk analysis (name, amount, purpose required). "Upload documents instead" gives
  Upload → Extract & verify → Application form (optional) → Risk analysis; nothing is required on that
  path (owner's answer): continuing fills empty fields from confirmed document fields and the checks
  report what is missing. On the loan page, "Alerts for this loan" now sits directly before
  "Transaction flow". Known, not fixed: the flow graph's SVG makes the Monitoring page scroll
  sideways at 360px (pre-existing).
- **Risk scoring programme (planned 17 Oct 2026):** synthetic transaction data, a daily risk-scoring
  job, a pattern miner agent and an optional explainer agent. **Start at `docs/plans/README.md`**: it has
  the plan index, the 17-step build order with a status per step (steps 1–4 done), the decisions taken and
  the checkpoints that need the owner. Work is on the local branch `plan/synthetic-transactions` (not
  pushed, no PR). Update the status in that README when a step finishes.
- **Risk scoring steps 8 and 9 (17 Oct 2026, branch `risk-scoring-job` from `plan/synthetic-transactions`):**
  scoring core, settings v1, alert decision, reason text and "what changed" block, hand-written pattern
  library v1, file input port, replay and evaluation (`npm run synth && npm run score`). What is built and
  the first replay's numbers: `docs/RISK_SCORING.md`. B-55, B-56 and B-58 added. **Next: checkpoint 2.**
  Under the agreed weights slow-burn and fund-diversion loans cannot reach Needs attention (behaviour max
  10; typology patterns 18), so they never alert; the owner tunes the weights, the 15-point step and the
  3% budget from the replay. Owner's answers to the scorer brief: EMIs inferred from repayments (grace 5
  days, partial below 90%); monitoring rules feed the pattern layer only; direct layer 10 for 2+
  proceedings, 15 for 3+ sources, counterparties left out, status weights 100% in v1; a missing seed
  review means support 0.6 everywhere; months scored on their last IST day.
- **Budget alert (done, checkpoint 3 / B-15):** **Budget alerts exist** (checked 18 Oct 2026 on billing account `My Billing Account`, project `fund-tracer`): `fund-tracer monthly budget` ₹450/month on all services and `fund-tracer Vertex AI (agents)` ₹200/month on the AI services, each alerting at 50%, 90% and 100%. Budgets warn, they do not cap spend; the
  per-user daily limits and per-run caps still apply.
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
  (signed-in only), web loader falls back to `/graph-lab/`. D2 confirmed as Vertex AI by default.
- **After merging `main` (real sign-in):** D3 is wired: a signed-in person with a usable profile
  gets the cloud data (`web/src/lib/cloud/data-access.ts` sends the ID token + App Check token;
  `publicData` verifies both, except in the emulator). `publicData` has its own config
  (`getPublicDataConfig`), so it works without a Gemini key.
- **Tests (this session):** unit tests for storage, store, cloud, coordination, agent, AI,
  extraction, functions and web; Firestore rules and the pipeline's Firestore code run against the
  emulator with `npm run test:emulators` (CI job `emulators`). Bugs found and fixed: lost writes in
  the local blob store under concurrency (per-key lock), `createProposal` failing on a retried run
  after the owner had decided (now a no-op, like the disk store), tool handlers throwing instead of
  rejecting.
- **GCP resources not created yet:** this cloud container has no Google credentials. The owner runs
  `SEED=1 scripts/setup-ingest-gcp.sh fund-tracer` in Cloud Shell, then sets `INGEST_ENABLED=true`
  (see `docs/DEPLOY.md` → Cloud ingestion, including the one-time invoker step).
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
  (storage abstraction, publish step, Cloud Run job) need the GCP project; B-27 decided: a day is an IST day (`istDate` in packages/shared).
- **Merge with `main`:** `main` has a separate Playwright setup under `web/e2e/`
  (`Sanchit-Datir/finrakshak-ai#3`). Expect conflicts in `package.json`, the lockfile,
  `.gitignore` and `.prettierignore` when merging.

- **Hosting bridge (B-46):** `deploy.yml` runs `graphCli --web` before the web build so `/graph-lab/` ships
  with Hosting (fixes "dataset could not be loaded" on the live app). Public, no sign-in. Remove it once the
  cloud `/data/**` feed is live.

## Quick start in a new session

```bash
git checkout feat/public-data-ingest && git pull
npm ci
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web
npm run check && npm run build
npm run e2e                     # all scenarios (Chromium preinstalled in the cloud container)
npm run dev -w web              # manual testing at http://localhost:5173 (quick sign-in)
```

**Gotchas:**

- **ESLint and `lib/`:** fixed on `cleaning-code`: ESLint and Prettier now ignore only
  `functions/lib`, so `web/src/lib` is linted.
- **Missing public-records data:** if a check says "Could not run the public-records check", run
  `graphCli --web`.
- **Saved data:** after schema changes the saved data resets on its own, with a toast.
