# Architecture

```
Browser (React) ──Auth/App Check──▶ Callable Functions ──▶ Firestore
                                          │
                                          └──▶ Vertex AI (Gemini, via ADC)
```

- The browser reads/writes Firestore only where security rules allow (owner-scoped); privileged and AI operations go through callables.
- `packages/shared` is the contract: zod schemas used for client validation, callable I/O, and Firestore read validation.
- Environments: `default` project is a placeholder; create separate `dev` / `prod` projects and alias them in `.firebaserc`.

## Public-source data pipeline (`ingest/`)

```
official sites ──(robots.txt, ≥1.5 s/host)──▶ ingest acquire ──▶ data/raw/<source>/  (manifest + sha256 files) ──▶ Cloud Storage
data.gov.in ──(manual download)──────────────────────────────▶ data/raw/mca_ogd/   (5 committed CSV parts)
                                                ingest extract ──▶ data/interim/text/  (pdf.js / HTML, per page)
                                                ingest build   ──▶ data/processed/*.jsonl + bigquery/*.schema.json ──▶ BigQuery
```

- Runs in Google Cloud: Cloud Scheduler → Cloud Workflows `ingest-daily` → Cloud Run jobs
  `ingest-acquire` (one task per source) and `ingest-build` (build, publish gates, versioned
  publish, BigQuery loads). The same code runs locally as a CLI on the file system. It does not
  go through callables. Storage is one port (`ingest/src/storage/`): local disk or Cloud Storage
  with create-only raw files and compare-and-swap listing writes; leases and run records are
  Firestore in the cloud (`ingest/src/coordination/`). Plan and diagrams:
  `docs/plans/GCP_INGESTION_AGENT_PLAN.md`; operations: `docs/DEPLOY.md` → Cloud ingestion.
- The data model lives in `packages/shared/src/evidence/` (zod); BigQuery schemas are generated from it.
- Storage rules (what is in git vs Cloud Storage) are documented in `data/README.md`.
