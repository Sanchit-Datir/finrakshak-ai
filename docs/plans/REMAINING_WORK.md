# Remaining work: what is pending, what can run in parallel, and how it fits together

_Written 17 Oct 2026, after PR #31 (the risk scoring core) and PR #32 (the W1 handoff page) were merged. Read
this page to take the programme forward. The decisions and the build order are in `docs/plans/README.md`; the
details of each part are in the plan it links to._

## How to read this page

Every section says three things at the top:

- **Parallel?** whether it can run at the same time as other sections, and what it must wait for.
- **Owner:** the person the current split suggests (Sanchit = S, Abhishek = A). It can be swapped.
- **Size:** small, medium or large (relative, not hours).

Plain words: a **job** is plain code that runs on a schedule (no model). An **agent** is a job that calls a
model (Gemini on Vertex AI) and whose output a person or the code checks. This programme has one agent
running today, one parked, and one deferred.

## Status update (17 Oct 2026, branch `remaining-work-changes`)

| Section | State                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1      | Done on `main` (PR #34): matcher wired in, contract changes, settings v2                                                                                                                           |
| W2a–W2f | Code and tests done: `ingest/src/risk/{synthTables,synthLoadCli,bigQueryInputs,daily,step,scoreWriter,scoreStore}.ts`, `ingest/src/cloud/scoreTask.ts`, rules, setup/deploy scripts, workflow step |
| W2g     | **Owner:** setup run, data load and dry run (`docs/DEPLOY.md` → Synthetic risk scores)                                                                                                             |
| W3a–W3e | Done: shared schemas (`packages/shared/src/risk/scoring/store.ts`), `getRiskScores` callable, page `/monitoring/risk-scores`, alerts source `risk_score`, e2e `e2e/tests/risk-scores.spec.ts`      |
| W4      | Owner tasks, unchanged                                                                                                                                                                             |
| W5      | Status rows, session notes and B-57 updated                                                                                                                                                        |

**Owner's answers (17 Oct 2026):** Q1, Q2, Q3, Q4 and Q6 confirmed as suggested (section 8). The cloud
scorer reads public-record flags from `fundtrace_synth`, not from the public dataset, because the synthetic
flags name SYNTH companies that real records never match (B-54); from the public pipeline it reads only the
published build's date (B-43, B-50). Accepted. **Who sees the scores:** for now everyone signed in with a
usable profile sees every branch's synthetic scores (`RISK_SCORES_SCOPE` in
`functions/src/services/riskScores.ts`); branch scoping stays supported in the service and will be decided
later.

## 1. Where things stand

Done and on `main`: build steps 1–9 and the pattern contract. `npm run check` and `npm run build` pass.

| Piece                                                        | State                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Monitoring rules in `packages/shared`, with golden tests     | Done                                                                     |
| Synthetic data generator, 12 scenarios, 200 customers        | Done (`npm run synth`)                                                   |
| Pattern contract, matcher and candidate finder               | Done; the finder found **no useful candidates** (checkpoint 1)           |
| Scoring core, patterns v1, alert decision, reason text       | Done (`docs/RISK_SCORING.md`); `npm run score` replays 24 months locally |
| Real matcher wired into the scoring command                  | **Not yet** (W1a)                                                        |
| Anything in the cloud for scoring (BigQuery, Firestore, job) | **Not started** (W2)                                                     |
| Callable and app view for scores                             | **Not started** (W3)                                                     |
| Miner agent, approval flow, explainer agent                  | **Parked or deferred** (section 7)                                       |

Latest replay on the full synthetic set (before the matcher is wired in): 46 alerts, 12.5 per 1,000
loan-months (about 1.25% of loans a month, under the provisional 3% budget). Controls and the look-alikes
(seasonal, big prepayment, near threshold) alert 0 times. 74 defaulter loans are missed, because under the
agreed weights `slow_burn`, `fund_diversion` and `contagion` cannot reach the Needs attention cut-off.

## 2. How the pieces connect

