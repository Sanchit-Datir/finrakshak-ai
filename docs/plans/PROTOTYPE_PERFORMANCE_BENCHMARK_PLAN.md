# Plan: Prototype performance report and benchmarking

## Context

The repo has **no benchmarking today**: no timing code, no `web-vitals` / Lighthouse / bundle-size tooling,
no precision/recall numbers, no token or dollar metering. You asked for four kinds of "performance":
detection quality, web app speed, pipeline speed and cost, and business KPIs. This plan says how to
measure each, what already exists to reuse, and what in the repo must change. The deliverable is one
reproducible command (`npm run bench`) that writes a dated report to `docs/benchmarks/`.

Rules that shape the plan (CLAUDE.md, `docs/SESSION_NOTES.md`): ask before committing, no PR, never
touch `data/raw`, `data/processed`, `data/registry`; `npm run check && npm run build` must pass; no
`console.log`; add dependencies sparingly; mark made-up inputs TEST/SYNTH; wording is "leads", never verdicts.

## 1. What to measure and how

### A. Detection quality (does it find the right leads?)

| Check                                                                               | Ground truth available now                                                                      | Metric                                             | Honest limit                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Graph networks (`ingest/src/graph/networks.ts`)                                     | 10 synthetic scenarios S1-S10 (`scenarioList.ts`): 4 linked, 4 not linked                       | precision / recall on linked vs not-linked         | n=8, so report "k of 8 correct", not a percentage                     |
| Identity candidates (`identity.ts`)                                                 | S5 should be proposed; S2, S6, S10 must not                                                     | precision / recall                                 | n=4                                                                   |
| Public-records check and watch (`web/src/lib/public-records.ts`, `public-watch.ts`) | 3 e2e scenarios (Maheep, Advantage Overseas, Jai Corp), **all positives**                       | detection rate (recall) and priority match         | no negatives, so **no precision or false-alarm rate is possible yet** |
| AI extraction (`ingest/src/extract/ai/evaluate.ts`)                                 | `GATE` and `EvalReport` exist; golden set `ingest/eval/extraction-golden.jsonl` **not curated** | org / CIN / amount precision, coverage (gate B-52) | blocked on the owner curating >= 30 documents                         |

Needed to make this meaningful (new, small):

- **A reviewed negative set for the public-records check**: ~15-20 clean borrowers (TEST/SYNTH inputs or
  real companies with no adverse records) with expected "Routine review". Without it, only recall exists.
- **Real-data labels for the graph**: the 972 identity candidates and top networks have no human verdicts
  (`status: needs_review`). Sample ~50 and have the owner label them, then compute precision@k.
