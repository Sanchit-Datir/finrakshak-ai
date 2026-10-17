# Remaining agent changes (pattern miner + risk explainer)

Branch: `pattern-miner-risk-explainer-agent` (from `main` at `ac5dae4`). Purpose of both agents is taken
only from the repo docs: `docs/plans/AGENTS_PLAN.md`, `docs/plans/PATTERN_MINER_PLAN.md`,
`docs/plans/RISK_EXPLAINER_PLAN.md`, `docs/plans/PATTERN_CONTRACT.md`. This file is updated at every
checkpoint commit; delete it once everything below is done.

_Last checkpoint: 4 (explainer in getRiskScores and the app). Next: infra and docs._

## Done so far

- [x] Shared schemas: `agentRuns` envelope (`packages/shared/src/ingest/agentRuns.ts`), `decidePattern`
      input and library constants (`risk/patterns/decision.ts`), risk explanation doc
      (`risk/scoring/explanation.ts`); `GetRiskScoresResult.explanations` (optional, default `[]`).
- [x] Step 14a: edge-case tests for the ingestion agent's loop (`agent/supervisor.test.ts`). **Bug found and
      fixed:** after the input budget was used up, `submit_review` was refused too, so the agent could never
      finish (the error told it to call `submit_review`).
- [x] Step 14b: shared `runToolLoop` (`ingest/src/ai/toolLoop.ts` + tests); the ingestion agent uses it and
      its old tests pass unchanged; it writes an `agentRuns` envelope (`ai/agentRuns.ts`).
- [x] Shared output check "every number must be one the code computed" (`ai/outputChecks.ts`).
- [x] AI config: `FUNDTRACE_MINER_ENABLED` (false), `FUNDTRACE_MINER_MAX_TOOL_CALLS` (12),
      `FUNDTRACE_EXPLAIN_ENABLED` (false), `FUNDTRACE_EXPLAIN_MAX_ALERTS` (30).
- [x] Miner agent code (no tests yet): `miner/prompts/mine.ts`, `tools.ts` (5 tools), `wording.ts`,
      `agent.ts`, `proposals.ts`, `store.ts` (Firestore / file / memory), `load.ts`;
      `cloud/mineTask.ts` registered as task `mine` (role `miner`).

- [x] Miner tests (agent hostile outputs and injection, proposals, mock/kill switch/failure/same-input in
      `cloud/mineTask.test.ts`, Firestore store and `agentRuns` against the emulator); `minerCli propose`
      (prints only; `--allow-billed` needed for a billed model). Real data: 0 candidates, nothing proposed.
- [x] `decidePattern` callable (`functions/src/callable/decidePattern.ts`, `services/patterns.ts`):
      approve / reject / retire in one transaction, `riskPatternLibrary/current` + immutable `v<n>`, local
      canonical hash checked against the shared fixture.
- [x] Firestore rules + emulator tests: `agentRuns`, `patternProposals`, `riskPatternLibrary` (admin read
      only), `synthRiskExplanations` (no client access).

- [x] Risk explainer (ingest): `ingest/src/explain/` (placeholders, digest, output checks, prompt
      `explain.v1`, one-tool model step with one retry, store) and task `explain` (role `explainer`,
      `cloud/explainTask.ts`); tests for every check, the mock, the cap and idempotence, and the
      Firestore store against the emulator.

- [x] `getRiskScores` returns `explanations` for the returned alerts only (no input hash); the web loader
      parses them and the risk score drawer shows the latest alert's sentence labelled
      "AI-written summary of the recorded reasons", followed by that alert's recorded reasons
      (`components/risk-scores/AiExplanation.tsx`).

## Remaining

### Infra and docs

- [ ] `scripts/setup-ingest-gcp.sh`: service accounts `ingest-miner`, `ingest-explainer`; TTL on
      `agentRuns.expiresAt`. `scripts/deploy-ingest.sh`: jobs `ingest-miner` (on demand) and
      `ingest-explain`. `infra/workflows/ingest-daily.yaml`: `explain` step after `score` (job is a no-op
      while `FUNDTRACE_EXPLAIN_ENABLED=false`).
- [ ] `docs/BOUNDARY_CONDITIONS.md`: add B-59, B-60, B-61, B-62.
- [ ] Status updates: `docs/plans/README.md` (steps 12, 14, 17), `AGENTS_PLAN.md`,
      `PATTERN_MINER_PLAN.md` (fix "three read-only lookups" → two), `RISK_EXPLAINER_PLAN.md`,
      `docs/DEPLOY.md`, `docs/SESSION_NOTES.md`.
- [ ] `npm run check && npm run build` (and `npm run test:emulators` if the emulator runs here).

## Decisions to confirm with the owner

- Explanations live in their own collection `synthRiskExplanations/{alertId}`, not as a field on the alert,
  because an alert is created once and never rewritten (B-57). One explanation per alert; a prompt bump
  applies to new alerts only.
- Mock provider and kill switch store no proposals or explanations (only the `agentRuns` record). When a real
  model fails, the miner stores code-worded proposals with `model: null` (AGENTS_PLAN fallback rule).
- Candidates the model rejects are not proposed; the count is in the run record's note.
- The miner reads `data/processed` (as `npm run miner` does) and refuses to run until a build has been
  published (B-50); processed tables can be newer than the published build when a gate failed.
- Step 15 (approval view in the admin page, scoring reading approved patterns from Firestore,
  `proposals_waiting` finding) is not part of this branch.
- Checkpoint 4 (a capped real Vertex dry run) and E3 stay the owner's steps; everything runs on the mock.
