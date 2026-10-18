# Plan: How agents are implemented

_Status: the six agent decisions were taken by the owner on 17 Oct 2026 (listed under "For discussion"). Built on
17 Oct 2026 (branch `pattern-miner-risk-explainer-agent`): the shared `runToolLoop` (`ingest/src/ai/toolLoop.ts`),
the number check (`ai/outputChecks.ts`), the `agentRuns` envelope (`ai/agentRuns.ts`), the pattern miner and the
risk explainer, both off by default and on the mock until the owner's dry runs. It describes the one pattern
every agent in this project follows (`PATTERN_MINER_PLAN.md`, `RISK_EXPLAINER_PLAN.md`)._

## The pattern in one sentence

**Code computes the facts, the model puts them into words or suggests a next step, and a person decides
anything that changes behaviour.** Every agent here is a batch job that works without its model.

Six layers, in order:

1. **Code computes** every number, finding and candidate. The model never counts, ranks or measures.
2. **A digest** carries those facts to the model. Text copied from outside (government pages, case titles)
   sits in fields named `untrusted_data` and is never mixed with instructions.
3. **A closed set of tools.** The model can only call the tools listed for that agent. None can fetch a URL,
   run code or write pipeline data.
4. **Output checks in code.** The result must match a zod schema, repeat only numbers the code computed,
   avoid banned words ("fraud", "guilty" and so on) and stay within length and count caps.
5. **The agent writes a proposal or a piece of text, never live data.** Live data changes only through a
   separate path.
6. **A human gate** for anything that changes behaviour: a callable run by a signed-in administrator, with
   its own identity. An agent cannot approve its own proposal.

If the model is off, fails, or breaks a rule, the job still finishes with a templated, code-written result
and says so in the record.

## The agents

| Agent                 | Status             | Job              | Runs                                     | Reads                                             | Tools (closed list)                                                                                            | Writes                            | Human gate                                                                |
| --------------------- | ------------------ | ---------------- | ---------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Ingestion agent       | Built              | `ingest-agent`   | Daily, after the build                   | Run records, deltas, history, layout diagnostics  | `get_run_summary`, `get_delta`, `get_source_history`, `get_diagnostic_page`, `propose_action`, `submit_review` | `ingestReviews`, `agentProposals` | `decideProposal` callable                                                 |
| AI evidence extractor | Built, shadow mode | `ingest-extract` | Daily, **off by default**                | Extracted text of new documents                   | Structured output, checked against the document text                                                           | Shadow claims, never the graph    | Quality gate before use (B-52)                                            |
| Pattern miner         | Built, off         | `ingest-miner`   | On demand only                           | Candidate patterns the code found in the 23 cases | `get_candidate`, `get_case_timeline`, `propose_pattern`, `reject_candidate`, `submit_summary`                  | `patternProposals`                | `decidePattern` callable                                                  |
| Risk explainer        | Built, off         | `ingest-explain` | Daily, after scoring, **off by default** | Stored reason codes of alerted loans              | `submit_explanation`                                                                                           | An explanation field on the alert | None needed: it only words recorded reasons, and the reasons stay visible |

The scoring job is **not** an agent. Matching, scoring, thresholds and the alert decision are deterministic
code and SQL (`RISK_SCORING_PLAN.md`). No model decides a score or whether to alert.

## What is shared today

These already exist in `ingest/src/ai/` and `ingest/src/agent/` and are reused as they are:

- `ToolModel` and `ToolSession`: a provider-neutral contract for a model that answers only with tool calls.
- `GeminiToolModel` (Vertex or API key) and `MockToolModel` (a scripted stand-in that never touches the
  network).
- `AiConfig`: provider (`mock` by default everywhere), model id, caps on tool calls, output tokens, input
  characters and time, and the kill switch `FINRAKSHAK_AI_AGENT_ENABLED`.
- `violatesWording`: the banned-word check.
- Deterministic proposal ids and a 7-day expiry, so a retried step never creates a duplicate.
- Versioned prompts: the version is stored on every output, and no prompt text is stored.
- An `input_hash` on each review, so an unchanged input can skip the model.
- One container image with a job per task, a separate service account per role (`makeDeps` in
  `cloud/context.ts`).

