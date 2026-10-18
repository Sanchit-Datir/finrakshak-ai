# Prototype performance report and benchmarking: plan

_Updated 18 Oct 2026 after merging `main` (up to `26fe2af`) into `claude/intelligent-faraday-xbjw3e`.
Status: **planned, not started**._

This plan explains how we produce the **Prototype Performance Report** for FundTrace: what we measure,
how, which code changes it needs, and how anyone can re-run the benchmark from a fresh clone. The
report goes to `docs/PERFORMANCE_REPORT.md`; raw results go to `bench/results/`.

## Owner's decisions (18 Oct 2026)

| Question                        | Answer                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Required template or headings?  | None. Use the report outline in section 8                                    |
| Live Gemini calls allowed?      | **Yes**: about 50–100 calls on `gemini-3.1-flash-lite` (well under US$1)     |
| Live run against `fund-tracer`? | **Yes**: Claude runs the live benchmark once credentials exist (section 6.3) |
| Benchmark script                | **Required**, with run steps in the README so anyone can reproduce it        |
| Branch                          | `claude/intelligent-faraday-xbjw3e`. Ask before every commit; no PR          |

## 1. What changed in `main` since the first version of this plan

| Change                                                                                              | What it adds to the benchmark                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **AI analysis of an application** (`analyseApplication`, B-64)                                      | Latency, tokens, cost per call; facts/findings returned                |
| **AI investigator** (`investigateApplication`, B-67): tool loop, ≤ 10 turns, ≤ 8 reads, verifier    | Turns and tool calls per run, verified vs rejected claims, run time    |
| **FinRakshak Copilot** (`assistRecord`, B-66): grounding check on every answer                      | Latency, grounded vs rejected statements                               |
| Gemini now on **Vertex AI** for the app (ADC, `roles/aiplatform.user`)                              | Live run needs that role granted (owner step)                          |
| **Billed gate** (`billed-gate.ts`): AI allow-list (`aiEnabled` on the profile), then daily limit    | Measure the gate's overhead and that it refuses correctly              |
| **Burst rate limits** per person per instance (`config/limits.ts`)                                  | Throttling test: refusals, `retryAfterSeconds`, effective limit        |
| Attention score (code-computed) and new Risk scores views (filters, CSV, score over time)           | In-browser timing of the score and the Risk scores page                |
| Code split into modules; ESLint now covers `web/src/lib`; **1,579 unit tests**                      | Engineering-quality figures refreshed                                  |
| Second Hosting site **`finrakshak-ai`**                                                             | Web performance measured on the deployed site as well as locally       |
| README section 13 "Prototype performance and benchmarks" (quality gate, detection, dataset)         | Gets real measured numbers and a "How to run the benchmark" subsection |
| `web` uses `@playwright/test` 1.64 (no matching Chromium in the cloud container); `e2e` uses 1.56.1 | Browser benchmarks run from the `e2e` workspace                        |

## 2. What we benchmark: services, APIs and agents

### 2.1 Callable and HTTP functions (`functions/src`, region `asia-south1`)