```
public sources ─▶ ingest-acquire ─▶ ingest-extract (AI, off) ─▶ ingest-build ─▶ BigQuery fundtrace_public
                                                                       │
                                                                       ▼
                                   [NEW] ingest-score (job, no model, off by default)
                                          reads: public tables + loans/transactions (synthetic dataset)
                                          writes: BigQuery risk_scores / risk_alerts / risk_patterns
                                                  Firestore synthRiskLatest / synthRiskAlerts
                                                                       │
                                                                       ▼
                                   ingest-agent (AI review of the run, runs today)
                                                                       │
                          [NEW] getRiskScores callable ◀── Firestore ──┘      app: loan view, Alerts
```

Two interfaces keep the workstreams apart, and both already exist in code:

| Interface                                              | Where                                                       | Rule from now on                    |
| ------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------- |
| Input: `ScoringInputPort` / `ScoringData`              | `ingest/src/risk/inputs.ts`                                 | Change additively; say so in the PR |
| Output: `LoanScoreSchema`                              | `packages/shared/src/risk/scoring/types.ts`                 | Change additively; say so in the PR |
| Patterns: `Pattern`, `PatternSource`, `PatternMatcher` | `packages/shared/src/risk/patterns/`, `PATTERN_CONTRACT.md` | Changes only through W1c            |

## 3. Sections of work

### W1. Scoring quality

**Parallel?** Yes, with W2 and W3 (separate files). Inside W1 the order is serial: W1a, then W1c, then W1b.
**Owner:** S. **Size:** medium. **Full instructions:** `docs/plans/HANDOFF_SANCHIT_W1.md`.

- **W1a** wire the real `matchPattern` into `npm run score` in place of `noMatcher`, fix the docs that say it
  is missing, and report how the replay numbers change.
- **W1c** the three contract changes: a refused result from `PatternSource.load()`, how `graph_proximity`
  patterns relate to the graph layer, and renaming `evidence_event_ids` to `evidence_ids`.
- **W1b** tuning for checkpoint 2: measured options for making `slow_burn`, `fund_diversion` and `contagion`
  alert without alerting controls; the owner chooses; publish as settings v2 and keep v1 readable.

Why it should merge early: W3's screens show whatever scores W1 produces, and W2's dry run should use the
final matcher.

### W2. Cloud scoring job (build steps 10 and 11)

**Parallel?** Yes, with W1 and W3. Inside W2 the order is mostly serial, as marked. **Owner:** A.
**Size:** large. **Needs from the owner:** checkpoint 3 (the GCP setup run and the budget alert) before the
real dry run only; the code and its unit tests do not need GCP.

| Step | What                                                                                                                                                                                                                                                                                                                                       | Parallel?                | Reuses                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2a  | Load the synthetic data (`data/synthetic/*.jsonl`) into a separate BigQuery dataset `fundtrace_synth` (B-54: never into the public dataset). A guard refuses any dataset whose name does not end in `_synth`.                                                                                                                              | Yes, with W2e            | `BigQueryLoader` and `LoadSpec` in `ingest/src/cloud/bigquery.ts`; `bigQuerySchema` in `ingest/src/dataset/bigquery.ts` builds BigQuery schemas from zod |
| W2b  | A BigQuery `ScoringInputPort`: public records, entities and links from the published public dataset, loans and transactions from `fundtrace_synth`. Parse every row with zod; never return truth labels (B-55).                                                                                                                            | After W2a                | `ScoringInputPort` and the file implementation in `ingest/src/risk/fileInputs.ts` as the model                                                           |
| W2c  | The score writer: BigQuery `risk_scores`, `risk_alerts`, `risk_patterns` (a snapshot of the library each run). Append only, with a **deterministic job id** so a retry is a no-op (B-24), partitioned by `as_of`. Add B-57 (history immutable).                                                                                            | After W2b                | `LoadSpec` modes `append`, `jobId`, `partitionBy`, `clusterBy`                                                                                           |
| W2d  | The `score` task: `ingest/src/cloud/scoreTask.ts`, registered in `TASKS` in `cloud/main.ts` with a new role `scorer`; a lease `score-synthetic`; off by default behind `FUNDTRACE_SCORE_ENABLED`; reads the published build only (B-50).                                                                                                   | After W2b and W2c        | `makeDeps` in `cloud/context.ts`, `FirestoreLeaseManager`, the run log, the pattern of `agentTask.ts`                                                    |
| W2e  | Firestore: `synthRiskLatest/{loanId}` and `synthRiskAlerts/{alertId}`; default-deny rules, plus emulator rules tests. Agree the document shape with W3 **first**.                                                                                                                                                                          | Yes, with W2a–W2c        | `firestore.rules`; `functions/src/rules/firestoreRules.emulator.test.ts`; `npm run test:emulators`                                                       |
| W2f  | Infrastructure: service account `ingest-scorer` in `scripts/setup-ingest-gcp.sh`, a job in `scripts/deploy-ingest.sh`, and a step in `infra/workflows/ingest-daily.yaml` after `build` and before `agent`, wrapped like the other steps and retried **once** by the workflow (a code-triggered retry, safe because ids are deterministic). | After W2d                | The `deploy_job` helper, the existing `run_job` and failure handling in the workflow                                                                     |
| W2g  | Staging dry run: execute the job by hand, check the row counts and a replay month in `risk_scores`, then switch the step on.                                                                                                                                                                                                               | Last; needs checkpoint 3 | The dry-run approach in `docs/DEPLOY.md`                                                                                                                 |

