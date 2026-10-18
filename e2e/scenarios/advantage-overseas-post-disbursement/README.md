# Scenario: borrower's insolvency, liquidation and ED actions after disbursement

**Loan:** `L-2023-0601` to Advantage Overseas Private Limited (CIN U05121MH2004PTC199195),
₹2,00,00,000, disbursed 1 Jun 2023. It is in the demo loan book.
**Workspace:** post-disbursement. **Nothing is typed in:** the app watches every disbursed loan
automatically.
**Run:** `npm run e2e -- -g advantage`. Runner: `e2e/tests/monitoring-scenarios.spec.ts`;
inputs and expectations: `scenario.ts` in this folder.

> **Test loan:** `L-2023-0601` is a **TEST loan** added permanently to the demo loan book
> (`web/src/demo/seed.ts`). Its amount, account and dates are made up; its data source says so.
> Only the borrower is real, so that its public records can be matched.
>
> **Real records:** the public records come from the local public-records dataset in `data/graph`
> (IBBI and ED). ED actions are allegations until decided (B-36). In these titles the company is
> named as the subject ("bank fraud done by M/s Advantage Overseas…"), not as a victim (B-42).
>
> **Production:** the loan book would come from the bank's core system. Syncing it is not built
> yet.

## Why this scenario

A loan can look fine on the day it is disbursed and go wrong afterwards. The lender should be told
without anyone having to look the borrower up. This borrower's public records worsen step by step
over three years after disbursement. MCA still shows the company as **Active**, so watching MCA
status alone would miss all of it (B-43).

## Public records after disbursement (as in the local dataset)

| Record date | Source    | Record                                                                                                          | Alert                                            |
| ----------- | --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 16 Nov 2023 | IBBI      | Corporate insolvency (CIRP) started, applicant State Bank of India                                              | Urgent review: borrower taken to insolvency      |
| 6 Dec 2024  | IBBI      | Liquidation ordered                                                                                             | Urgent review: borrower ordered into liquidation |
| 5 Aug 2025  | ED Bhopal | Search under PMLA: "criminal conspiracy for the purpose of cheating, forgery…"                                  | Urgent review: enforcement action                |
| 18 Nov 2025 | ED Bhopal | Provisional attachment of nine properties in Dubai                                                              | Urgent review: enforcement action                |
| 29 Nov 2025 | ED Bhopal | Provisional attachment of properties in MP, Maharashtra and Kerala, "bank fraud done by M/s Advantage Overseas" | Urgent review: enforcement action                |
| 25 Jun 2026 | ED Bhopal | Provisional attachment of two life-insurance policies (Zurich International Life)                               | Urgent review: enforcement action                |

## How the automatic watch works

1. **Watch every loan.** Every loan in the loan book is watched automatically. The borrower's
   registered name and CIN come from the borrower record (for submitted applications, from the
   application's business details), and the disbursement date comes from the loan.
2. **Check after sign-in.** Each loan is checked against the local public-records dataset as of
   today, at most once a day. The borrower is matched by exact CIN first, then by exact name
   (B-37). Each record **dated after disbursement** becomes one event and one **Urgent review**
   alert.
3. **Raise each record once.** Events are append-only. A record is raised once, like a
   notification that has been sent.
4. **Where you see it, without searching:**
   - **Dashboard:** a "Public records on disbursed loans" card listing flagged loans
   - **Post-disbursement Monitoring:** a red banner on the loan, linking to the timeline
   - **Alerts:** source "Public-records watch", and the bell. Each alert opens with what was
     observed, why it matters, the source document link, possible innocent explanations and
     suggested steps. **Open case** escalates it.
   - **Public-records watch** page: the timeline per loan, and a table of every other watched
     loan. The fictional demo borrowers are never found in public records.
5. **Earlier records are context.** Records dated before disbursement are shown as context and
   don't raise alerts.

In production a scheduled backend job would run this daily against a live feed. That is not built
yet (cloud step on hold). The watch page still has **Check as of** to re-run a check by hand, and a
form to watch a loan that is not in the loan book.

## Expected results (asserted by the test)

1. **Dashboard:** after sign-in the card lists `L-2023-0601 · Advantage Overseas Private Limited`
   with "6 record(s) since disbursement".
2. **Alerts → Source: Public-records watch:** 6 alerts for that loan. Opening "Borrower taken to
   insolvency (CIRP)…" shows **Urgent review**, "…moratorium stops recovery actions…" and an
   **Open public record** link.
3. **Post-disbursement Monitoring, loan `L-2023-0601`:** the banner "6 public record(s) about this
   borrower since disbursement".
4. **Public-records watch:** the timeline lists the six records in date order, after the
   disbursement.
5. **Phone width:** no horizontal scroll at 390 px.

## Test it by hand

```bash
npm run build -w @finrakshak-ai/shared && npm run build -w ingest
node ingest/dist/graphCli.js --web   # publish the public-records data (once per machine)
npm run dev -w web                   # http://localhost:5173 → Continue with quick sign-in
```

1. Sign in. Within a few seconds a toast says "6 new public-record alert(s) on disbursed loans".
2. On the **Dashboard**, look at the **Public records on disbursed loans** card.
3. Open the **bell** or **Alerts** (source: Public-records watch) and open an alert.
4. Open **Post-disbursement Monitoring**, choose loan `L-2023-0601` and see the banner.
5. Click **See the timeline and evidence** to reach the watch page.

**If you used the app before this change:** the saved demo data is reset automatically, because
the data model changed, and a toast explains this. That reset is what adds the TEST loan. To run
it again from scratch, clear the site data: F12 → Application → Local storage → clear.

## Run the automated test

```bash
npx playwright install chromium   # first time only
npm run e2e -- -g advantage       # add --headed to watch, or --ui for UI mode
```

Screenshots are saved to `e2e/screenshots/advantage-overseas-post-disbursement/`: dashboard card,
alert detail, monitoring banner, timeline and mobile view. They are git-ignored.

## Limits

- **Local snapshot.** The dataset is a local snapshot (built 16 Oct 2026), not a live IBBI or ED
  feed, and statuses may have changed since (B-43).
- **Records only.** Records show insolvency and enforcement actions, not whether this loan is in
  default.
- **Borrower only.** Only the borrower is watched. Customers and group companies of disbursed
  loans are not yet watched; that would be a later step (scenario 3, or the Amtek group).
