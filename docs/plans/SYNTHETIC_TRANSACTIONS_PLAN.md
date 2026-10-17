# Plan: Synthetic transaction data generator

_Status: approved by the owner on 17 Oct 2026 with the defaults below (200 customers, 24 months, generated
files out of git, 10 held-out customers). Revised the same day to match the web app's transaction model and
monitoring rules. Nothing here is implemented._

## Why

Bank customer and transaction data cannot be shared or exposed, so there is nothing real to test a
risk-scoring pipeline against. The idea is a generator that makes **fictional** customers with
transactions that follow defined scenarios (healthy, slowly failing, sudden enforcement, round-tripping
and so on), plus a **ground-truth label** for every customer and month. The scoring work that follows
(pattern matching, direct entity matches, risk history and the "has risk increased" delta) can then be
built and tested against known answers.

It extends what the repo already does: `ingest/src/graph/scenarios.ts` (fictional "SYNTH" organisations
and `example.invalid` URLs) and the TEST loans in `e2e/scenarios/`.

## What this proves, and what it does not (B-55)

- **It proves the plumbing:** patterns are stored, scoring finds them, risk history records the delta,
  and look-alikes stay quiet.
- **It does not prove that the patterns predict real defaults.** Public data (ED, IBBI, NFRA) says what
  happened to a defaulter, not how their account moved. The transaction shapes below are assumptions
  based on how enforcement narratives describe fund routing. Treat them as hypotheses until they are
  tested on real bank history.
- Never quote a detection rate on this data as accuracy.
- To avoid a circular test, one defaulter archetype (`dormant_burst`) is **held out**: no scoring
  pattern is written for it, and the expected result is "not detected by patterns". This checks that the
  system does not claim more than it knows.

## Decisions already made

- Deterministic seeded code. **No Gemini and no billed API** anywhere in the generator (B-15).
- Fictional customers only; every name starts with `SYNTH`.
- Output is separate from real data: `data/synthetic/` on disk and a `fundtrace_synth` BigQuery dataset.
  Nothing under `data/raw`, `data/processed` or `data/registry` is touched.
- INR only. 200 customers over 24 months (2024-01 to 2025-12), roughly 100–150k transactions.
- Generated files stay out of git (reproducible from the seed). One small contract sample is the only
  exception (see "Alignment with the web app").

## Alignment with the web app

The web app already has a transaction model and a monitoring engine, so the generator must feed them
instead of inventing a parallel one.

**What exists** (`web/src/domain/schemas.ts`, `web/src/lib/monitoring.ts`):

- `Transaction`: `id`, `loanId`, `at` (a timestamp string), `fromId`, `toId`, `amountMinor` (INR paise,
  integer), `type` (`disbursement`, `neft`, `rtgs`, `imps`, `upi`, `cheque`, `cash_withdrawal`,
  `repayment`), `reference`, `source` (`demo` or `import`). Money moves between **entities**; a loan's
  credited account is an entity of kind `account` owned by the borrower.
- `Loan`, `Entity` (kinds: `individual`, `company`, `account`, `loan`, `document`, `proceeding`,
  `counterparty`) and `Relationship` (`director_of`, `owner_of`, `shares_address`, `same_proceeding`,
  and others).
- `runMonitoring(db)` runs five rules over those rows, with thresholds from `settings.monitoring`:

  | Rule id                 | Default threshold                                                         |
  | ----------------------- | ------------------------------------------------------------------------- |
  | `rapid_onward`          | at least 70% of the disbursement leaves within 72 hours                   |
  | `linked_counterparty`   | any outflow to an entity within two relationship hops of the borrower     |
  | `circular`              | at least 50% of a transfer returns within 30 days                         |
  | `cash_split`            | 3 or more withdrawals at 90–99% of the ₹1 lakh reference within 7 days    |
  | `repeated_counterparty` | 2 or more loans pay the same counterparty at least ₹1 lakh within 60 days |

**What the generator therefore does:**

1. **Emits rows in the web shape**, field for field, so they can be loaded straight into the app's `Db`
   and run through `runMonitoring`. Synthetic rows add one extra key, `synthetic: true`, which the web
   schemas ignore. `source` is `import` (they model imported bank data) and `Loan.dataSource` is
   `SYNTHETIC TEST DATA`.
2. **Uses full timestamps, not only dates.** `rapid_onward` works in hours, so `at` is a UTC ISO
   timestamp; the IST calendar day is derived with `istDate` (B-27).
3. **Does not re-implement the rules.** Scenarios are built to trip, or deliberately not trip, the
   existing rules, and the labels name the rule ids expected. The later scoring job reads those alerts as
   inputs to its behaviour layer; the new work is the public-record patterns, the history and the delta.