| Function                 | Uses Gemini | Burst limit / min | Daily AI limit       | `maxInstances` | Memory | Timeout | Key input caps                                                  |
| ------------------------ | ----------- | ----------------- | -------------------- | -------------- | ------ | ------- | --------------------------------------------------------------- |
| `health`                 | no          | –                 | –                    | 5              | 256MiB | default | –                                                               |
| `getProfile`             | no          | 20                | –                    | 5              | 256MiB | 30 s    | –                                                               |
| `getRiskScores`          | no          | 20                | –                    | 2              | 256MiB | 30 s    | –                                                               |
| `publicData` (HTTP)      | no          | –                 | –                    | 3              | 256MiB | 60 s    | pointer cache (`publishedData.ts`)                              |
| `askGemini`              | yes         | 5                 | 30 per person (IST)  | 5              | 256MiB | 60 s    | prompt ≤ 8,000 chars, ≤ 1,024 output tokens, 30 s model timeout |
| `analyseApplication`     | yes         | 3                 | shared, 1 per call   | 5              | 256MiB | 90 s    | prompt ≤ 24,000 chars, ≤ 12 documents, ≤ 25 findings            |
| `assistRecord` (Copilot) | yes         | 6                 | shared, 1 per call   | 5              | 256MiB | 90 s    | prompt ≤ 24,000 chars, ≤ 8 statements                           |
| `investigateApplication` | yes         | 2                 | **1 per model turn** | 5              | 256MiB | 120 s   | bundle ≤ 40,000 chars, ≤ 10 turns, ≤ 8 reads, 100 s deadline    |
| `decideProposal`         | no          | –                 | –                    | 2              | 256MiB | 30 s    | owner-only                                                      |
| `decidePattern`          | no          | –                 | –                    | 2              | 256MiB | 30 s    | owner-only                                                      |

All callables require sign-in and App Check. The emulator accepts an unsigned placeholder App Check
token (`web/src/lib/cloud/firebase.ts`), which makes a free local API benchmark possible.

### 2.2 Throttling and spending controls

| Control             | Where                      | Behaviour to verify                                                                                                                    |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Burst rate limit    | `services/rate-limit.ts`   | Fixed 60 s window per person **per instance**; refusal is `resource-exhausted` with `retryAfterSeconds`; refused calls are not counted |
| AI allow-list       | `services/billed-gate.ts`  | Account without `aiEnabled` gets `permission-denied` and creates no usage record                                                       |
| Daily AI limit      | `services/usage-limit.ts`  | Firestore transaction per (person, IST day); never crossed, even with parallel calls; not refunded on model failure                    |
| Investigator budget | `services/investigation/`  | Stops at the daily limit mid-run and keeps verified findings ("Stopped at your daily AI limit")                                        |
| Input size caps     | each callable's zod schema | Oversized input refused **before** any use is counted                                                                                  |
| `maxInstances`      | each function              | Calls past the instance cap queue or fail (`429`/`unavailable`) instead of scaling cost                                                |
| Budget alerts       | GCP billing                | ₹450/month (project), ₹200/month (AI services); out of scope to trigger                                                                |

### 2.3 Agents (`ingest/`, Cloud Run jobs, off by default)

| Agent                                  | Loop limits                                       | Already recorded                                          |
| -------------------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Ingestion agent (`ingest/src/agent/`)  | Shared `runToolLoop`, tool-call and input budgets | `agentRuns` record: counts, versions, input/output tokens |
| Pattern miner (`ingest/src/miner/`)    | Same loop; `npm run miner -- propose` prints only | Same; 0 candidates on real timelines so far               |
| Risk explainer (`ingest/src/explain/`) | Same loop; number check on every sentence         | Same; sentences rejected by the number check counted      |

The app's AI features run inside callables (2.1); the agents above run as jobs. Both get benchmarked
on the **mock** provider for free, and the app features also live (section 6).

## 3. Baseline figures we already have

| Area                   | Source                                           | Figures                                                                                                            |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Public-data pipeline   | `data/processed/stats.json`                      | 19,628 documents; 18,286 entities; 57,382 relationships; 46,907 evidence claims; 1,110 risk signals; rebuild ~30 s |
| MCA matching           | `data/processed/stats.json`                      | 766,814 rows (Maharashtra); 6 by CIN, 2,949 by unique name                                                         |
| Relationship graph     | `data/graph/summary.json`                        | 43,405 nodes; 47,116 edges; 3,349 networks; 972 identity candidates                                                |
| Risk scoring v2        | `npm run synth && npm run score`                 | 28.5 alerts / 1,000 loan-months; 0 of 85 controls alerted; 85 of 105 defaulters caught                             |
| v2 + prepayment (B-59) | `docs/RISK_SCORING.md`                           | 105 of 105 caught, 0 false alarms, 30.4 / 1,000 loan-months                                                        |
| Engineering            | README section 13                                | 1,579 unit tests in 169 files; 0 known production vulnerabilities                                                  |
| Cost per AI call       | README section 12 (upper bounds from input caps) | Copilot ≈ US$0.002; analysis ≈ US$0.003; investigator ≤ US$0.04                                                    |
| AI extraction quality  | `ingest/eval/` (B-52)                            | **Not measured**: golden set not curated                                                                           |

