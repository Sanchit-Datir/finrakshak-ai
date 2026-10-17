# Plan: Risk explainer agent (optional)

_Status: deferred by the owner on 17 Oct 2026, then **E2 built at the owner's request the same day** (branch
`pattern-miner-risk-explainer-agent`): `ingest/src/explain/`, task `explain` (job `ingest-explain`, off by
default), explanations in `getRiskScores` and the app. E3 (the capped dry run) still waits on the go conditions
below. One change from the design: the sentence is stored in its own collection `synthRiskExplanations/{alertId}`
instead of a field on the alert, because an alert is created once and never rewritten (B-57); the alert's
`change_text` is the template. See `AGENTS_PLAN.md` for the pattern it follows._

## Goal

When a loan's risk has gone up, the alert carries structured reasons: a code, a layer, points, the evidence
status and the dates. A reviewer can read them, but a short plain sentence is quicker. This agent writes
that sentence from the stored reasons and nothing else.

Example of the intended output, for a loan that moved from Routine review to Needs attention:

> Since the last check, a company that shares this borrower's registered address was named in an ED
> provisional attachment record (an allegation, not a finding). No other reason changed.

It adds no new fact. If the sentence and the reason codes ever disagree, the codes are right.

## Build the templated text first

Every reason code gets a fixed sentence template in code (`risk/reasonText.ts` in shared), with slots for
the dates, record kinds and evidence status. The scoring job and the app use it from the first day, so:

- the alert is readable without any model;
- the template is the fallback whenever the agent is off, fails or is rejected;
- reviewers can judge whether the templates are already good enough before any model is paid for.

The templated alert text also carries a **deterministic "what changed" block**, computed by code from the
previous and current reasons, so the most useful part of an explanation never depends on a model:

> **New since last check:** a linked company is named in an ED provisional attachment record (allegation).
> **Unchanged:** the borrower and a second company share a registered address. **Score:** 34 → 52
> (Needs attention).

It lists reasons added, reasons no longer present and reasons unchanged, each from its template, plus the
score and band change. It is part of step 8 (scoring core) and has its own tests: every combination of
added, removed and unchanged reasons; the first score of a loan (every reason is new); and a band step-up
with no new reason (possible when points on an existing reason grow), where the block says no new reason
appeared and names the reasons whose points changed.

## Go conditions (after step 13)

Build the explainer only if **both** hold:

1. Reviewers (you, to start) read the synthetic alerts in the app and find the templated text hard to follow
   when several reasons combine.
2. The budget alert exists (B-15), so a real provider can be switched on safely.

**Stop rule for the dry run (E3):** if more than about 1 in 10 of the model's sentences fails the output
checks, or reads as stronger than the recorded reasons, stop and keep the templates.

## Design

1. **Input is structured and small.** For one alert: the band change, the score change, and for each reason
   its code, layer, points, record kind, evidence status and date. **No document titles and no free text from
   outside**, which removes most of the injection surface.
2. **Names stay out of the prompt.** The model sees placeholders (`{BORROWER}`, `{LINKED_COMPANY_1}`) and
   writes with them. Code substitutes the real names afterwards (B-38). In synthetic mode this is a habit; in
   a future real-data mode it keeps customer names away from the model.
3. **One tool, `submit_explanation`,** taking the alert id and the text. The existing `ToolModel` contract
   answers only with tool calls, so one tool is the natural shape. There is no tool loop to speak of.
4. **Output checks in code,** each failing back to the template:
   - at most 400 characters and at most two sentences;
   - every number and date in the text appears in the input;
   - every placeholder is one that was given, and the top reason is mentioned;
   - evidence status wording is kept: an allegation is never described as a finding;
   - no banned word (`violatesWording`).
5. **Stored beside the template, not instead of it.** The alert keeps `explanation_template` (always
   present) and `explanation_ai` (optional) with the model id and prompt version. The app shows the reasons
   list under the sentence either way, and labels the sentence "AI-written summary of the recorded reasons"
   (CLAUDE.md: never present AI output unlabelled).
