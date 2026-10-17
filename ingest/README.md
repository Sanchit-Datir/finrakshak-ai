# ingest — public-source acquisition & dataset build

TypeScript pipeline for **Phase 0–2** of the FundTrace AI brief: audit sources, download permitted
public records with provenance, extract text, and build the canonical tables (brief section 8) that
BigQuery, Gemini extraction and the graph/risk layers consume.

```
manual   ──▶ data/raw/mca_ogd/company_master.partNof5.csv  MCA master (committed)
acquire  ──▶ data/raw/<source>/files/<sha256>.<ext>   immutable originals  (→ Cloud Storage)
         ──▶ data/raw/<source>/manifest.jsonl          url, retrieved_at, sha256, bytes, terms
         ──▶ data/interim/listings/<source>.jsonl      every listed item (metadata), merged run to run
         ──▶ data/interim/state/<source>.json          watermark: last success, last full relist
         ──▶ data/interim/delta/<source>/<run>.json    what changed in that run (added/changed/removed)
extract  ──▶ data/interim/text/<sha256>.json           text per page (pdf.js / HTML)
build    ──▶ data/processed/*.jsonl                    canonical tables + MCA join (committed)
         ──▶ data/processed/bigquery/*.schema.json     BigQuery schemas derived from zod
registry ──▶ data/registry/sources.json                Phase 0 access audit (committed)
```

