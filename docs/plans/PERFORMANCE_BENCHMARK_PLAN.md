# Prototype performance report and benchmarking: plan

_Written 18 Oct 2026 on branch `claude/intelligent-faraday-xbjw3e`. Status: **planned, not started**._

This plan explains how we will produce the **Prototype Performance Report** for FundTrace: what we
measure, how we measure it, what code is needed, and what the owner has to do. The finished report
goes to `docs/PERFORMANCE_REPORT.md`, with the raw numbers in `data/benchmarks/`.

## Owner's decisions (18 Oct 2026)

| Question                        | Answer                                                                    |
| ------------------------------- | ------------------------------------------------------------------------- |
| Required template or headings?  | None. Use the report outline in section 6                                 |
| Live Gemini calls allowed?      | **Yes**: about 50–100 calls on `gemini-3.1-flash-lite` (well under $1)    |
| Live run against `fund-tracer`? | **Yes**: Claude runs `bench-live.sh` (needs credentials: see section 4.3) |
| Branch                          | `claude/intelligent-faraday-xbjw3e`. Ask before every commit; no PR       |

## 1. What we already have (baseline figures, 18 Oct 2026)

| Area                     | Source of the numbers                               | Current figures                                                                                                   |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Public-data pipeline     | `data/processed/stats.json`                         | 6 sources; 19,628 documents; 18,286 entities; 57,382 relationships; 46,907 evidence claims; 1,110 risk signals    |
| MCA company matching     | `data/processed/stats.json`                         | 766,814 master rows (Maharashtra); 6 matched by CIN, 2,949 by unique name                                         |
| Relationship graph       | `data/graph/summary.json`                           | 43,405 nodes; 47,116 edges; 3,349 networks; 972 identity candidates                                               |
| Synthetic data           | `data/synthetic/manifest.json`                      | 200 loans, 18,071 transactions, 24 months, 12 loan types (archetypes), seed 20261017                              |
| Risk scoring (v2)        | `npm run synth && npm run score`, `RISK_SCORING.md` | 105 alerts (28.5 per 1,000 loan-months); 0 controls or look-alikes alerted; 85 of 105 defaulters caught on time   |
| Risk scoring (v2 + B-59) | `RISK_SCORING.md`                                   | 105 of 105 defaulters on time, 0 false alarms, 30.4 per 1,000 loan-months                                         |
| Public-records scenarios | `e2e/scenarios/` (3 scenarios)                      | Expected alerts: Maheep 1 (Urgent review), Advantage Overseas 6, Jai Corp 1                                       |
| AI extraction quality    | `ingest/eval/` (`eval-ai`, B-52)                    | **Not measured**: the golden set (at least 30 hand-checked documents) has not been curated                        |
| Cost settings            | `functions/src/config/`, `COST_GUIDELINES.md`       | Model `gemini-3.1-flash-lite`; 256 MiB; `maxInstances` 2–5; daily AI limit 30 per person; burst 5/min (askGemini) |

**Not measured anywhere yet:** run times, memory, throughput, web load speed, function latency,
Gemini latency, tokens and cost per call. No code records timings today.

## 2. What the report will measure

| #   | Dimension                 | Metrics                                                                                                       | Where it runs                     |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A   | Detection quality         | Detection rate, false alarms, alerts per 1,000 loan-months, months from onset to alert, per-archetype results | Local, free                       |
| B   | Scenario correctness      | Pass/fail and alert counts for the 3 public-record scenarios                                                  | Local, free (Playwright)          |
| C   | Data pipeline quality     | Source coverage, rows per table, MCA match rate, duplicate (identity) candidates, documents needing OCR       | Local, free                       |
| D   | Batch speed and memory    | Wall time, peak memory (RSS), rows per second for `extract`, `resolve`, `graphCli`, `synth`, `score`          | Local, free                       |
| E   | Scalability               | Scoring run time and memory at 200, 2,000 and 20,000 synthetic loans                                          | Local, free                       |
| F   | In-browser check speed    | Public-records check per application; daily watch over the whole loan book                                    | Local, free (Playwright + Chrome) |
| G   | Web app performance       | Bundle sizes (gzip), Lighthouse performance / accessibility / best practices, desktop and 360px mobile        | Local, free                       |
| H   | Engineering quality       | Unit, emulator and e2e test counts and run times; lint / typecheck clean                                      | Local, free                       |
| I   | Function latency          | `health`, `getProfile`, `getRiskScores`, `publicData`: median and 95th percentile, cold vs warm               | **Live** (`fund-tracer`)          |
| J   | Gemini latency and cost   | `askGemini` end-to-end time, input/output tokens per call, cost per call                                      | **Live**, billed (under $1)       |
| K   | Monthly cost at demo load | Estimate from J plus Firebase/Cloud Run pricing and our `maxInstances` / memory settings                      | Calculation                       |