**Not measured anywhere yet:** run times, memory, throughput, web load speed, function latency, cold
starts, throttling behaviour, Gemini latency and real tokens per call (the cost figures are estimates).

## 4. Metrics

| #   | Dimension                    | Metrics                                                                                                                                                                                            | Tier                    |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| A   | Detection quality            | Detection rate, false alarms, alerts per 1,000 loan-months, months from onset to alert, per archetype; 2 seeds                                                                                     | 1                       |
| B   | Scenario correctness         | Pass/fail and alert counts for the 3 public-record scenarios                                                                                                                                       | 1                       |
| C   | Data pipeline quality        | Coverage, rows per table, MCA match rate, identity candidates, pages needing OCR                                                                                                                   | 1                       |
| D   | Batch speed and memory       | Wall time, peak RSS, rows/s: `build`, `graphCli`, `synth`, `score`                                                                                                                                 | 1                       |
| E   | Scalability                  | `synth --customers` 200 / 2,000 / 20,000 then `score`: time and memory vs size                                                                                                                     | 1                       |
| F   | In-browser logic             | Run checks (rules + public-records check), attention score, daily watch over the loan book, Risk scores page                                                                                       | 1                       |
| G   | Web performance              | Bundle sizes (raw, gzip) per chunk; Lighthouse performance / accessibility / best practices, LCP, TBT, CLS at desktop and 360 px                                                                   | 1 (local), 3 (deployed) |
| H   | Engineering quality          | Unit, emulator and e2e counts and durations; lint and typecheck clean                                                                                                                              | 1                       |
| I   | API latency (mock)           | p50 / p95 / max per callable on the emulator with the mock model: framework, auth, zod, gate and Firestore overhead                                                                                | 2                       |
| J   | Throttling and limits        | Burst refusals and `retryAfterSeconds`; daily limit under 10 parallel calls (never crossed); allow-list refusal; oversized input refused without a use counted; investigator stopping at the limit | 2                       |
| K   | Agent loop efficiency (mock) | Investigator turns, tool calls, verified vs rejected claims; Copilot grounded vs rejected statements; ingest agents' tool calls per run                                                            | 2                       |
| L   | API latency (live)           | p50 / p95 per function, cold vs warm, from outside Google Cloud                                                                                                                                    | 3                       |
| M   | Gemini performance (live)    | Model latency, input/output tokens, cost per call for `askGemini`, `analyseApplication`, `assistRecord`, `investigateApplication`; verifier rejection rate on real model output                    | 3                       |
| N   | Monthly cost                 | From M plus Firebase/Cloud Run pricing and our caps; compare with the README section 12 estimates                                                                                                  | calc                    |

**Tiers:** 1 = offline, free, no credentials. 2 = local Firebase emulators with the mock model, free,
no credentials. 3 = live `fund-tracer` project, needs credentials, costs under US$1.

## 5. How each tier is measured

### Tier 1: offline

- **A:** `synth` (seed 20261017 and 20261018), then `score --settings v1`, `v2`, and v2 with the
  prepayment rule. Read each `score_report.json`.
- **B, F:** Playwright spec `e2e/tests/bench.spec.ts` (e2e workspace, Chromium 1194 preinstalled):
  quick sign-in, run the 3 scenarios, time **Run checks** 10× on the Maheep application, time the daily
  watch and the Risk scores page. Timings come from `performance.now()` marks read back from the page; no
  app logic changes.
