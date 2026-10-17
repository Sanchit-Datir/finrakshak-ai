# Test scenarios (end to end)

Each folder here is one end-to-end test case for the web app. It holds:

- `scenario.ts`: the **inputs** and the **expected** result
- `README.md`: the story behind it, the data it relies on, and the expected outcome

There are two kinds of scenario, each with its own runner:

| Kind                                | Type (`types.ts`)    | Runner                               | What it does                                                                                                                                                            |
| ----------------------------------- | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loan application (pre-disbursement) | `LoanScenario`       | `tests/loan-scenarios.spec.ts`       | Fills a new application, runs the checks (including the public-records check) and compares the result with `expect`                                                     |
| Post-disbursement watch             | `MonitoringScenario` | `tests/monitoring-scenarios.spec.ts` | Signs in, lets the automatic public-records watch check the demo loan book, and confirms the alerts on the dashboard, Alerts page, Monitoring banner and watch timeline |

Both runners save screenshots to `screenshots/<id>/`.

## Scenarios

| ID                                                                                       | Kind                    | What it tests                                                                                                                                      | Expected                                     |
| ---------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`maheep-trade-credit-chain`](maheep-trade-credit-chain/README.md)                       | Loan application        | The applicant's largest customer is in liquidation at the end of a chain of four unpaid debts (IBBI)                                               | Urgent review                                |
| [`advantage-overseas-post-disbursement`](advantage-overseas-post-disbursement/README.md) | Post-disbursement watch | TEST loan `L-2023-0601` (demo loan book): after disbursement the borrower is taken to insolvency, then liquidation, then ED search and attachments | 6 alerts raised automatically, Urgent review |
| [`jai-corp-sudden-enforcement`](jai-corp-sudden-enforcement/README.md)                   | Post-disbursement watch | TEST loan `L-2024-0401` (demo loan book): a clean, listed borrower faces an ED attachment of ₹230 crore after disbursement                         | 1 alert raised automatically, Urgent review  |

Other specs: `tests/risk-scores.spec.ts` checks the synthetic risk scores page (`/monitoring/risk-scores`),
a loan's detail and the `risk_score` alerts against the bundled sample `web/src/demo/synth-risk-sample.json`
(rebuild it with `node ingest/dist/risk/riskSampleCli.js`).

## Run

```bash
npm run build -w @fund-tracker/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web   # publishes the public-records graph used by the check
npm run e2e                          # builds the web app, starts vite preview, runs all scenarios
npm run e2e -- -g maheep             # one scenario, by id
npm run e2e -- -g advantage          # post-disbursement: escalating records
npm run e2e -- -g jai-corp           # post-disbursement: sudden enforcement
```

## Add a scenario

1. Create `scenarios/<id>/scenario.ts` exporting a `LoanScenario` or a `MonitoringScenario` (see
   `types.ts`). Copy `maheep-trade-credit-chain/scenario.ts` or
   `advantage-overseas-post-disbursement/scenario.ts` as a starting point.
2. Write `scenarios/<id>/README.md`. Say what pattern is tested, which public records it relies
   on (with dates), the expected result, and which values are test inputs.
3. Add the scenario to `SCENARIOS` or `MONITORING_SCENARIOS` in `index.ts`, and add a row to the
   table above.
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
