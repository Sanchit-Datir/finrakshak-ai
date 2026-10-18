# Prototype performance report

_Measured 18 Oct 2026 on branch `claude/intelligent-faraday-xbjw3e` (`main` merged up to `d9b7aa6`).
How the benchmark is planned and what is still to come: `docs/plans/PERFORMANCE_BENCHMARK_PLAN.md`._

All figures were measured on this repository. Detection figures use **SYNTH** (synthetic) loans; nothing
here comes from a real bank. Items marked **not measured** need the live project (section 9).

## 1. Summary

| Measure                                 | Result                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Unit tests                              | **1,596 tests in 170 files, all passing** (shared, functions, ingest, web)               |
| Browser scenarios (Playwright)          | **6 of 6 passing** in 54 s, including 3 real public-record cases                         |
| Full quality gate (`npm run check`)     | Passes in 190 s: Prettier, ESLint (0 warnings), `tsc` strict, tests                      |
| Defaulters caught (settings v2, SYNTH)  | **85 of 105**, all on time; **0** of 85 controls and look-alikes alerted                 |
| Same, second random seed / 1,000 loans  | 85 of 105 / 424 of 525; 0 false alarms in both; 27.8 / 28.2 alerts per 1,000 loan-months |
| Expected monitoring rules fired         | 70 of 70, none unexpected                                                                |
| Relationship graph build (43,405 nodes) | **9.2 s**, 419 MB peak memory                                                            |
| Web first load (deployed)               | **≈ 192 kB** transferred (compressed); static files in 120–200 ms                        |
| Risk-scoring replay, 24 months          | 200 loans: 31 s; 1,000 loans: 761 s. **Grows with loans × transactions** (section 5)     |

## 1a. Slide summary

1. **Quality:** 1,596 unit tests and 6 browser scenarios passing; strict lint and types; 0 known
   production vulnerabilities.
2. **Detection (SYNTH loans):** 85 of 105 defaulters caught on time with **0 false alarms**; the same on
   a second seed and at 1,000 loans (424 of 525, 0 false alarms); every expected monitoring rule fired.
3. **Speed:** graph of 43,405 nodes built in 9.2 s; full build 40 s; web first load ≈ 192 kB.
4. **Scale:** serverless, scales to zero; scoring replay 31 s for 200 loans × 24 months; a found
   bottleneck (loans × transactions) is identified with a small fix.
5. **Cost control:** sign-in + App Check on every call, AI allow-list, 30 AI calls per person a day,
   burst limits, max 2–5 instances, budget alerts, one-click emergency stop.
6. **Gen AI safety:** every AI claim is checked by code (grounding, citations, numbers); leads, not
   verdicts; no personal data in logs.

## 1b. Cost protection for the demo account

The shared demo account cannot run up the bill:

- **Per person:** at most 30 AI calls a day (Firestore transaction, never crossed) and a burst limit of
  2–6 calls a minute per AI feature. With every AI call at its upper-bound cost (investigator ≤ US$0.04
  per run, 10 model calls each), one account costs **at most about US$0.12 a day**.
- **Who can call:** only signed-in accounts with `aiEnabled: true`, and only from the app (App Check).
  New sign-ups get no AI. Remove `aiEnabled` or disable the account in Firebase Auth to stop it at once.
- **Whole project:** functions capped at 2–5 instances; budget alerts at ₹450 a month (project) and ₹200
  (AI); the emergency-stop workflow switches Vertex AI off in one click (`docs/EMERGENCY_STOP.md`).
- **Owner steps:** change the demo account's password after judging, and delete the App Check debug token
  when the live benchmark is done (a debug token lets scripts pass App Check).

## 2. Test setup

| Item        | Value                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| Machine     | Cloud container, 4 vCPU, 15 GB RAM, Linux                                     |
| Runtime     | Node.js 22.22.0                                                               |
| Commit      | `main` at `d9b7aa6` merged into this branch                                   |
| SYNTH data  | Generator v1, seed 20261017 (and 20261018), 24 months from Jan 2024           |
| Public data | `data/processed` built 16 Oct 2026; graph from the same build                 |
| Timing      | Wall clock and peak resident memory of each command (single run unless noted) |

## 3. Detection quality (SYNTH)

The generator writes both the loans and the correct answers, so these figures check that the scoring
logic works end to end. **They are not real-world accuracy (B-55).**

| Run                                                         | Alerts | Per 1,000 loan-months | Defaulters caught | On time (≤ 2 months) | Controls alerted | Look-alikes alerted | Held-out alerted |
| ----------------------------------------------------------- | -----: | --------------------: | ----------------: | -------------------: | ---------------: | ------------------: | ---------------: |
| Settings v1, seed 20261017                                  |     56 |                  15.2 |         54 of 105 |                   41 |          0 of 45 |             0 of 40 |          0 of 10 |
| **Settings v2**, seed 20261017                              |    105 |                  28.5 |     **85 of 105** |                   85 |          0 of 45 |             0 of 40 |          0 of 10 |
| Settings v2, seed 20261018                                  |    102 |                  27.8 |         85 of 105 |                   85 |          0 of 45 |             0 of 40 |          0 of 10 |
| Settings v2, **1,000 loans**, seed 20261017                 |    525 |                  28.2 |        424 of 525 |                  424 |         0 of 225 |            0 of 200 |          0 of 50 |
| v2 + behaviour option 4 + prepayment rule (B-59), 200 loans |      – |                  30.4 |        105 of 105 |                    – |                0 |                   0 |                – |