- **C:** read `stats.json`, `graph/summary.json`, `registry/sources.json`. Never change source data.
- **D, E:** each step runs 3 times; record the median, peak RSS and rows/s. Scaling uses
  `synth --customers N --out bench/tmp/synth-N` then `score --in bench/tmp/synth-N` (both options already
  exist, so no CLI change is needed). Machine info (CPU, cores, RAM, OS, Node) and the commit are saved
  with the results.
- **G:** `vite build` chunk sizes; Lighthouse (pinned dev dependency) against `vite preview` for the
  Command center, an application, Risk scores and Relationship graph pages.
- **H:** `npm run check`, `npm run test:emulators`, `npm run e2e`; counts and durations.

### Tier 2: local API on the emulators (mock model)

`firebase emulators:exec --only auth,functions,firestore --project demo-fund-tracer` runs the API
benchmark, which:

1. creates 3 TEST users in the Auth emulator and their profiles in the Firestore emulator (one with
   `aiEnabled: true`, one without, one with the daily limit almost used);
2. calls each callable with a placeholder App Check token, sequentially (latency, I) and in bursts
   (throttling, J), using fixture inputs from the functions' test fixtures (e.g.
   `investigation/bundle.fixture.ts`);
3. checks every refusal's error code and `reason` (`rate_limit`, `daily_limit`), reads the usage
   document back to prove the limit was not crossed, and records the investigator and Copilot counts (K).

The ingestion agent, miner and explainer run once each on the mock (`ingest` CLI) with their
`agentRuns` counts collected (K).

### Tier 3: live (`fund-tracer`)

- **L:** 3 cold calls per function (after ≥ 20 minutes idle) and 30 warm calls, 1 s apart, staying under
  every burst limit.
- **M:** fixed **TEST** inputs with no personal data: ~20 `askGemini` (3 prompt sizes), ~10
  `analyseApplication`, ~15 `assistRecord`, ~5 `investigateApplication` (each up to 10 model calls).
  About 50 calls for the first three plus up to 50 model calls for the investigator: under US$1 at the
  prices in README section 12. Token counts and model time come from the functions' structured logs
  (section 7, change 2), read with `gcloud logging read`.
- **G (deployed):** Lighthouse against the `fund-tracer` and `finrakshak-ai` Hosting sites.

## 6. Code changes needed

### 6.1 API-level changes (functions)

| #   | Change                                                                                                                           | Why                                                                 | Files                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Return the model's `usageMetadata` (input/output tokens) and model time from the Gemini services                                 | Functions do not record tokens today (the ingest agents already do) | `services/gemini.ts`, `services/gemini-tools.ts`, `services/tool-model.ts`                       |
| 2   | Add `durationMs`, `modelMs`, `inputTokens`, `outputTokens` to each AI callable's existing `logger.info` line (counts only, B-16) | Real latency and cost per call without changing the response shape  | `callable/askGemini.ts`, `analyseApplication.ts`, `assistRecord.ts`, `investigateApplication.ts` |
| 3   | Add `durationMs` to the non-AI callables' log lines                                                                              | Server-side latency for `getProfile`, `getRiskScores`, `publicData` | same folder, `http/publicData.ts`                                                                |

No response schema changes and no change to any limit: the client-side benchmark measures round-trip
time, and the server logs give the split. Each change gets a unit test, and the mock stays the default.

**Findings to report, not change now (owner decides):**

- The burst limiter is **per instance**, so the effective limit can reach `maxInstances` × limit (for
  example 5 × 2 = 10 investigator runs a minute). The daily limit is global and is the real cap. The
  benchmark measures this; a global limiter (Firestore) would add a read per call.
- The daily use is **not refunded** when the model call fails (by design, B-15). The live run records
  how often that happens.
- `health` has no explicit `timeoutSeconds` (default 60 s). Harmless; noted for consistency.