## 3. How each part is measured (offline, free)

### A. Detection quality

1. `npm run synth` (seed 20261017), then `npm run score` with settings **v1**, **v2**, and **v2 with
   `behaviour.prepayment_min_multiple` on** (B-59).
2. Read `data/synthetic/score_report.json` for each run and put the three side by side: per archetype
   (loans, alerted, alerted within 2 months, band agreement), totals, alert rate against the 3% budget.
3. Add a second seed (for example 20261018) to show the numbers are not tied to one random draw.

### B. Scenarios

`npm run e2e` (needs `node ingest/dist/graphCli.js --web` first). Record each scenario's result and
the time each spec takes.

### C. Pipeline quality

Read `stats.json`, `graph/summary.json`, `registry/sources.json`, and count `needs_ocr` pages in
`data/interim/text/` where present. No source data is changed (owner rule).

### D. Batch speed and memory

New script `npm run bench` (section 5) runs each step 3 times and records the median wall time,
peak RSS (`process.resourceUsage().maxRSS`) and rows per second. Machine details (CPU, cores, RAM,
Node version) are written next to the numbers so they can be compared later.

### E. Scalability

`synth` with 200, 2,000 and 20,000 loans (new `--loans` option if the CLI lacks one), then time
`score` on each. Plot run time and memory against loan count; state whether growth is linear.

### F. In-browser checks

Playwright spec `e2e/tests/bench.spec.ts`: sign in with quick sign-in, run **Run checks** on the
Maheep scenario 10 times and time the public-records check; trigger the daily watch over the demo
loan book and time it. Uses `performance.now()` marks read back from the page; no app logic changes.

### G. Web app

- `npm run build -w web`, then list each chunk's raw and gzip size (Vite output).
- Lighthouse (dev dependency, pinned) against `vite preview`, through the preinstalled Chromium
  (`/opt/pw-browsers/chromium`), for the dashboard, an application page and `/graph-lab`, at desktop
  and at 360px mobile. Record performance, accessibility, best practices, LCP, TBT and CLS.

### H. Engineering quality

Run `npm run check`, `npm run test:emulators` and `npm run e2e`; record counts and durations.

## 4. Live measurements (`fund-tracer` project)

### 4.1 Function latency (I)

`scripts/bench-live.sh` calls each function from outside Google Cloud:

- **Cold start:** first call after at least 20 minutes idle, 3 times per function.
- **Warm:** 30 calls per function, one at a time, 1 second apart (stays under the burst limits:
  20/min for `getProfile` and `getRiskScores`).
- Records client-side round-trip time; the median and 95th percentile go in the report.

### 4.2 Gemini (J)

- About 50 `askGemini` calls in three prompt sizes (short, medium, near `maxPromptChars`), on
  `gemini-3.1-flash-lite` via Vertex AI.
- Record round-trip time, and input/output token counts from the function's structured log
  (`usageMetadata`; never the prompt or the reply).
- Cost per call = tokens × the current Vertex AI price for the model (price and date written in the
  report). The total must stay under $1.
- Prompts are fixed **TEST** text with no personal data.

### 4.3 What the live run needs (blockers to clear first)