- Report the 23 seed cases as a **recall backtest** ("is each seed case found in the graph and its known
  counterparties linked?"). Seeds are `seed_candidate_unverified`, so state that.

### B. Web app speed

Measured in two layers, both reusing existing infrastructure:

1. **Pure logic in Node (vitest bench-style script, no new dependency)**: time `runChecks`, `runMonitoring`,
   `allAlerts` (web/src/lib/checks.ts:617, monitoring.ts:388, alerts.ts:47) on `createDemoDb()`, and
   `checkPublicRecords` / `checkWatch` on an already-built `LabIndex`. Use `performance.now()` with warm-up and
   N iterations; report median and p95. **Gotcha:** `runChecks` memoises per `Db` in a `WeakMap`, so build a
   fresh `Db` per iteration or you measure cache hits.
2. **Real browser via the existing `e2e/` Playwright workspace** (preview server on :4173): navigation
   timing, `largest-contentful-paint` and layout-shift via `PerformanceObserver`, JS transferred per route,
   and the graph-lab load broken into fetch / gunzip / parse (zod) / index. Run at 1440px and 360px
   (CLAUDE.md requires 360px). Add a throttled profile (CDP: 4x CPU, fast 3G) because the dataset is
   ~5 MB gzip / ~37 MB JSON (B-41).
3. **Bundle size**: parse `web/dist` after `npm run build -w web` (sizes per chunk, gzip). Budget table in
   the report (React, zod, pdfjs async chunk, Firebase, per-route lazy chunks).

Lighthouse is optional: it adds a heavy dependency. Recommendation: skip it; Playwright's
`PerformanceObserver` gives the same LCP/CLS/TBT-style numbers with zero new packages.

### C. Pipeline speed and cost

- **Graph build time**: `node ingest/dist/graphCli.js` (about 10 s per `data/graph/README.md`, never measured).
  Run 5 times, report median, peak RSS (`/usr/bin/time -v`), nodes and edges per second.
  **Caution:** it rewrites the committed `data/graph/` files. The bench must write elsewhere (see changes).
- **Dataset build**: `node ingest/dist/cli.js build` needs `data/interim/*` which is not in git, so
  bench it only where an ingest cache exists (cloud container or the owner's machine). Otherwise skip, with a note.
- **Cloud runs (real numbers)**: `ingest_runs` in BigQuery already holds per-source `duration_ms`,
  added/changed/removed counts and status (`ingest/src/cloud/history.ts`). Add a SQL query under
  `ingest/sql/` for median/p95 duration and failure rate per source over 30 days.
- **Cost**: today only estimates exist (`docs/COST_GUIDELINES.md` section 5). Real cost needs token counts,
  which are only logged by the agent (`agent/supervisor.ts:137`) and not stored. Persist `inputTokens` /
  `outputTokens` and model on the run record and in `ingest_runs`, and in `extract` runs, then compute
  `tokens x price` using the price table in the cost guidelines. Compare estimate vs measured.
- `acquire` is **not** benchmarked offline: it hits live government sites (B-35, 1.5 s/host pacing).

### D. Business KPIs

The Reports page (`web/src/pages/ReportsPage.tsx`) already computes real metrics from the data (applications
processed, needing review, open/closed alerts, trend, document states) but only over **demo seed data**,
and the spec forbids hard-coded improvement or "losses prevented" claims (spec section 14, ReportsPage L364).
So KPIs are only meaningful with real usage. Plan: define the KPI set now, compute it from the audit log
(every mutation writes an audit entry), and label it "Demo data" until real users exist:

- time from application start to checks run; alerts raised per 100 loans; median alert time-to-first-action;
  % alerts closed as "no concern" (a proxy for false alarms); share of Urgent review alerts actioned in 24 h.
- Do **not** report time saved or losses prevented without a baseline study. Say that in the report.

## 2. Repo changes needed

| Change                                                                                                                            | Files                                                                                                                                                         | Why                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| New `bench/` workspace (TypeScript, in the npm workspaces list) with `src/` runners and a `report.ts` that writes Markdown + JSON | `package.json` (workspaces, script `bench`), `bench/package.json`, `bench/tsconfig.json`, `eslint` / `prettier` already cover it                              | one place for all benchmarks, kept out of `npm run check` runtime |
| Output dir override for the graph build                                                                                           | `ingest/src/graphCli.ts`, `ingest/src/pipeline/graph.ts` (env `FUNDTRACE_GRAPH_OUT`, validated in `ingest/src/config.ts`)                                     | benchmark without rewriting committed `data/graph/*`              |
| Timing helper (start, stop, `duration_ms`)                                                                                        | `ingest/src/log.ts` or a new `ingest/src/util/timing.ts`                                                                                                      | graph / build steps log durations                                 |
| Persist token usage on runs                                                                                                       | `packages/shared/src/ingest/runs.ts` (zod), `ingest/src/cloud/history.ts`, `ingest/src/agent/supervisor.ts`, `ingest/src/cloud/extractTask.ts`, `ingest/sql/` | real cost instead of estimates                                    |
| Load-stage timing in graph-lab loader                                                                                             | `web/src/lib/graph-lab.ts` (fetch / gunzip / parse / index), behind `performance.mark` (no telemetry sent)                                                    | per-stage breakdown in the browser                                |
| Labelled datasets                                                                                                                 | `bench/data/public-records-negatives.json` (TEST/SYNTH), `ingest/eval/extraction-golden.jsonl` (owner), `bench/data/graph-review-sample.jsonl` (owner)        | precision needs negatives and labels                              |
| Performance tab on Reports (optional, later)                                                                                      | `web/src/pages/ReportsPage.tsx` (Tab type L39, `tabs` L169)                                                                                                   | show KPIs with a Demo marker; CSV export via `lib/export.ts`      |
| CI: bundle-size budget job (optional)                                                                                             | `.github/workflows/ci.yml`                                                                                                                                    | fail on regressions; only if you want a gate                      |
| Docs                                                                                                                              | `docs/BENCHMARKS.md` (method, how to run, limits), `docs/SESSION_NOTES.md`, new boundary condition B-54                                                       | CLAUDE.md requires logging new boundary conditions                |

Reuse, don't rebuild: `createDemoDb` (web/src/demo/seed.ts), `SCENARIOS` / `MONITORING_SCENARIOS`
(`e2e/scenarios/index.ts`), `evaluate.ts` + `eval-ai` CLI, `e2e/playwright.config.ts` preview server,
`toCsv` / `downloadFile` (`web/src/lib/export.ts`).

## 3. Boundary conditions to flag (CLAUDE.md)

- **B-40 / B-37**: hub thresholds and fuzzy matching are the main precision drivers; changing `THRESHOLDS`
  must be re-benchmarked.
- **B-41**: graph bundle size in the browser (~5 MB gzip): the main web-speed risk and the headline metric.
- **B-43**: results depend on a snapshot dated 2026-10-16, so every report records dataset build date.
- **B-52**: AI extraction gate: no AI metric can be reported until the golden set exists.
- **B-35 / B-15**: benchmarks must never hit live sources or billed Vertex; mock provider by default, cost from logged tokens only.
- **B-35 (ED/SFIO)**: reports must not reproduce ED / SFIO document text; cite counts only.
- **Coverage limits** (print in every report): MCA is Maharashtra only, SEBI is a 10-order sample, no director data,
  seed cases unverified. Recall on this data does not generalise.
- **New B-54 (proposed)**: benchmark numbers on tiny labelled sets (n=3 to 10) are anecdotes, not rates. The report prints n next to every ratio.
- Note: `BOUNDARY_CONDITIONS.md` has **two entries numbered B-46**; fix when adding B-54.

## 4. Suggested phasing (each phase = one commit, asked for first)

1. **Quick wins, no new data**: `bench/` workspace, bundle sizes, Node timings for checks / watch / graph
   build with output-dir override, report generator, `docs/BENCHMARKS.md`.
2. **Browser timings**: Playwright LCP / load-stage / throttled runs at 1440px and 360px.
3. **Detection quality**: synthetic-scenario precision/recall, 3 scenario recall, plus negative set; owner labels.
4. **Cost and cloud**: token persistence, `ingest_runs` queries, estimate-vs-measured table. Needs GCP.
5. **KPIs and Reports tab**: only once there is real usage; keep Demo marker.

## 5. Verification

- `npm ci && npm run build -w @fund-tracker/shared && npm run build -w ingest && node ingest/dist/graphCli.js --web`
- `npm run bench` produces `docs/benchmarks/<date>.md` + `.json`; re-run twice and confirm medians agree within ~10%.
- Confirm `git status` shows **no change** under `data/raw`, `data/processed`, `data/registry` or `data/graph`
  after a bench run (checksum the 30 source files as earlier sessions did).
- Unit tests for the report math (precision/recall, percentile) and for the zod token fields.
- `npm run check && npm run build`, then `npm run e2e` still passes.
