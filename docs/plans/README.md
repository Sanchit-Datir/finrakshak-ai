# Plans: index, build order and status

Read this first when working on anything in `docs/plans/`. It says which plan is which, what is done, and
what comes next. **Update the status column in the same commit that finishes a step.**

_Last updated: 17 Oct 2026. Steps 12, 14 and 17 (E2) are on branch `pattern-miner-risk-explainer-agent`
(pushed, no PR)._

## The plans

| Plan                             | What it covers                                                                                                                                                  | Status                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `DELTA_INGESTION_PLAN.md`        | Daily detection of what changed at each public source                                                                                                           | Built (see `docs/SESSION_NOTES.md`)                                    |
| `GCP_INGESTION_AGENT_PLAN.md`    | Cloud pipeline, publish gates, ingestion agent, AI extraction in shadow mode                                                                                    | Built and merged; GCP resources are the owner's steps                  |
| `SYNTHETIC_TRANSACTIONS_PLAN.md` | A seeded generator of fictional loans and transactions with ground-truth labels, in the web app's own shapes                                                    | Approved, not started                                                  |
| `RISK_SCORING_PLAN.md`           | Score 0–100, bands, alert decision, history, daily Cloud Run job, app view                                                                                      | Approved, steps 1–2 done (rules moved to shared)                       |
| `PATTERN_MINER_PLAN.md`          | An agent that proposes patterns from the 23 seed cases for the owner to approve                                                                                 | Agent built (steps 12, 14), off by default; step 15 open               |
| `PATTERN_CONTRACT.md`            | The interface between the pattern miner and the risk scoring job: the `Pattern` object, the library, the timeline input, the matcher signature, shared fixtures | Proposed, to agree before parallel work                                |
| `AGENTS_PLAN.md`                 | The one pattern all agents follow, shared parts, authority, testing, cost, failure modes                                                                        | Built: shared loop, `agentRuns`, miner and explainer                   |
| `RISK_EXPLAINER_PLAN.md`         | Optional agent that words the recorded reasons of an alert                                                                                                      | E2 built at the owner's request (17 Oct 2026), off by default; E3 open |

## Build order

`S` = synthetic data plan, `R` = risk scoring plan, `M` = pattern miner plan, `E` = explainer plan.
Each step is one commit, made only when the owner asks. Each ends with `npm run check && npm run build`.
The steps run in four phases. A phase ends with something you can see working.

### Phase A: foundations (local, no cloud)

| #   | Step                                                                                                                                                                | Needs from the owner                | Status              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------- |
| 1   | R0 Characterisation tests for the monitoring rules and record kinds                                                                                                 |                                     | [x] done, `0775b52` |
| 2   | R1 Move rule detection and record kinds into `packages/shared`                                                                                                      |                                     | [x] done, `72727d6` |
| 3   | S1 Synthetic schemas (web-shaped), seeded random generator, calendar, ledger, guards (`f596fe0`, built by the forked session)                                       |                                     | [x] done            |
| 4   | M0 Seed verification sheet for the 23 cases (`c96df4f`; `npm run miner`, see `data/verification/README.md`)                                                         | **Built. Now you review the cases** | [x] done            |
| 4a  | C0 Pattern contract: schemas, interfaces, `timelineFromEvents`, library helpers and shared fixtures in `packages/shared/src/risk/patterns/` (`PATTERN_CONTRACT.md`) |                                     | [x] done            |

### Phase B: first end-to-end result (local, no cloud)

| #   | Step                                                                                                                             | Needs from the owner                               | Status                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| 5   | S2 Population, flags, labels, CLI, contract sample and web contract test, first archetypes                                       |                                                    | [x] done                         |
| 6   | S3 The remaining archetypes, including look-alikes and `near_threshold`                                                          |                                                    | [x] done                         |
| 7   | M1 Pattern definitions, matcher, candidates with baseline lift, backtest (no model)                                              | **Checkpoint 1: do the candidates look useful?**   | [x] done, no candidates found    |
| 8   | R2 Scoring core, settings, alert decision, replay harness, templated reason text with the "new / unchanged / score change" block | **Checkpoint 2: tune the 3% budget and 15 points** | [x] done, `docs/RISK_SCORING.md` |
| 9   | R4 Pattern layer with hand-written version 1 patterns (kept in code until step 15)                                               |                                                    | [x] done, with step 8            |