4. **Puts the public-record flags in the graph-lab shape** (`Entity` and `CaseEvent` from
   `packages/shared/src/evidence`, as `scenarios.ts` does), with `SYNTH` names, so `public-watch.ts` can
   find them when it looks a borrower up by name. How each `case_type` maps to insolvency, liquidation or
   enforcement in the app is checked in MVP 2.

**Known limitation:** the web app uses zod 4 and `packages/shared` uses zod 3, so the web schemas cannot
be imported by `ingest`. The shared synthetic schemas therefore mirror the web shapes. To keep the two
from drifting, a **contract test** runs in the web workspace (below). Merging the two schema sets is a
separate decision and not part of this plan.

## Data model (new zod schemas in `packages/shared/src/synth/`)

Every record carries `synthetic: z.literal(true)`. Amounts are INR paise as integers (`amountMinor`), as
the web model has them; there is no currency field because the app is INR only.

| Schema              | Key fields                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SynthEntity`       | the web `Entity` shape; names start `SYNTH `; kinds used: `company`, `individual`, `account`, `counterparty`                                                                                                       |
| `SynthRelationship` | the web `Relationship` shape (`director_of`, `shares_address`, and so on), with `status` and `observedAt`                                                                                                          |
| `SynthLoan`         | the web `Loan` shape (`amountMinor`, `disbursedAt`, `accountEntityId`, `monitoringDays`)                                                                                                                           |
| `SynthTransaction`  | the web `Transaction` shape, with `type` and `source: 'import'`                                                                                                                                                    |
| `SynthFlag`         | a graph-lab `Entity` plus `CaseEvent` pair (shared evidence types), dated, with the evidence status of B-36 (allegation, finding or fact)                                                                          |
| `SynthTruth`        | per loan: `archetype`, `class` (`control`/`defaulter`/`lookalike`/`held_out`), `onset_month` or null, `expected_rules` (existing rule ids), and per month `expected_band`, `expected_patterns`, `expected_reasons` |
| `SynthManifest`     | `seed`, `generator_version`, `as_of_start`, counts per file and archetype, `sha256` per file (no wall-clock time, so it is reproducible)                                                                           |

`expected_band` uses `routine`, `needs_attention` and `urgent`, the app's `Priority` ids, which show as
Routine review, Needs attention and Urgent review. The wording is never "fraud".

## Scenarios (200 customers)

Each scenario names the existing rule it should trip (or must not trip) and the later scoring result.

| Archetype            | Count | Class     | Transaction shape                                                              | Existing rules expected               | Scoring result expected              |
| -------------------- | ----: | --------- | ------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------ |
| `control`            |    45 | control   | EMIs on time, steady inflows                                                   | none                                  | routine all months                   |
| `slow_burn`          |    20 | defaulter | EMI delay grows, then partial payments, then missed                            | none                                  | band climbs from onset               |
| `sudden_enforcement` |    15 | defaulter | transactions normal; a flag on the borrower appears at onset                   | none                                  | routine, then urgent from flag month |
| `round_trip`         |    15 | defaulter | at least 50% of an outbound transfer returns within 30 days                    | `circular`                            | pattern match                        |
| `fund_diversion`     |    15 | defaulter | 70% or more of the drawdown leaves within 72 hours, to a related party         | `rapid_onward`, `linked_counterparty` | pattern match                        |
| `contagion`          |    15 | defaulter | the borrower's top receipt counterparties get flagged after onset              | none                                  | rise from graph proximity            |
| `shared_address`     |    15 | defaulter | clusters of 5 borrowers on one address paying one counterparty; one is flagged | `repeated_counterparty`               | direct match plus graph for the rest |
| `cash_split`         |    10 | defaulter | 3 or more cash withdrawals at 90–99% of the ₹1 lakh reference within 7 days    | `cash_split`                          | pattern match                        |
| `dormant_burst`      |    10 | held_out  | months of silence, then heavy movement                                         | none                                  | not detected by patterns (B-55)      |
| `seasonal`           |    15 | lookalike | lumpy inflows, all EMIs paid                                                   | none                                  | routine, no alert                    |
| `big_prepayment`     |    15 | lookalike | one large early repayment (`repayment`), no missed EMI                         | none                                  | routine, no alert                    |
| `near_threshold`     |    10 | lookalike | just under each rule: 69% out in 72 h, 49% back in 30 days, 2 cash withdrawals | none                                  | routine, no alert                    |

The `near_threshold` customers test the edges of the rules (just under, and in the defaulter archetypes
just over), the same boundary style `docs/BOUNDARY_CONDITIONS.md` asks for.

## Files

New (all under the size limits in CLAUDE.md: files under about 300 lines, functions under about 40):

```
packages/shared/src/synth/
  index.ts          exports
  schemas.ts        the schemas above
  schemas.test.ts
