# Plan: How agents are implemented

_Status: proposed, for discussion with the owner. Nothing here is implemented. It describes the one pattern
every agent in this project follows, using the ingestion agent that already exists and the two planned ones
(`PATTERN_MINER_PLAN.md`, `RISK_EXPLAINER_PLAN.md`)._

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
| Pattern miner         | Planned            | `ingest-miner`   | On demand only                           | Candidate patterns the code found in the 23 cases | `get_candidate`, `get_case_timeline`, `propose_pattern`, `reject_candidate`, `submit_summary`                  | `patternProposals`                | `decidePattern` callable                                                  |
| Risk explainer        | Planned, optional  | `ingest-explain` | Daily, after scoring, **off by default** | Stored reason codes of alerted loans              | `submit_explanation`                                                                                           | An explanation field on the alert | None needed: it only words recorded reasons, and the reasons stay visible |

The scoring job is **not** an agent. Matching, scoring, thresholds and the alert decision are deterministic
code and SQL (`RISK_SCORING_PLAN.md`). No model decides a score or whether to alert.

## What is shared today

These already exist in `ingest/src/ai/` and `ingest/src/agent/` and are reused as they are:

- `ToolModel` and `ToolSession`: a provider-neutral contract for a model that answers only with tool calls.
- `GeminiToolModel` (Vertex or API key) and `MockToolModel` (a scripted stand-in that never touches the
  network).
- `AiConfig`: provider (`mock` by default everywhere), model id, caps on tool calls, output tokens, input
  characters and time, and the kill switch `FUNDTRACE_AGENT_ENABLED`.
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
- **One run-record shape** (`model`, `prompt_version`, `input_hash`, `tool_calls`, token usage, status,
  whether the result was templated) so one admin view can show every agent.

Nothing else is new. No agent framework, no new platform.

## Authority and identity

Each agent has a closed action list, its own service account and its own Firestore collection, in the style
of B-49:

| Agent     | Service account    | Can read                   | Can write                          | Cannot                                         |
| --------- | ------------------ | -------------------------- | ---------------------------------- | ---------------------------------------------- |
| Ingestion | `ingest-agent`     | Buckets, BigQuery (read)   | Its review and proposal documents  | Fetch URLs, change pipeline data               |
| Extractor | `ingest-extractor` | Extracted text             | Create-only shadow objects         | Alter listings, raw evidence or published data |
| Miner     | `ingest-miner`     | Published case data (read) | `patternProposals`, its run record | Approve, write `riskPatterns`, write buckets   |
| Explainer | `ingest-explainer` | Alert rows, reason codes   | The explanation field of an alert  | Change scores, bands, reasons or alerts        |

Applying a decision always goes through a callable that checks the signed-in person and role, validates the
input, acts, and returns a typed result. The agent's account has no path to that write.

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

The budget alert is still parked (B-15). Create it **before** any provider other than `mock` is switched on
in the cloud. Every agent stays on `mock` until you set its provider explicitly.

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
2. **Is the explainer worth building?** Recommended: not until reviewers say the templated reason text is
   hard to read. The templated text ships with scoring either way.
3. **Model choice per agent.** The default is the cheapest model. The miner makes very few calls, so a
   stronger model would cost cents more; worth a trial after the first dry run.
4. **Where run history lives.** Recommended: one shared run-record shape in the existing run collections,
   with an agent field, rather than a new collection per agent.
5. **Autonomy.** Today only the ingestion agent has one automatic action (re-running a source after a
   transient error, set by code, not by the model). Recommended: no automatic actions for anything that
   touches risk.
6. **Platform.** Recommended: keep Cloud Run jobs. A managed agent platform would add a service and a
   billing surface that a daily batch job of this size does not need.

## Not in this plan

A chat interface, agents that call each other, agents with web access, and any use of a model to decide a
score or an alert.