Decisions the cloud work needs (see section 8): whether the scorer's account may create objects in a staging
location for the load files, and which dataset it reads while the public pipeline is still a dry run.

### W3. App and callable (build step 13)

**Parallel?** Yes, with W1 and W2: build against the Firestore **emulator** seeded from
`data/synthetic/scores.jsonl`. Only the last integration test needs W2e and W2g. **Owner:** S (after W1).
**Size:** large.

| Step | What                                                                                                                                                                                                                                                                                                                                           | Reuses                                                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3a  | The result schema for `getRiskScores` in `packages/shared`, parsed on the web side. Latest score per loan: score, band, reasons, "what changed" text, settings and pattern versions, data date, a `stale_inputs` flag.                                                                                                                         | `LoanScoreSchema`; the web already parses callable results with shared schemas (`web/src/lib/cloud/profile.ts`)                                                                              |
| W3b  | The callable `functions/src/callable/getRiskScores.ts`: check `request.auth`, validate input with zod, authorise by the caller's profile and `branchId` (or admin), read Firestore, return the typed result; App Check on; `maxInstances` and small memory. Thin handler, logic in `services/`.                                                | `decideProposal.ts` for the pattern (narrow local zod schemas plus `AssertTrue` checks that they match shared); `getProfile` and the `users/{uid}` profile; `functions/src/index.ts` exports |
| W3c  | The app view. A recommended design: a new page for synthetic risk scores, not a merge into the demo loan book, because the synthetic loans are different loans from the demo ones. Show band with icon and text, reasons, the "what changed" block and the data date; label everything "Synthetic test data"; wording from `domain/labels.ts`. | `MonitoringPage`, `PublicRecordsWatchPage` for layout; `fundtrace-ui` skill (`.claude/skills/fundtrace-ui/SKILL.md`); every async view needs loading, empty, error and success states        |
| W3d  | An alerts source: add `'risk_score'` to `UnifiedAlert.source` and `SOURCE_LABEL` in `web/src/lib/alerts.ts`, so band-up and override alerts appear on the Alerts page.                                                                                                                                                                         | `web/src/lib/alerts.ts`                                                                                                                                                                      |
| W3e  | End-to-end test on the synthetic sample.                                                                                                                                                                                                                                                                                                       | `e2e/` and `npm run e2e`                                                                                                                                                                     |

Read `CLAUDE.md` before this section: callables follow `callable/` (thin) → `services/` → `config/`, the web
app never calls Gemini or Firestore directly (it has no Firestore package on purpose), and functions deploy
without workspace packages.

### W4. Owner tasks (not code)

**Parallel?** Yes, and these block the others at the points shown. **Owner:** A.

| Task                                                                                                                                                                      | Blocks                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Review the 23 seed cases (`npm run miner`, `data/verification/README.md`); this creates `seed_review.json`                                                                | Pattern support weights (every run records `no_seed_review` and uses 0.6 until then) |
| **Checkpoint 2:** choose a tuning option from W1b                                                                                                                         | Publishing settings v2                                                               |
| **Checkpoint 3:** run `scripts/setup-ingest-gcp.sh` (see `docs/DEPLOY.md`) and create the budget alert (B-15, **done 18 Oct 2026**); create the `fundtrace_synth` dataset | The real dry run in W2g                                                              |
| Set `INGEST_ENABLED=true` (and later `INGEST_PUBLISH_ENABLED=true`) if not already set                                                                                    | Deployment of any new job                                                            |

