# FundTrace public-source dataset

Built by `ingest/` (see `ingest/README.md`). Row counts and build time: `processed/stats.json`.
Source access audit (terms, robots, licences, gaps): `registry/sources.json`.

| Path | Committed | Contents |
| --- | --- | --- |
| `registry/sources.json` | yes | Phase 0 audit of all 10 brief sources |
| `processed/*.jsonl` | yes | Canonical tables (brief section 8), one JSON object per line |
| `processed/bigquery/*.schema.json` | yes | BigQuery schemas for `bq load` |
| `processed/case_timelines.json` | yes | Seed cases with linked official records in date order |
| `raw/` | yes | Original downloads. `raw/mca_ogd/company_master.csv` is stored as 5 header-carrying parts (`company_master.partNof5.csv`); concatenate the rows to rebuild it |
| `interim/` | no | Listings, item→document map, extracted text |

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
- Amounts are INR paise (`amount.minor`), integers only.
