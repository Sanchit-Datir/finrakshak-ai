# AI analysis of a loan application

_Added 18 Oct 2026 (branch `feat/application-ai-analysis`). Owner's decisions: Gemini through the
Gemini Developer API (AI Studio) key held in Secret Manager, not Vertex AI; runs only on a click, with
the daily limit; real calls only after a budget limit exists (B-15)._

## Attention score (code, not the model)

At the top of the card, once the checks have run: an **attention score from 0 to 100**, its band and the
three findings that add most. Code computes it (`web/src/lib/attention-score.ts`) from the unresolved
findings, the same ones Review priority uses: urgent 60, needs attention 30, routine 10, capped at 100.
Bands use the app's wording: 0–29 Routine review, 30–59 Needs attention, 60–100 Urgent review. One urgent
finding alone is Urgent review (as Review priority says); several smaller findings can add up to a higher
band than the worst single one. It shows in demo mode too, since no model is involved. Gemini receives the
score and its drivers and explains them; a summary or note that states any other score is withheld.

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
  (`GEMINI_DAILY_LIMIT`, 30), then `services/applicationAnalysis.ts`.
- The model gets the data inside `<<<APPLICATION_DATA … APPLICATION_DATA>>>` and is asked for JSON. A
  reply that is not the expected JSON is retried once; a cut-off reply (`MAX_TOKENS`) is a failure.
- Logs hold counts only, never field values, findings or model text.
- The result is stored on the application (`aiAnalysis`) with a key of the inputs; when documents or
  findings change, the card says it is out of date.
- Locally, in tests and in the emulator the provider is `mock`: nothing is sent, and the card shows
  "Mock provider — no model called". A deployed function uses the `apikey` provider.

## Switching it on (owner)

1. Create the budget limit first (B-15, checkpoint 3). AI Studio billing is separate from the GCP
   budget alert: set a spend cap on the AI Studio project too. Use a key on a billed (paid) project so
   prompts are not used to improve Google's models.
2. `firebase functions:secrets:set GEMINI_API_KEY` and the IAM grant in `docs/DEPLOY.md`.
3. Give the reviewers `aiEnabled: true` in their profile.
4. Deploy. The card shows "Not connected" until a person signs in with a cloud account.