### W5. Housekeeping

**Parallel?** Yes, small, best at the end. **Owner:** whoever finishes last. **Size:** small.

- Build step 16: update `docs/SESSION_NOTES.md`, finish the synthetic data README.
- Keep the status rows in `docs/plans/README.md` current (each person edits only their own rows).
- Add the remaining boundary conditions in the commit that first needs them (section 9).

## 4. Dependencies at a glance

| Section        | Can start now?                           | Must wait for                               | Can run alongside |
| -------------- | ---------------------------------------- | ------------------------------------------- | ----------------- |
| W1a            | Yes                                      | nothing                                     | W2, W3, W4        |
| W1c            | Yes (after W1a is advised, not required) | nothing                                     | W2, W3, W4        |
| W1b            | After W1a (the numbers change)           | W1a, then the owner's choice                | W2, W3            |
| W2a, W2e       | Yes                                      | nothing (the dry run needs W4 checkpoint 3) | W1, W3            |
| W2b–W2d, W2f   | After W2a, in order                      | previous W2 step                            | W1, W3            |
| W2g            | No                                       | W2f, W4 checkpoint 3, preferably W1a        | W3 (after W2e)    |
| W3a–W3e        | Yes, on the emulator                     | the Firestore shape agreed with W2e         | W1, W2            |
| W3 integration | No                                       | W2e, W2g                                    | n/a               |

Suggested waves: **wave 1** W1a, W2a, W2e, W3a and the owner's seed review; **wave 2** W1c, W2b, W2c, W3b,
W3c; **wave 3** W1b, W2d, W2f, W3d, W3e; **wave 4** W2g, the integration run, W5.

## 5. When the agents run, and how

### What runs every day

The Cloud Scheduler starts the Cloud Workflow `ingest-daily` at 03:05 IST. It runs the jobs in this order
(`infra/workflows/ingest-daily.yaml`):

| Order | Job                                                     | Type                 | Notes                                                                                      |
| ----- | ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| 1     | `ingest-acquire` (one task per source)                  | Job                  | Delta detection and fetch; a failure is recorded and the run continues                     |
| 2     | `ingest-extract`                                        | **Agent** (Gemini)   | AI evidence extraction in shadow mode; **off by default** (`FUNDTRACE_AI_EXTRACT_ENABLED`) |
| 3     | `ingest-build`                                          | Job                  | Publish gates, versioned publish, BigQuery load                                            |
| 4     | **`ingest-score` (new)**                                | **Job, no model**    | Added by W2f; off by default; retried once by the workflow                                 |
| 5     | `ingest-agent`                                          | **Agent** (Gemini)   | Reviews the whole run; may propose actions for the owner; 15-minute limit                  |
| 6     | Re-run of failed sources, then rebuild and review again | Jobs, one agent call | Only when the agent's code-computed findings call for it (transient errors)                |

### How the one running agent behaves

- **Who runs it:** the Cloud Run job `ingest-agent`, under its own service account `ingest-agent`.
- **What decides what it says:** code computes the findings and baselines first. The model sees a digest and
  has a closed set of tools (`get_run_summary`, `get_delta`, `get_source_history`, `get_diagnostic_page`,
  `propose_action`, `submit_review`). It can call at most 8 tools and sees at most 60,000 characters.
- **When the model is not called:** on a healthy day, with the kill switch on (`FUNDTRACE_AGENT_ENABLED=false`),
  with the `mock` provider, or if the model fails. The review is then a code-written text, marked as such.
- **What it can change:** nothing in the pipeline. It writes a review (`ingestReviews/{runId}`) and
  proposals (`agentProposals/{id}`). A person decides through the `decideProposal` callable. The only
  automatic action is a code-set re-run of a source after a transient error.
- **Provider:** `scripts/deploy-ingest.sh` sets the provider to Vertex AI with the cheapest model by default;
  tests and local runs use `mock` and never call a billed API.

### What does not run yet

