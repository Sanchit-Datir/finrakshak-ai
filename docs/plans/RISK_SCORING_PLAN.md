# Plan: Risk scoring job

_Status: approved by the owner on 17 Oct 2026 (decisions listed at the end). Nothing here is implemented. It depends on the
synthetic data generator in `docs/plans/SYNTHETIC_TRANSACTIONS_PLAN.md` (at least its MVPs 1–2)._

## Goal

Tell, for every loan, whether the risk **has increased** since the last check, and why. A loan is scored
against four things: public adverse records (direct matches), patterns learned from the historical cases,
closeness to flagged entities in the relationship graph, and the loan's own transaction behaviour. Each
score is stored with its reasons, so the next run can say what changed.

The owner's rules already accepted (17 Oct 2026):

- Score 0–100: direct match 40, pattern match 30, graph proximity 20, own behaviour drift 10.
- Bands: Routine review below 30, Needs attention 30–59, Urgent review 60 and above.
- An insolvency, liquidation or ED record on the borrower after disbursement goes straight to Urgent review.
- An alert fires when the band steps up, or when the score rises 15 or more points inside a band **and** a
  new reason appeared. No new reason, no alert; an already-alerted reason does not alert again.
- A fall is recorded without an alert; the band steps down only after 2 clean runs in a row.
- Weights, cut-offs and the step live in versioned settings, and every score records the version used.

## What exists today

| Piece                                 | Where                                                                                                                     | Use here                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Public data tables (11)               | BigQuery, built daily by `ingest-build` (`entities`, `case_events`, `relationships`, `risk_signals`, and others)          | Direct and graph layers read the published build |
| Seed cases and timelines              | `case_seeds`, `case_timelines.json` (23 cases, all `seed_candidate_unverified`)                                           | Source of the pattern library                    |
| Exact matching rule (B-37)            | `web/src/lib/public-records.ts`: CIN first, then exact normalised name; record kinds insolvency, liquidation, enforcement | The direct layer must match the same way         |
| Transaction rules and thresholds      | `web/src/lib/monitoring.ts` (402 lines), thresholds in `settings.monitoring`                                              | Feed the pattern and behaviour layers            |
| Bands and wording                     | `Priority`: `routine`, `needs_attention`, `urgent`; labels in `web/src/domain/labels.ts`                                  | Reused as is                                     |
| Cloud Run job pattern                 | `ingest/src/cloud/main.ts` (`TASKS`), `scripts/deploy-ingest.sh`, `infra/workflows/ingest-daily.yaml`                     | The scoring job is one more task                 |
| Approval flow for AI proposals        | `agentProposals`, `decideProposal` callable                                                                               | Reused later for pattern approval                |
| Synthetic loans, transactions, labels | the synthetic plan                                                                                                        | Test input and ground truth                      |

## Design decisions

1. **One pure scoring core in `packages/shared/src/risk/`.** It takes plain typed arrays and returns scores
   and alert decisions. It does no I/O, so the same code can run in the Cloud Run job, in a local CLI and,
   later, in the app. This follows how the repo already separates pure logic from tasks.
2. **Move the rule detection to shared, keep the wording in web.** `monitoring.ts` and the record-kind
   mapping in `public-records.ts` import only types and a money formatter, so the detection can become pure
   functions over structural types. That avoids the zod 3 versus 4 split (the web schemas are not
   imported; plain TypeScript shapes are). The web app keeps building its alert text and calls the shared
   detection. This settles the open question from the synthetic plan.
3. **Inputs come through a port**, like the storage port in `ingest/src/storage/`: a BigQuery
   implementation for the cloud and a file implementation for local runs on `data/processed` and
   `data/synthetic`.
4. **No model calls in the scoring job.** Reasons are templated from reason codes, and each alert carries a
   deterministic "new since last check / unchanged / score change" block computed from the previous and
   current reasons. An explainer agent that rewrites them in plain language is optional, deferred until after
   the app view exists, and built only if the templated text reads badly (`RISK_EXPLAINER_PLAN.md`).