### 6.2 The benchmark script

A new workspace **`bench/`** (TypeScript, same lint and typecheck rules, results git-ignored):

```
bench/
├── package.json
├── README.md                 how to run, what each number means
├── src/
│   ├── offline.ts            tier 1: pipeline, scoring, scaling, bundle sizes
│   ├── api.ts                tier 2: emulator API latency, throttling and limits
│   ├── live.ts               tier 3: live latency and Gemini (refuses to run without BENCH_LIVE=1)
│   ├── lighthouse.ts         web performance (local preview or a URL)
│   ├── stats.ts              median, p95, rows/s (unit tested)
│   ├── machine.ts            CPU, RAM, OS, Node, commit
│   └── report.ts             results JSON → Markdown tables
└── results/                  <date>-<tier>.json (git-ignored)
```

Plus `e2e/tests/bench.spec.ts` for the in-browser timings (B, F).

Root `package.json` scripts:

| Script                 | What it runs                                                                   | Needs                       |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| `npm run bench`        | Tier 1 + in-browser timings + Lighthouse on the local build; writes the report | Nothing (Node 22, Chromium) |
| `npm run bench:api`    | Tier 2 inside `firebase emulators:exec` with the mock model                    | Java (for the emulators)    |
| `npm run bench:live`   | Tier 3 against a deployed project                                              | Credentials, `BENCH_LIVE=1` |
| `npm run bench:report` | Rebuild `docs/PERFORMANCE_REPORT.md` from the latest results                   | Results from a run          |

Rules: no billed call unless `BENCH_LIVE=1` and the project id are set; tokens come from the
environment and are never written to disk; results hold counts and timings only. The benchmark is
**not** added to CI (CI never calls a billed API, and timings on shared runners are too noisy to gate
on), but `bench/src/stats.ts` tests run in `npm run check`.

### 6.3 What the live run needs

**Accounts (owner, 18 Oct 2026).** The live run signs in with an email and password (Firebase Auth),
read from the environment as `BENCH_EMAIL` and `BENCH_PASSWORD`. The password is never written to the
repository, to results or to logs. Profiles in Firestore:

