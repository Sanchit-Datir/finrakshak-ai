# Contract: pattern library between the pattern miner and the risk scoring job

_Status: agreed by the owner on 17 Oct 2026 (patterns carry no weights; the library is one Firestore
document; the pattern layer takes the largest single pattern, not the sum), for Sanchit to follow. Step C0
builds the schemas, fixtures and interfaces; the rest is not implemented. It is the interface between `PATTERN_MINER_PLAN.md` (producer) and `RISK_SCORING_PLAN.md`
(consumer)._

## Why this exists

Two people, or two agents, can only build the miner and the scorer in parallel if both agree on exactly what
passes between them. This document fixes that: **one object (`Pattern`), one envelope (`PatternLibrary`),
one input shape (`SubjectTimeline`), one function signature (`matchPattern`), and where each lives.**

A note on names: the "risk analysis agent" is, in our plans, the **risk scoring job** (`ingest-score`). It is
deterministic code and SQL and calls no model (`AGENTS_PLAN.md`, Autonomy). It reads patterns; it does not
write them. The only agent on the producing side is the pattern miner, and even it can only propose.

## The shape of the flow

```
case timelines ──▶ miner (code finds candidates, agent words them) ──▶ PatternProposal  (status draft)
                                                                            │  owner approves (decidePattern callable)
                                                                            ▼
                                                                  PatternLibrary (approved patterns)
                                                                            │  read-only
                                                                            ▼
loan ─▶ SubjectTimeline ─▶ risk scoring job: matchPattern(pattern, timeline, neighbours) ─▶ reasons + points
```

The proposal contains the exact `Pattern` object that will go live. Approving it copies that object into the
library and changes its status. **Nothing is transformed between what you approved and what is scored.**

## 1. `Pattern` (the unit that passes between them)

Lives in `packages/shared/src/risk/patterns/schema.ts` as a zod schema. Fields are snake_case, like the
other shared evidence schemas.

| Field                 | Type                                                     | Rule                                                                                                                        |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`      | literal `1`                                              |                                                                                                                             |
| `pattern_id`          | string                                                   | `pat_` plus the first 16 hex of sha256 of the canonical JSON of `definition`. The same definition always gives the same id. |
| `version`             | integer ≥ 1                                              | Bumped when the owner approves a change to an existing pattern.                                                             |
| `name`                | string, 3–80 chars                                       | Plain words, no verdict words (`violatesWording`).                                                                          |
| `description`         | string, 20–400 chars                                     | What the sequence is, in neutral terms.                                                                                     |
| `benign_explanations` | string[1..5], each ≤ 200 chars                           | Required. Why the same sequence can be innocent.                                                                            |
| `origin`              | `hand_written` or `miner`                                |                                                                                                                             |
| `status`              | `draft`, `approved` or `retired`                         | The scorer uses `approved` only.                                                                                            |
| `definition`          | discriminated union on `template` (section 2)            |                                                                                                                             |
| `support`             | object (section 3)                                       | Facts about the evidence behind the pattern.                                                                                |
| `evidence_statuses`   | `('fact' \| 'finding' \| 'allegation' \| 'inference')[]` | The statuses of the events the pattern rests on (B-36). Never upgraded.                                                     |
| `created_at`          | UTC datetime                                             |                                                                                                                             |
| `approved_by`         | string or null                                           | Firebase uid of the deciding administrator; null while `draft`.                                                             |
| `approved_at`         | UTC datetime or null                                     |                                                                                                                             |
| `retired_at`          | UTC datetime or null                                     |                                                                                                                             |
| `supersedes`          | `pattern_id` or null                                     |                                                                                                                             |

The pattern carries **no weights and no points**. How much a match counts is the scorer's decision, from its
versioned settings (section 5). That keeps one source of truth for scoring.

## 2. `definition`: the closed set of templates

A pattern is one of these. Free text is impossible.

A **step matcher** says which timeline event satisfies a step. It is one of:
`{ by: 'case_type', value: string }`, `{ by: 'kind', value: 'insolvency' | 'liquidation' | 'enforcement' }`,
`{ by: 'source', value: SourceId }`.

| `template`             | Fields                                                                                               | Meaning                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sequence`             | `steps` (2–4 step matchers), `max_gap_months` (1–60), `min_lead_months` (0–60)                       | The steps occur in order, each next step within the gap. The last step is the outcome; earlier steps come at least `min_lead_months` before it.                                      |
| `co_occurrence`        | `matchers` (2–4 step matchers), `min_sources` (1–6), `window_months` (1–60)                          | The matchers all occur within the window, from at least `min_sources` different sources.                                                                                             |
| `graph_proximity`      | `kind` (a record kind), `max_hops` (1–3), `exclude_hubs` (literal `true`)                            | An entity with a record of that kind lies within `max_hops` documented links (`verified` links only; an `inferred` or `user_provided` link does not count); hubs never count (B-40). |
| `transaction_typology` | `rule_id` (`rapid_onward`, `linked_counterparty`, `repeated_counterparty`, `circular`, `cash_split`) | The existing monitoring rule fired on the loan. **Hand-written only**; the miner cannot produce it.                                                                                  |

