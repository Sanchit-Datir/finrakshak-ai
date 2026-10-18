# Scenario: working-capital loan where the applicant's customer is in liquidation

**Applicant (test):** Maheep Marketing Private Limited
**Pattern:** chain of unpaid trade dues ending in a customer in liquidation
**Run:** `npm run e2e` (Playwright runner `e2e/tests/loan-scenarios.spec.ts`; inputs and expectations in `scenario.ts` next to this file)

> The application values used here are **test inputs made up for this scenario**: amounts, PAN,
> signatory, dates and the second customer. They are not Maheep Marketing's real data. Only the
> public-record results are real; they come from the local public-records dataset in
> `data/graph`, built from IBBI, MCA, ED, RBI, NFRA, SFIO and SEBI sources. A connection or
> insolvency case is not evidence of wrongdoing.

## The situation in public records (IBBI announcements)

Each company applied for the insolvency of the next one because it was not paid:

| Date        | Applicant (owed money)                 | Debtor (did not pay)                                            | Debtor status in the local dataset      |
| ----------- | -------------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| 25 Apr 2026 | Maheep Marketing Pvt Ltd               | Deep Star Alloys and Steels Pvt Ltd (CIN U27100MH1995PTC090840) | Under Liquidation (MCA)                 |
| 22 Feb 2025 | Deep Star Alloys and Steels Pvt Ltd    | Navmi Steel Traders Pvt Ltd                                     | In liquidation (IBBI)                   |
| 27 Sep 2025 | Navmi Steel Traders Pvt Ltd            | Maruti Strips and Ferro Alloys Pvt Ltd                          | In liquidation (IBBI)                   |
| 18 Dec 2024 | Maruti Strips and Ferro Alloys Pvt Ltd | Yatin Steels India Pvt Ltd                                      | Active per MCA; in liquidation per IBBI |

Money reaches Maheep only if each company below pays the one above. Its customer is in
liquidation, and that customer is itself owed money by companies in liquidation. The receivable
Maheep holds is therefore unlikely to be paid in full or on time.

## What the application collects (and why)

| Section                                         | Field                                                                                     | Used for                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Loan details                                    | Borrower type = Private limited company; product = MSME working capital; amount; tenure   | Shows the business sections; a working-capital limit is drawn against receivables       |
| Business details                                | Business / firm name                                                                      | Matching the applicant to public records (exact normalised name)                        |
| Business details                                | CIN / registration number                                                                 | Preferred matching key (B-37); leave blank if not known                                 |
| Business details                                | **PAN of the business** (new)                                                             | KYC identifier. Public records do not contain PAN, so it is **not** used for matching   |
| Business details                                | GSTIN, Udyam number                                                                       | KYC identifiers (not used by this check)                                                |
| **Trade receivables (largest customers)** (new) | Customer name, CIN (optional), outstanding (₹), oldest unpaid invoice date, up to 10 rows | Matching each customer to public records and measuring the share of receivables at risk |
| Declaration                                     | Loan purpose, signed declaration, officer remarks                                         | Existing checks                                                                         |

Supporting documents (outside this check): receivables ageing statement, GST returns and bank
statements.

## What the risk analysis does

1. **Match** the applicant and each declared customer: exact CIN first, then the exact normalised
   name. A record with a different CIN is never a match, and a name shared by several records is
   reported as ambiguous (B-37). No fuzzy matching.
2. **Read records** for each match: IBBI insolvency/liquidation, ED/SFIO/SEBI enforcement and RBI
   licence actions, plus the MCA status.
3. **Find undeclared customers.** If the applicant itself filed for the insolvency of a company,
   that company owes it money. It is checked even if the applicant did not declare it.
4. **Follow the chain** from each customer in distress: the companies that owe that customer
   money, as documented insolvency applications. Up to 4 links are followed, taking the latest
   filing at each step.
5. **Save the result** on the application with the dataset date and an audit entry. A re-run is
   requested if the business details or customers change afterwards.
6. **Raise a finding** in the normal findings table (category "Customer / counterparty exposure"),
   with evidence links to each IBBI announcement, unknowns, possible innocent explanations and
   verification steps.

## Expected result (asserted by the Playwright test)

- The chain shows Deep Star → Navmi → Maruti Strips → Yatin Steels with statuses and IBBI links.
- Impact on receivables: declared ₹50,00,000, of which ₹18,00,000 (36%) is owed by a customer in
  liquidation, leaving ₹32,00,000.
- Finding: **"Customer in liquidation — receivable may not be recovered: Deep Star Alloys…"**,
  priority **Urgent review**, so the application's review priority is Urgent review.
- No horizontal scroll at 390 px width.

## Priority rule (policy values — confirm)

- Customer **in liquidation or dissolved** and its receivable is **≥ 20%** of declared receivables
  (`URGENT_RECEIVABLE_SHARE_PERCENT`) → **Urgent review**.
- Customer in liquidation that the applicant **did not declare** → **Urgent review**.
- Customer in insolvency resolution (CIRP), or in liquidation below 20% → **Needs attention**.
- Applicant itself in insolvency or liquidation → **Urgent review**. Applicant named in
  enforcement records → **Needs attention**, because its role (accused or victim) is unknown
  (B-42).
- The impact figure treats receivables from customers in insolvency or liquidation as not
  eligible for drawing power until recovery is evidenced.

## Run it

```bash
npm ci
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web   # publishes the public-records graph to the web app
npm run e2e                          # builds the web app, starts vite preview, runs the scenario
```

Screenshots are written to `e2e/screenshots/maheep-trade-credit-chain/` and the HTML report to
`e2e/playwright-report/`. Both are git-ignored.

## Limits

- The dataset is a local snapshot (built 16 Oct 2026). It is not a live MCA21 or IBBI lookup, and
  statuses may have changed since.
- The MCA company master covers Maharashtra only, so companies elsewhere are matched by exact
  name and need CIN confirmation.
- Recovery in liquidation is unknown. The applicant may have filed a claim, provided for the loss
  or settled.
- A customer's insolvency is a credit event, not wrongdoing by the applicant or the customer.
