# Scenario: a clean, listed borrower suddenly faces an ED attachment

**Loan:** `L-2024-0401` to Jai Corp Limited (listed, CIN L17120MH1985PLC036500), ₹5,00,00,000
term loan, disbursed 1 Apr 2024. It is in the demo loan book.
**Workspace:** post-disbursement, with the automatic public-records watch. **Nothing is typed
in.**
**Run:** `npm run e2e -- -g jai-corp`. Runner: `e2e/tests/monitoring-scenarios.spec.ts`;
inputs and expectations: `scenario.ts` in this folder.

> **Test loan:** `L-2024-0401` is a **TEST loan** added to the demo loan book
> (`web/src/demo/seed.ts`). Its amount, account and dates are made up. Only the borrower is real,
> so that its public records can be matched.
>
> **Real record:** the ED record is real (local dataset in `data/graph`). A provisional attachment
> is an allegation until decided (B-36). The title names the company as the subject ("against Jai
> Corp Limited and others"), not as a victim (B-42).

## Why this scenario

Scenario 2 shows a borrower getting worse step by step. This one shows the opposite risk: a
borrower that looks **clean at disbursement** and then has a **sudden enforcement action**.

- **At disbursement:** the borrower had no insolvency or enforcement record. It had only taken
  three of its own customers to insolvency (2020–2022), a mild receivables signal.
- **What would catch it:** only an ongoing watch catches the later event. A pre-disbursement check
  would have passed.

## Public records (as in the local dataset)

| Date                | Source    | Record                                                                                                                                               | Effect                                                     |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Jan 2020 – Sep 2022 | IBBI      | Jai Corp filed insolvency against three customers (Silk Woven Sack, Vama Wovenfab, G.S. Oils)                                                        | Before the loan; not about the borrower itself. No alert.  |
| _1 Apr 2024_        | _Test_    | _Loan L-2024-0401 disbursed_                                                                                                                         |                                                            |
| **6 Oct 2026**      | ED Mumbai | Provisional attachment of immovable properties worth ₹230 crore (market value ₹336 crore) "under the PMLA, 2002 against Jai Corp Limited and others" | **Urgent review: enforcement action against the borrower** |

## Expected results (asserted by the test)

1. **Dashboard:** after sign-in, the "Public records on disbursed loans" card lists
   `L-2024-0401 · Jai Corp Limited` with "1 record(s) since disbursement".
2. **Alerts → Source: Public-records watch:** 1 alert for that loan, "Enforcement action against
   the borrower: Jai Corp Limited (2026-10-06)". It shows **Urgent review**, why it matters
   ("Assets, including any security, may be attached") and an **Open public record** link to the
   ED press release.
3. **Post-disbursement Monitoring, loan `L-2024-0401`:** the banner "1 public record(s) about this
   borrower since disbursement".
4. **Public-records watch:** the timeline shows the disbursement, then the 6 Oct 2026 ED
   attachment.
5. **Phone width:** no horizontal scroll at 390 px.

## Test it by hand

```bash
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web   # publish the public-records data (once per machine)
npm run dev -w web                   # http://localhost:5173 → Continue with quick sign-in
```

1. Sign in. Within a few seconds a toast reports the new public-record alerts. Scenario 2's loan
   is flagged too.
2. On the **Dashboard**, find `L-2024-0401 · Jai Corp Limited` in the **Public records on
   disbursed loans** card.
3. Open the **bell** or **Alerts** (source: Public-records watch), open the Jai Corp alert, and
   follow **Open public record**.
4. Open **Post-disbursement Monitoring**, choose loan `L-2024-0401`, and check the banner. Then
   click **See the timeline and evidence**.

If you used the app before this loan was added, clear the site data (F12 → Application → Local
storage → clear), so the demo loan book reloads with the new TEST loan.

## Run the automated test

```bash
npx playwright install chromium   # first time only
npm run e2e -- -g jai-corp        # add --headed to watch, or --ui for UI mode
```

Screenshots are saved to `e2e/screenshots/jai-corp-sudden-enforcement/`. They are git-ignored.

## Limits

- **Local snapshot.** The dataset is a local snapshot (built 16 Oct 2026), not a live ED feed
  (B-43).
- **Allegations only.** A provisional attachment is not a finding of guilt. Check the borrower's
  role and whether any pledged security is among the attached assets.
- **Borrower only.** Its customers' insolvencies (2020–2022) are not watched for disbursed loans
  yet. That would be a later extension: watching customers and group companies.
