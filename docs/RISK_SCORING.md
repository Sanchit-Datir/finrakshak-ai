# Risk scoring: what is built

This page describes the risk scoring code as it exists today: build steps 8 (R2) and 9 (R4) in
`docs/plans/README.md`. The plan behind it is `docs/plans/RISK_SCORING_PLAN.md`; the interface with the
pattern miner is `docs/plans/PATTERN_CONTRACT.md` (section 7 is the scorer's half).

Everything here runs locally on **synthetic data only** (B-54). Nothing is written to BigQuery or
Firestore yet (that is step 11), no model is called anywhere (B-15), and a score is a lead for a
reviewer, never a verdict (B-58).

## Run it

```bash
npm run synth                    # make data/synthetic/*.jsonl (not in git)
npm run score                    # replay 24 months, compare with the truth labels
npm run score -- --help          # options
npm run score -- --data-built-on 2024-06-30   # pretend the public data is old (B-56 demo)
npm run score -- --patterns path/to/library.json   # or FUNDTRACE_PATTERN_LIBRARY=...
```

It writes two git-ignored files to `data/synthetic/`:

| File                | What is in it                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `scores.jsonl`      | One row per loan per month: the score, its reasons, the band shown, the alert decision, the text |
| `score_report.json` | Run findings, settings and pattern versions, and the comparison with `truth.jsonl`               |

## Where the code is

| Piece                        | File                                                      |
| ---------------------------- | --------------------------------------------------------- |
| Versioned settings (v1)      | `packages/shared/src/risk/scoring/settings.ts`            |
| Reason and score schemas     | `packages/shared/src/risk/scoring/types.ts`               |
| Direct match layer           | `packages/shared/src/risk/scoring/direct.ts`              |
| Graph proximity layer        | `packages/shared/src/risk/scoring/graph.ts`               |
| Pattern match layer          | `packages/shared/src/risk/scoring/patternLayer.ts`        |
| Behaviour drift layer        | `packages/shared/src/risk/scoring/behaviour.ts`, `emi.ts` |
| Score, bands, override       | `packages/shared/src/risk/scoring/score.ts`               |
| Alert decision               | `packages/shared/src/risk/scoring/decide.ts`              |
| Reason text, "what changed"  | `packages/shared/src/risk/scoring/reasonText.ts`          |
| One run over all loans       | `packages/shared/src/risk/scoring/run.ts`                 |
| Hand-written patterns (v1)   | `packages/shared/src/risk/patterns/handWritten.ts`        |
| Input port, file input       | `ingest/src/risk/inputs.ts`, `fileInputs.ts`              |
| Pattern sources (code, file) | `ingest/src/risk/patternSources.ts`                       |
| Month-by-month replay        | `ingest/src/risk/replay.ts`                               |
| Comparison with truth labels | `ingest/src/risk/evaluate.ts`                             |
| Command line                 | `ingest/src/risk/scoreCli.ts`, `cliArgs.ts`               |

The scoring core in `packages/shared` is pure: no I/O, no clock, no model. The same code will run in the
Cloud Run job (step 11) and could later run in the app. Every file has a test next to it.

## The score

The score is the sum of four layers, capped at 100. All numbers are in `DEFAULT_SCORING_SETTINGS`
(`settings_version: 'v1'`), and every score stores the settings version, the pattern library version
and the date of the public data it used (B-43).

| Layer           | Max | How it is worked out                                                                                                                                                                                                                                                                                                                   |
| --------------- | --: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct match    |  40 | Records on the borrower: an insolvency, liquidation or enforcement record dated **after** disbursement (strictly after the disbursement day) 40; the same kinds dated on or before it 25; an NFRA record 15; plus 10 for 2+ records or 15 for records in 3+ sources. A director's or owner's record counts half. Summed, capped at 40. |
| Pattern match   |  30 | Each matched approved pattern scores `round(30 × strength × support weight)`; the layer takes the **largest single pattern**, not the sum.                                                                                                                                                                                             |
| Graph proximity |  20 | The closest flagged entity through documented links: 1 hop 20, 2 hops 10, 3+ 0; half when the path has an inferred or user-provided link. Hubs (25+ links) never count and are never walked through (B-40). Directors and owners already scored in the direct layer are left out.                                                      |
| Behaviour drift |  10 | From the loan's own repayments: one unmet EMI 4, two in a row 8, three or more (or a delay that grows over three EMIs) 10; receipts down 25% over the last 90 days against the 90 before add 1, down 50% add 2; capped at 10. Only the last 6 EMIs count.                                                                              |

**Bands:** Routine review below 30, Needs attention 30–59, Urgent review 60 and above.

**Override:** an insolvency, liquidation or enforcement record on the **borrower** dated after
disbursement sends the loan straight to Urgent review, whatever the score. A director's record never
triggers it. Evidence-status weighting applies to every row except this one; in v1 every status
weighs 100% (the factors are in settings, to set at checkpoint 2).

### How public records are matched

The scoring core receives records already matched to entity ids. The file input matches each synthetic
flag to an entity by exact CIN, then by exact normalised name (`normalizeCompanyName`, B-37). A name that
matches no entity, or more than one, is not merged and is counted as `unmatched_records`.

### How EMIs are worked out

The loan rows carry no repayment schedule, so `emi.ts` infers one:

- An EMI falls due every month on the disbursement day (clamped to the month's end).
- The usual EMI is the most common repayment amount (the larger one on a tie).
- Repayments pay the oldest EMI first, as a bank applies them.
- The schedule ends once repayments reach the loan amount (the tenor is not in the data).
- An EMI is **late** when paid more than 5 days after it was due, **partial** when paid below 90% of the
  usual amount, and **missed** when still unpaid more than 5 days after it was due. An EMI that is
  overdue on the scoring day counts as missed until it is paid, and then reads as late.

Money is compared in integer paise only (B-01, B-03).

### Patterns

- Patterns come through a `PatternSource`: `codePatterns()` (the hand-written library) or
  `filePatterns(path)`. Both run `readPatternLibrary` with a real sha256, so a library whose content
  hash does not match is **refused** (`load()` resolves to `{ refused: reason }`, it does not throw): the
  run continues with the pattern layer at 0, marked `no_patterns`, and a `library_refused` finding. An
  unreadable or non-JSON library file is refused the same way. An invalid pattern or an unknown template is skipped
  and counted as an `invalid_pattern` or `unknown_template` finding. Only `approved` patterns are used.
- The matcher is **injected**. The score command injects the real `matchPattern`
  (`packages/shared/src/risk/patterns/match.ts`, built on the miner side in step 7). The scorer builds
  its inputs: a `SubjectTimeline` per borrower from the borrower's own public records through
  `timelineFromEvents` (replay-safe: nothing after `as_of`), and the flagged neighbours from the
  documented links (`flaggedNeighbours`). Tests that need to control the result use a fake matcher and the
  shared fixture library.
- A `transaction_typology` pattern matches when its monitoring rule fired on the loan (strength 1), from
  `detectMonitoring` in `packages/shared/src/risk/rules`. A match result that is malformed, or names
  another pattern, is skipped as an `invalid_match_result` finding.
- Support weight is 1.0 with 3 or more **verified** supporting cases, otherwise 0.6, and always 0.6 for
  a hand-written hypothesis. Verified cases come from `data/verification/seed_review.json` at score time;
  that file does not exist yet, so every run has the `no_seed_review` finding and every weight is 0.6.
- Each matched pattern gives one `pattern_match` reason with `pattern_id`, `pattern_name`, `strength`,
  `support_weight`, `points`, `evidence_event_ids` and `evidence_statuses`, and the score stores
  `pattern_version = library_version`. The scorer never writes or edits the library.

**Hand-written library, version 1** (`handWritten.ts`; all approved hand-written hypotheses, so all at
0.6): one `transaction_typology` per monitoring rule (rapid onward, linked counterparty, circular, cash
split, repeated counterparty), an enforcement record then insolvency within 36 months, insolvency then
liquidation within 24 months, and enforcement and insolvency records from two sources within 24 months.
`graph_proximity` patterns are left out of v1 on purpose, because the graph layer already scores
closeness to flagged entities. The ids and the content hash are fixed in the file; a test recomputes them
and checks the library passes `PatternLibrarySchema`.

## Alerts

`decideAlert(previous, current, settings, alreadyAlerted)` returns one of:

| Kind                   | When                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `override`             | The override record is present and has not been alerted before (also on a loan's first score)             |
| `initial`              | A loan's first score is already Needs attention or Urgent review                                          |
| `band_up`              | The band is above the band currently shown                                                                |
| `rise_with_new_reason` | The score rose 15 or more points and a reason appeared that was not there last time and was never alerted |
| `none`                 | Anything else, including any fall                                                                         |

The band shown (`held_band`) steps down only after **2 clean runs in a row** (runs below the band
shown). A run with stale inputs neither counts as clean nor resets the count (B-56). Reasons are compared
by `reason_key` (the same record, neighbour, pattern or EMI problem keeps its key while its evidence
grows); a reason with 0 points is never "new".

### "What changed" text

Each row carries a templated block with no model involved:

```
New since last check:
- A public record (ed provisional attachment, source ed) dated 2024-06-27 names the borrower after disbursement. Evidence status: allegation. (+40 points)
Unchanged:
- none
Score change: 0 → 40 (+40). Band: Routine review → Urgent review.
```

It adds "No longer present" when reasons dropped away, a line when the public data is stale, and a line
when no patterns were available ("its 0 is not low risk").

## Findings a run can record

`no_patterns`, `invalid_pattern`, `unknown_template`, `library_refused`, `invalid_match_result`,
`no_seed_review`, `stale_public_data` and `missing_input`. None of them stops the run.

## Replay on the synthetic data (full set, seed 20261017, real matcher)

This checks plumbing, not accuracy (B-55): the generator wrote both the data and the labels.

| Archetype            | Loans | Alerted | Alerted within 2 months of onset | Band agreement |
| -------------------- | ----: | ------: | -------------------------------: | -------------: |
| `control`            |    45 |       0 |                                – |           100% |
| `slow_burn`          |    20 |       0 |                                0 |          33.6% |
| `sudden_enforcement` |    15 |      15 |                               15 |           100% |
| `round_trip`         |    15 |       6 |                                6 |             0% |
| `fund_diversion`     |    15 |       0 |                                0 |             0% |
| `contagion`          |    15 |       0 |                                0 |          78.8% |
| `shared_address`     |    15 |      15 |                                2 |          62.3% |
| `cash_split`         |    10 |       8 |                                8 |             0% |
| `dormant_burst`      |    10 |       0 |                                0 |           100% |
| `seasonal`           |    15 |       0 |                                – |           100% |
| `big_prepayment`     |    15 |       0 |                                – |           100% |
| `near_threshold`     |    10 |       0 |                                – |           100% |

46 alerts in 3,690 loan-months (12.5 per 1,000 loan-months, against a provisional budget of about 3% of
loans a month). The expected monitoring rules fired for all 70 expected cases, with none unexpected.
Controls and look-alikes: 0 alerts. The held-out `dormant_burst` loans match no pattern. The only run
finding is `no_seed_review`.

**What the real matcher changed.** Compared with injecting a matcher that matches nothing, the same replay
differs in 120 of 3,690 loan-month scores, all `sudden_enforcement`: a lone enforcement record is a half
match (strength 0.5) of the two-step sequence "enforcement record, then insolvency", which scores
`round(30 × 0.5 × 0.6)` = 9 pattern points. No band, alert or archetype row changed, because those loans are
already Urgent review through the override. Every other public-record pattern needs two records, and each
synthetic borrower has at most one.

The slow-burn, fund-diversion and contagion loans do not alert. Under the agreed weights they cannot:

- Behaviour drift tops out at 10 points, but the truth labels expect Needs attention (30) from late EMIs
  alone.
- Fund diversion scores 18: the two typology patterns at 0.6 support take the largest, not the sum. The
  linked party has no record, so the graph layer adds nothing. The same holds for contagion.

This is the main input for checkpoint 2 (tune the 3% budget, the 15-point step and the cut-offs).

## Boundary conditions

- **B-01, B-03:** EMI and receipt amounts are compared as integers, with an overflow check.
- **B-05:** pattern points round half up, after cutting float noise.
- **B-15:** no model calls.
- **B-24:** the score id is deterministic: loan, day, settings version, pattern version.
- **B-27:** `as_of` is an IST day.
- **B-36:** evidence status is stored on every reason and never upgraded.
- **B-37:** records are matched only by exact CIN or exact normalised name.
- **B-40:** hubs are excluded from the graph layer.
- **B-43:** every score stores `data_built_on`.
- **B-54:** synthetic data only.
- **New:** B-55 (ground truth is not evidence), B-56 (missing or stale inputs are not low risk) and B-58
  (a score is a lead, not a verdict) are in `docs/BOUNDARY_CONDITIONS.md`, each with tests.

## Not built yet

- BigQuery tables, the Firestore writer, the `score` Cloud Run task and its lease (step 11).
- The Firestore pattern source (step 15).
- The app view (step 13).

## Contract changes (workstream W1c)

1. **Done:** `PatternSource.load()` resolves to `LoadedLibrary | RefusedLibrary` (`{ refused: reason }`)
   instead of throwing, so every consumer records the same finding without a try/catch.
2. Open: how `graph_proximity` patterns relate to the graph layer.
3. Open: `evidence_event_ids` becomes `evidence_ids`, to cover transaction ids as well as event ids.