5. **Synthetic and real never mix (B-54).** The job runs in a `synthetic` mode that reads and writes only
   `*_synth` datasets and `synth`-prefixed Firestore collections. A real mode is created only when real
   bank data exists, with its own dataset, service account and review.
6. **The app reads scores through a callable.** The web app deliberately does not use Firestore
   (CLAUDE.md, `audit:prod`), so a thin callable `getRiskScores` (auth, zod input, branch authorisation,
   zod-typed result, App Check) reads Firestore and returns the latest score per loan.

## The score (starting values, all in versioned settings)

Each layer returns points and a list of reasons (code, evidence ids, evidence status, source). The total is
the sum, capped at 100.

**Direct match (max 40).** Subjects: the borrower, its directors and owners, and the top counterparties.
Exact CIN or exact normalised name only (B-37).

| Record on the borrower                                                  | Points | Override to Urgent |
| ----------------------------------------------------------------------- | -----: | ------------------ |
| Insolvency, liquidation or enforcement record, dated after disbursement |     40 | Yes                |
| Same kinds, dated before disbursement (context)                         |     25 | No                 |
| NFRA finding                                                            |     15 | No                 |
| Several adverse proceedings, or presence in 3 or more sources           |  10–15 | No                 |
| A director or owner with the same records                               |   half | No                 |

Evidence status (B-36) is stored with each reason and never upgraded. Weighting by status applies to the
non-override rows; the override rows follow the owner's decision above.

**Graph proximity (max 20).** Distance from the borrower to a flagged entity through documented links.
One hop 20 (10 if the link is only inferred), two hops 10 (5), three or more 0. Hubs (large bank creditors,
regulators, shared service addresses, busy insolvency professionals) are excluded (B-40).

**Pattern match (max 30).** For each matched pattern, points are `round(30 × match strength × support)`; the
layer takes the **largest single pattern's points, not the sum**, so overlapping patterns do not double
count (decided 17 Oct 2026). Patterns carry no weights; the scorer computes support from the seed
verification file at score time (`PATTERN_CONTRACT.md`). Support is 1.0 for a pattern backed
by 3 or more **verified** cases, 0.6 for 1–2, and capped at 0.6 while the seed cases are still
`seed_candidate_unverified` (all 23 are today). Two families of pattern:

- public-record sequences from the case timelines (for example an ED search followed by CIRP within a set
  number of months), matched against the borrower's own public timeline;
- transaction typologies: the five existing monitoring rules plus any approved additions.

Output is always "similar to cases X and Y", never a probability.

**Own behaviour drift (max 10).** From the loan's own transactions: one missed EMI 4, two in a row 8,
three or more or a growing delay for three months 10; a falling balance trend adds up to 2 within the cap.

## Output and storage

BigQuery tables, append-only (corrections are new rows), in `fundtrace_synth` for now:

| Table           | Key fields                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `risk_scores`   | `score_id` (deterministic), `run_id`, `as_of` (IST day), `loan_id`, `borrower_id`, `score`, `band`, points per layer, `reasons` (repeated record), `settings_version`, `pattern_version`, `data_built_at` (B-43), `previous_score`, `previous_band`, `delta`, `alert_kind`, `stale_inputs` |
| `risk_alerts`   | `alert_id` = loan + reason code + evidence key (so a repeat is the same row), `band`, `reasons`, `created_at`, `status`                                                                                                                                                                    |
| `risk_patterns` | per run: `library_version`, `content_hash`, and each `Pattern` of the library (`PATTERN_CONTRACT.md`)                                                                                                                                                                                      |

Firestore (written by the job, read only through the callable): `synthRiskLatest/{loanId}` with the latest
score, band, top reasons, `as_of`, settings version and data date; `synthRiskAlerts/{alertId}`. Rules are
default-deny with no client writes, plus an emulator rules test for each collection (CLAUDE.md).