End of phase B: month-by-month scores and "risk rose because..." on synthetic data, run from the command line.

### Phase C: cloud

| #   | Step                                                                                                                                                         | Needs from the owner                                            | Status                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 10  | S4 Replay and optional load into the `fundtrace_synth` dataset                                                                                               | Create the dataset                                              | [x] code done (W2a); load is the owner's step                                          |
| 11  | R3 Tables, `score` task, workflow step (off), Firestore collections and rules, service account                                                               | **Checkpoint 3: GCP setup run; create the budget alert (B-15)** | [x] code done (W2b–W2f); dry run W2g waits on checkpoint 3                             |
| 12  | M2 Proposal schema, `decidePattern` callable, `agentRuns` envelope schema with rules and TTL, rules and emulator tests; verify service-account write scoping |                                                                 | [x] done, branch `pattern-miner-risk-explainer-agent`; write scoping: code only (B-61) |

End of phase C: a staging dry run writes `risk_scores`, and the rules emulator tests pass.

### Phase D: app and agents

| #   | Step                                                                                                                                                                                                                                                                     | Needs from the owner                         | Status                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| 13  | R5 `getRiskScores` callable and the app view, e2e on the synthetic sample                                                                                                                                                                                                |                                              | [x] done (W3a–W3e); live integration waits on W2g                                 |
| 14  | M3 Miner agent in three commits: 14a edge-case tests for the ingestion agent's loop, 14b extract `runToolLoop` (old tests unchanged) and have the ingestion agent write its `agentRuns` envelope, 14c the miner. 14a and 14b are skipped if checkpoint 1 drops the miner | **Checkpoint 4: approve any Vertex dry run** | [x] code done (14a found a loop bug, fixed); Vertex dry run waits on checkpoint 4 |
| 15  | M4 Approval view in the admin page; scoring reads approved patterns from Firestore, replacing the in-code patterns of step 9; the `proposals_waiting` finding in the daily review                                                                                        |                                              | [ ]                                                                               |
| 16  | S5 Docs: README for the synthetic data, session notes                                                                                                                                                                                                                    |                                              | [ ]                                                                               |
| 17  | E1–E3 Optional explainer agent                                                                                                                                                                                                                                           | Decide after step 13                         | [x] E1 and E2 done; E3 dry run waits on the budget alert                          |

### Checkpoints

Work stops at these for the owner's decision.

| Checkpoint                              | After step                                                                                                                                                                          | What you decide                                                                                                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Are the mined candidates useful?     | 7                                                                                                                                                                                   | **Result (17 Oct 2026): no candidates** (see `PATTERN_MINER_PLAN.md`). **Owner decided to keep steps 12, 14 and 15 in the plan for when better data exists;** until then hand-written patterns carry the pattern layer |
| 2. Does the alert behaviour feel right? | 8                                                                                                                                                                                   | Tune the 3% alert budget, the 15-point step and the cut-offs against the synthetic replay                                                                                                                              |
| 3. Cloud setup and budget               | before 11 Run the GCP setup yourself and create the budget alert before anything cloud is switched on (B-15). **Budget part done (18 Oct 2026)**; the setup run is still to confirm |
| 4. Spend on a real model                | before 14                                                                                                                                                                           | Approve one capped Vertex dry run, with the miner A/B (cheapest vs one tier up) that you score by accept or reject. Until then every agent stays on the `mock` provider                                                |
| (Optional) Explainer                    | after 13                                                                                                                                                                            | Build it only if multi-reason alerts read badly in the templated form and the budget alert exists                                                                                                                      |

## Decisions taken (17 Oct 2026)

- Vector search is not part of this work. If "find similar cases" is ever wanted: BigQuery `VECTOR_SEARCH`,
  never Vertex AI Vector Search.
- Score 0–100: direct match 40, pattern match 30, graph proximity 20, own behaviour drift 10.
- Bands: Routine review below 30, Needs attention 30–59, Urgent review 60 and above.
- An insolvency, liquidation or ED record on the borrower after disbursement goes straight to Urgent review.
- Alert on a band step-up, or a rise of 15 or more points with a new reason; one `initial` alert if a loan's
  first score is already above Routine review; a fall is recorded without an alert and the band steps down
  after 2 clean runs.