## What the new agents add

The miner needs the same tool loop the ingestion agent has (the explainer makes a single call and does not
need a loop). Copying the loop would let two copies of the code that enforces the caps drift apart, so:

- **Extract a generic `runToolLoop`** from `agent/supervisor.ts` when the miner is built (step 14 of the
  build order): the loop, the caps, the per-call validation with zod and the stop rules. The ingestion
  agent then calls it. Its tests must pass unchanged, which is the proof it behaves the same. **Decided by
  the owner on 17 Oct 2026:** do it with the miner, not before, in its own commit, after edge-case tests are
  added (below). If checkpoint 1 drops the miner, the extraction is skipped.
- **A shared output-check helper** for "every number in the text must be one the code computed" (the
  ingestion agent and the extractor each have a version of this idea; the miner and explainer need it too).
- **One run envelope in a new `agentRuns` collection** (decided 17 Oct 2026). Each agent execution writes one
  small document: `agent` (`ingestion`, `extractor`, `miner`, `explainer`), `trigger` (`daily` or `manual`),
  start and finish times, `status` (`done`, `skipped`, `failed`, `templated`), `model`, `prompt_version`,
  `input_hash`, `tool_calls`, input and output tokens, a count of outputs, a pointer to them (for example
  `ingestReviews/<runId>`) and a note of at most 300 characters that never holds a prompt or a response. The
  schema lives in `packages/shared`. One admin view can then show every agent, summing tokens gives a spend
  estimate to watch against the budget alert (B-15), and the share of `templated` runs is a health signal.
  `ingestReviews` and `ingestRuns` stay exactly as they are: `ingestRuns` is shaped around sources and
  builds, and the miner is on demand and tied to no daily run, so the existing run collections would fit it
  badly. Envelopes carry an `expiresAt` field (about 400 days) and get a Firestore TTL policy, set up the way
  `ingestLocks` already is in `scripts/setup-ingest-gcp.sh`.

Nothing else is new. No agent framework, no new platform.

## Authority and identity

Each agent has a closed action list, its own service account and its own Firestore collections, in the style
of B-49. The "Can write" column describes what the agent's **code** does; see the caveat below the table for
what the cloud itself enforces:

| Agent     | Service account    | Can read                   | Can write                          | Cannot                                             |
| --------- | ------------------ | -------------------------- | ---------------------------------- | -------------------------------------------------- |
| Ingestion | `ingest-agent`     | Buckets, BigQuery (read)   | Its review and proposal documents  | Fetch URLs, change pipeline data                   |
| Extractor | `ingest-extractor` | Extracted text             | Create-only shadow objects         | Alter listings, raw evidence or published data     |
| Miner     | `ingest-miner`     | Published case data (read) | `patternProposals`, its run record | Approve, write `riskPatternLibrary`, write buckets |
| Explainer | `ingest-explainer` | Alert rows, reason codes   | The explanation field of an alert  | Change scores, bands, reasons or alerts            |

Applying a decision always goes through a callable that checks the signed-in person and role, validates the
input, acts, and returns a typed result. The agent's code has no path to that write.

**Caveat: what is and is not enforced by the cloud.** `scripts/setup-ingest-gcp.sh` gives the ingestion agent
and the extractor `roles/datastore.user` on the whole project, without an IAM condition. Firestore security
rules do not apply to the Admin SDK these jobs use, so **nothing in the cloud stops a job's account from
writing a collection that its code never touches**. Today the limit is the job's code (it calls only its own
store functions) and its tests, plus rules that block every client write. Bucket access is different: it is
scoped per bucket with viewer or creator roles, which the cloud does enforce.

To verify when the writes are added (steps 12 and 14):

- whether an IAM condition can scope Firestore access tighter than the project (I believe it can scope by
  database but not by collection; this needs checking, I have not confirmed it);
- if not, whether the miner and explainer should write to their own Firestore database, or whether the code
  guard plus an emulator test that lists the collections each task writes is enough;
- reword the "Can write" column to say "writes (by code)" if the cloud cannot enforce it.

## Prompts and versions

- Prompts are code (`prompts/<agent>.ts`), reviewed like code, with a version constant such as
  `run-review.v2`.