ingest/src/synth/
  rng.ts            seeded PRNG (mulberry32), integer helpers; no new dependency
  rng.test.ts
  calendar.ts       IST day and timestamp arithmetic on strings (month ends, leap days, hours)
  calendar.test.ts
  ledger.ts         builds transactions and keeps account balances consistent
  ledger.test.ts
  population.ts     borrowers, accounts, counterparties, addresses, relationships, flags
  generate.ts       runs every archetype for a seed and returns all rows plus truth
  generate.test.ts
  truth.ts          expected rules and expected band per loan per month
  truth.test.ts
  replay.ts         as-of-month views of transactions and flags
  replay.test.ts
  output.ts         writes jsonl files and the manifest (checks the output path)
  output.test.ts
  sample.ts         builds the small contract sample from a fixed seed
  sample.test.ts    regenerates the sample and compares it byte for byte with the committed file
  safety.test.ts    no real-looking identifiers; path and dataset guards
  load.ts           optional BigQuery load into a *_synth dataset (reuses bigQuerySchema)
  load.test.ts      client mocked, never calls Google
  archetypes/
    types.ts        Archetype interface: id, class, build(rng, ctx)
    control.ts, slowBurn.ts, suddenEnforcement.ts, roundTrip.ts, fundDiversion.ts, contagion.ts,
    sharedAddress.ts, cashSplit.ts, dormantBurst.ts, seasonal.ts, bigPrepayment.ts, nearThreshold.ts
    <name>.test.ts  one per archetype
