# Plan: Daily delta ingestion to GCP

## Context

Today the pipeline (`ingest/`) runs by hand: `acquire` → `extract` → `build` → `graphCli --web`, with all data on local disk
(`data/raw` ~810 MB, `interim` ~76 MB, `processed` ~75 MB, graph bundle ~5 MB gz). The UI loads a static bundle from
`/graph-lab/` (gitignored, must be published on every machine). Goal: every day detect what changed at each source,
fetch only that, store it in GCP, rebuild, and publish so the UI always reads the latest verified dataset.

Key facts from the codebase that shape the design:

- Raw store is already content-addressed (sha256) with an append-only `manifest.jsonl`; IDs are deterministic (`stableId`); extract is idempotent per checksum. These are good delta foundations.
- Missing: diff of today's listing vs yesterday's, per-source watermark, run log, lock, scheduler, Dockerfile, deploy workflow.
- `build` is a full, global rebuild (entity resolution depends on the whole corpus, ~30 s; graph ~10 s). So **delta applies to fetching/extracting; build/graph stay full recomputes** (cheap, and correct).
- Sources: ED (one JSON call, int IDs), IBBI (~15k rows relisted every run), RBI (per-year POST), NFRA/SFIO (S3waaS HTML), SEBI (sample capped at 10; full ~24.5k), MCA master (manual, robots forbids crawling).

## Target architecture (GCP, one region, recommend asia-south1 — B-34)

| Concern                                                    | Service                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schedule                                                   | Cloud Scheduler (03:00 IST daily, retries) → Cloud Run **Job**                                                                                                                                             |
| Compute                                                    | Cloud Run Job (container of `ingest/`), 1 task, up to 60 min; split per-source tasks if needed (B-30)                                                                                                      |
| Raw documents (PDF/HTML, content-addressed)                | Cloud Storage **private** bucket `…-raw` (ED/SFIO must not be public, B-35); versioning on, lifecycle to Nearline after 90d                                                                                |
| Run state: manifests, listings snapshots, text, watermarks | Cloud Storage `…-state` bucket (same layout as `data/interim`) + Firestore `ingestRuns/{runId}` for status/summary                                                                                         |
| Processed tables (11)                                      | **BigQuery** dataset `fundtrace` (existing `bq load` + zod-generated schemas); `--replace` per table only after a build passes validation                                                                  |
| UI serving                                                 | Versioned graph bundle in a **publish** bucket → deployed under Firebase Hosting (no CSP change, B-44); `index.json` points at the latest `graph-lab.<builtAt>.json.gz`; keep last N versions for rollback |
| Secrets                                                    | Secret Manager (data.gov.in key, alert webhook) — B-31                                                                                                                                                     |
| Alerts                                                     | Cloud Monitoring alert on job failure/ no success in 26 h → email; Budget alert (B-15)                                                                                                                     |
| Identity                                                   | Dedicated service account: Storage objectAdmin on 3 buckets, BigQuery dataEditor/jobUser, Secret accessor only                                                                                             |

## Delta detection design (per source adapter)

Add a `Delta` stage between `list()` and download, using the existing `runListing` snapshots in `interim/listings/history/`:

1. **List** (cheap path per source): ED full single call; IBBI/NFRA/SFIO page newest-first and stop after a page of already-known keys (plus a weekly full relist to catch edits/deletions); RBI current + previous year daily, all years monthly; SEBI newest pages per order type.
2. **Diff** listing vs. stored previous listing by `stableId` key → `added`, `changed` (field hash differs), `removed` (kept, flagged, never deleted — soft-delete rule).
3. **Fetch** only added/changed items' documents (existing polite fetcher, ≥1.5 s/host, robots respected, B-35). Existing manifest skip-by-URL stays; for changed items re-fetch and store a new sha256 version.
4. **Extract** only new checksums (already idempotent).
5. **Write** per-run `delta/<source>/<date>.json` (counts + keys) and a run summary — this is also the audit trail and powers a "what changed today" UI/alert.
6. **Watermark** per source in state bucket (last successful listing hash/date) updated only on success.

Run flow: lock (Firestore doc, TTL) → per-source delta (failures isolated per source) → if any new data: `build` → validate (zod, row-count sanity: fail if a table drops >20% — guard against a broken scrape) → `graph` → publish bundle + `bq load` → update `index.json`/`dataset_built_at` → release lock → record run. If validation fails, nothing is published; UI keeps last good build.

## SEBI full index, MCA, bank loan book

- **SEBI**: remove 10-item cap behind config; first run = backfill (~24.5k listing rows, throttled, resumable across runs by watermark); then daily newest-first. Download PDFs for relevance-selected items only (existing `selectForDownload`).
- **MCA master**: not crawlable. Option A: data.gov.in OGD API with key in Secret Manager (monthly delta by CIN/updated date). Option B: manual upload of the new CSV parts to `…-state/mca/` which triggers a rebuild (Eventarc on object finalize). Plan: build B first, A when key available. Stop committing 5×45 MB CSVs to git; move to bucket.
- **Bank loan book** (reverses the session-note "later" item — needs your approval): separate pipeline, not part of the public-data job: contains PII/financial data → own bucket + Firestore/BigQuery with strict rules, per-bank access, Firestore rules + emulator tests, no PII in logs. Needs inputs from you (see questions). Sequenced last.