- Provisional alert budget: about 3% of loans a month. Public data counts as stale after 7 days.
- Rule detection lives in `packages/shared`; the web app keeps the wording.
- The risk explainer agent is deferred until after step 13. Alert text is templated with a deterministic
  "new since last check / unchanged / score change" block from step 8; the explainer is built only if
  multi-reason alerts read badly and the budget alert exists (`RISK_EXPLAINER_PLAN.md`).
- Pattern contract (`PATTERN_CONTRACT.md`): patterns carry no weights; verified support is computed at score time; the live library is ONE Firestore document `riskPatternLibrary/current` with immutable `v<n>` copies; the pattern layer takes the largest single matched pattern's points (capped at 30), not the sum. Step C0 builds the contract; the scorer side and the miner side then work in parallel.
- Synthetic risk scores (17 Oct 2026): a separate app page; the scorer may create load files only under
  `interim/risk-load/`; it reads the `dry-run` build date while publishing is off; it keeps the project-wide
  Firestore role (a test lists the collections it writes); everyone with a usable profile sees every
  branch's scores for now (branch scoping to be decided later).
- Autonomy: the only automatic action is a code-triggered retry of an idempotent failed step, at most once
  per run (the source re-run, and the scoring job). Scores, bands, alerts, patterns, thresholds and settings
  change only through a person. Pending proposals are surfaced by a code-computed `proposals_waiting`
  finding (`AGENTS_PLAN.md`, Autonomy).
- Platform: keep Cloud Run jobs (`ingest-miner` on demand; `ingest-explain` only if built). Revisit only for an
  interactive in-app agent, long-running agents with memory, or a bank rule requiring a managed platform
  (`AGENTS_PLAN.md`).
- Agent run history: a new `agentRuns` collection with one shared envelope schema and a TTL; `ingestRuns` and
  `ingestReviews` unchanged. Service accounts hold project-wide Firestore access today, so write scoping is
  verified in steps 12 and 14 (`AGENTS_PLAN.md`).
- Model choice: the cheapest model for every agent. At checkpoint 4 the miner gets one A/B (cheapest vs one
  tier up on the same candidates), chosen by the owner's accept/reject labels (`AGENTS_PLAN.md`).
- The shared agent tool loop (`runToolLoop`) is extracted with the miner, not before, in its own commit with
  edge-case tests first; skipped if the miner is dropped (`AGENTS_PLAN.md`).
- Synthetic data: 200 customers over 24 months, generated files out of git, one small contract sample
  (under 100 KB) committed, 10 held-out customers.
- Miner: propose at 2 supporting cases, full weight at 3 verified; outcome is the first insolvency or
  liquidation record; on demand only; approval by Firestore console and callable first.

## Boundary conditions added along the way

Each is added to `docs/BOUNDARY_CONDITIONS.md` in the same commit as the first step that needs it.

| ID   | Topic                                     | Added in step |
| ---- | ----------------------------------------- | ------------- |
| B-54 | Synthetic and real data separation        | 3 (S1)        |
| B-55 | Ground truth is not evidence              | 8 (R2)        |
| B-56 | Missing or stale inputs are not low risk  | 8 (R2)        |
| B-57 | Score history is immutable                | 11 (R3)       |
| B-58 | A score is a lead, not a verdict          | 8 (R2)        |
| B-60 | One case, one vote                        | 7 (M1)        |
| B-61 | Patterns are approved by a person         | 12 (M2)       |
| B-62 | AI wording is a convenience, not evidence | 17 (E2)       |
| B-63 | Patterns from hand-picked defaulters      | 7 (M1)        |

## How people and agents use these documents

- **A coding session** (CLAUDE.md says to read `docs/SESSION_NOTES.md` first, which points here): read this
  file, find the first unchecked step, read the plan it belongs to, do that one step, update the status.
- **A side session started for parallel work** gets the plan file name and the step number in its brief.
- **Agents that run in the cloud never read these documents.** What they need is in code: prompts, tool
  lists, caps and checks. The plans are where those are decided; building a step turns the decision into
  code and tests. See `AGENTS_PLAN.md`.

## Working rules that apply to every step

- Ask before committing. Do not push or open a pull request unless asked.
- Never change `data/raw`, `data/processed` or `data/registry`; derived output goes in new files.
- Tests and CI never call a billed API; the model provider is `mock` unless the owner sets it.
- Mark synthetic data **SYNTH** and never mix it with real records.
- Wording: leads, never verdicts (Routine review, Needs attention, Urgent review).
- Call out every boundary condition a step touches by its ID.