ingest/src/synthCli.ts      mirrors graphCli.ts; flags: --seed, --customers, --months, --out, --sample, --bigquery
web/src/lib/synth-sample.json       the contract sample (about 12 customers, under 100 KB), committed
web/src/lib/synth-contract.test.ts  the contract test (below)
data/synthetic/README.md    what the files are, the SYNTH rule, how to regenerate
```

Changed:

- `package.json` (root): add script `synth` (build shared and ingest, then run `synthCli.js`).
- `.gitignore`: ignore generated `data/synthetic/*.jsonl`. Tracked: the README, the manifest and the
  contract sample.
- `packages/shared/src/index.ts`: export the synth schemas.
- `ingest/README.md`: a short "Synthetic transactions" section.
- `docs/BOUNDARY_CONDITIONS.md`: add B-54 and B-55 (below).
- `docs/SESSION_NOTES.md`: update at the end of each MVP.

## Design rules

- **Determinism (B-24):** one seed gives byte-identical files. IDs come from `stableId`; no `Math.random`,
  no wall-clock time in any output.
- **Money (B-01, B-39):** integer paise only; amounts are drawn with integer arithmetic, never floats.
  Percent thresholds are computed with integers so a "69%" customer is never accidentally 70%.
- **Days (B-27):** the IST day is derived with `istDate`; timestamps are UTC ISO strings.
- **Ledger invariant:** for each account, the running balance equals the previous balance plus or minus
  the amount, with no gaps; EMI count never exceeds the tenor.
- **Replay:** `asOf(month)` returns only transactions and flags dated on or before that month end, so
  scoring can be run month by month and the delta checked.
- **Guards:** the writer refuses an output folder inside `data/raw`, `data/processed` or `data/registry`;
  the loader refuses any dataset whose name does not end in `_synth` and refuses to write synthetic rows
  into a real table.
- **No real identifiers:** generated text never matches PAN or CIN formats, and every URL is
  `example.invalid`.

## Tests

All tests are vitest unit tests, next to the source. None call a billed API.

| Area               | What is asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rng`              | same seed gives the same sequence; different seeds differ; ranges are inclusive and integer-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `calendar`         | leap day 2024-02-29; 31 Jan plus one month; month and year rollover; a 72-hour window across midnight IST; IST day of a UTC instant                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `schemas`          | valid samples pass; name without `SYNTH`, `synthetic: false`, fractional `amountMinor`, non-positive amounts and unknown `type` are rejected                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ledger`           | balance chain is consistent; amounts are safe integers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `generate`         | two runs with one seed give identical sha256 per file; counts per archetype match the allocation; IDs are unique; every referenced entity exists; rows are sorted by `at` then id; truth has a row for every loan and month                                                                                                                                                                                                                                                                                                                                                      |
| per archetype      | the promised shape, measured. `slow_burn`: median days-late never falls across the stress window, then a missed EMI. `round_trip`: at least 50% returns within 30 days. `fund_diversion`: at least 70% leaves within 72 hours. `cash_split`: 3 or more withdrawals at 90–99% of the reference in 7 days. `shared_address`: five borrowers share an address, exactly one is flagged. `contagion`: top receipt counterparties are flagged after onset. `near_threshold`: each measure is just under its limit. `seasonal`, `big_prepayment`, `control`: no missed EMI and no flags |
| `truth`            | controls and look-alikes never exceed `routine`; defaulters never go down in band after onset; `held_out` expects no pattern match                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `replay`           | `asOf(m)` contains nothing from after month `m`; each month's view is contained in the next; a flag dated in month 7 is absent in month 6 and present in month 7                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `output`, `safety` | output-path guard; manifest hashes match the files; no PAN or CIN-shaped strings; dataset-name guard; no synthetic rows accepted by a real-table writer                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sample`           | the committed contract sample equals a fresh build from the fixed seed (catches drift on the ingest side)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `synthCli`         | arguments parsed with zod; bad seed rejected; customers capped at 5,000 and months at 36                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Contract test (web workspace, `web/src/lib/synth-contract.test.ts`).** It parses the sample with the
web's own `EntitySchema`, `RelationshipSchema`, `LoanSchema` and `TransactionSchema`, builds a `Db` from
`createEmptyDb()` with those rows and the default `settings.monitoring`, runs `runMonitoring`, and checks
that for every loan the rule ids raised equal the `expected_rules` in the sample's labels. A change to
either the web model or the generator that breaks this fails CI, in whichever workspace changed.

## Risk scoring decisions accepted for the next plan

Accepted by the owner on 17 Oct 2026, to be used when the scoring job is planned (not built here):

- **Score:** 0–100 from four layers: direct match 40, pattern match 30, graph proximity 20, own behaviour
  drift 10. The existing monitoring alerts feed the behaviour and pattern layers.
- **Bands:** Routine review below 30, Needs attention 30–59, Urgent review 60 and above.
- **Overrides:** an insolvency, liquidation or ED record on the borrower after disbursement goes straight
  to Urgent review. This settles the open "alert levels" item in `docs/SESSION_NOTES.md`.
- **A risk rise raises an alert** when the band steps up, or when the score rises 15 or more points inside
  a band **and** a new reason appeared. No new reason means no alert; an already-alerted reason does not
  alert again.
- **A fall** is recorded in history, without an alert. The band steps down only after 2 clean runs in a row.
- **Tuning:** weights, cut-offs and the 15-point step live in a versioned settings block (version,
  effective date, who changed it), like `settings.monitoring`, and every stored score records the version
  that produced it. Synthetic runs are used to check that controls and look-alikes never alert and
  defaulters alert early; the values stay provisional until real history exists (B-55).

**Open question for the scoring plan:** the monitoring rules live in `web/src/lib` and use zod 4 types, so
the `ingest` jobs cannot import them. Either the rules move into `packages/shared` (which means resolving
the zod 3 and 4 split) or the scoring job reads the alerts another way. Decide this when the scoring job
is planned.

## MVPs (one commit each, on request only)

| MVP | Content                                                                                                                                                           | Done when                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Schemas (web-shaped), rng, calendar, ledger, guards, with tests                                                                                                   | `npm run check && npm run build` pass                            |
| 2   | Population, flags, truth, manifest, CLI to disk, contract sample and web contract test; archetypes `control`, `slow_burn`, `sudden_enforcement`, `fund_diversion` | second run with one seed is byte-identical; contract test passes |
| 3   | The other archetypes with their shape tests, including `near_threshold`                                                                                           | every archetype test passes; labels match the table              |
| 4   | Replay, optional BigQuery load into `fundtrace_synth`                                                                                                             | load runs against a mocked client; guard tests pass              |
| 5   | Docs: README, boundary conditions B-54 and B-55, session notes                                                                                                    | docs reviewed by the owner                                       |

Verification at each MVP: `npm run check && npm run build`; regenerate twice and compare checksums;
confirm the checksums of `data/raw`, `data/processed` and `data/registry` are unchanged.

## Boundary conditions

Touched, with how each is handled:

- **B-01 / B-39 money:** integer paise, rejected if unsafe.
- **B-15 cost:** no model calls; a BigQuery load of about 40 MB stays inside the free tier.
- **B-24 idempotency:** seeded generation and `stableId`.
- **B-27 IST day:** IST day derived from UTC timestamps.
- **B-36 evidence status:** flags carry it and are never upgraded.
- **B-37 / B-38 personal data:** no real people, no real identifiers.

New, to be added to `docs/BOUNDARY_CONDITIONS.md` in MVP 5:

- **B-54 Synthetic and real data separation:** synthetic data lives in its own folder and dataset, every
  record is `synthetic: true` with a `SYNTH` name, loaders and writers refuse mixing, and the app labels
  any such data "Synthetic test data" (never shown as real).
- **B-55 Ground truth is not evidence:** results on synthetic data prove the plumbing only; no accuracy is
  quoted from them, and one archetype is held out of pattern writing.

## Not in this plan

The pattern library, the scoring job and the explainer agent. They come after this, and they depend on
the data and labels defined here.