## 3. `support`

| Field                   | Type                                 | Meaning                                                                         |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `basis`                 | `mined` or `hand_written_hypothesis` | Whether this was found in the cases or written as a hypothesis.                 |
| `supporting_case_ids`   | string[]                             | Seed case ids (`dhfl`, `ilfs`, ...). Empty for a hypothesis.                    |
| `supporting_case_count` | integer                              | Distinct cases, never entries (B-60).                                           |
| `population`            | `{ n, follow_on, lift }` or null     | Baseline among entities named in adverse records (B-59). Null for a hypothesis. |
| `median_gap_months`     | number or null                       |                                                                                 |

**`verified_case_count` is deliberately not stored.** The scorer computes it at score time from
`data/verification/seed_review.json` (step 4), so verifying a case raises a pattern's weight without editing
the pattern.

## 4. `PatternLibrary` (the envelope the scorer reads)

| Field             | Type        | Rule                                                                                                        |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `schema_version`  | literal `1` |                                                                                                             |
| `library_version` | integer ≥ 0 | Increases on every approval, retirement or change. **This is the `pattern_version` stored on every score.** |
| `content_hash`    | sha256 hex  | Of the canonical JSON of `patterns`. The scorer checks it and refuses a library that does not match.        |
| `patterns`        | `Pattern[]` | Approved and retired patterns; retired ones are kept for history.                                           |

### Where it lives

| Place                                                                                                  | Written by                           | Read by                          | When                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------- | -------------------------- |
| `packages/shared/src/risk/patterns/handWritten.ts`                                                     | people, in code, with tests          | the scorer (`codePatterns`)      | From the start (version 1) |
| A local file, path in `FUNDTRACE_PATTERN_LIBRARY`                                                      | `minerCli export-library`            | the scorer (`filePatterns`)      | Local runs and tests       |
| Firestore `riskPatternLibrary/current` (one document) and `riskPatternLibrary/v<n>` (immutable copies) | the `decidePattern` callable only    | the scorer (`firestorePatterns`) | Cloud, after step 12/15    |
| BigQuery `risk_patterns`                                                                               | the scoring job, a snapshot each run | analysts                         | Cloud                      |

