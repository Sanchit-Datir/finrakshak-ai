# FinRakshak Copilot

A side panel that answers questions about the record on screen: an application, a borrower, a loan,
an alert, a case, or the whole portfolio on the Command center. Open it with **Ask AI** in the top
bar, **Ctrl/⌘ J**, or **I**. It drafts; a person decides (B-58).

## What it does

| Task                    | Available on                      | Output                                                  |
| ----------------------- | --------------------------------- | ------------------------------------------------------- |
| Why was this flagged?   | every record, portfolio           | The leads, most serious first, plus harmless reasons    |
| What should I verify?   | every record, portfolio           | Checks tied to the finding or alert that needs them     |
| Draft an info request   | application, alert                | A polite note to the borrower, one item per open point  |
| Draft risk observations | application, borrower, loan, case | The "Risk observations" section of an appraisal note    |
| Where did the money go? | loan, alert                       | Transfers after disbursement, in time order             |
| Free question           | everywhere                        | An answer from the record, or "the record does not say" |

## How an answer is made

1. **Context pack** (`web/src/lib/assist/context.ts`, `pack.ts`). The browser turns the record into at
   most 60 numbered facts, such as `S1` (the record), `F3` (a finding), `T7` (a transaction) or
   `R2` (a public record). PAN, Aadhaar, account and phone numbers are masked first. Each fact also
   keeps an in-app link, which stays in the browser. The panel lists every fact under "Data the
   copilot can use".
2. **Model** (`functions/src/callable/assistRecord.ts`, `services/assist.ts`). Signed in with a cloud
   account, the facts go to the `assistRecord` function. Its steps:
   - checks sign-in, App Check, the AI allow-list, a burst limit (6 a minute) and the daily AI limit;
   - asks Gemini for JSON in which every statement cites fact refs;
   - puts the record and the question in delimited data blocks, which the prompt says to treat as
     data, not instructions.
3. **Grounding check** (`packages/shared/src/assistGrounding.ts`, runtime copy in
   `functions/src/services/assist.ts`). A statement is removed when:
   - it cites nothing, or cites a fact that was not sent;
   - a number in it does not appear in the facts it cites (amounts are compared as digits, so
     `₹1,00,000` matches `100000`);
   - it uses a verdict word.

   The answer shows how many statements were kept and why the others were removed (B-66).

4. **Demo session.** No model is called. Fixed rules build the answer from the same facts
   (`web/src/lib/assist/simulate.ts`). It passes the same grounding check and is labelled
   **Simulated demo output · no model called**.

## Cost and limits

Each answer is one billed call, which counts against the same daily AI limit as `analyseApplication`
(`GEMINI_DAILY_LIMIT`). An oversized record is refused before anything is counted. The mock provider
(emulator, tests, CI) never calls a model.

## Tests

- `packages/shared/src/assistGrounding.test.ts` and `functions/src/services/assist.test.ts` run the
  same cases (`assist-grounding-cases.json`).
- `functions/src/callable/assistRecord.test.ts` covers auth, malformed input, the burst and daily
  limits, the retry on bad JSON, and logs that hold counts only.
- `web/src/lib/assist/simulate.test.ts` checks that every kind of record builds a valid request and
  that every simulated answer passes the check.
