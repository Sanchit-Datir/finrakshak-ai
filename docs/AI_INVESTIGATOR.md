# AI investigator for a loan application

_Added 18 Oct 2026 (branch `claude/ai-investigator-e63431`, from `feat/application-ai-analysis`), as decided
with the owner the same day. Boundary condition: **B-66**._

The owner wants visible AI doing the assessment, with no hallucination: **the AI proposes with cited
evidence, code verifies, a person decides.** Findings are leads (Routine review / Needs attention / Urgent
review), never verdicts.

## What the officer sees

On the application's **Risk** step, the **AI investigator** card (under the AI-assisted analysis card):

- **Investigate with AI** (on a click only; each run counts once against the daily AI limit, B-15).
- **Verified findings**: kind, priority, the AI's statement, and "Evidence (checked by code)": each cited
  field with its value, ratio with how code computed it, public-records candidate or record, or related
  entity. Public-record matches are marked **Possible match — needs verification**, or **CIN or address
  agrees** when code found that too. Each can be dismissed ("not an issue") and restored.
- **Draft questions for the applicant**: editable; **Approve question** records it as a note on the
  application. Nothing is sent.
- **"AI made N claims: V verified, R rejected"**, with the reasons for rejections (counts only).
- The result is stored on the application with a key of its inputs; when the application data or the
  check findings change it is marked **Out of date** and stops counting in the score.
- Demo session: **Not connected — no AI investigation ran**. Mock provider: "Mock provider — no model
  called"; mock findings add nothing to the score.

## Flow

1. **Browser bundle** (`web/src/lib/investigation-bundle.ts`): the typed-in application by section
   (applicant, business, loan, collateral, customers). PAN, GSTIN and Udyam numbers masked; date of birth,
   mobile and street address left out; empty fields kept as `''` so gaps can be asked about.
   - **Ratios by code** (`investigation-ratios.ts`): loan to income (or turnover), EMI to monthly income
     (at an assumed 12% a year, stated in the ratio, since no rate is recorded), liabilities to income,
     loan to collateral, loan per acre, largest customer's share of receivables, receivables to loan.
   - **Public-records shortlist by code** (`investigation-shortlist.ts`): per party (applicant, business,
     each declared customer), up to 5 companies (people for the applicant) from the published index by
     fuzzy name matching (distinctive words, small spelling differences, score ≥ 70/100). A different CIN
     is never shortlisted (B-37); same CIN is listed first. `cinAgrees` and `addressAgrees` (pincode) are
     computed by code.
   - **Related entities**: relationships recorded in the workspace for the borrower (with any open case)
     and, from the public records, companies registered at the same address as a confident candidate
     (exact CIN or name score 100), with any insolvency/liquidation/enforcement record or MCA status.
2. **Callable** `investigateApplication` (`functions/src/callable/investigateApplication.ts`): sign-in,
   rate limit (2 a minute), zod input (runtime copy in `services/investigation/input.ts`, kept in sync
   with the shared schema by the `AssertTrue` type and a limits test), size ≤ 40,000 characters (checked
   before any use is counted), then the billed gate (AI allow-list + daily limit). App Check enforced,
   `maxInstances: 5`, `minInstances: 0`, 256 MiB, 120 s.
3. **Tool loop** (`services/investigation/loop.ts`, after `ingest/src/ai/toolLoop.ts`): Gemini on Vertex AI
   (`gemini-3.1-flash-lite`, location `global`) in forced function-calling mode, temperature 0. Closed tool
   list: `get_section`, `get_ratio`, `get_public_record_candidates`, `get_record`, `get_related_entities`,
   `submit_finding`, `submit_question`, `submit_summary`. The model first sees only an overview (section
   sizes, ratio names, parties, check findings) inside `<<<APPLICATION_OVERVIEW … >>>`.
4. **Verification** (`services/investigation/verify.ts`), for every claim:

| Rule                                                                                                                                      | Rejection reason                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Cited field path must be in the bundle; a quoted value must appear in that field                                                          | `unknown_field`, `quote_mismatch`    |
| Cited ratio must be one code sent                                                                                                         | `unknown_ratio`                      |
| Cited record or candidate must be in a shortlist; for a match, in **that party's** list                                                   | `unknown_record`, `not_in_shortlist` |
| Cited entity must be in the bundle (and the party's, when a party is named)                                                               | `unknown_entity`, `unknown_party`    |
| Every number written must appear in the cited evidence (the model does no arithmetic)                                                     | `unknown_number`                     |
| No verdict words (fraud, scam, guilty, criminal, launder, cheat, forged); no stated score                                                 | `verdict_word`, `stated_score`       |
| Each kind cites what it needs: match → a record; link → an entity with a known concern; numbers → a ratio or field; mismatch → two fields | `missing_evidence`                   |
| Caps: 10 findings, 8 questions, 300 characters each                                                                                       | `over_limit`                         |

A shortlisted match is **possible** (at most Needs attention) unless a cited candidate's CIN or address
also agrees (**strong**). "Not enough evidence" is a valid outcome (`notEnoughEvidence`). A summary
with verdict words, a score or an unknown number is withheld.

## Limits (B-10, B-11, B-14, B-15)

- At most **8 read calls** and **10 model turns**; submissions have their own caps; tool replies read by
  the model are capped at 30,000 characters (reads are then refused, submissions still accepted).
- A reply whose arguments do not parse is reported back **once**; a second one fails the run. A cut-off
  reply (`MAX_TOKENS`), a model error, or the 100-second deadline fails the run: nothing partial is kept,
  and the card says "The AI service could not answer. Try again."
- **Every model call counts** against the daily AI limit, and the limit is never crossed (owner, 18 Oct
  2026). The first call is checked with the allow-list; before each further call one more use is taken.
  When none is left (or the usage lookup fails) the run stops there, keeps what was already verified and
  is marked "Stopped at your daily AI limit". The card shows the model calls counted and the uses left.
- Names are sent unmasked (owner, 18 Oct 2026: no need to mask them); PAN, GSTIN and Udyam numbers stay
  masked and date of birth, mobile and street address stay out (B-16).
- Logs hold counts only (parties, ratios, tool calls, claims); never names, values or model text (B-16).

## Attention score

Verified, current, non-mock AI findings add points as their own kind, scaled by priority like rule
findings (urgent 100%, needs attention 60%, routine 30%): public-record match 45, related-entity link 40,
implausible numbers 25, sections that do not agree 15. The drivers show them as "AI finding (evidence
verified)". The AI never sets the number. Table: `docs/APPLICATION_AI_ANALYSIS.md`.

## Running it

- Locally, in tests and in the emulator the provider is `mock`: code scripts the tool calls from the
  bundle (`mockScript` in `investigate.ts`) and they run through the same loop and checks; nothing is sent.
- Deployed: same steps as the analysis card (`docs/APPLICATION_AI_ANALYSIS.md` → Switching it on). All
  functions run as `728958349363-compute@developer.gserviceaccount.com` (checked 18 Oct 2026), which then
  had only `roles/cloudbuild.builds.builder` and `roles/datastore.user`. It needs the predefined
  `roles/aiplatform.user` (call Vertex AI models; no new account or custom role is needed). Granting it is
  the owner's step (`scripts/setup-gcp.sh`, or the one `gcloud projects add-iam-policy-binding` command in
  `docs/APPLICATION_AI_ANALYSIS.md`).
- Browser check done on 18 Oct 2026 against the auth + functions emulators (project `demo-fund-tracer`,
  mock provider): demo session shows Not connected; a run produces a verified possible/strong match with
  its evidence, a draft question that can be approved, out-of-date marking, no horizontal scroll at 360 px.
