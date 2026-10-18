# AI analysis of a loan application

_Added 18 Oct 2026 (branch `feat/application-ai-analysis`). Owner's decisions: Gemini on **Vertex AI**
(changed from the AI Studio key on 18 Oct 2026: billed to `fund-tracer` under its budgets, no API key, and
no free-tier data use); runs only on a click, with the daily limit; real calls only after a budget limit exists (B-15, done 18 Oct 2026)._

## Attention score (code, not the model)

At the top of the card, once the checks have run: an **attention score from 0 to 100**, its band and the
three findings that add most. Code computes it (`web/src/lib/attention-score.ts`) from the unresolved
findings, the same ones Review priority uses. Each kind of finding has its own weight, the points it adds
when it is urgent; a milder finding of the same check adds less (needs attention 60%, routine 30%,
rounded). Points add up, capped at 100. Bands use the app's wording: 0–29 Routine review, 30–59 Needs
attention, 60–100 Urgent review. It shows in demo mode too, since no model is involved. Gemini receives
the score and its drivers and explains them; a summary or note that states any other score is withheld.

| Finding (rule)                                               | Full points | Needs attention | Routine |
| ------------------------------------------------------------ | ----------: | --------------: | ------: |
| Applicant in public records (`public_records`, applicant)    |          70 |              42 |      21 |
| Relationships to open investigations (`relationship_review`) |          50 |              30 |      15 |
| Customer in public records (`public_records`, customer)      |          45 |              27 |      14 |
| Survey number / warehouse receipt reuse                      |          45 |              27 |      14 |
| Declared income vs bank credits (`income_mismatch`)          |          30 |              18 |       9 |
| Name mismatch, date-of-birth conflict, existing charges      |          25 |              15 |       8 |
| Public-records check out of date / not run                   |          25 |              15 |       8 |
| Land area vs 7/12 (`land_area`)                              |          20 |              12 |       6 |
| Unclear fields, missing documents                            |           8 |               5 |       2 |
| Required fields, purpose, failed documents, unreviewed items |           5 |               3 |       2 |
| Any check not listed (a new rule)                            |          30 |              18 |       9 |
| AI investigator: possible public-record match (verified)     |          45 |              27 |      14 |
| AI investigator: link to a related entity of concern         |          40 |              24 |      12 |
| AI investigator: numbers that look implausible together      |          25 |              15 |       8 |
| AI investigator: sections that do not agree                  |          15 |               9 |       5 |

AI-investigator rows count only for findings code verified, from a real model (not the mock), still
current (the application has not changed since) and not dismissed; their drivers are labelled "AI finding
(evidence verified)". The model never sets the score. See `docs/AI_INVESTIGATOR.md`.

Because weights differ by check, the score's band can be lower than Review priority (an urgent but
low-weight finding, such as missing documents) or higher (several findings adding up). The weights are
the owner's starting point (18 Oct 2026), not tuned on outcomes.

## What it does

On the application's **Risk** step, **Analyse with Gemini** sends the application's recorded document
fields and its check findings to the `analyseApplication` function. Gemini returns:

| Part               | What it is                                                      | Checked by code                                                                                                         |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Risk summary       | Up to 6 plain sentences on what the documents show              | Withheld if it uses verdict words (B-58)                                                                                |
| From the documents | Facts, each tied to one recorded field (the evidence extractor) | Kept only if the field was sent and the fact quotes its value                                                           |
| About the findings | One note per finding on what to check (the risk explainer)      | Kept only for a finding that was sent; one per finding                                                                  |
| Matched patterns   | Not from the model                                              | Patterns match a disbursed loan's transactions, so none apply to an application; the card links to the risk scores page |

The pattern miner is not used here: it looks across the seed cases to propose new patterns for a
person to approve, so it has nothing to say about one application.

## Data flow and limits

- Applications live in the browser's workspace, so the browser builds the request
  (`web/src/lib/application-analysis.ts`): unreadable and empty fields are left out, identity, account,
  phone and similar fields are masked (B-16), and documents that would not fit 20,000 characters are left
  out and counted.
- `functions/src/callable/analyseApplication.ts`: sign-in, App Check, 3 calls a minute, input schema,
  size check (before any use is counted), AI allow-list (`aiEnabled`) and the daily limit
  (`GEMINI_DAILY_LIMIT`, 100 since 18 Oct 2026), then `services/applicationAnalysis.ts`.
- The model gets the data inside `<<<APPLICATION_DATA … APPLICATION_DATA>>>` and is asked for JSON. A
  reply that is not the expected JSON is retried once; a cut-off reply (`MAX_TOKENS`) is a failure.
- Logs hold counts only, never field values, findings or model text.
- The result is stored on the application (`aiAnalysis`) with a key of the inputs; when documents or
  findings change, the card says it is out of date.
- Locally, in tests and in the emulator the provider is `mock`: nothing is sent, and the card shows
  "Mock provider — no model called". A deployed function uses the `vertex` provider
  (location `global`, model `gemini-3.1-flash-lite`); `GEMINI_PROVIDER=apikey` still selects the API key.

## Switching it on (owner)

1. Budget alerts exist (B-15, checkpoint 3, done 18 Oct 2026: ₹450/month for `fund-tracer`, ₹200/month
   for the AI services). They only warn; the daily limit and caps are the hard brakes.
2. Give the functions' runtime account Vertex access once (`scripts/setup-gcp.sh` does it; by hand:
   `gcloud projects add-iam-policy-binding fund-tracer --member
serviceAccount:728958349363-compute@developer.gserviceaccount.com --role roles/aiplatform.user`).
3. Give the reviewers `aiEnabled: true` in their profile.
4. Deploy. The card shows "Not connected" until a person signs in with a cloud account.
