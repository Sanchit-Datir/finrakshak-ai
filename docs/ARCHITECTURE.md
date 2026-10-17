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

- Runs offline as a Node CLI (later a Cloud Run job + Cloud Scheduler); it does not go through callables.
- The data model lives in `packages/shared/src/evidence/` (zod); BigQuery schemas are generated from it.
- Storage rules (what is in git vs Cloud Storage) are documented in `data/README.md`.
