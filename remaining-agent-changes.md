# Remaining agent changes (pattern miner + risk explainer)

Branch: `pattern-miner-risk-explainer-agent` (from `main` at `ac5dae4`). The purpose of both agents comes only
from the repo docs: `docs/plans/AGENTS_PLAN.md`, `docs/plans/PATTERN_MINER_PLAN.md`,
`docs/plans/RISK_EXPLAINER_PLAN.md`, `docs/plans/PATTERN_CONTRACT.md`. Delete this file once the items below
are done or moved to `docs/plans/README.md`.

_Last checkpoint: 5. All code for steps 12, 14 and 17 (E2) is built; `npm run check && npm run build` and the
emulator tests pass. What is left is owner steps, step 15 and the decisions below._

## Done on this branch

- Shared schemas: `agentRuns` envelope, `decidePattern` input and library constants, risk explanation doc;
  `GetRiskScoresResult.explanations`.
- Step 14a: edge-case tests for the ingestion agent's loop. **Bug found and fixed:** after the input budget was
  used up, `submit_review` was refused too, so the agent could never finish.
- Step 14b: shared `runToolLoop` (`ingest/src/ai/toolLoop.ts`); the ingestion agent's tests pass unchanged; it
  writes an `agentRuns` envelope. Shared number check `ai/outputChecks.ts`.
- Pattern miner (steps 12, 14c): agent, tools, wording checks, proposals, Firestore/file/memory store, task
  `mine` (job `ingest-miner`, off), `minerCli propose`, `decidePattern` callable, rules and emulator tests.
- Risk explainer (E2): `ingest/src/explain/`, task `explain` (job `ingest-explain`, off), explanations in
  `getRiskScores`, the labelled sentence in the risk score drawer.
- Infra: accounts `ingest-miner` and `ingest-explainer`, `agentRuns` TTL, both jobs in the deploy script,
  `explain` step in the daily workflow, repo variables `INGEST_MINER_ENABLED` and `INGEST_EXPLAIN_ENABLED`.
- Docs: B-59 to B-62, plan statuses, `docs/DEPLOY.md` (Pattern miner and risk explainer),
  `docs/SESSION_NOTES.md`.

## Remaining

- [ ] **Step 15 (not started):** the approval view in the admin page (proposals with their evidence, the
      approve / reject / retire buttons calling `decidePattern`); a `firestorePatterns` source so the scoring job
      reads `riskPatternLibrary/current` instead of the hand-written patterns (decide how the hand-written
      ones move into the library); the `proposals_waiting` finding (`FINDING_CODES` in
      `packages/shared/src/ingest/agent.ts`, a rule in `ingest/src/agent/findings.ts`).
- [ ] **Owner steps:** create the budget alert (B-15); re-run `scripts/setup-ingest-gcp.sh <project>` for the two
      new accounts and the TTL; checkpoint 4 (one capped Vertex run of the miner, A/B cheapest vs one tier up);
      E3 (explainer dry run on synthetic alerts, stop rule about 1 in 10).
- [ ] **Optional:** an admin view of `agentRuns` (one list for every agent, token totals against the budget).

## Decisions to confirm with the owner

1. Explanations live in their own collection `synthRiskExplanations/{alertId}`, not as a field on the alert,
   because an alert is created once and never rewritten (B-57). One explanation per alert; a prompt bump applies
   to new alerts only.
2. The mock provider and the kill switches store no proposals or explanations (only the `agentRuns` record).
   When a real model fails, the miner stores code-worded proposals with `model: null` (AGENTS_PLAN fallback).
3. Candidates the model rejects are not proposed; only their count is kept (in the run record's note). The
   model's summary is not stored anywhere (the envelope never holds a model response).
4. The miner reads `data/processed` (as `npm run miner` does) and refuses to run until a build has been
   published (B-50). Processed tables can be newer than the published build when a gate failed.
5. The app shows only the AI sentence of a loan's **latest** alert; an older sentence is not shown.
6. A missing `ingest-explain` job (accounts not created yet) shows as a failed `explain` step in the daily run,
   the same as `score` today.