The live pattern library is **one Firestore document**, `riskPatternLibrary/current` (approved by the owner,
see `docs/plans/PATTERN_MINER_PLAN.md`), with immutable copies `riskPatternLibrary/v<n>`; the scorer reads one
consistent snapshot. Its exact shape, and how the scorer and the miner share it, is
`docs/plans/PATTERN_CONTRACT.md`. The BigQuery `risk_patterns` table is a **snapshot of the library taken on
each scoring run** (`library_version`, `content_hash` and the patterns), so any past score can be reproduced.

## Alert decision (pure function, one table-driven test)

`decideAlert(previous, current, settings, alreadyAlerted)` returns `none`, `band_up`,
`rise_with_new_reason`, `override` or `initial`. It also applies the step-down rule (2 clean runs). Cases
that must be covered: no change; band up; rise of 14 and of 15 points; rise with and without a new reason;
same reason already alerted; fall; fall for one run then recovery; override reason; first score ever;
missing previous row; stale inputs.

## Job and wiring

- **Task:** `score` in `ingest/src/cloud/main.ts`, new role `scorer`, run as Cloud Run job `ingest-score`.
- **Service account** `ingest-scorer`: BigQuery job user, data editor on the `*_synth` dataset only, data
  viewer on the public dataset, Firestore write on the `synth*` collections only, no bucket write.
- **Order in `ingest-daily.yaml`:** after `build`, before `agent`; a failure is recorded like the other
  steps. It is **off by default** (`FUNDTRACE_SCORE_ENABLED`), as extraction is.
- **Reads only the published, gated build** (B-50), never an interim one.
- **Lease:** a Firestore lease `score-synthetic` stops two runs from writing at once (B-51).
- **Idempotent:** deterministic `score_id`; a re-run for the same `as_of` inserts nothing new.
- **One retry, by the workflow:** a failed `score` task is retried once by `ingest-daily.yaml` (a code
  trigger, safe because of the idempotence above), never by an agent. Nothing else about scores, bands or
  alerts is automatic beyond the daily run itself (`AGENTS_PLAN.md`, Autonomy).
- **Replay:** `--as-of` and a replay mode run the months in order, which is how the delta is tested.
- **Local CLI** `scoreCli.ts`, like `graphCli.ts`, runs the same core on files.
- **Cost (B-15):** queries set `maximumBytesBilled`. My estimate is a few hundred MB scanned per run
  against the 1 TB a month free tier; confirm after the first dry run.

## Evaluation on synthetic data (plumbing, not accuracy: B-55)

A harness replays the 24 months and compares the output with `SynthTruth`:

- controls and look-alikes: zero alerts;
- defaulters: an alert within a set number of months of their onset month, with the expected reason codes;
- `expected_rules` match the rules actually raised;
- `dormant_burst` (held out): no pattern match, and any alert comes from other layers only;
- alert volume per 1,000 loans per month, to compare with reviewer capacity.

The report is written under `data/synthetic/` (git-ignored) and the thresholds in the settings are tuned
from it. They stay provisional until real history exists.

## Files

```
packages/shared/src/risk/
  settings.ts        zod schema and defaults for the versioned settings
  rules/             rapidOnward.ts, circular.ts, cashSplit.ts, linkedCounterparty.ts,
                     repeatedCounterparty.ts (detection moved from web/src/lib/monitoring.ts)
  recordKinds.ts     case_type to insolvency / liquidation / enforcement (from public-records.ts)
  direct.ts, graph.ts, patterns.ts, behaviour.ts   the four layers
  score.ts           combines layers, applies bands and overrides
  decide.ts          decideAlert and the step-down rule
  *.test.ts          one test file per module
ingest/src/risk/
  inputs.ts          the input port
  bigqueryInputs.ts, fileInputs.ts
  writeScores.ts     BigQuery insert and Firestore latest/alerts
  evaluate.ts        replay harness against SynthTruth
ingest/src/cloud/scoreTask.ts (+ test)      the Cloud Run task
ingest/src/scoreCli.ts                      local run
functions/src/callable/getRiskScores.ts (+ test), functions/src/services/riskScores.ts
firestore.rules, firestore.indexes.json     new collections and rules test
infra/workflows/ingest-daily.yaml, scripts/setup-ingest-gcp.sh, scripts/deploy-ingest.sh
web/src/lib/monitoring.ts                   keeps wording, calls the shared detection
```

