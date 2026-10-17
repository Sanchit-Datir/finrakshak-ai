# Seed case review

The 23 seed cases (DHFL, IL&FS, Reliance ADAG Finance, SREI and others) link official records to each
case by matching names in titles and text. That can match the wrong company. Before the pattern miner
(`docs/plans/PATTERN_MINER_PLAN.md`) trusts a case, a person checks each linked record.

## Files here

| File                    | What it is                                                         | In git? |
| ----------------------- | ------------------------------------------------------------------ | ------- |
| `seed_review_sheet.csv` | The working sheet you fill in (open it in Excel or Google Sheets). | no      |
| `seed_review.json`      | Your saved decisions. The miner reads this.                        | yes     |

`data/processed/` is never changed by any of this.

## How to review

```bash
npm run miner -- verify-sheet --case dhfl,ilfs   # a sheet for the cases you choose (or none for all 23)
# open data/verification/seed_review_sheet.csv, fill the `verdict` column, save as CSV
npm run miner -- verify-apply --reviewer "Your Name"
npm run miner -- verify-status
```

For each row, open the `url` and decide whether the record is about the same company as the case:

| `verdict` | Meaning                                                                           |
| --------- | --------------------------------------------------------------------------------- |
| `correct` | The record is about this case's company or group.                                 |
| `wrong`   | It is about a different company. The miner leaves it out of the case.             |
| `unsure`  | You cannot tell. The case stays unverified until you decide.                      |
| (empty)   | Not reviewed yet. You can stop and continue later; progress is kept.              |

`note` is optional. Do not change the other columns, especially `case_id` and `entry_key`.

A case becomes **verified** when every one of its rows has a verdict, none is `unsure`, and at least one is
`correct`. Rows marked `wrong` do not block it. The status is worked out by the tool; you never type it.

Re-running `verify-sheet` refuses to overwrite a sheet that may hold unapplied edits unless you add
`--force`. A new sheet is pre-filled with your earlier decisions.

## Where to start

Verify the largest and best-known cases first: DHFL, IL&FS, Reliance ADAG Finance, SREI, Religare. Together
they hold most of the 330 linked records. Until a case is verified, patterns that rest on it keep a reduced
weight in the risk score.