| Agent                        | Status           | When it would run                                                                   | How                                                                                                                         |
| ---------------------------- | ---------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Pattern miner                | **Parked**       | On demand only: `gcloud run jobs execute ingest-miner`; never in the daily workflow | Code finds candidates, the model only words them, **you approve** each pattern (section 7)                                  |
| Risk explainer               | **Deferred**     | Daily, right after `ingest-score`, only if built                                    | One short call per alerted loan; reads stored reason codes only; its words are labelled and sit beside the recorded reasons |
| Scoring job (`ingest-score`) | **Not an agent** | Daily, after `build`                                                                | Deterministic code and SQL; no model, ever                                                                                  |

Every agent starts on the `mock` provider. The first real model call for a new agent is a capped dry run that
needs the budget alert (checkpoint 3) and the owner's approval (checkpoint 4).

## 6. How existing code is used

| You need to...                                     | Use this                                                                                            | Where                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Add a Cloud Run job step                           | The task table `TASKS`, the role in `makeDeps`, env parsing in `CloudEnv`                           | `ingest/src/cloud/main.ts`, `context.ts`, `env.ts`                  |
| Stop two runs writing at once                      | `FirestoreLeaseManager` (leases expire by TTL on `expiresAt`)                                       | `ingest/src/coordination/`                                          |
| Record a run                                       | `RunLog` implementations (Firestore for the cloud)                                                  | `ingest/src/coordination/runLog.ts`                                 |
| Load rows into BigQuery safely                     | `BigQueryLoader` with `LoadSpec` (`replace` swaps a snapshot; `append` adds history, with a job id) | `ingest/src/cloud/bigquery.ts`                                      |
| Build a BigQuery schema from a zod schema          | `bigQuerySchema`                                                                                    | `ingest/src/dataset/bigquery.ts`                                    |
| Read and write files or Cloud Storage the same way | The storage port (`fs` or `gcs`)                                                                    | `ingest/src/storage/`                                               |
| Score a loan                                       | `scoreRun` and the layers (pure functions)                                                          | `packages/shared/src/risk/scoring/`                                 |
| Detect the five transaction patterns               | `detectMonitoring`                                                                                  | `packages/shared/src/risk/rules/`                                   |
| Match a pattern against a timeline                 | `matchPattern`, `timelineFromEvents`, the conformance runner and fixtures                           | `packages/shared/src/risk/patterns/`                                |
| Get synthetic loans and truth labels               | `npm run synth`, then `npm run score` to replay and compare                                         | `ingest/src/synth/`, `ingest/src/risk/`, `data/synthetic/`          |
| Add a callable                                     | The `decideProposal` pattern: auth, zod input, authorise, act, typed result, App Check              | `functions/src/callable/`, `functions/src/index.ts`                 |
| Add a Firestore collection                         | A rule in `firestore.rules`, an emulator rules test, an index entry if a query needs one            | `firestore.rules`, `functions/src/rules/`, `firestore.indexes.json` |
| Call a callable from the web app                   | The `lib/cloud` helpers; parse the result with a shared schema                                      | `web/src/lib/cloud/`                                                |
| Show an alert in the app                           | `UnifiedAlert` and its sources                                                                      | `web/src/lib/alerts.ts`                                             |
| Run an agent safely (if you ever add one)          | `ToolModel`, `MockToolModel`, `GeminiToolModel`, `AiConfig`, the wording check, versioned prompts   | `ingest/src/ai/`, `ingest/src/agent/`, `AGENTS_PLAN.md`             |

## 7. Parked and deferred work

**Pattern miner agent (build steps 12, 14, 15).** Checkpoint 1 found no candidates: in 18 of the 20 seed
cases that have an insolvency or liquidation record, that record is the earliest the data holds (the ED
records start in June 2022 and the NFRA records in December 2019, after most 2017–2019 insolvency
announcements). The tools are built and tested on planted patterns, so they will find patterns if the data
ever holds some. The owner decided to keep the steps in the plan.

- **Unpark when:** earlier ED and NFRA records are available, or other sources arrive (rating changes,
  auditor resignations, stock exchange disclosures), or real bank defaults give transaction-level history.
- **What stays valid meanwhile:** the contract, the matcher, the candidate finder and the pattern layer; the
  hand-written library carries the pattern layer.