One document for the whole library (a few dozen patterns is well under Firestore's 1 MiB limit) means the
scorer reads one consistent snapshot and a replace is atomic. This replaces the per-pattern
`riskPatterns/{patternId}` collection written in the earlier plans.

The miner writes **only** `patternProposals/{id}`, never the library.

## 5. `PatternProposal` (what the miner writes)

| Field                                                            | Meaning                                                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `proposal_id`, `run_id`                                          | Deterministic ids, so a retry is a no-op.                                                       |
| `pattern`                                                        | A full `Pattern` with `status: 'draft'`, `origin: 'miner'`, `approved_*` null.                  |
| `candidate`                                                      | The code's numbers: support, population, lift, gap spread, leave-one-out and lead-time results. |
| `model`, `prompt_version`, `input_hash`                          | Provenance, or null when templated.                                                             |
| `status`, `created_at`, `expires_at`, `decided_at`, `decided_by` | As for `agentProposals`; expires after 30 days.                                                 |

Rules the miner keeps: `pattern.definition` is the candidate's computed definition, never edited by the
model; every number in `support` equals the code's; `name`, `description` and `benign_explanations` pass the
wording check.

## 6. `SubjectTimeline` and `matchPattern` (the input and the function)

Both sides use the same builder and the same matcher, so a pattern behaves the same when it is proposed, when
it is backtested and when it is scored. They live in `packages/shared/src/risk/patterns/`.

```ts
interface TimelineEvent {
  event_id: string;
  date: string; // IST calendar date, YYYY-MM-DD
  case_type: string; // as in the public tables, e.g. 'ed_search_seizure'
  kind: 'insolvency' | 'liquidation' | 'enforcement' | null; // from recordKindOf(case_type)
  source_id: string;
  evidence_status: 'fact' | 'finding' | 'allegation' | 'inference' | 'unknown';
}
interface SubjectTimeline {
  subject_id: string; // an entity id
  as_of: string; // events after this date are not in `events` (replay-safe)
  events: TimelineEvent[]; // sorted by date, then event_id
}
interface FlaggedNeighbour {
  entity_id: string;
  hops: 1 | 2 | 3;
  link_status: 'verified' | 'user_provided' | 'inferred';
  kinds: ('insolvency' | 'liquidation' | 'enforcement')[];
  is_hub: boolean;
}
interface MatchResult {
  pattern_id: string;
  strength: number; // 0..1
  matched_event_ids: string[];
  matched_neighbour_ids: string[];
}
function matchPattern(
  definition: PatternDefinition,
  timeline: SubjectTimeline,
  neighbours: readonly FlaggedNeighbour[],
): MatchResult | null; // null = no match
```

Properties the matcher must have (these are tests):

- **Pure and deterministic**: same input, same output; no clock, no I/O.
- **Replay-safe**: an event dated after `as_of` can never change the result.
- `strength` is between 0 and 1, is 0 or `null` if the first step is missing, is 1 only for a full match, and
  never goes down when a step is added.
- `transaction_typology` is not matched here; the scorer maps a fired monitoring rule to the pattern.
- Unknown `template` or a malformed definition returns `null` and never throws.

The **scorer builds** `SubjectTimeline` and `FlaggedNeighbour[]` from the BigQuery tables; the **miner builds**
the same shapes from `case_timelines.json`. A shared `timelineFromEvents(events, asOf)` does the sorting and
the kind lookup for both.

## 7. What the scorer does with a match (its half of the contract)

- Loads patterns through one port, `PatternSource.load()`, with three implementations (code, file,
  Firestore). It resolves to `{ libraryVersion, contentHash, patterns, skipped }`, or to `{ refused: reason }`
  when the library as a whole is unusable (a broken envelope, a content hash that does not match, a source
  that cannot be read). A refused library is a result, not an exception: the scorer records one
  `library_refused` finding, scores the pattern layer 0 and marks the run `no_patterns`. `load` rejects only
  for a bug. `readPatternLibrary` is the non-throwing reader every source uses; `parsePatternLibrary` still
  throws `PatternLibraryError`, for callers that want it.
- Validates with zod. An invalid pattern is skipped and counted as an `invalid_pattern` finding; it never
  stops the run. An empty library means the pattern layer scores 0 and the run is marked `no_patterns`, which
  is never shown as low risk (B-56).
- Uses `approved` patterns only. Skips an unknown `template` with a finding (forward compatibility).
- **Ignores `graph_proximity` patterns.** The scorer has a graph layer (up to 20 points) that already scores
  closeness to a flagged entity through documented links; a `graph_proximity` pattern would count the same
  neighbour twice. So the pattern layer neither matches nor scores it, and it is not an error or a finding.
  If the only approved patterns are `graph_proximity`, the layer has nothing to match and the run is marked
  `no_patterns`. The template stays in the contract because the miner's matcher and a consumer without a
  graph layer can use it. _Decided in workstream W1c; the owner can reverse it._
- Points per matched pattern: `round(30 × strength × support_weight)`, where `support_weight` is 1.0 for 3 or
  more **verified** supporting cases and 0.6 otherwise (and 0.6 for every hand-written hypothesis). **The
  pattern layer is the largest single pattern's points, capped at 30, not the sum**, so overlapping patterns
  do not double count. _Decided by the owner on 17 Oct 2026._
- Writes one reason per matched pattern into `risk_scores.reasons`:
  `{ code: 'pattern_match', pattern_id, pattern_name, strength, support_weight, points, evidence_ids, evidence_statuses }`,
  and stores `pattern_version = library_version` on the score.
  `evidence_ids` holds public event ids for a public-record pattern, the transaction ids of the fired
  monitoring rule for a `transaction_typology`, and neighbour entity ids for a graph match (it was
  `evidence_event_ids` before workstream W1c, which was too narrow). `MatchResult` keeps `matched_event_ids`
  and `matched_neighbour_ids`.
- Never writes to the library, never edits a pattern, never calls a model.

## 8. Versions and compatibility

- Inside `schema_version` 1, changes are additive only: new optional fields, new values for open fields.
  Consumers ignore unknown optional fields.
- A new `template` is a minor change: old scorers skip it with a finding instead of failing.
- A breaking change makes `schema_version` 2. The scorer reads 1 and 2 for one release.
- `library_version` only ever increases. An old score's `pattern_version` can always be reproduced from the
  immutable `riskPatternLibrary/v<n>` copy.

## 9. The agreement test (shared fixtures)

The contract is real only if both sides run the same examples. A new step **C0** adds, in
`packages/shared/src/risk/patterns/`:

- the schemas above, with tests (valid, and one rejection per rule);
- `fixtures/library.sample.json`: a library with one pattern per template and one retired pattern;
- `fixtures/timelines.sample.json` and `fixtures/match-cases.json`: input timelines with the expected
  `MatchResult` for each pattern, including the edges (gap exactly at the limit and one month over, lead time
  one month short, events after `as_of`, a hub neighbour, an inferred link);
- the `PatternSource` and `matchPattern` types (the matcher body is built in step 7 by the miner side; until
  then the scorer injects a fake matcher in its tests).

Both sides' tests load the same fixture files. If the miner side changes a shape, the scorer side's tests fail
in CI, and the other way round.

## 10. Who builds what

| Piece                                                                                                                                  | Builder                                   | Needs                          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| **C0** schemas, fixtures, interfaces (section 9)                                                                                       | One person, first, small                  | This contract agreed           |
| **Scorer side**: `PatternSource` (code, file, Firestore), the pattern layer, reasons, tests with a fake matcher and the sample library | Sanchit (risk scoring job, steps 8 and 9) | C0                             |
| **Miner side**: `matchPattern`, `timelineFromEvents`, candidates, backtest, proposals, `export-library`                                | Miner builder (step 7, then 14)           | C0                             |
| `decidePattern` callable and the library documents                                                                                     | Step 12                                   | C0, the miner's proposal shape |

After C0 the two sides do not need each other until the first end-to-end run (step 15, scoring reads approved
patterns from Firestore).

## Decisions

1. **Agreed (17 Oct 2026):** patterns carry no weights; `verified_case_count` is computed at score time; the
   library is one Firestore document.
2. **Agreed:** max, not sum, across matched patterns (section 7).
3. **C0 is built first by the session that agreed the contract** (step 4a in the README), so Sanchit can start
   the scorer side against finished schemas and fixtures.

## Implementation notes from building C0

- The schemas, `timelineFromEvents`, `canonicalJson`, `parsePatternLibrary` and the conformance runner are
  pure and live in `packages/shared/src/risk/patterns/`. `packages/shared` also runs in the browser, so it
  does **not** import Node's crypto: the functions that need sha256 (`patternIdOf`, `contentHashOf`,
  `verifyLibrary`) take the hash function as a parameter, and the jobs pass one built on `node:crypto`.
- `violatesWording` moved from `ingest/src/agent/wording.ts` into `packages/shared/src/risk/wording.ts`
  (the ingest file re-exports it, so nothing else changes), so a library with a banned word in a pattern
  name or description is rejected by the schema itself.
- The fixtures are JSON files in `packages/shared/src/risk/patterns/fixtures/`. Their pattern ids and
  `content_hash` are real, and a test recomputes them.
- A match case expects one of four outcomes, not a number: `no_match` (null, or strength 0), `not_full_match`
  (null, or strength below 1), `partial_match` (strength strictly between 0 and 1), or `full_match` (strength
  exactly 1, with the listed event and neighbour ids). The strength formula for partial matches is the
  matcher's business (step 7), so the fixtures only pin what the contract promises.