What is committed, what goes to Cloud Storage, file layouts and conventions: see
[`data/README.md` → How data is stored](../data/README.md#how-data-is-stored).

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
Options:

- `--list-only` / `--docs-only` — run only the listing or only the document step.
- `--full` — force a full relist (ignores the incremental schedule).
- `--max N` — documents per source (default 1500, env `FUNDTRACE_MAX_DOCS_PER_SOURCE`; SEBI 10 via
  `SOURCE_DOC_CAPS` in `src/config.ts`).
- `--max-items N` — listing rows per source (SEBI 10 via `SOURCE_ITEM_CAPS`).
- `FUNDTRACE_MIN_DELAY_MS` — per-host delay, default 1500 ms (use 2500 for IBBI).
- `FUNDTRACE_DATA_DIR` — data folder, default `<repo>/data`.

Every step is idempotent: already-downloaded URLs and already-extracted checksums are skipped; a
changed document becomes a new manifest line (new version), never an overwrite.

## Daily delta: only fetch what changed

`acquire` does not blindly re-list and overwrite. For each source it decides between two listing modes
(`src/delta/policy.ts`), diffs the result against the stored listing (`src/delta/diff.ts`) and merges it:

| Mode          | When                                                            | What the adapter does                                                    |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `full`        | first run, `--full`, the relist interval has passed, or ED/SEBI | lists everything; items that disappeared are reported as `removed`       |
| `incremental` | otherwise, for IBBI, NFRA, SFIO, RBI                            | pages newest-first and stops at the first page of items it already holds |

- **Relist interval** (`FULL_RELIST_EVERY_DAYS` in `src/delta/policy.ts`): IBBI, NFRA and SFIO weekly, RBI
  monthly. RBI incremental runs list only the current and previous year; a full run lists 2015–. ED is one
  API call and SEBI is a capped sample, so both always list in full.
- **Diff** is by `item_id` (a hash of the source URL or key). An item is `changed` when its content
  hash differs (title, dates, document URLs, fields; `listed_at` is ignored), `added` when new, and
  `removed` when a full relist no longer shows it. Removed items are **flagged, never deleted**: they stay in
  the listing and are reported once (`missing_ids` in the state file); if they reappear the flag clears.
- **Merge**: the stored listing is upserted, so a partial (incremental) listing never drops older items.
  Unchanged items keep their stored record, which keeps `build` output byte-identical when nothing changed.
- **Downloads and extract** already skip known URLs and checksums, so only added/changed items cost requests.
- **Nothing is overwritten on failure.** If an adapter throws, a full relist returns no items although items
  were listed before, or a first page parses to zero rows for a collection we already hold (a layout change),
  that source's listing, history and state stay as they were. Sources are independent: one failing is logged,
  recorded as `failed` in the run summary, the others still run, and the process exits with code 1.
- **Reports**: each run writes `data/interim/delta/<source>/<UTC timestamp>.json` and a run summary
  `data/interim/delta/runs/<UTC timestamp>.json` (mode, counts, error per source). Timestamps are UTC;
  which timezone defines "a day" for the scheduler is still open (B-27).
- **History** (`interim/listings/history/<source>/<date>.jsonl`) now holds the items fetched in that run, which
  is a partial snapshot for incremental runs.

```bash
node ingest/dist/cli.js acquire ibbi nfra        # incremental when the relist is not yet due
node ingest/dist/cli.js acquire all --full       # force a full relist of every source
```

## Sources (see `data/registry/sources.json` for the full audit)

| Source        | Status             | What is collected                                                                                                                                                                                                                          |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NFRA          | automated          | All orders, AQR, FRQR and inspection reports (listing + PDFs)                                                                                                                                                                              |
| SEBI          | automated (sample) | 10 most recent Chairperson/Member orders with PDFs for now (`SOURCE_ITEM_CAPS` / `SOURCE_DOC_CAPS`); the full index is ~24.5k orders across 7 order types, with SAT appeal refs                                                            |
| IBBI          | automated          | All public announcements (debtor, applicant, IP, type, dates); PDFs for seed cases                                                                                                                                                         |
| ED            | automated          | All press releases since Jun 2022 (public JSON); PDFs for seed cases / lending-fraud keywords                                                                                                                                              |
| RBI           | automated          | Press-release index 2015–; detail text for enforcement releases (penalties, CoR cancellations, s.35A, alert list)                                                                                                                          |
| SFIO          | automated          | Prosecution lists (convicted directors, proclaimed offenders) and notices                                                                                                                                                                  |
| MCA / OGD     | **manual**         | CSV downloaded by hand (robots.txt forbids crawling) and committed as `data/raw/mca_ogd/company_master.partNof5.csv`: Maharashtra only, 626,930 unique companies/LLPs. `build` adds CIN, status, incorporation date and registered address |
| NSE / BSE     | **licence**        | Terms require written permission / licensed feed                                                                                                                                                                                           |
| NCLT          | **blocked**        | HTTP 403 to automated clients — curate manually                                                                                                                                                                                            |
| eCourts / SCI | **CAPTCHA**        | Not bypassed; curate manually                                                                                                                                                                                                              |

Download selection lives in `src/select/relevance.ts`; seed cases (brief step 2) in
`src/seed/cases.ts` — aliases are search terms, not claims.

## Outputs (`data/processed`)

| Table                          | Meaning                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `documents`                    | One row per (listing item, document URL); checksum/location null when only listed                                                                                                                     |
| `case_events`                  | One row per order / notice / press release with case type, authority, proceeding status, appeal status, typed amounts                                                                                 |
| `entities`                     | Resolved organisations (CIN/LLPIN, MCA status and incorporation date when matched, aliases, sources)                                                                                                  |
| `addresses`                    | Registered offices from the MCA master (normalised)                                                                                                                                                   |
| `persons`                      | Insolvency professionals and audit partners (public professional roles only)                                                                                                                          |
| `relationships`                | Typed, dated, evidence-linked edges (`NAMED_IN_PROCEEDING`, `INSOLVENCY_APPLICANT_AGAINST`, `INSOLVENCY_PROFESSIONAL_FOR`, `AUDITOR_OF`, `AUDIT_PARTNER_FOR`, `CO_MENTIONED_WITH`, `REGISTERED_AT`)   |
| `evidence_claims`              | Source-grounded statements with excerpt, page, method, `fact/finding/allegation/inference`                                                                                                            |
| `risk_signals`                 | Explainable leads (cross-source presence, repeated adverse proceedings, insolvency after enforcement, NFRA reporting findings, seed-case network, shared registered address) with benign explanations |
| `case_seeds`, `case_documents` | Seed cases and the documents that mention them                                                                                                                                                        |
| `entity_match_candidates`      | Similar names deliberately **not** merged — for human review                                                                                                                                          |

## Load into Google Cloud

```bash
gcloud storage rsync -r data/raw gs://$BUCKET/raw          # immutable originals
for t in documents case_events entities persons addresses relationships evidence_claims \
         risk_signals case_seeds case_documents entity_match_candidates; do
  bq load --replace --source_format=NEWLINE_DELIMITED_JSON \
    $DATASET.$t data/processed/$t.jsonl data/processed/bigquery/$t.schema.json
done
```

`documents.file_location` uses `gs://<bucket>/raw/...`; substitute your bucket name.

## MCA company master data (manual step)

Already present: `data/raw/mca_ogd/company_master.part1of5.csv` … `part5of5.csv` (Maharashtra,
766,814 rows, 626,930 unique CIN/LLPIN). To add or refresh:

1. Sign in at data.gov.in and download "Registrars of Companies (RoC)-wise Company Master Data"
   (one CSV per RoC/state, or the national file).
2. Save the CSV(s) in `data/raw/mca_ogd/` (full path in this repo: `<repo>/data/raw/mca_ogd/`). Any
   `*.csv` is read; header spellings such as `COMPANY_NAME` / `CompanyName` are both recognised and
   repeated CINs are ignored. Split files over 100 MB into header-carrying parts named
   `*.partNofM.csv` if they must be committed (`.gitignore` only admits `company_master.part*of5.csv`
   today — extend the pattern for new files).
3. Run `node ingest/dist/cli.js build`. `stats.json → mca_master` reports rows read and matches
   (current: 6 by CIN, 2,949 by unique name).

This adds `entities.cin/status/incorporation_date`, `addresses`, `REGISTERED_AT` edges and the
`shared_registered_address` signal. Names shared by several companies are not matched (B-37).

## Limits and next steps

- Extraction here is deterministic (regex + listing fields, `extractor_version: regex-v1`). Names are
  candidates; Gemini extraction (brief Phase 3) should run over `data/interim/text` with a strict
  schema and write `extraction_method: gemini` claims alongside these.
- Scanned PDFs are flagged `needs_ocr` in the text store.
- Documents beyond the per-source cap remain listed (metadata) and can be fetched with `--max`.