- **When unparked, the order is:** `agentRuns` envelope and proposal storage with the `decidePattern`
  callable (step 12); edge-case tests for the ingestion agent's loop, then extract `runToolLoop`, then the
  miner (step 14, with checkpoint 4); the approval view and Firestore pattern source (step 15). All of it is
  in `PATTERN_MINER_PLAN.md` and `AGENTS_PLAN.md`.

**Risk explainer agent (step 17).** Deferred until after the app view exists. Build it only if alerts with
several reasons read badly in the templated text (which already has the "new / unchanged / score change"
block) **and** the budget alert exists. Stop rule for its dry run: if more than about 1 in 10 sentences
fails the checks, drop it. See `RISK_EXPLAINER_PLAN.md`.

**Real bank data.** Out of scope. If it ever arrives it needs its own dataset, service account, review of
B-38, and a separate mode of the scoring job; synthetic and real data never mix (B-54).

## 8. Open questions

| #   | Question                                                                                                                                                                           | Affects  | Suggested answer                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Q1  | The BigQuery loader reads a `gs://` file. May the scorer's service account create objects in a staging location? The plan said "no bucket write", which conflicts with the loader. | W2c, W2f | **Decided: yes**, create-only, limited to `interim/risk-load/` by an IAM condition            |
| Q2  | While the public pipeline is still a dry run, the scorer should read `fundtrace_public_dryrun`. Is that the dataset it reads until publishing is switched on?                      | W2b      | **Decided: yes**; it reads the `dry-run` channel's build date until publishing is switched on |
| Q3  | Are the Firestore document shapes `synthRiskLatest/{loanId}` (the latest `LoanScore` plus `loan_id`) and `synthRiskAlerts/{alertId}` right?                                        | W2e, W3  | **Decided: yes**; shapes in `packages/shared/src/risk/scoring/store.ts`                       |
| Q4  | Should the app show synthetic scores on a separate page or merge them into the demo loan book?                                                                                     | W3c      | **Decided: separate page** (`/monitoring/risk-scores`)                                        |
| Q5  | Who has access to the GCP project and can run the setup script?                                                                                                                    | W4, W2g  | To confirm                                                                                    |
| Q6  | Service accounts hold project-wide Firestore access today (`roles/datastore.user`), so a job's write limits rely on its code. Is that acceptable for the scorer?                   | W2f      | **Decided: yes for now**; `scoreStore.emulator.test.ts` lists the collections it writes       |

## 9. Boundary conditions to call out

Name the ID in your reply and your PR whenever you touch one. New ones are added to
`docs/BOUNDARY_CONDITIONS.md` in the commit that first needs them.

| ID               | Where it bites in this work                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| B-01, B-03, B-05 | Money as integer paise, rounding of points (all scoring work)                                               |
| B-15             | Cost: no model in the scoring job; budget alert before any real provider; bytes-billed caps on queries (W2) |
| B-24             | Idempotency: deterministic score ids and BigQuery job ids (W2c)                                             |
| B-27             | `as_of` is an IST day                                                                                       |
| B-36, B-37, B-40 | Evidence status never upgraded; exact entity matching; hubs excluded                                        |
| B-43             | Every score stores the public data date                                                                     |
| B-50, B-51       | Read only the published build; a lease stops concurrent runs (W2d)                                          |
| B-54, B-55       | Synthetic data only, never mixed with real; results prove plumbing, not accuracy                            |
| B-56, B-58       | Stale or missing inputs are not low risk; a score is a lead, not a verdict (wording, W3c)                   |
| **B-57 (new)**   | Score history is immutable; corrections are new rows. Add in W2c.                                           |
| B-60 to B-63     | Miner and explainer: built (B-59 went to the prepayment rule, so the defaulters condition is B-63)          |

## 10. Rules for everyone

- One workstream per branch, cut from `main`; one PR per workstream; `git merge origin/main` before opening
  the PR (the `Up to date with main` check).
- `npm run check && npm run build` must pass before any commit. Ask the owner before committing; push only
  when asked.
- Tests next to the source, never a real model or billed API, zod on all external data (`CLAUDE.md`).
- Never change `data/raw`, `data/processed` or `data/registry`.
- Edit only your own lines in shared files (`packages/shared/src/risk/index.ts`, the status rows of
  `docs/plans/README.md`).
- Wording is Routine review, Needs attention, Urgent review; never "fraud".