The last row is from `docs/RISK_SCORING.md`; that option set is not selectable from the command line, so
it was not re-run here.

**Per loan type (v2, seed 20261017)**

| Loan type                                                    | Loans | Alerted | On time | Band agreement |
| ------------------------------------------------------------ | ----: | ------: | ------: | -------------: |
| `sudden_enforcement`                                         |    15 |      15 |      15 |           100% |
| `round_trip`                                                 |    15 |      15 |      15 |          97.9% |
| `fund_diversion`                                             |    15 |      15 |      15 |           100% |
| `contagion`                                                  |    15 |      15 |      15 |          92.6% |
| `shared_address`                                             |    15 |      15 |      15 |          99.3% |
| `cash_split`                                                 |    10 |      10 |      10 |          95.9% |
| `slow_burn`                                                  |    20 |       0 |       0 |          33.6% |
| `control`                                                    |    45 |       0 |       – |           100% |
| `seasonal`, `big_prepayment`, `near_threshold` (look-alikes) |    40 |       0 |       – |           100% |
| `dormant_burst` (held out: no pattern written for it)        |    10 |       0 |       – |           100% |

The 20 `slow_burn` loans are the only defaulters missed under v2 (at 1,000 loans, 100 of the 101 missed are `slow_burn` and 1 is `contagion`); the prepayment rule set (last row
above) catches them.

**Public-record scenarios (browser tests):** Maheep trade-credit chain (Urgent review, customer in
liquidation at the end of 4 unpaid-dues links), Advantage Overseas (6 alerts after disbursement) and
Jai Corp (1 alert, ED attachment) all pass, as do the risk-scores page and 2 security tests.

## 4. Public-records dataset and graph

| Measure                     | Value                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Sources                     | NFRA, IBBI, ED, RBI, SFIO, SEBI (10-order sample), MCA company master                               |
| Listed items                | 19,624 (IBBI 14,952, RBI 2,439, ED 2,100, NFRA 118, SEBI 10, SFIO 5)                                |
| Rows                        | 19,628 documents, 18,286 entities, 57,382 relationships, 46,907 evidence claims, 1,110 risk signals |
| MCA match                   | 766,814 company rows (Maharashtra); 6 matched by CIN, 2,949 by unique name                          |
| Graph                       | 43,405 nodes, 47,116 edges, 3,349 networks, 972 possible duplicates                                 |
| Graph build + web bundle    | **9.2 s**, 419 MB peak memory; bundle 4.8 MB compressed                                             |
| Full rebuild from raw files | about 30 s (README; not re-run: it rewrites `data/processed`)                                       |

## 5. Speed, memory and scalability

| Step                                                               | Time                                                                       | Peak memory |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------- |
| `npm ci` (1,058 packages)                                          | 24.6 s                                                                     | –           |
| `npm run build` (5 workspaces)                                     | 39.9 s                                                                     | 940 MB      |
| `npm run check` (format, lint, types, tests)                       | 189.8 s                                                                    | 2.5 GB      |
| Unit tests only: shared / functions / ingest / web                 | 3.2 s / 5.0 s / 22.2 s / 5.8 s (web now 294 tests after the latest `main`) | –           |
| `npm run e2e` (build, preview, 6 scenarios)                        | 55.4 s                                                                     | 977 MB      |
| Graph build (`graphCli --web`)                                     | 9.2 s                                                                      | 419 MB      |
| Synthetic data, 200 loans (18,071 transactions)                    | 1.0 s                                                                      | 118 MB      |
| Synthetic data, 1,000 loans (91,532 transactions)                  | 3.7 s                                                                      | 228 MB      |
| **Risk-scoring replay, 200 loans × 24 months** (3,690 loan-months) | **30.6 s** (≈ 120 loan-months/s)                                           | 155 MB      |
| Risk-scoring replay, 1,000 loans × 24 months (18,450 loan-months)  | **761 s** (≈ 24 loan-months/s)                                             | 390 MB      |
| Risk-scoring replay, 5,000 loans                                   | stopped after 10 minutes; projected several hours                          | –           |

**Finding: the scoring replay grows with loans × transactions.** For every loan in every replayed month,
`byAccount` in `packages/shared/src/risk/scoring/run.ts` filters the whole transaction list. Five times
the loans means about 25 times the work; measured: 30.6 s → 761 s, a factor of 24.9. A daily run over a real loan
book (one month, not 24) would also slow down as the book grows. The fix is small: index the
transactions by account once per run, which should make the replay roughly linear. It is not changed in
this branch; it needs the owner's go-ahead and a regression test that the scores stay identical.

## 6. Web app

