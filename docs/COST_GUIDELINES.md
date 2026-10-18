# Cost guidelines

This project is built to be cheap to run. Every new service, setting or model choice must be
checked against this page, and this page updated when it changes.

## 1. Tests and local work never call a billed API

- `GEMINI_PROVIDER` is `mock | apikey | vertex`. Only `apikey` and `vertex` cost money.
- It defaults to **`mock`** under Vitest, in CI, and in the Firebase emulator (`config/env.ts`).
  It defaults to `vertex` only for a deployed function (owner, 18 Oct 2026); `apikey` must be set
  explicitly.
- `mock` returns a fixed reply, never creates a client and never touches the network, even when a
  real key is present on the machine. Unit tests prove this (`gemini.test.ts`, `env.test.ts`).
- To test against the real model on purpose, run `npm run serve:live -w functions`, keep the prompt
  tiny, and do it rarely. Never put the real provider in CI.
- Any new paid integration (another model, OCR, a data API) follows the same pattern: one service
  module, a mock mode that is the default for tests, an explicit switch for live use.

## 2. Model choice

Pick the **cheapest model that passes our own quality check** on mock documents, per task. Do not
default to the newest or largest model. Prices are USD per 1M tokens (paid tier), from
<https://ai.google.dev/gemini-api/docs/pricing> on 2026-10-16. Check the page before relying on them.

| Model                     | Input       | Output      | Notes                                                               |
| ------------------------- | ----------- | ----------- | ------------------------------------------------------------------- |
| `gemini-3.1-flash-lite`   | 0.25        | 1.50        | **Default.** Verified working with a new API key.                   |
| `gemini-3.5-flash-lite`   | 0.30        | 2.50        | Costs more than 3.1 Flash-Lite.                                     |
| `gemini-3.8-flash`        | 0.75        | 3.75        | Doubles to 1.50 / 7.50 on 2027-01-01. Use only if Lite fails a task |
| `gemini-2.5-flash(-lite)` | 0.30 / 0.10 | 2.50 / 0.40 | Cheaper on paper, but the API rejects them for new keys (404).      |

Rules:

- `GEMINI_MODEL` is configuration, not code. A heavier model for one hard task (e.g. handwritten
  Marathi extraction) is set for that task only, after the cheap model has been tried and measured.
- Re-check prices and availability before each release; models are retired and prices change.
- Keep `maxOutputTokens` and prompt size capped (`GEMINI_LIMITS`). Output tokens cost 6x input.
- Free-tier API keys are for **mock or synthetic data only**: Google may use free-tier inputs to
  improve its products. Real customer documents need the paid tier or Vertex AI.

## 3. Configuration checklist for every function and service

- [ ] `maxInstances` set (currently 5 for `askGemini`) so a bug or abuse cannot scale cost.
- [ ] `memory` set to the smallest that works (256MiB); `minInstances` stays 0 (no idle cost).
- [ ] Region `asia-south1`, same as Firestore, to avoid cross-region transfer.
- [ ] `timeoutSeconds` as low as the task allows; external calls have their own timeout.
- [ ] Firestore: always paginate, never scan a collection, add indexes only for real queries.
- [ ] BigQuery (later): partition and cluster tables, never `SELECT *`, set a maximum bytes billed
      per query, load data with batch jobs (free) rather than streaming inserts.
- [ ] No always-on or per-hour-billed resource (dedicated clusters, graph databases, min instances)
      without the owner's written approval and a monthly figure in this file.
- [ ] Old function build images are cleaned up (cleanup policy is set on the Artifact Registry repo).
- [ ] A budget alert covers the project, and it is reviewed when a new paid service is added.

## 4. Before adding a service

Write down, in the PR: what it costs per call or per month at expected volume, which free quota it
uses, and what stops it from growing without bound (quota, cap, or budget).

## 5. Cloud ingestion pipeline (monthly estimate)

Estimated at today's volume (six sources, a few hundred new documents a day at most); confirm
with the first month's bill and update this table.

| Item                                                                  | What stops it growing                                                          | Estimate                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Cloud Run jobs (~40 min acquire across 6 tasks, ~5 min build per day) | Jobs scale to zero; CPU/memory/timeout capped; `maxRetries` 1 / 0              | free tier to ~US$3             |
| Workflows + Scheduler (~10 steps, 1 trigger per day)                  | One schedule                                                                   | free tier                      |
| Cloud Storage (~1–3 GB, raw kept forever)                             | Create-only raw, state versions expire after 90 days, 14 published versions    | < US$0.20                      |
| BigQuery (~100 MB, batch loads, small queries)                        | Load jobs are free; history tables partitioned by `run_date`                   | < US$0.50                      |
| Firestore (a few hundred reads/writes per day)                        | One document per run, one lease per source                                     | free tier                      |
| Artifact Registry                                                     | Cleanup policy keeps 10 images                                                 | < US$0.20                      |
| Gemini, agent review                                                  | Model called only on days that need attention; ≤ 8 tool calls, 60k input chars | < US$0.10                      |
| Gemini, AI extraction (off by default)                                | ≤ 50 documents/run, ≤ 10 pages / 30k chars each, cached per prompt version     | ~US$5 (backfill ~US$5–10 once) |

Rules: documents per source per run are capped (`FUNDTRACE_MAX_DOCS_PER_SOURCE`, 300 in the cloud)
so a backlog is fetched over several days; the build is skipped when no source changed; every
BigQuery job has a deterministic id, so a retried run never loads (or bills) twice.

## 6. Known gaps

- Billed AI is limited to people whose profile (`users/{Firebase user ID}`) has `aiEnabled: true`, so
  self-registered strangers cannot spend (see `docs/DEPLOY.md`, step D). Each billed call costs one
  Firestore read for that check, and each login one for `getProfile`; both are far inside the free quota.
- **Burst limits** (`functions/src/config/limits.ts`): each signed-in person may call `askGemini` 5 times a
  minute and `getProfile` 20 times a minute. They are checked first, in memory (free), before any database or
  model work, so a runaway loop or a stolen session cannot become a flood of Firestore or Gemini calls. They
  are per function instance (at most 5), so the real ceiling can be a few times higher. They do **not** cover
  strangers: requests without sign-in or App Check are turned away by the platform before our code runs, and
  can only be bounded by `maxInstances`, the free quota and the budget alert. Real protection against that
  would be Cloud Armor in front of a load balancer, which has a fixed monthly cost and is not worth it yet.
- `askGemini` has a per-user daily limit (`GEMINI_DAILY_LIMIT`, default 30 calls per Indian day,
  counted in the `usage` collection) that applies only to billed providers. The Firestore counter is
  unit-tested with an in-memory store but has not yet been run against a Firestore emulator.
- The count is not refunded when the model call fails, so a flaky upstream can use up a user's day.
- The budget alert only emails; it does not stop spending. For that there is a one-click soft stop and a
  hard-stop command: see `docs/EMERGENCY_STOP.md`. Rehearse it now and then.
