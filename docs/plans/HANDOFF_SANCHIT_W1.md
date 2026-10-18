# Handoff for Sanchit: workstream W1, scoring quality

_Written 17 Oct 2026. This page is self-contained: it has the setup, the prompt to paste into Claude Code,
what you own, what to leave alone, and what to report back. The big picture is in `docs/plans/README.md`._

## Where things stand

Build steps 1–9 are on `main` (PR #31 and the plan branch). That includes your scoring core, the
pattern layer, the synthetic data generator, the pattern matcher and the pattern contract. `npm run check`
and `npm run build` pass on `main`.

Two people are now working in parallel, on separate branches and separate files:

| Person   | Workstreams                                                                              | Branch                   |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| You      | **W1** scoring quality (this page), then **W3** the app and the `getRiskScores` callable | `feat/scoring-quality`   |
| Abhishek | **W4** his own decisions and GCP setup, then **W2** the cloud scoring job                | `feat/cloud-scoring-job` |

## 1. Set up your branch

Start from `main`. Do not use `plan/synthetic-transactions`; it is already merged.

```bash
git fetch origin && git switch -c feat/scoring-quality origin/main && npm ci && npm run build -w @finrakshak-ai/shared
```

If you and Abhishek ever share one folder or machine, use separate worktrees (`git worktree add`), never one
shared checkout.

## 2. The tasks, in this order

### W1a: wire in the real matcher

`matchPattern` exists in `packages/shared/src/risk/patterns/match.ts` and passes the shared fixtures, but the
score command still injects `noMatcher` (`ingest/src/risk/matcher.ts`), so public-record patterns can never
match in a replay. `docs/RISK_SCORING.md` still says the matcher is not built.

1. Replace `noMatcher` with the real `matchPattern` in the score command, and give the scorer what the matcher
   needs (a `SubjectTimeline` per borrower from `timelineFromEvents`, and the flagged neighbours).
2. Fix the text in `docs/RISK_SCORING.md` that says the matcher is missing.
3. Run `npm run synth` then `npm run score`, and report how the numbers change against the baseline below.

**Baseline before your change** (full 200-customer set, seed 20261017, `noMatcher`):

| Archetype            | Loans | Alerted | On time | Band agreement |
| -------------------- | ----: | ------: | ------: | -------------: |
| `control`            |    45 |       0 |       0 |           100% |
| `slow_burn`          |    20 |       0 |       0 |          33.6% |
| `sudden_enforcement` |    15 |      15 |      15 |           100% |
| `round_trip`         |    15 |       6 |       6 |             0% |
| `fund_diversion`     |    15 |       0 |       0 |             0% |
| `contagion`          |    15 |       0 |       0 |          78.8% |
| `shared_address`     |    15 |      15 |       2 |          62.3% |
| `cash_split`         |    10 |       8 |       8 |             0% |
| `dormant_burst`      |    10 |       0 |       0 |           100% |
| `seasonal`           |    15 |       0 |       0 |           100% |
| `big_prepayment`     |    15 |       0 |       0 |           100% |
| `near_threshold`     |    10 |       0 |       0 |           100% |

Total 46 alerts, 12.5 per 1,000 loan-months. Monitoring rules 70 of 70 expected found, none unexpected.
Controls alerted 0; defaulters missed 74. The only finding is `no_seed_review`.

**Must hold after your change:** controls and look-alikes (`seasonal`, `big_prepayment`, `near_threshold`)
stay at 0 alerts, and the held-out `dormant_burst` is not flagged by patterns.

### W1c: the three contract changes you proposed

These are the three items in the "Proposed contract changes" section of `docs/RISK_SCORING.md`. They are part
of your workstream. Make each one a separate small commit:

1. `PatternSource.load()` returns a refused result (`{ refused: reason }`) instead of throwing, so every
   consumer records the same finding without a try/catch.
2. Decide how `graph_proximity` patterns relate to the graph layer: ignored by a scorer that has a graph
   layer, or meant to add up. Write the answer into `PATTERN_CONTRACT.md`, and make the code match.
3. Rename `evidence_event_ids` to `evidence_ids` so it covers both event ids and transaction ids. Update the
   contract, the schemas, the fixtures and every test that uses the name.

You may edit `packages/shared/src/risk/patterns/` for these three changes only. Keep the change additive where
you can, and list every shape change in the PR description. The miner side is parked, but its code
(`match.ts`, the candidate finder) uses these shapes and must still pass.

### W1b: tuning for checkpoint 2

The main finding so far is that several scenarios cannot alert under the agreed weights:

- Behaviour drift tops out at 10 points, so late EMIs alone can never reach Needs attention (30).
- Fund diversion scores 18, because the two typology patterns at 0.6 support take the largest, not the sum,
  and the linked party has no record.
- Contagion adds nothing because the linked party has no record.

**Do not change the defaults in `packages/shared/src/risk/scoring/settings.ts` yet.** Instead produce a short
table of options for Abhishek, for example:

| Option | What changes | Alerts per 1,000 loan-months | Controls and look-alikes alerted | Defaulters caught |
| ------ | ------------ | ---------------------------: | -------------------------------: | ----------------: |

Each option must be measured with `npm run score`, not estimated. Abhishek picks one. Then publish it as
**settings v2** and keep v1 readable, because every stored score records its settings version (B-24).

## 3. The prompt to paste into Claude Code

```text
You are working in the finrakshak-ai repo, on branch feat/scoring-quality (cut from main). Your job is
workstream W1, "scoring quality". Do only W1.

READ FIRST, in order: CLAUDE.md, docs/SESSION_NOTES.md, docs/plans/README.md,
docs/plans/HANDOFF_SANCHIT_W1.md (this plan), docs/RISK_SCORING.md, docs/plans/RISK_SCORING_PLAN.md,
docs/plans/PATTERN_CONTRACT.md, docs/BOUNDARY_CONDITIONS.md.

W1 TASKS, in this order
1. W1a: wire the real matchPattern (packages/shared/src/risk/patterns/match.ts) into the scoring command
   in place of noMatcher (ingest/src/risk/matcher.ts). Fix the docs that still say the matcher is not
   built. Run `npm run synth` then `npm run score` and report how the numbers change against the baseline
   table in docs/plans/HANDOFF_SANCHIT_W1.md.
2. W1c: the three contract changes listed in docs/RISK_SCORING.md ("Proposed contract changes"), as small
   separate commits: PatternSource.load() returns a refused result, decide how graph_proximity patterns
   relate to the graph layer, rename evidence_event_ids to evidence_ids. Update PATTERN_CONTRACT.md and
   every test and fixture the change touches.
3. W1b: tuning. Do NOT change the defaults in packages/shared/src/risk/scoring/settings.ts yet. Produce a
   measured table of options for the owner: what to change so slow_burn, fund_diversion and contagion
   alert, and the cost in false alarms (controls and look-alikes must stay at 0 alerts). Wait for the
   owner's choice, then publish it as settings v2 and keep v1 readable.

YOU OWN: packages/shared/src/risk/scoring/**, the existing files in ingest/src/risk/**,
packages/shared/src/risk/patterns/** (only for the W1c changes), docs/RISK_SCORING.md,
docs/plans/PATTERN_CONTRACT.md.

DO NOT TOUCH (another person is working there): ingest/src/cloud/**, infra/**, scripts/**,
firestore.rules, firestore.indexes.json, functions/**, web/**, ingest/src/synth/**, ingest/src/miner/**.
Do not add files named ingest/src/risk/bigquery*.ts (those belong to the cloud workstream).

INTERFACES YOU MUST NOT BREAK: ScoringInputPort / ScoringData (ingest/src/risk/inputs.ts) and
LoanScoreSchema (packages/shared/src/risk/scoring/types.ts) may change only ADDITIVELY, and every such
change goes in the PR description so the other person sees it.

RULES: ask me before committing; do not push unless I say; tests next to source; mutation-check any
threshold you change; never call a real model; synthetic data only (B-54, B-55); update only your own row
in docs/plans/README.md; npm run check && npm run build must pass before any commit; merge main into the
branch before opening the PR (CLAUDE.md); call out every boundary condition you touch by its ID.

FIRST REPLY: do not code yet. Confirm what you read, list the commits you will make for W1a and W1c, and
list any question for me. Wait for my OK.
```

## 4. What you own, and what you leave alone

| You (Sanchit) own                                                                                                                                                      | Leave alone (Abhishek is working there)                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/risk/scoring/**`, existing `ingest/src/risk/**`, `packages/shared/src/risk/patterns/**` (W1c only), `docs/RISK_SCORING.md`, `PATTERN_CONTRACT.md` | `ingest/src/cloud/**`, `infra/**`, `scripts/**`, `firestore.rules`, `functions/**`, `web/**`, `ingest/src/synth/**`, `ingest/src/miner/**`, `ingest/src/risk/bigquery*.ts` |

Lines in shared files (`packages/shared/src/risk/index.ts`, the status rows in `docs/plans/README.md`) are
edited by both of you. Change only your own lines, and run `git merge origin/main` before you open the PR so
the merge is clean.

## 5. What to hand back

- A PR into `main` from `feat/scoring-quality`, one per task if they are large (W1a, W1c, then W1b).
- The measured numbers: before and after for W1a; the options table for W1b.
- Every shape change listed in the PR description.
- `npm run check && npm run build` passing.
- The README status row for your step updated, and nothing else in the README.

## 6. Decisions already taken (do not reopen)

- Score 0–100: direct 40, pattern 30, graph 20, behaviour 10. Bands: Routine below 30, Needs attention 30–59,
  Urgent 60 and above.
- An insolvency, liquidation or enforcement record on the borrower after disbursement goes straight to Urgent.
- Alert on a band step-up, or a rise of 15 or more points with a new reason; one `initial` alert if a loan's
  first score is above Routine; the band steps down after 2 clean runs.
- Provisional alert budget about 3% of loans a month. Public data is stale after 7 days.
- The pattern layer takes the largest single pattern, not the sum. Patterns carry no weights.
- No model is called anywhere in the scoring job.

## 7. After W1: W3, the app and the callable

When W1 is merged, you start W3: the `getRiskScores` callable (auth, zod, branch authorisation, App Check),
a typed result in shared, the loan view with score, band, reasons and the "what changed" text, a risk-score
source in Alerts, labelled "Synthetic test data", and an end-to-end test. You will read the Firestore shape
that Abhishek's W2 writes (`synthRiskLatest/{loanId}` and `synthRiskAlerts/{alertId}`); agree it with him
before you start, and test against the Firestore emulator seeded from `data/synthetic/scores.jsonl`.