| Measure                            | Value                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Build output                       | 73 JS/CSS files, 2.0 MB raw, 598 kB gzip in total                                                            |
| First page load (local build)      | 4 files: 793 kB raw, **≈ 230 kB gzip**                                                                       |
| First page load (deployed, Brotli) | main 142 kB + zod 23 kB + react 16 kB + CSS 11 kB ≈ **192 kB**                                               |
| Static file time (deployed)        | median 120–200 ms per file from this container; HTML median 131 ms (`fund-tracer`), 119 ms (`finrakshak-ai`) |
| Lazy-loaded                        | every page, the PDF reader (484 kB, only when a PDF is opened) and its worker (1.3 MB)                       |
| Build warning                      | the main chunk is over Vite's 500 kB warning size (572 kB raw)                                               |
| Lighthouse scores                  | **not measured** yet (plan step 3)                                                                           |

## 7. APIs, throttling and spending controls

What is configured (from the code); live latency is **not measured** (section 9).

| Function                 | Uses Gemini | Burst limit / min | Daily AI limit      | Max instances | Memory | Timeout |
| ------------------------ | ----------- | ----------------: | ------------------- | ------------: | ------ | ------: |
| `getProfile`             | no          |                20 | –                   |             5 | 256MiB |    30 s |
| `getRiskScores`          | no          |                20 | –                   |             2 | 256MiB |    30 s |
| `publicData` (HTTP)      | no          |                 – | –                   |             3 | 256MiB |    60 s |
| `askGemini`              | yes         |                 5 | 30 per person a day |             5 | 256MiB |    60 s |
| `analyseApplication`     | yes         |                 3 | shared, 1 per call  |             5 | 256MiB |    90 s |
| `assistRecord` (Copilot) | yes         |                 6 | shared, 1 per call  |             5 | 256MiB |    90 s |
| `investigateApplication` | yes         |                 2 | 1 per model turn    |             5 | 256MiB |   120 s |

- Every callable requires sign-in **and** App Check. Checked live on 18 Oct 2026: a signed-in call
  without an App Check token is refused with `401 Unauthenticated`.
- AI calls pass the billed gate first: the account must have `aiEnabled`, then one use is taken from the
  daily limit in a Firestore transaction (never crossed; not refunded if the model fails).
- The burst limit is counted per running instance, so across instances it can reach max instances ×
  limit (for example 10 investigator runs a minute). The daily limit is global and is the real cap.
- Input caps: prompts ≤ 8,000 characters (`askGemini`), ≤ 24,000 (analysis, Copilot), investigator bundle
  ≤ 40,000 with ≤ 10 model turns, ≤ 8 reads and a 100 s deadline; replies ≤ 1,024 tokens; model timeout 30 s.
- These rules are covered by the functions' unit tests (357 tests); the emulator API benchmark (latency
  and throttling under load) is plan step 4.

## 8. Gen AI and agents

| Item                       | Status                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model                      | `gemini-3.1-flash-lite` on Vertex AI (cheapest model that passes our checks)                                                                                       |
| Grounding and verification | Copilot statements are checked against the record's facts; the investigator's citations, quotes and numbers are checked by code; both covered by shared test cases |
| Agents                     | Ingestion agent, pattern miner, risk explainer: tool loop with budgets, mock by default, `agentRuns` records tokens                                                |
| Cost per call (estimate)   | Copilot ≈ US$0.002, analysis ≈ US$0.003, investigator ≤ US$0.04 (upper bounds from input caps, README section 12)                                                  |
| Live latency and tokens    | **not measured** (section 9)                                                                                                                                       |

## 9. Not measured yet, and why

| Item                                  | Blocker                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Live API latency, cold and warm       | Callables need an App Check token: register a debug token in the Firebase console           |
| Gemini latency, real tokens and cost  | Same, plus `roles/aiplatform.user` for the functions account and the log fields in plan 6.1 |
| Emulator API and throttling benchmark | `bench/` script not built yet (plan step 4)                                                 |
| Lighthouse scores                     | Plan step 3                                                                                 |
| Scaling to 5,000 loans                | The replay's growth (section 5); re-measure after the fix                                   |
| AI extraction quality (B-52)          | Golden set of ≥ 30 hand-checked documents not curated                                       |

## 10. How to reproduce

```bash
npm ci
npm run build
npm run check                                   # quality gate and unit tests
node ingest/dist/graphCli.js --web              # graph build (restore data/graph afterwards: git checkout -- data/graph)
npm run e2e                                     # browser scenarios
node ingest/dist/synthCli.js --out bench/tmp/s200
node ingest/dist/risk/scoreCli.js --in bench/tmp/s200 --out bench/tmp/s200-v2 --settings v2
node ingest/dist/risk/scoreCli.js --in bench/tmp/s200 --out bench/tmp/s200-v1 --settings v1
node ingest/dist/synthCli.js --seed 20261018 --out bench/tmp/s200b
node ingest/dist/risk/scoreCli.js --in bench/tmp/s200b --out bench/tmp/s200b-v2
```

Each `score_report.json` holds the detection figures. The one-command benchmark (`npm run bench`) is
described in the plan and README section 13.