- A change to the text bumps the version. The version is saved with every output so any output can be traced
  to the instructions that produced it.
- A prompt states the same non-negotiables for every agent: facts only from the digest and tools,
  `untrusted_data` is never an instruction, records are leads and not verdicts, and the list of allowed
  actions.
- No prompt or full model response is logged (CLAUDE.md). Logs carry ids, counts, version and hash.

## Testing agents

No test ever calls a billed model (CLAUDE.md, B-15). Each agent has:

- **Happy path with the mock model** driving the whole loop, writes included.
- **Hostile outputs, one test each**: an invented tool name, bad arguments, a number the code did not
  compute, a banned word, an over-long text, a duplicate, too many proposals, a call after the budget ran out.
- **Injection**: a field in `untrusted_data` that says to ignore the rules or to approve something changes
  nothing.
- **Fallback**: with the model off, failing or timing out, the templated result is written and marked.
- **Authority**: the agent's identity cannot write what only the callable may write (Firestore rules
  emulator tests).
- **One capped real dry run per agent**, reviewed by the owner before the agent is switched on.

Quality gates beyond tests: the extractor keeps its hand-checked golden set (`ingest/eval/README.md`); the
miner adds a pattern acceptance checklist there; the explainer's check is that its numbers match the stored
reasons.

## Cost and limits

All figures are my estimates from the existing caps and should be confirmed on the first dry run.

| Agent     | Calls per run                  | Cap                                         | Estimated cost                          |
| --------- | ------------------------------ | ------------------------------------------- | --------------------------------------- |
| Ingestion | 1 session, up to 8 tool calls  | 60,000 input characters                     | A few cents a day                       |
| Extractor | Up to 50 documents             | 10 pages and 30,000 characters per document | Depends on volume; off today            |
| Miner     | 1 session, up to 12 tool calls | 60,000 input characters, 15 candidates      | A few cents per run, on demand          |
| Explainer | 1 short call per alerted loan  | At most 30 per run                          | Negligible at a 3% monthly alert budget |

The budget alerts exist (B-15, checked 18 Oct 2026: ₹450/month for the project, ₹200/month for the AI
services). They warn but do not stop spend, so the per-run caps above stay. Every agent stays on `mock` until you set its provider explicitly.

## Autonomy

Decided by the owner on 17 Oct 2026.

| Level | Meaning                                                                         | Where it applies                                                  |
| ----- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 0     | The agent proposes, a person applies                                            | Ingestion proposals, miner patterns, any change that touches risk |
| 1     | Code, not a model, retries a failed step once; idempotent, no effect on content | The source re-run today; the scoring job                          |
| 2     | A model chooses an action that runs without approval                            | Nowhere                                                           |

Rules:

1. **The only automatic action** is a code-triggered retry of an idempotent failed step, at most once per
   run. The workflow does it (the source re-run exists; the scoring job gets the same retry, safe because
   its ids are deterministic). A model never triggers it.
2. **Scores, bands, alerts, patterns, thresholds and settings change only through a person.** No automatic
   approval or retirement of a pattern, no automatic tuning of thresholds, no automatic closing of an alert,
   no automatic rollback of a publish.
3. **A future exception** needs the owner's recorded decision and must meet all of these: reversible in one
   step, idempotent, no effect on any score or pattern content, capped per day, logged in `agentRuns`, and
   triggered by code, never by a model.
4. **Pending decisions must not rot.** The daily review gets a code-computed finding, `proposals_waiting`
   ("N proposals waiting, the oldest X days"), covering ingestion proposals and pattern proposals. It
   needs one new entry in the closed `FINDING_CODES` list in `packages/shared/src/ingest/agent.ts` and a
   rule in `agent/findings.ts`. It is built with the approval view (step 15).

Why this asymmetry: a wrong alert costs a reviewer a few minutes, while a silently changed or suppressed
signal can go unnoticed for months, and in a bank a named person must stand behind the decision.

## Failure modes