## MVPs (one commit each, on request only)

| MVP | Content                                                                                                                                                  | Done when                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0   | Characterisation tests for `monitoring.ts` (it has only 35 lines of tests) and the record-kind mapping                                                   | tests pass on the unchanged code, so a move can be proven identical |
| 1   | Move rule detection and record kinds to `packages/shared/src/risk/`; web calls them                                                                      | the MVP 0 tests still pass; `npm run check && npm run build` pass   |
| 2   | Settings, the four layers, score, bands, `decideAlert`; reason templates and the "what changed" block; file inputs; `scoreCli`; evaluation on the sample | decision table passes; controls and look-alikes give no alert       |
| 3   | BigQuery tables and writer, `score` task, workflow step (off), Firestore collections, rules and tests                                                    | dry run in staging writes `risk_scores`; rules emulator tests pass  |
| 4   | Pattern library v1 (hand-written from the case timelines and the five rules) and the pattern layer                                                       | pattern tests pass; support caps applied                            |
| 5   | `getRiskScores` callable and the app view: score, band, reasons, "since last check", Alerts source `risk_score`, labelled "Synthetic test data"          | e2e scenario on the synthetic sample passes                         |
| 6   | Optional explainer agent for the reasons of alerted loans                                                                                                | capped per run; mock model in tests                                 |

The **pattern miner agent** (drafting patterns from the case timelines for the owner to approve) is a
separate plan. MVP 4 hand-writes version 1 so scoring is not blocked on it.

## Boundary conditions

Touched, with how each is handled:

- **B-15 cost:** no model calls in the job; bytes-billed cap on every query; mock model for the optional agent.
- **B-24 idempotency:** deterministic ids; re-runs add nothing.
- **B-27 IST day:** `as_of` is an IST day (`istDate`).
- **B-36 evidence status:** stored on every reason, never upgraded; the owner's override is the one rule that acts on enforcement records.
- **B-37 entity matching:** exact CIN or exact normalised name only.
- **B-38 personal data:** the synthetic mode holds none; a real mode needs its own dataset and review first.
- **B-40 hubs:** excluded from the graph layer.
- **B-43 snapshot age:** every score stores the date of the public data it used.
- **B-50 and B-51:** only the published build is read; a lease prevents concurrent runs.
- **B-54 and B-55:** synthetic separation and ground truth, from the synthetic plan.

New, to be added to `docs/BOUNDARY_CONDITIONS.md`:

- **B-56 Missing or stale inputs are not low risk:** if the public data is older than a set number of days
  or an input is missing, the score is marked `stale_inputs`, no step-down is applied and no "improved"
  state is shown.
- **B-57 Score history is immutable:** scores and alerts are append-only; a correction is a new row that
  references the old one; settings and pattern versions are kept so any score can be reproduced.
- **B-58 A score is a lead, not a verdict:** wording follows `domain/labels.ts`, never "fraud"; no
  automatic adverse action is taken from a score.

## Decisions from the owner (17 Oct 2026)

1. **Reviewer capacity:** about 3% of loans alerting per month. This is provisional; the cut-offs are tuned
   against it on synthetic data and revisited when real numbers exist.
2. **First score for a loan:** if the first score is already Needs attention or Urgent, raise one alert of
   kind `initial`.
3. **Rule detection:** move it into `packages/shared` (design decision 2), proven identical by the MVP 0
   tests first.
4. **Stale-data limit (B-56):** the public build counts as stale after 7 days.

## Not in this plan

The pattern miner agent, the real-data mode and its approvals, and any use of real bank data.