## Phases

0. **Prereqs (needs your OK per SESSION_NOTES)**: confirm GCP project ID/region, Blaze billing, enable APIs, budgets, buckets, service accounts, `.firebaserc` project id.
1. **Delta core (local, no cloud)**: listing diff + watermark + delta reports + run summary, tests per adapter (empty, malformed, duplicate, removed, page-stop), `docs/BOUNDARY_CONDITIONS.md` additions.
2. **Storage abstraction**: `RawStore`/state behind an interface with local-fs and GCS implementations (same layout, content-addressed keys). Env via validated config.
3. **Containerise + Cloud Run Job + Scheduler**, publish step (BigQuery load, bundle to publish bucket), alerting, lock, validation gates. Dry-run in a staging dataset first.
4. **UI**: `loadPublicRecords` reads versioned `index.json` from Hosting; show "data as of <dataset_built_at>" and last-run status (B-43); Hosting deploy step (GitHub Action, Workload Identity Federation, no keys in repo) that publishes the latest bundle without a rebuild of the app.
5. **Backfill**: SEBI full index and IBBI/RBI history; MCA upload path.
6. **Bank loan-book sync** (after approval and design review).

## Cost/scale notes (to confirm with real numbers in Phase 3)

Storage ~1 GB (cents/month); Cloud Run job minutes per day and BigQuery loads are negligible; main drivers are SEBI/IBBI request volume (time, not money) and later Gemini extraction (B-15 budgets first). Bundle grows with data: B-41 limit (~64 MB file / browser memory) is the trigger to move to the query API — flagged as a future phase.

## Boundary conditions touched (to call out/add)

B-15 budgets, B-24 idempotency (deterministic IDs, re-run safe), B-27 "day" = IST, B-30 job timeouts/resume, B-31 secrets, B-32 Blaze, B-34 region, B-35 private bucket/polite crawling/permission for ED+SFIO, B-36 never upgrade evidence status on delta, B-37/38 entity merge + PII, B-41 bundle size, B-43 snapshot date shown, B-44 CSP/headers. New ones to add: concurrent runs/lock (B-new), partial source failure, source layout change (scrape returns 0 rows → fail, don't publish), clock/DST, deleted-at-source records.

## Verification (when implemented)

- Unit tests for diff/watermark (fixtures: no change, 1 added, 1 changed, 1 removed, malformed listing, 0-row page).
- Run twice locally: second run reports zero delta and byte-identical `processed/`.
- Staging GCP project: trigger job manually, inspect `delta/` report, BigQuery row counts, published `index.json`; kill the job mid-run and re-run (resume/idempotent); inject a 0-row listing and confirm publish is blocked and alert fires.
- `npm run check && npm run build`; Playwright e2e against the published bundle; checksum of `data/raw|processed|registry` unchanged by local-only phases.

## Open questions for you

1. GCP project ID, region (asia-south1 recommended), who owns billing/budget limit?
2. Alert email/channel for failures?
3. IBBI full relist daily is slow at 2.5 s/request — OK to do newest-pages daily + full weekly?
4. MCA: do you have a data.gov.in API key, or should the manual-upload path be the default?
5. Bank loan book: source system (file drop, API, DB?), format, frequency, and who may see which loans (multi-bank/tenant?), PII handling rules?
6. Are ED/SFIO documents allowed to be stored in GCP (private) — permission status (B-35)?
7. Retention: keep every historical raw version forever, or lifecycle after N months?

---

# Decisions (from owner) and PR breakdown

Decisions: project/region/budget TBD by owner (use placeholders, config-driven); alerts = Cloud Monitoring policy only, no email channel yet;
IBBI newest pages daily + full relist weekly; MCA = manual upload; bank loan book = TBD/manual, deferred; ED/SFIO in private bucket
(permission not verified, B-35 flag stays); raw history kept forever (no delete lifecycle).

| PR  | MVP                                                                                        | Needs GCP?             | Done when                                 |
| --- | ------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------- |
| 1   | Delta core: listing diff, watermark, delta reports                                         | No                     | 2nd local run = zero delta                |
| 2   | Cheap listing per source (newest-first stop, IBBI weekly full, RBI years) + failure guards | No                     | per-source tests pass                     |
| 3   | Storage abstraction (local-fs + GCS impl), validated config                                | No (fake GCS in tests) | local run unchanged; GCS impl unit-tested |
| 4   | Publish contract: versioned bundle + index.json, validation gates, BigQuery load script    | Staging bucket/dataset | gates block bad build                     |
| 5   | Container + Cloud Run Job + Scheduler + lock + run log + alert policy (IaC/scripts)        | Yes                    | manual trigger works end-to-end           |
| 6   | UI reads versioned index, shows data-as-of + last-run status; Hosting deploy workflow      | Yes                    | e2e passes on published bundle            |
| 7   | SEBI full index backfill (resumable) + MCA manual-upload trigger                           | Yes                    | backfill completes over several runs      |
| 8   | Bank loan-book sync (design first)                                                         | Later                  | owner approves design                     |