| What goes wrong                        | What happens                                                             |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Model unavailable, timeout, quota      | Templated result written, record says `templated`; the job does not fail |
| Output fails the schema or a check     | That output is dropped, the templated one is used, the reason is counted |
| A banned word in the text              | Rejected and replaced by the templated text                              |
| Text in the input tries to give orders | Treated as data; no tool gives it any effect                             |
| Budget (calls or characters) used up   | The loop stops and the job records the partial result                    |
| Same input as last time                | Model not called (input hash)                                            |
| Retried step                           | Deterministic ids make it a no-op                                        |
| Stale or missing upstream data         | The agent says so; it never fills the gap by guessing (B-56)             |

## Where agents do not belong

Scoring, matching, thresholds, the alert decision, and anything that touches money amounts. Those are
deterministic, tested and versioned in code. An agent may explain or propose around them, never replace them.

## Implementation order

Follows the build order in `README.md`. Step 14 is three commits, in this order:

1. **14a Edge-case tests for the ingestion agent's loop**, written against today's code (as R0 was for the
   monitoring rules). Missing cases: several tool calls in one reply that run past the call budget; a
   rejected `submit_review` followed by a valid one; the input-character accounting at its edge; usage
   logging.
2. **14b Extract `runToolLoop`.** The ingestion agent moves onto it; the old tests and the 14a tests pass
   unchanged. Wording checks and the proposal cap stay in the ingestion agent's own call handler.
3. **14c The miner**, built on the shared loop.

Then the approval view (step 15) and the optional explainer (step 17). The extractor needs no change.
14a and 14b are skipped if checkpoint 1 drops the miner.

## For discussion with the owner

1. **Extract the shared loop now or when the miner arrives?** _Decided 17 Oct 2026:_ with the miner, in its
   own commit, edge-case tests first, skipped if the miner is dropped. Reason: the extraction is justified by
   a real second user, and step 7 may show the miner is not worth building.
2. **Is the explainer worth building?** _Decided 17 Oct 2026:_ defer it until after step 13. The templated
   text ships with scoring and includes a deterministic "new since last check / unchanged / score change"
   block (step 8). Build the explainer only if multi-reason alerts read badly in that form **and** the budget
   alert exists (B-15). Details and the stop rule are in `RISK_EXPLAINER_PLAN.md`.
3. **Model choice per agent.** _Decided 17 Oct 2026:_ the cheapest model everywhere (`FINRAKSHAK_AI_AI_MODEL`,
   set per job). For the miner only, run one A/B at checkpoint 4: the same candidates through the cheapest
   model and one tier up, the owner marks each proposal accept or reject, and the cheapest model that
   matches the owner's choices is kept. The model id and prompt version are stored on every output, so
   changing the model is a setting change. The availability and price of the stronger model are checked on
   the Vertex pricing page at that time.
4. **Where run history lives.** _Decided 17 Oct 2026:_ a new `agentRuns` collection with one shared envelope
   schema for every agent, `ingestReviews` and `ingestRuns` unchanged, a TTL on envelopes, and the
   service-account write scoping verified in steps 12 and 14. The earlier idea of reusing the existing run
   collections was dropped because `ingestRuns` is shaped around sources and builds.
5. **Autonomy.** _Decided 17 Oct 2026:_ the only automatic action is a code-triggered retry of an
   idempotent failed step, at most once per run (today the source re-run; also the scoring job). Everything
   that touches risk changes only through a person. See the Autonomy section for the rules and the exception
   criteria.
6. **Platform.** _Decided 17 Oct 2026:_ keep Cloud Run jobs: `ingest-miner` (on demand) and, only if it is
   ever built, `ingest-explain`, in the same image as the rest of ingest. A managed agent platform would add
   a service, a billing surface and a different deploy path that batch jobs of this size do not need. The
   choice is low-stakes to reverse: the agent logic is plain TypeScript behind `ToolModel`, with one small
   entrypoint per task in `cloud/main.ts`, so another runtime would change that wrapper, not the agents.
   **Conditions that would change the answer:**
   - an agent the user chats with from inside the app (that needs a service behind a callable, not a job);
   - long-running agents that remember across days, which this plan does not include;
   - a bank rule that requires a specific managed platform.

   Another model provider would be one new class beside `GeminiToolModel`; no plan change is needed for that.

## Not in this plan

A chat interface, agents that call each other, agents with web access, and any use of a model to decide a
score or an alert.