6. **Runs as its own job,** `ingest-explain`, after `ingest-score`, off by default
   (`FUNDTRACE_EXPLAIN_ENABLED`). Its service account may read alerts and write only the AI explanation
   field. It cannot change a score, a band, a reason or whether an alert exists.
7. **Capped and idempotent.** At most 30 alerts per run; an alert whose input hash already has an
   explanation is skipped; ids are deterministic so a retry writes nothing new.

## Cost

My estimate from the planned alert budget (about 3% of loans a month): 30 alerts a month for 1,000 loans, a
few hundred tokens in and about a hundred out for each. That is a small fraction of a cent per alert on the
cheapest model, so cost is not the reason to hesitate. The reason to hesitate is value: it only matters if the
templates read badly.

## Tests

| Area          | What is asserted                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Templates     | Every reason code has a template; each renders with every slot filled; an allegation is worded as an allegation; no banned word                                     |
| Prompt input  | Contains no document title or free text; names are replaced by placeholders and restored exactly                                                                    |
| Output checks | Rejects: a number not in the input, an unknown placeholder, a missing top reason, an over-long text, a third sentence, a banned word, a finding-for-allegation swap |
| Mock model    | Happy path writes `explanation_ai`; a failing or empty model leaves only the template                                                                               |
| Authority     | The job's identity cannot write score, band, reasons or alert status (rules emulator test)                                                                          |
| Idempotence   | A second run with the same input writes nothing; a changed input writes a new version                                                                               |
| Injection     | Placeholder-like or instruction-like text in a reason field changes nothing                                                                                         |

## Files

```
packages/shared/src/risk/reasonText.ts (+ test)       templates for every reason code (built with scoring, MVP 2)
ingest/src/explain/
  digest.ts, placeholders.ts, checks.ts               input, name substitution, output checks (each with a test)
  prompts/explain.ts                                  versioned prompt
  explainTask.ts (+ test)                             the Cloud Run task, role `explainer`, in cloud/main.ts
scripts/setup-ingest-gcp.sh, scripts/deploy-ingest.sh service account and job `ingest-explain`
infra/workflows/ingest-daily.yaml                     a step after `score`, off by default
web: alert view shows the sentence with its label and the reasons list under it
```

## Steps (when you decide to build it)

| Step | Content                                                                                                                                             | Done when                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| E1   | Templates for every reason code plus the "what changed" block, used by the scoring job and the app (part of steps 8 and 13; **happens regardless**) | Reviewers can read every alert without a model                  |
| E2   | Digest, placeholders, output checks, prompt, task and job, all against the mock model                                                               | Every hostile-output test passes                                |
| E3   | One capped dry run on synthetic alerts, reviewed by you                                                                                             | You judge the sentences better than the templates, or stop here |

## Boundary conditions

- **B-15 cost:** per-run cap, mock by default, off by default, budget alert before any real provider.
- **B-36 evidence status:** the wording of allegations versus findings is checked, not left to the model.
- **B-38 personal data:** names are placeholders in the prompt.
- **B-49 style authority:** one tool, one field, its own account.
- **B-58 leads, not verdicts:** banned-word check on every output.
- **New, to add in E2: B-62 AI wording is a convenience, not evidence.** It is always shown with the recorded
  reasons, is labelled as AI-written, and is never stored in place of the reasons.

## For discussion

1. **Build it at all?** _Decided 17 Oct 2026:_ defer; decide after step 13 against the go conditions above.
2. **Label wording** in the app for the AI sentence.
3. **Language.** The templates and the prompt are English. Do reviewers need Hindi or Marathi? The app has a
   language preference; templates would then need translation by a person, not the model.

## Not in this plan

Free-form chat about a loan, explanations of why a pattern was proposed (that is the miner's job and goes
through your approval), and any use of the sentence in a decision.
