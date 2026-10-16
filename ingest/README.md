# ingest — public-source acquisition & dataset build

TypeScript pipeline for **Phase 0–2** of the FundTrace AI brief: audit sources, download permitted
public records with provenance, extract text, and build the canonical tables (brief section 8) that
BigQuery, Gemini extraction and the graph/risk layers consume.

```
acquire  ──▶ data/raw/<source>/files/<sha256>.<ext>   immutable originals  (→ Cloud Storage)
         ──▶ data/raw/<source>/manifest.jsonl          url, retrieved_at, sha256, bytes, terms
         ──▶ data/interim/listings/<source>.jsonl      every listed item (metadata)
extract  ──▶ data/interim/text/<sha256>.json           text per page (pdf.js / HTML)
build    ──▶ data/processed/*.jsonl                    canonical tables (committed)
         ──▶ data/processed/bigquery/*.schema.json     BigQuery schemas derived from zod
registry ──▶ data/registry/sources.json                Phase 0 access audit (committed)
```

## Run

```bash
npm ci
npm run build -w @fund-tracker/shared && npm run build -w ingest
node ingest/dist/cli.js registry
node ingest/dist/cli.js acquire all            # or: acquire nfra sebi --max 500
node ingest/dist/cli.js extract
node ingest/dist/cli.js build
```

Behind an HTTP proxy (e.g. Claude Code cloud sessions) run Node with `NODE_USE_ENV_PROXY=1`.
Options: `--list-only`, `--docs-only`, `--max N` (documents per source; default 1500, SEBI 50 via `SOURCE_DOC_CAPS`; env
`FUNDTRACE_MAX_DOCS_PER_SOURCE`); `FUNDTRACE_MIN_DELAY_MS` (per-host delay, default 1500 ms;
use 2500 for IBBI); `FUNDTRACE_DATA_DIR` (default `<repo>/data`). Every step is idempotent:
already-downloaded URLs and already-extracted checksums are skipped; a changed document becomes a
new manifest line (new version), never an overwrite.

## Sources (see `data/registry/sources.json` for the full audit)

| Source        | Status             | What is collected                                                                                                                                                                                                                     |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFRA          | automated          | All orders, AQR, FRQR and inspection reports (listing + PDFs)                                                                                                                                                                         |
| SEBI          | automated (sample) | 10 most recent Chairperson/Member orders with PDFs for now (`SOURCE_ITEM_CAPS` / `SOURCE_DOC_CAPS`); the full index is ~24.5k orders across 7 order types, with SAT appeal refs                                                       |
| IBBI          | automated          | All public announcements (debtor, applicant, IP, type, dates); PDFs for seed cases                                                                                                                                                    |
| ED            | automated          | All press releases since Jun 2022 (public JSON); PDFs for seed cases / lending-fraud keywords                                                                                                                                         |
| RBI           | automated          | Press-release index 2015–; detail text for enforcement releases (penalties, CoR cancellations, s.35A, alert list)                                                                                                                     |
| SFIO          | automated          | Prosecution lists (convicted directors, proclaimed offenders) and notices                                                                                                                                                             |
| MCA / OGD     | **manual**         | robots.txt disallows www.data.gov.in. Download the RoC-wise Company Master Data CSV(s) yourself into `data/raw/mca_ogd/`; `build` then binds CIN, status, incorporation date and registered address (unique-name or CIN matches only) |
| NSE / BSE     | **licence**        | Terms require written permission / licensed feed                                                                                                                                                                                      |
| NCLT          | **blocked**        | HTTP 403 to automated clients — curate manually                                                                                                                                                                                       |
| eCourts / SCI | **CAPTCHA**        | Not bypassed; curate manually                                                                                                                                                                                                         |

Download selection lives in `src/select/relevance.ts`; seed cases (brief step 2) in
`src/seed/cases.ts` — aliases are search terms, not claims.

## Outputs (`data/processed`)

| Table                          | Meaning                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `documents`                    | One row per (listing item, document URL); checksum/location null when only listed                                                                                                  |
| `case_events`                  | One row per order / notice / press release with case type, authority, proceeding status, appeal status, typed amounts                                                              |
| `entities`                     | Resolved organisations (CIN when bound, aliases, sources)                                                                                                                          |
| `persons`                      | Insolvency professionals and audit partners (public professional roles only)                                                                                                       |
| `relationships`                | Typed, dated, evidence-linked edges (`NAMED_IN_PROCEEDING`, `INSOLVENCY_APPLICANT_AGAINST`, `INSOLVENCY_PROFESSIONAL_FOR`, `AUDITOR_OF`, `AUDIT_PARTNER_FOR`, `CO_MENTIONED_WITH`) |
| `evidence_claims`              | Source-grounded statements with excerpt, page, method, `fact/finding/allegation/inference`                                                                                         |
| `risk_signals`                 | Explainable leads (cross-source presence, repeated adverse proceedings, insolvency after enforcement, NFRA reporting findings, seed-case network) with benign explanations         |
| `case_seeds`, `case_documents` | Seed cases and the documents that mention them                                                                                                                                     |
| `entity_match_candidates`      | Similar names deliberately **not** merged — for human review                                                                                                                       |

## Load into Google Cloud

```bash
gcloud storage rsync -r data/raw gs://$BUCKET/raw          # immutable originals
for t in documents case_events entities persons relationships evidence_claims \
         risk_signals case_seeds case_documents entity_match_candidates; do
  bq load --replace --source_format=NEWLINE_DELIMITED_JSON \
    $DATASET.$t data/processed/$t.jsonl data/processed/bigquery/$t.schema.json
done
```

`documents.file_location` uses `gs://<bucket>/raw/...`; substitute your bucket name.

## MCA company master data (manual step)

1. Sign in at data.gov.in and download "Registrars of Companies (RoC)-wise Company Master Data"
   (one CSV per RoC/state or the national file).
2. Save the CSV files in `data/raw/mca_ogd/` (any `*.csv`; header variants are detected).
3. Run `node ingest/dist/cli.js build`. `stats.json → mca_master` reports rows read and matches.

This adds `addresses`, `REGISTERED_AT` edges and the `shared_registered_address` signal. Ambiguous
names (several companies with the same normalised name) are not matched.

## Limits and next steps

- Extraction here is deterministic (regex + listing fields, `extractor_version: regex-v1`). Names are
  candidates; Gemini extraction (brief Phase 3) should run over `data/interim/text` with a strict
  schema and write `extraction_method: gemini` claims alongside these.
- Scanned PDFs are flagged `needs_ocr` in the text store.
- Documents beyond the per-source cap remain listed (metadata) and can be fetched with `--max`.