| Account             | Role             | Branch      | `aiEnabled` | Password given |
| ------------------- | ---------------- | ----------- | ----------- | -------------- |
| `manager@gmail.com` | `branch_manager` | `br-shirur` | true        | yes            |
| (owner's account)   | `administrator`  | `br-shirur` | true        | no             |

| Need                                                     | Status / why                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles/aiplatform.user` on the functions runtime account | Vertex AI calls fail without it (open item in `SESSION_NOTES.md`)                                                                                                                                                                                                                               |
| A user with a profile and `aiEnabled: true`              | **Done**: `manager@gmail.com` (above)                                                                                                                                                                                                                                                           |
| App Check token                                          | Every callable enforces App Check. Either register a **debug token** in the Firebase console (`BENCH_APPCHECK_DEBUG_TOKEN`), or run the live benchmark through the deployed site in headless Chromium so reCAPTCHA Enterprise issues the token (low bot scores may refuse it)                   |
| Reaching the live project from Claude's session          | **Checked 18 Oct 2026:** sign-in with `manager@gmail.com` works; `getProfile` then returns `401 Unauthenticated` because no App Check token was sent. So the App Check row above is the only blocker                                                                                            |
| Daily limit plan                                         | 30 AI calls per person per IST day, and one investigator run can use 10. With one account: **about 30 model calls a day**, so the live AI part runs over 3–4 days, or the owner adds TEST accounts. Using `manager@gmail.com` uses that person's AI calls for the day. **Owner decides** (B-15) |
| `main` deployed with the log changes (6.1)               | Token counts and server timings come from those log lines                                                                                                                                                                                                                                       |

## 7. Run steps (these go into `bench/README.md` and README section 13)

```bash
npm ci
npm run build
node ingest/dist/graphCli.js --web     # public-records bundle for the app
npm run bench                          # offline benchmark, free, ~10 minutes
npm run bench:api                      # API, throttling and limits on the emulators (mock model), free
# optional, costs money (under US$1), needs a deployed project and credentials:
BENCH_LIVE=1 BENCH_PROJECT=<project-id> BENCH_EMAIL=... BENCH_PASSWORD=... \
  BENCH_APPCHECK_DEBUG_TOKEN=... npm run bench:live
npm run bench:report                   # writes docs/PERFORMANCE_REPORT.md
```

## 8. Report outline (`docs/PERFORMANCE_REPORT.md`)

1. Summary: headline numbers (detection, false alarms, scoring throughput, p95 API latency, cost per AI call)
2. Test setup: machine, Node, data checksums, commit, date
3. Detection quality (A, B), with the B-55 caveat in bold
4. Data pipeline coverage and quality (C)
5. Speed, memory and scalability (D, E, F)
6. Web performance and accessibility (G)
7. APIs: latency, throttling and spending controls (I, J, L)
8. Gen AI: model latency, tokens, cost, grounding and verifier results, agent loop efficiency (K, M)
9. Cost (N) against the README section 12 estimates
10. Engineering quality (H)
11. Limits of the prototype and next steps (golden set for B-52, national MCA data, real transactions,
    global rate limiter)
12. How to reproduce (section 7)

## 9. Boundary conditions

| ID               | Condition                                             | How the plan handles it                                                                                        |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| B-15             | Billed model calls and budget                         | Mock in tiers 1–2; live only with `BENCH_LIVE=1`; under US$1 approved; daily limit kept and tested, not raised |
| B-16             | No PII or model text in logs                          | New log fields are counts and timings only; TEST inputs carry no personal data                                 |
| B-10, B-11, B-14 | Model limits (input size, cut-off replies, deadlines) | Tier 2 sends oversized inputs and checks refusals; tier 3 records `MAX_TOKENS` and deadline failures           |
| B-52             | AI extraction quality gate                            | Reported as "not measured" until the golden set exists                                                         |
| B-54, B-55       | Synthetic data; labels from the same generator        | Detection figures labelled **SYNTH**; the report says they check the logic, not real-world accuracy            |
| B-64, B-66, B-67 | Analysis, Copilot, investigator                       | Benchmarked through their callables with their existing limits; nothing about them changes                     |

**New boundary condition to add when the work starts:** the per-instance burst limit allows up to
`maxInstances` × limit calls a minute across instances (section 6.1). It goes into
`docs/BOUNDARY_CONDITIONS.md` in the commit that adds the throttling test.

## 10. Order of work

| Step | Work                                                                                    | Needs from the owner                                       | Status |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ |
| 1    | `npm ci`, build, `graphCli --web`; baseline `check`, `test:emulators`, `e2e`            |                                                            | [ ]    |
| 2    | `bench/` workspace skeleton, `stats.ts` + tests, `offline.ts` (A, C, D, E)              |                                                            | [ ]    |
| 3    | `bench.spec.ts` and `lighthouse.ts` (B, F, G, H)                                        |                                                            | [ ]    |
| 4    | API changes 1–3 with tests; `api.ts` (I, J, K) on the emulators; new boundary condition |                                                            | [ ]    |
| 5    | `report.ts`, `bench/README.md`, README section 13 numbers                               |                                                            | [ ]    |
| 6    | Deploy `main` with steps 4–5; `live.ts` dry run against the emulators                   | Role grant, deploy                                         | [ ]    |
| 7    | Live run (L, M, deployed G)                                                             | Credentials, TEST users, App Check token, daily-limit plan | [ ]    |
| 8    | Final `docs/PERFORMANCE_REPORT.md`; update `SESSION_NOTES.md`                           |                                                            | [ ]    |

Steps 1–5 need nothing from the owner. Each step ends with `npm run check && npm run build`. Ask before
each commit.
