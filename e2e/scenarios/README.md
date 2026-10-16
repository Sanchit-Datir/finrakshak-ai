# Loan-application test scenarios

Each folder here is one end-to-end test case for the web app. It holds:

- `scenario.ts`: the application **inputs** and the **expected** risk-analysis result
- `README.md`: the story behind it, the data it relies on, and the expected outcome

`tests/loan-scenarios.spec.ts` runs every scenario listed in `index.ts`. For each one it:

1. fills a new application
2. runs the public-records check and the configured checks
3. compares the result with `expect`
4. saves screenshots to `screenshots/<id>/`

## Scenarios

| ID                                                                 | What it tests                                                                                        | Expected priority |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------- |
| [`maheep-trade-credit-chain`](maheep-trade-credit-chain/README.md) | The applicant's largest customer is in liquidation at the end of a chain of four unpaid debts (IBBI) | Urgent review     |

## Run

```bash
npm run build -w @fund-tracker/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web   # publishes the public-records graph used by the check
npm run e2e                          # builds the web app, starts vite preview, runs all scenarios
npm run e2e -- -g maheep             # one scenario, by id
```

## Add a scenario

1. Create `scenarios/<id>/scenario.ts` exporting a `LoanScenario` (see `types.ts`). Copy
   `maheep-trade-credit-chain/scenario.ts` as a starting point.
2. Write `scenarios/<id>/README.md`. Say what pattern is tested, which public records it relies
   on (with dates), the expected result, and which values are test inputs.
3. Add the scenario to `SCENARIOS` in `index.ts` and a row to the table above.
4. Run `npm run e2e -- -g <id>` and check the screenshots.

If a scenario needs a step the runner doesn't have yet (other borrower types, documents, transaction
monitoring), add an optional field to `types.ts` and handle it in the runner. Existing scenarios
must keep passing.

## Rules for test data

- **Mark made-up values.** Application inputs (amounts, signatories, PAN, dates, extra customers)
  are made up; mark them "TEST" or "SYNTH". Use `ABCDE1234F` (the sample format printed on PAN
  forms) rather than any real-looking PAN.
- **Real public records.** Public-record results may involve real companies. Cite the source
  records in the scenario README, and describe insolvency or enforcement as records, never as
  wrongdoing (B-36, B-42).
- **Personal data.** Never use real personal data: names of individuals, Aadhaar, mobile numbers
  or home addresses (B-38).
- **Dataset changes.** Expectations depend on the local dataset (`data/graph`, see B-43). If a
  rebuild changes a status or a date, update the scenario and its README together.
