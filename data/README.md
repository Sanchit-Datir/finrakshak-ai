# FundTrace public-source dataset

Built by `ingest/` (see `ingest/README.md`). Row counts, MCA match counts and build time:
`processed/stats.json`. Source access audit (terms, robots, licences, gaps): `registry/sources.json`.

## How data is stored

```
data/
├── registry/sources.json            Phase 0 access audit of the 10 brief sources        (git)
├── raw/                             original source files, never edited
│   ├── mca_ogd/company_master.partNof5.csv   MCA company master, 5 parts              (git)
│   └── <source>/                    nfra, sebi, ibbi, ed, rbi, sfio                      (Cloud Storage)
│       ├── manifest.jsonl           one line per downloaded file version
│       └── files/<aa>/<sha256>.<ext>  content-addressed originals (PDF / HTML / JSON)
├── interim/                         rebuildable working files                           (local only)
│   ├── listings/<source>.jsonl      every item the source lists (metadata)
│   ├── listings/history/<source>/<YYYY-MM-DD>.jsonl   listing snapshot per run
│   ├── item_documents/<source>.jsonl  listing item → document URLs
│   └── text/<aa>/<sha256>.json      extracted text per page (+ needs_ocr flag)
├── verification/                   owner review of the seed case timelines            (git)
└── processed/                       canonical dataset for BigQuery / the app            (git)
    ├── <table>.jsonl                11 tables (below), UTF-8 JSON Lines
    ├── bigquery/<table>.schema.json  BigQuery schemas generated from the zod models
    ├── case_timelines.json          seed cases with linked official records by date
    └── stats.json                   build time, listed items, MCA matches, row counts
```

| Layer | In git? | Size (Oct 2026) | Why |
| --- | --- | --- | --- |
| `registry/`, `processed/` | yes | ~75 MB | Small, reviewable, needed by the app and BigQuery |
| `raw/mca_ogd/` (5 parts) | yes | 219 MB | Manually downloaded, cannot be re-fetched automatically; each part < 100 MB |
| `raw/<source>/` downloads | **no** → Cloud Storage | ~810 MB | Large binaries; ED/SFIO forbid reproduction without permission (B-35); re-downloadable |
| `interim/` | no | ~76 MB | Rebuildable from `raw/` with `acquire --list-only --full` + `extract`; `state/` and `delta/` are run bookkeeping (watermarks, change reports) and `acquire.lock` exists only while `acquire` runs |

`.gitignore` enforces this split (`data/raw/*` ignored except the MCA parts; `data/interim/` ignored).

### Raw downloads (provenance, brief section 6)

- **Immutable and content-addressed**: a file is stored at `files/<first 2 hex>/<sha256>.<ext>`;
  identical content is stored once. Writes go to a temp file and are renamed, so an interrupted run
  never leaves a truncated file under a valid checksum.
- **Manifest** (`manifest.jsonl`, append-only): `sha256, source_id, url, final_url, retrieved_at`
  (UTC), `http_status, content_type, bytes, path, terms_note`. If a source changes a document, the
  next run appends a new line (new version); history is never overwritten.
- Current contents: NFRA 120 files, IBBI 161, RBI 1,500, ED 563, SEBI 20 (10 orders: page + PDF),
  SFIO 5.
- In Google Cloud: `gcloud storage rsync -r data/raw gs://$BUCKET/raw`. `documents.file_location`
  is written as `gs://<bucket>/raw/...` — replace `<bucket>` with your bucket name.

### MCA company master (`raw/mca_ogd/`)

- Source: data.gov.in "RoC-wise Company Master Data", downloaded manually (robots.txt forbids
  crawling). Licence: GODL-India — attribute MCA / data.gov.in.
- Stored as `company_master.part1of5.csv` … `part5of5.csv`; each part repeats the header row. To
  rebuild one file: `head -1 company_master.part1of5.csv > company_master.csv && tail -q -n +2
  company_master.part*of5.csv >> company_master.csv` (the unsplit file is git-ignored).
- Coverage: **Maharashtra only** (ROC Mumbai and ROC Pune) — 766,814 rows; 765,281 carry a CIN or
  LLPIN, covering 626,930 unique companies/LLPs (the export repeats ~138k rows). Add other states'
  CSVs to the same folder for national coverage; any `*.csv` there is read, duplicates are ignored.
- Columns used: CIN, company name, status, class, registration date, state, industrial
  classification, registered office address. Other columns (capital, ROC, listing status) are kept
  in the raw file but not yet loaded.
- Join rule (B-37): exact CIN where a document already gave one, otherwise a **unique** normalised
  name; names shared by several companies are not matched. Current build: 6 by CIN, 2,949 by name,
  producing `entities.status / incorporation_date / cin`, 2,813 `addresses` and `REGISTERED_AT` edges.

### Processed tables (brief section 8)

| Table | Key | Notes |
| --- | --- | --- |
| `documents` | `document_id` | One per (listing item, document URL); `checksum_sha256`/`file_location` null when only listed |
| `case_events` | `event_id` | Order / notice / press release: case type, authority, proceeding & appeal status, amounts |
| `entities` | `entity_id` | `ent_<CIN or LLPIN>` when known, else `ent_<hash of normalised name>` |
| `persons` | `person_id` | Insolvency professionals and audit partners only (B-38) |
| `addresses` | `address_id` | Registered offices from MCA, normalised |
| `relationships` | `relationship_id` | Typed, dated edges with `document_id`, `evidence_status`, `confidence` |
| `evidence_claims` | `claim_id` | Statement + excerpt + page + method + `fact/finding/allegation/inference` |
| `risk_signals` | `signal_id` | Review leads with explanation and benign explanations |
| `case_seeds`, `case_documents` | `case_id` | Seed cases and the documents that mention them |
| `entity_match_candidates` | pair | Similar names deliberately not merged |

Conventions: ids are deterministic hashes, so rebuilding gives the same ids; dates are as published
(`YYYY-MM-DD`, IST calendar day); timestamps are UTC ISO-8601; money is `{minor, currency}` in INR
paise (integers only, B-01/B-39). Load into BigQuery with the commands in `ingest/README.md`.

### Rebuilding

```bash
node ingest/dist/cli.js acquire all   # re-list sources and fetch new documents (skips stored ones)
node ingest/dist/cli.js extract       # text for new checksums only
node ingest/dist/cli.js build         # regenerate data/processed (≈30 s)
```

## Reading the data responsibly

- Every case event, claim and edge carries an evidence status: `fact` (stated in an official record),
  `finding` (adjudicated by a regulator/court), `allegation` (investigation, interim order, show-cause,
  attachment), `inference` (derived by this pipeline, e.g. co-mention). Do not upgrade them.
- Insolvency, RBI penalties, CoR cancellations and NFRA auditor findings are **not** findings of fraud
  by the company. ED press releases describe investigations unless a conviction is stated.
- Entity names come from regex extraction and are candidates; merges use exact CIN or exact
  normalised name only. `entity_match_candidates` lists similar names that were not merged.
- `risk_signals` are review leads with benign explanations — never a verdict or a public ranking.
- ED and SFIO require permission before reproduction; keep this dataset private until cleared.
- Small companies and LLPs often use a residence as their registered office; addresses are used only
  to link companies, never published.