| Need                  | Why                                                                                        | Who                              |
| --------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| Google credentials    | This cloud container has none; the run needs a signed-in test user and project access      | Owner (or run it in Cloud Shell) |
| A test user           | Callables check `request.auth`; use a dedicated **TEST** account with a usable profile     | Owner                            |
| App Check debug token | Every callable has `enforceAppCheck: true`; register a debug token in the Firebase console | Owner                            |
| Daily AI limit        | `GEMINI_DAILY_LIMIT` is 30 per person; 50 calls need 2 test accounts or a run over 2 days  | **Owner decides** (see B-15)     |
| Deployed `main`       | Latency must be measured on the code that is in the report                                 | Owner (Deploy workflow)          |

The daily limit stays as it is. We do not raise it for the benchmark unless the owner says so.

## 5. Code changes needed

All of them are additive. None changes app behaviour, source data or the published settings.

| #   | Change                                                                                                                     | Files                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Benchmark runner: times pipeline steps, records machine info, writes `data/benchmarks/report.json` (run times git-ignored) | `ingest/src/bench/`, `npm run bench`          |
| 2   | `--loans N` (and `--seed`) for the synthetic generator, if missing, for the scaling test                                   | `ingest/src/synthCli.ts`, `ingest/src/synth/` |
| 3   | In-browser timing spec for the public-records check and the daily watch                                                    | `e2e/tests/bench.spec.ts`                     |
| 4   | Lighthouse runner (pinned dev dependency, justified: dev-only, not in the bundle, not in `audit:prod`)                     | `e2e/` or `scripts/bench-lighthouse.ts`       |
| 5   | Live latency and Gemini script (reads a token from the environment; never committed)                                       | `scripts/bench-live.sh`                       |
| 6   | Log token counts in `askGemini`, if not already logged (structured fields only, no prompt text)                            | `functions/src/services/gemini.ts`            |
| 7   | The report itself                                                                                                          | `docs/PERFORMANCE_REPORT.md`                  |

Each change keeps `npm run check && npm run build` passing, with unit tests for the runner's
summary maths (median, p95, rows per second). The benchmark is **not** added to CI: CI never
calls a billed API, and run times on shared runners are too noisy to gate on.

## 6. Report outline (`docs/PERFORMANCE_REPORT.md`)

1. Summary: five headline numbers (detection rate, false alarms, scoring throughput, p95 function
   latency, cost per AI call)
2. Test setup: machine, Node version, data versions (checksums from the manifests), commit
3. Detection quality (A, B), with the B-55 caveat in bold
4. Data pipeline coverage and quality (C)
5. Speed, memory and scalability (D, E, F)
6. Web app performance and accessibility (G)
7. Cloud latency and AI performance (I, J)
8. Cost (K) and the cost controls in place
9. Engineering quality (H)
10. Limits of this prototype and next steps (golden set for B-52, other states' MCA data, real
    transaction data)

## 7. Boundary conditions

| ID   | Condition                                     | How the plan handles it                                                                                                   |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| B-15 | Billed model calls and budget                 | Live calls only through `bench-live.sh`, started by hand; mock everywhere else; owner approved under $1; daily limit kept |
| B-55 | Synthetic labels come from the same generator | The report says detection numbers check the scoring logic, not real-world accuracy                                        |
| B-52 | AI extraction quality gate                    | Reported as "not measured" until the owner curates the golden set; no AI claims enter the graph                           |
| B-54 | Synthetic data only for scoring               | Scaling runs use synthetic loans; outputs are labelled **SYNTH**                                                          |

## 8. Order of work

| Step | Work                                                              | Needs from the owner              | Status |
| ---- | ----------------------------------------------------------------- | --------------------------------- | ------ |
| 1    | `npm ci`, build, `graphCli --web`; baseline `check`, `e2e`        |                                   | [ ]    |
| 2    | Changes 1 and 2 (runner, `--loans`); measure A, C, D, E           |                                   | [ ]    |
| 3    | Changes 3 and 4 (browser timing, Lighthouse); measure B, F, G, H  |                                   | [ ]    |
| 4    | Change 5 and 6 (live script, token logging); deploy via `main`    | Credentials, test user, App Check | [ ]    |
| 5    | Live run: I and J                                                 | Decision on the daily AI limit    | [ ]    |
| 6    | Write `docs/PERFORMANCE_REPORT.md` (and an HTML version if asked) |                                   | [ ]    |

Steps 1–3 need nothing from the owner and can start at once. Ask before each commit.
