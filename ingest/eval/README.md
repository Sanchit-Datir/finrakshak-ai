# AI extraction quality gate (B-52)

AI-extracted claims stay in the shadow table (`evidence_claims_ai_shadow`) until the extractor
clears the gate below on a hand-checked golden set and the owner approves merging them.

| Metric (micro-averaged)                         | Gate          |
| ----------------------------------------------- | ------------- |
| Golden documents                                | at least 30   |
| Coverage (golden documents that were extracted) | at least 90 % |
| Organisation-name precision                     | at least 0.90 |
| CIN precision                                   | at least 0.95 |
| Amount precision (integer paise)                | at least 0.95 |

Recall and case-type accuracy are reported but not gated.

## Golden set

`extraction-golden.jsonl` (not committed until curated): one JSON object per line, for documents
already extracted by the pipeline (the `sha256` of the raw file, as in `interim/text/`).

```json
{
  "sha256": "<64 hex>",
  "organisations": [{ "name": "Example Finance Limited", "cin": "L65910MH1990PLC012345" }],
  "amounts_paise": [627000000000],
  "case_type": "penalty"
}
```

- List every **organisation** a careful reader would name from the document; never individuals.
- `cin` only when printed in the document, else `null`.
- `amounts_paise`: every monetary amount, in integer paise (₹62.70 crore = 627,000,000 rupees =
  62700000000 paise; write the number, not a formula).
- Pick documents across all six sources and the seed cases (DHFL, IL&FS, ...), including hard
  ones (scanned annexures excluded: they need OCR).

## Run

```bash
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
FINRAKSHAK_AI_STORAGE=gcs FINRAKSHAK_AI_RAW_BUCKET=... FINRAKSHAK_AI_STATE_BUCKET=... FINRAKSHAK_AI_PUBLISH_BUCKET=... \
  node ingest/dist/cli.js eval-ai --golden ingest/eval/extraction-golden.jsonl --model gemini-3.1-flash-lite
```

Exit code 0 = gate passed. Record the report in the PR that proposes merging AI claims.
